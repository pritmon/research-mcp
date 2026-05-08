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

function relevanceScore(query: string, title: string, summary: string): number {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/).filter(w => w.length >= 3);
  if (words.length === 0) return 0.3;

  const hay = `${title}\n${summary}`.toLowerCase();
  const hits = words.reduce((acc, w) => acc + (hay.includes(w) ? 1 : 0), 0);
  return Math.max(0, Math.min(1, hits / Math.min(6, words.length)));
}

/**
 * Search Wikipedia's open API for articles matching the query, then fetch and
 * summarize each result in parallel.
 *
 * Wikipedia's API is freely accessible from any server (no key, no rate limits
 * for reasonable usage) and returns rich, reliable data.
 *
 * Returns `{ query, results: [{ url, title, summary, relevance_score }] }`.
 */
export async function searchAndSummarize(query: string, numResults = 5): Promise<SearchAndSummarizeResult> {
  const n = Math.max(1, Math.min(8, numResults));

  // Wikipedia opensearch — returns titles + page URLs
  const api = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=${n}&namespace=0&format=json&origin=*`;

  let candidates: Array<{ url: string; title: string }> = [];
  try {
    const res = await fetchWithRetry(api, undefined, { timeoutMs: 10_000, maxRetries: 2 });
    // opensearch returns [query, [titles], [descriptions], [urls]]
    const data = (await res.json()) as [string, string[], string[], string[]];
    const titles = data[1] ?? [];
    const urls = data[3] ?? [];
    candidates = titles
      .map((title, i) => ({ title, url: urls[i] ?? '' }))
      .filter(r => r.url && r.title);
  } catch (err) {
    log('warn', 'Wikipedia search API unreachable', { query }, err);
    return { query, results: [] };
  }

  if (candidates.length === 0) return { query, results: [] };

  const settled = await Promise.allSettled(
    candidates.slice(0, n).map(async r => {
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
