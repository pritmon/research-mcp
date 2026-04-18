import { z } from 'zod';
import { claudeText } from '../utils/claude.js';
import { fetchPageText } from '../utils/fetch.js';
import { log } from '../utils/logger.js';

export const SummarizeUrlInputSchema = z.object({
  url: z.string().url(),
});

/**
 * Fetches a URL, cleans HTML, and returns an AI-generated summary.
 *
 * - 10s web timeout
 * - Redirects followed automatically
 * - Non-HTML content is handled best-effort (summarize raw text if readable)
 */
export async function summarizeUrl(url: string): Promise<string> {
  const page = await fetchPageText(url, 10_000);

  if (page.status >= 400) {
    const msg = `Failed to fetch URL (status ${page.status}).`;
    log('warn', msg, { url, finalUrl: page.finalUrl, contentType: page.contentType ?? 'unknown' });
    return msg;
  }

  const snippet = page.text.slice(0, 12_000);
  if (!snippet) return 'No readable text content found at the URL.';

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

