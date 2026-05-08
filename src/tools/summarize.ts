/**
 * @module tools/summarize
 *
 * `summarize_url` tool — fetch any public URL and generate an AI summary.
 *
 * Role in the system:
 *   This is the simplest tool in the suite: one URL in, one markdown bullet-
 *   point summary out.  It is also used as a building block by `compare.ts`,
 *   which calls `summarizeUrl` on each page before asking Claude to compare them.
 *
 * Pipeline:
 *   1. `fetchPageText` — retrieve the URL, follow redirects, clean HTML.
 *   2. Hard-truncate the cleaned text to 12 000 chars to stay well within
 *      Claude's context window while keeping most meaningful content.
 *   3. `claudeText` — send a structured prompt and return the bullet summary.
 *
 * Error handling:
 *   HTTP errors (4xx/5xx) are returned as a plain string message rather than
 *   thrown so the MCP tool handler can surface them as non-fatal text content
 *   instead of an error response.
 */

import { z } from 'zod';
import { claudeText } from '../utils/claude.js';
import { fetchPageText } from '../utils/fetch.js';
import { log } from '../utils/logger.js';

/**
 * Input schema for the `summarize_url` MCP tool.
 * Validates that the caller passes a well-formed absolute URL.
 */
export const SummarizeUrlInputSchema = z.object({
  url: z.string().url(),
});

/**
 * Fetch a URL, clean the HTML, and return an AI-generated bullet-point summary.
 *
 * Design notes:
 *   - 10 s web timeout: balances responsiveness (most pages load < 3 s) against
 *     slow servers.  Retries are handled inside `fetchPageText`.
 *   - 12 000-char snippet cap: the Claude Sonnet context window is very large,
 *     but long prompts increase latency and cost.  12 k chars typically covers
 *     the substantive content of a news article or Wikipedia page.
 *   - The prompt includes `finalUrl` (post-redirect URL) and `contentType` so
 *     Claude can calibrate its summary (e.g., "this is a PDF" or "this is a
 *     forum thread").
 *   - Non-HTML content (PDFs, JSON, plain text) reaches here as raw text; the
 *     prompt instructs Claude to handle it best-effort.
 *
 * @param url - Absolute URL to summarise.
 * @returns Markdown bullet-point summary, or an error message string on failure.
 */
export async function summarizeUrl(url: string): Promise<string> {
  const page = await fetchPageText(url, 10_000);

  // Return a plain-text error message rather than throwing so that the MCP
  // tool handler and the HTTP server can both surface it as content rather than
  // as a protocol-level error.
  if (page.status >= 400) {
    const msg = `Failed to fetch URL (status ${page.status}).`;
    log('warn', msg, { url, finalUrl: page.finalUrl, contentType: page.contentType ?? 'unknown' });
    return msg;
  }

  // Truncate to avoid excessively large prompts; most meaningful information
  // in an article is front-loaded, so slicing from the start is a reasonable
  // heuristic.
  const snippet = page.text.slice(0, 12_000);
  if (!snippet) return 'No readable text content found at the URL.';

  // Structured prompt following an "enterprise research analyst" persona to
  // elicit concise, factual, caveat-aware summaries rather than verbose prose.
  const prompt = [
    'You are an enterprise research assistant.',
    'Summarize the source for a busy analyst.',
    '',
    'Requirements:',
    '- Output 5-8 bullet points, each <= 20 words.',
    '- Include: key claims, important numbers, and any caveats/limitations.',
    '- Do not hallucinate; if uncertain, say so.',
    '',
    `Source URL: ${page.finalUrl}`,
    `Content-Type: ${page.contentType ?? 'unknown'}`,
    '',
    'Content (cleaned/plain text):',
    snippet,
  ].join('\n');

  return await claudeText(prompt, { timeoutMs: 30_000, maxRetries: 3 });
}

