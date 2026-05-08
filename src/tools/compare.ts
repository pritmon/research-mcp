/**
 * @module tools/compare
 *
 * `compare_sources` tool — fetch, summarise, and cross-compare multiple URLs.
 *
 * Role in the system:
 *   This is the most "pipeline-heavy" tool in the suite.  It chains three stages:
 *   1. Parallel page fetch  → raw HTML/text for each URL
 *   2. Parallel summarise   → per-source bullet summaries via `summarizeUrl`
 *   3. Claude comparison    → structured agreements/contradictions/consensus
 *
 * Concurrency model:
 *   Both the fetch and summarise stages use `Promise.allSettled` rather than
 *   `Promise.all`.  This ensures that a single failing URL does not abort the
 *   entire operation; only successfully fetched/summarised sources advance to
 *   the comparison stage.  The final Claude call receives whatever subset of
 *   sources succeeded, which means useful output is still produced even when
 *   one or two URLs are unreachable.
 *
 * Constraints:
 *   - Minimum 2, maximum 6 URLs (enforced by `CompareSourcesInputSchema`).
 *   - Per-URL fetch timeout: 10 s.
 *   - Claude comparison timeout: 60 s with up to 4 000 output tokens — the
 *     comparison response is longer than a single summary.
 */

import { z } from 'zod';
import { claudeJson } from '../utils/claude.js';
import { fetchPageText } from '../utils/fetch.js';
import { summarizeUrl } from './summarize.js';

/**
 * Input schema for the `compare_sources` MCP tool.
 *
 * Enforces 2–6 valid URLs: fewer than 2 makes comparison meaningless;
 * more than 6 risks exceeding the Claude context window when all summaries
 * are concatenated into the comparison prompt.
 */
export const CompareSourcesInputSchema = z.object({
  urls: z.array(z.string().url()).min(2).max(6),
});

/**
 * Zod schema for the structured comparison output returned by Claude.
 *
 * Fields:
 *   - `sources`        : Each input URL with its title (if detected) and summary.
 *   - `agreements`     : Points on which all / most sources concur.
 *   - `contradictions` : Points where sources conflict or present opposing data.
 *   - `consensus`      : One-sentence overall takeaway synthesising all sources.
 *   - `confidence`     : Analyst's confidence in the consensus: "low" | "medium" | "high".
 */
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

/** TypeScript type inferred from `CompareSourcesOutputSchema`. */
export type CompareSourcesOutput = z.infer<typeof CompareSourcesOutputSchema>;

/**
 * Fetch, summarise, and structurally compare multiple web sources.
 *
 * Pipeline in detail:
 *
 *   **Stage 1 — Fetch** (`Promise.allSettled`)
 *   All URLs are fetched in parallel with a 10 s timeout each.
 *   Why `allSettled`?  If one URL is down we still want to compare the rest
 *   rather than failing the entire tool call.  Rejected fetches are silently
 *   dropped; the caller sees a comparison over fewer sources.
 *
 *   **Stage 2 — Summarise** (`Promise.allSettled`)
 *   Each successfully-fetched page is summarised in parallel by `summarizeUrl`.
 *   Again `allSettled` is used so a single slow/failing Claude summarise call
 *   doesn't block the others.
 *
 *   **Stage 3 — Compare** (single `claudeJson` call)
 *   The accumulated summaries are serialised as JSON and embedded in a
 *   structured prompt that instructs Claude to identify agreements,
 *   contradictions, produce a consensus, and rate its confidence.
 *   The output is validated against `CompareSourcesOutputSchema`.
 *
 * @param urls - Array of 2–6 absolute URLs to compare.
 * @returns A `CompareSourcesOutput` object with per-source summaries and analysis.
 * @throws If the final Claude call fails after exhausting retries.
 */
export async function compareSources(urls: string[]): Promise<CompareSourcesOutput> {
  // Stage 1: fetch all pages in parallel; drop individual failures gracefully.
  const pages = await Promise.allSettled(urls.map(u => fetchPageText(u, 10_000)));
  const ok = pages.flatMap(p => (p.status === 'fulfilled' ? [p.value] : []));

  // Stage 2: summarise each successfully-fetched page in parallel.
  // Why `allSettled` again?  Summarise internally calls Claude, which can
  // timeout or rate-limit.  Dropping a single failing summary is preferable
  // to aborting the entire comparison.
  const summaries = await Promise.allSettled(
    ok.map(async p => ({
      url: p.finalUrl,
      // title is extracted by Claude during comparison (not during fetch) —
      // set to undefined here as a placeholder for the schema shape.
      title: undefined as string | undefined,
      summary: await summarizeUrl(p.finalUrl),
    }))
  );

  // Collect only the fulfilled summaries for the comparison prompt.
  const sources = summaries.flatMap(s => (s.status === 'fulfilled' ? [s.value] : []));

  // Stage 3: single Claude call to produce the structured cross-source analysis.
  // `maxTokens: 4_000` and `timeoutMs: 60_000` are higher than for single
  // summaries because the comparison output is inherently longer and requires
  // more reasoning across multiple sources.
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
    // Providing the output schema in the prompt aligns Claude's output with
    // CompareSourcesOutputSchema, reducing ZodError-triggered retries.
    'Return JSON strictly matching this shape:',
    JSON.stringify(CompareSourcesOutputSchema.shape, null, 2),
  ].join('\n');

  return await claudeJson(prompt, CompareSourcesOutputSchema, { timeoutMs: 60_000, maxRetries: 3, maxTokens: 4_000 });
}

