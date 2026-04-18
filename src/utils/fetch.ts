import * as cheerio from 'cheerio';
import he from 'he';
import { z } from 'zod';
import { log } from './logger.js';

export const FetchOptionsSchema = z.object({
  timeoutMs: z.number().int().positive(),
  maxRetries: z.number().int().min(0).max(10).default(2),
  initialBackoffMs: z.number().int().positive().default(250),
  maxBackoffMs: z.number().int().positive().default(4000),
  userAgent: z.string().min(1).default('research-mcp/1.0'),
});

export type FetchOptions = z.infer<typeof FetchOptionsSchema>;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function backoffDelayMs(attempt: number, initial: number, max: number): number {
  const base = Math.min(max, initial * 2 ** attempt);
  const jitter = Math.floor(Math.random() * Math.min(250, base));
  return Math.min(max, base + jitter);
}

/**
 * Fetch a URL with timeout and retry logic.
 *
 * - Retries on transient network errors and retryable HTTP statuses (429, 5xx)
 * - Uses exponential backoff with jitter
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit | undefined,
  opts: Partial<FetchOptions>
): Promise<Response> {
  const { timeoutMs, maxRetries, initialBackoffMs, maxBackoffMs, userAgent } = FetchOptionsSchema.parse(opts);

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'user-agent': userAgent,
          ...(init?.headers ?? {}),
        },
      });

      if (attempt < maxRetries && isRetryableStatus(res.status)) {
        const delay = backoffDelayMs(attempt, initialBackoffMs, maxBackoffMs);
        log('warn', 'Retryable HTTP status from fetch', { url, status: res.status, attempt, delay });
        await res.arrayBuffer().catch(() => undefined);
        await sleep(delay);
        continue;
      }

      return res;
    } catch (err) {
      lastErr = err;
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const canRetry = attempt < maxRetries && !isAbort;
      if (!canRetry) throw err;

      const delay = backoffDelayMs(attempt, initialBackoffMs, maxBackoffMs);
      log('warn', 'Fetch failed; retrying', { url, attempt, delay }, err);
      await sleep(delay);
    } finally {
      clearTimeout(t);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('fetchWithRetry failed');
}

/**
 * Clean HTML to readable plain text.
 *
 * Removes scripts/styles/nav-like blocks, collapses whitespace, and decodes
 * HTML entities.
 */
export function cleanHtmlToText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, canvas, iframe, nav, footer, header, aside').remove();
  const text = $('body').text() || $.text();
  const decoded = he.decode(text);
  return decoded
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export type FetchedPage = {
  url: string;
  finalUrl: string;
  contentType: string | null;
  status: number;
  text: string;
  isHtml: boolean;
};

/**
 * Fetch a web page and return best-effort text.
 *
 * Handles redirects (via fetch), non-HTML content-types, and timeout.
 */
export async function fetchPageText(url: string, timeoutMs = 10_000): Promise<FetchedPage> {
  const res = await fetchWithRetry(url, undefined, { timeoutMs, maxRetries: 2 });
  const contentType = res.headers.get('content-type');
  const isHtml = !!contentType && contentType.toLowerCase().includes('text/html');
  const finalUrl = res.url || url;

  let text = '';
  try {
    text = await res.text();
  } catch (err) {
    log('warn', 'Failed reading response body', { url, finalUrl, status: res.status }, err);
  }

  const cleaned = isHtml ? cleanHtmlToText(text) : text.trim();

  return {
    url,
    finalUrl,
    contentType,
    status: res.status,
    text: cleaned,
    isHtml,
  };
}

