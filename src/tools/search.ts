import { z } from 'zod';
import { fetchWithRetry, fetchPageText } from '../utils/fetch.js';
import { summarizeUrl } from './summarize.js';
import { log } from '../utils/logger.js';

export const SearchAndSummarizeInputSchema = z.object({
  query: z.string().min(2),
  num_results: z.number().int().min(1).max(8).optional(),
});

export type SearchAndSummarizeResult = {
  query: string;
  results: Array<{
    url: string;
    title: string;
    summary: string;
    relevance_score: number;
  }>;
};

type DdgTopic = {
  FirstURL?: string;
  Text?: string;
  Topics?: DdgTopic[];
};

function flattenTopics(topics: DdgTopic[] | undefined): Array<{ url: string; title: string }> {
  const out: Array<{ url: string; title: string }> = [];
  const walk = (t: DdgTopic): void => {
    if (t.FirstURL && t.Text) out.push({ url: t.FirstURL, title: t.Text });
    if (t.Topics) t.Topics.forEach(walk);
  };
  (topics ?? []).forEach(walk);
  return out;
}

function relevanceScore(query: string, title: string, summary: string): number {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/).filter(w => w.length >= 3);
  if (words.length === 0) return 0.3;

  const hay = `${title}\n${summary}`.toLowerCase();
  const hits = words.reduce((acc, w) => acc + (hay.includes(w) ? 1 : 0), 0);
  return Math.max(0, Math.min(1, hits / Math.min(6, words.length)));
}

/**
 * Uses DuckDuckGo Instant Answer API (no key) to find results, then fetches and
 * summarizes each result in parallel using `Promise.allSettled`.
 *
 * Returns `{ query, results: [{ url, title, summary, relevance_score }] }`.
 */
export async function searchAndSummarize(query: string, numResults = 5): Promise<SearchAndSummarizeResult> {
  const n = Math.max(1, Math.min(8, numResults));
  const api = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;

  const res = await fetchWithRetry(api, undefined, { timeoutMs: 10_000, maxRetries: 2 });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  const schema = z.object({
    AbstractURL: z.string().optional(),
    AbstractText: z.string().optional(),
    Heading: z.string().optional(),
    Results: z
      .array(z.object({ FirstURL: z.string().optional(), Text: z.string().optional() }))
      .optional(),
    RelatedTopics: z.array(z.any()).optional(),
  });

  const ddg = schema.safeParse(json);
  if (!ddg.success) {
    log('warn', 'DuckDuckGo response did not match expected schema', { query });
    return { query, results: [] };
  }

  const candidate: Array<{ url: string; title: string }> = [];
  if (ddg.data.AbstractURL && ddg.data.Heading) candidate.push({ url: ddg.data.AbstractURL, title: ddg.data.Heading });
  for (const r of ddg.data.Results ?? []) {
    if (r.FirstURL && r.Text) candidate.push({ url: r.FirstURL, title: r.Text });
  }
  candidate.push(
    ...flattenTopics(ddg.data.RelatedTopics as unknown as DdgTopic[] | undefined)
  );

  // De-dupe and cap
  const seen = new Set<string>();
  const urls = candidate
    .filter(r => {
      if (!r.url || seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    })
    .slice(0, n);

  const settled = await Promise.allSettled(
    urls.map(async r => {
      // Quick HEAD-style fetch isn't reliable across sites; instead fetch text directly.
      const page = await fetchPageText(r.url, 10_000);
      const summary = await summarizeUrl(page.finalUrl);
      return {
        url: page.finalUrl,
        title: r.title,
        summary,
        relevance_score: relevanceScore(query, r.title, summary),
      };
    })
  );

  const results = settled
    .flatMap(s => (s.status === 'fulfilled' ? [s.value] : []))
    .sort((a, b) => b.relevance_score - a.relevance_score);

  return { query, results };
}

