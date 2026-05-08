import { z } from 'zod';
import { fetchWithRetry } from '../utils/fetch.js';
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

type WikiSummary = {
  title?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
};

/**
 * Search Wikipedia and return article summaries instantly.
 *
 * Step 1: Wikipedia full-text search API → ranked article titles (~200ms)
 * Step 2: Wikipedia REST summary API per article → plain-text extract (~200ms each, parallel)
 *
 * No Claude call needed — Wikipedia's own extracts are returned as the summary.
 * Total time: ~1–2 seconds for 3 results.
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
    log('warn', 'Wikipedia search API unreachable', { query }, err);
    return { query, results: [] };
  }

  if (titles.length === 0) return { query, results: [] };

  // Step 2: fetch Wikipedia's pre-computed summary for each title in parallel
  const settled = await Promise.allSettled(
    titles.slice(0, n).map(async title => {
      const slug = encodeURIComponent(title.replace(/ /g, '_'));
      const summaryApi = `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`;
      const res = await fetchWithRetry(summaryApi, undefined, { timeoutMs: 8_000, maxRetries: 1 });
      const data = (await res.json()) as WikiSummary;
      const extract = data.extract ?? '';
      const url = data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${slug}`;
      return {
        url,
        title: data.title ?? title,
        summary: extract.slice(0, 600),
        relevance_score: relevanceScore(query, title, extract),
      };
    })
  );

  return {
    query,
    results: settled
      .flatMap(s => (s.status === 'fulfilled' && s.value.summary ? [s.value] : []))
      .sort((a, b) => b.relevance_score - a.relevance_score),
  };
}
