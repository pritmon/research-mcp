/**
 * @module tools/search
 *
 * `search_and_summarize` tool — search Wikipedia and return AI-formatted summaries.
 *
 * Role in the system:
 *   Rather than integrating a paid web-search API, this tool uses the freely
 *   accessible Wikipedia search and summary REST APIs to return relevant results
 *   quickly and without authentication.  Claude is used only for light formatting
 *   (converting a paragraph extract into bullet points) — not for search ranking
 *   or retrieval, which keeps latency and cost low.
 *
 * Two-stage retrieval pipeline:
 *   Stage 1 — Wikipedia full-text search (`w/api.php?action=query&list=search`)
 *             → returns ranked article titles (~200 ms)
 *   Stage 2 — Wikipedia REST summary API (`/api/rest_v1/page/summary/:slug`)
 *             → returns a plain-text extract per article (~200 ms each, parallel)
 *
 * Claude is called once per article to reformat the extract into bullet points.
 *   If that call fails the raw extract is used as a fallback, so results are
 *   always returned even if the AI layer is temporarily unavailable.
 *
 * Relevance scoring:
 *   A lightweight client-side term-frequency heuristic ranks results by how many
 *   unique query words appear in the title + extract.  This re-ranks Wikipedia's
 *   search order using the actual extracted content rather than just the title.
 *
 * Total expected latency: ~3–8 seconds for 3–5 results.
 */

import { z } from 'zod';
import { fetchWithRetry } from '../utils/fetch.js';
import { claudeText } from '../utils/claude.js';
import { log } from '../utils/logger.js';

/**
 * Input schema for the `search_and_summarize` MCP tool.
 *
 * `query` must be at least 2 characters so the Wikipedia API has something
 * meaningful to match against.  `num_results` is capped at 8 to keep latency
 * manageable (each result requires a parallel Claude call).
 */
export const SearchAndSummarizeInputSchema = z.object({
  query: z.string().min(2),
  num_results: z.number().int().min(1).max(8).optional(),
});

/** Shape of the overall tool result returned to the caller. */
export type SearchAndSummarizeResult = {
  query: string;
  results: Array<{
    /** Canonical Wikipedia article URL. */
    url: string;
    /** Article title as returned by Wikipedia. */
    title: string;
    /** AI-formatted bullet-point summary (or raw extract on Claude failure). */
    summary: string;
    /** Client-side relevance score in [0, 1]. */
    relevance_score: number;
  }>;
};

/**
 * Compute a simple term-frequency relevance score for a query against a result.
 *
 * Algorithm:
 *   1. Tokenise the query into words of 3+ characters (short words like "a",
 *      "of", "in" are stop-word-like noise).
 *   2. Count how many unique query words appear anywhere in the combined
 *      `title + summary` text.
 *   3. Normalise by `min(6, wordCount)` — capping at 6 query words prevents
 *      very long queries from making scoring too granular.
 *
 * Why client-side scoring?  Wikipedia's search API ranks by its own internal
 * BM25-like index which weights title matches heavily.  After fetching full
 * extracts we have richer content to re-rank against, which tends to surface
 * more on-topic articles when the query term appears primarily in article body.
 *
 * @param query   - The original search query string.
 * @param title   - Wikipedia article title.
 * @param summary - Plain-text extract or formatted summary.
 * @returns Score in [0, 1] where 1.0 means all query words matched.
 */
function relevanceScore(query: string, title: string, summary: string): number {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/).filter(w => w.length >= 3);
  if (words.length === 0) return 0.3;  // can't score; return a neutral fallback
  const hay = `${title}\n${summary}`.toLowerCase();
  const hits = words.reduce((acc, w) => acc + (hay.includes(w) ? 1 : 0), 0);
  return Math.max(0, Math.min(1, hits / Math.min(6, words.length)));
}

/**
 * Partial shape of a Wikipedia REST summary API response.
 * Only the fields we actually use are typed; the full response has many more.
 */
type WikiSummary = {
  title?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
};

