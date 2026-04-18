import { z } from 'zod';
import { claudeJson } from '../utils/claude.js';
import { fetchPageText } from '../utils/fetch.js';
import { summarizeUrl } from './summarize.js';

export const CompareSourcesInputSchema = z.object({
  urls: z.array(z.string().url()).min(2).max(6),
});

export const CompareSourcesOutputSchema = z.object({
  sources: z.array(
    z.object({
      url: z.string().url(),
      title: z.string().optional(),
      summary: z.string(),
    })
  ),
  agreements: z.array(z.string()),
  contradictions: z.array(z.string()),
  consensus: z.string(),
  confidence: z.string(),
});

export type CompareSourcesOutput = z.infer<typeof CompareSourcesOutputSchema>;

/**
 * Fetch all URLs in parallel, summarize each, then use Claude to produce a
 * structured comparative analysis across sources.
 */
export async function compareSources(urls: string[]): Promise<CompareSourcesOutput> {
  const pages = await Promise.allSettled(urls.map(u => fetchPageText(u, 10_000)));
  const ok = pages.flatMap(p => (p.status === 'fulfilled' ? [p.value] : []));

  const summaries = await Promise.allSettled(
    ok.map(async p => ({
      url: p.finalUrl,
      title: undefined as string | undefined,
      summary: await summarizeUrl(p.finalUrl),
    }))
  );

  const sources = summaries.flatMap(s => (s.status === 'fulfilled' ? [s.value] : []));

  const prompt = [
    'You are an enterprise research analyst comparing multiple sources.',
    '',
    'Task:',
    '- Identify agreements and contradictions across sources.',
    '- Provide a short consensus statement.',
    '- Provide an overall confidence: low | medium | high (as a string).',
    '',
    'Sources (URL + summary):',
    JSON.stringify(sources, null, 2),
    '',
    'Return JSON strictly matching this shape:',
    JSON.stringify(CompareSourcesOutputSchema.shape, null, 2),
  ].join('\n');

  return await claudeJson(prompt, CompareSourcesOutputSchema, { timeoutMs: 30_000, maxRetries: 3 });
}