/**
 * Search Wikipedia for the given query and return AI-formatted result summaries.
 *
 * Detailed flow:
 *
 *   **Step 1 — Full-text search**
 *   Calls the MediaWiki `action=query&list=search` endpoint to retrieve up to
 *   `n` ranked article titles.  If the Wikipedia API is unreachable an empty
 *   results array is returned (rather than throwing) so the tool degrades
 *   gracefully.
 *
 *   **Step 2 — Parallel summary fetch + AI formatting** (`Promise.allSettled`)
 *   For each title, the Wikipedia REST `/page/summary/:slug` endpoint is called
 *   in parallel to get a pre-computed plain-text extract.  Claude then formats
 *   the extract into 4–6 bullet points.  `Promise.allSettled` ensures that a
 *   single failing article fetch or Claude call does not block the others.
 *   On Claude failure the raw extract (first 600 chars) is used as the summary.
 *
 *   **Sorting**
 *   Results are sorted descending by `relevance_score` so the most on-topic
 *   articles appear first regardless of Wikipedia's internal ranking.
 *
 * @param query      - Search string (e.g. "Model Context Protocol 2025").
 * @param numResults - Desired number of results, clamped to [1, 8] (default 5).
 * @returns `{ query, results }` where each result has url, title, summary, relevance_score.
 */
export async function searchAndSummarize(query: string, numResults = 5): Promise<SearchAndSummarizeResult> {
  const n = Math.max(1, Math.min(8, numResults));

  // Step 1: full-text search for ranked titles
  const searchApi = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${n}&format=json&origin=*`;
  let titles: string[] = [];
  try {
    const res = await fetchWithRetry(searchApi, undefined, { timeoutMs: 8_000, maxRetries: 2 });
    const data = (await res.json()) as { query?: { search?: Array<{ title: string }> } };
    titles = (data?.query?.search ?? []).map(h => h.title);
  } catch (err) {
    // If Wikipedia search is unreachable, return empty results rather than
    // propagating an error — the tool still succeeds, just with no data.
    log('warn', 'Wikipedia search API unreachable', { query }, err);
    return { query, results: [] };
  }

  if (titles.length === 0) return { query, results: [] };

  // Step 2: fetch Wikipedia's pre-computed summary for each title in parallel.
  // Why `Promise.allSettled`?  A failed fetch for one article should not
  // prevent the other articles from being returned.
  const settled = await Promise.allSettled(
    titles.slice(0, n).map(async title => {
      // Wikipedia's REST API expects underscored, URL-encoded slugs.
      const slug = encodeURIComponent(title.replace(/ /g, '_'));
      const summaryApi = `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`;
      const res = await fetchWithRetry(summaryApi, undefined, { timeoutMs: 8_000, maxRetries: 1 });
      const data = (await res.json()) as WikiSummary;
      const extract = data.extract ?? '';
      // Fall back to a constructed URL if the API doesn't return `content_urls`.
      const url = data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${slug}`;

      // Format as bullet points using Claude — input is tiny (~600 chars) so ~3-5s
      // The first 600 chars of the extract serve as a raw fallback if Claude fails.
      let summary = extract.slice(0, 600);
      try {
        summary = await claudeText(
          `Summarize this in 4-6 bullet points (each <= 20 words, start each with "- **Key term**: detail"):\n\n${extract.slice(0, 800)}`,
          { timeoutMs: 20_000, maxRetries: 1, maxTokens: 300 }
        );
      } catch {
        // fall back to plain extract if Claude fails
      }

      return {
        url,
        title: data.title ?? title,
        summary,
        // Score against the original extract (not the Claude-formatted version)
        // for an unbiased keyword-frequency signal.
        relevance_score: relevanceScore(query, title, extract),
      };
    })
  );

  return {
    query,
    // Drop any rejected promises (failed fetches) and results with empty summaries,
    // then sort so the most relevant articles appear first.
    results: settled
      .flatMap(s => (s.status === 'fulfilled' && s.value.summary ? [s.value] : []))
      .sort((a, b) => b.relevance_score - a.relevance_score),
  };
}
