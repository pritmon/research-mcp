/**
 * @module fetch
 *
 * HTTP fetching utilities for the research-mcp server.
 *
 * Role in the system:
 *   All outbound HTTP calls (to arbitrary URLs fetched by research tools and to
 *   the Wikipedia APIs used by the search tool) funnel through `fetchWithRetry`.
 *   `fetchPageText` is the higher-level entry point that adds HTML→text
 *   conversion on top of `fetchWithRetry`.
 *
 * Design philosophy:
 *   - Reliability over raw speed: every call gets configurable retries with
 *     exponential backoff + jitter so transient server errors (5xx, 429) and
 *     network blips do not bubble up as hard failures.
 *   - Hard timeouts via AbortController: Node's built-in `fetch` does not
 *     honour a timeout option; we arm a `setTimeout` that calls `abort()` so
 *     the request always resolves (or rejects) within `timeoutMs`.
 *   - Cheerio + he for HTML cleaning: removes boilerplate DOM noise (scripts,
 *     navbars, footers) and decodes HTML entities so the text handed to Claude
 *     is as signal-dense as possible.
 */

import * as cheerio from 'cheerio';
import he from 'he';
import { z } from 'zod';
import { log } from './logger.js';

/**
 * Zod schema that validates and provides defaults for fetch options.
 *
 * Using Zod here (rather than a plain interface with defaults scattered across
 * call sites) means every caller gets the same validated, defaulted config
 * object with a single `FetchOptionsSchema.parse(opts)` call.
 */
export const FetchOptionsSchema = z.object({
  timeoutMs: z.number().int().positive(),
  maxRetries: z.number().int().min(0).max(10).default(2),
  initialBackoffMs: z.number().int().positive().default(250),
  maxBackoffMs: z.number().int().positive().default(4000),
  userAgent: z.string().min(1).default('research-mcp/1.0'),
});

/** Validated fetch configuration (all fields are required after `parse`). */
export type FetchOptions = z.infer<typeof FetchOptionsSchema>;

/**
 * Async sleep helper.
 *
 * @param ms - Duration in milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Decide whether an HTTP status code warrants a retry.
 *
 * - 429 Too Many Requests: rate-limited; backing off is exactly what the
 *   server is asking for.
 * - 5xx Server Error: transient infrastructure failures that often self-heal
 *   within seconds.
 * - 4xx (except 429) are client errors (bad URL, auth required, not found)
 *   that won't improve on retry, so we let them propagate immediately.
 *
 * @param status - HTTP response status code.
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * Compute the delay before the next retry using truncated exponential backoff
 * with uniform random jitter.
 *
 * Formula: `min(maxBackoffMs, initial * 2^attempt) + random(0, min(250, base))`
 *
 * Why jitter?  Multiple concurrent callers retrying at the same deterministic
 * interval cause a "thundering herd" that hammers a struggling server at
 * perfectly synchronised moments.  Adding jitter spreads the retries across a
 * wider window, reducing coordinated load spikes.
 *
 * @param attempt        - Zero-based retry index (0 = first retry).
 * @param initial        - Base delay in ms for attempt 0.
 * @param max            - Hard cap on the delay in ms.
 * @returns Jittered delay in milliseconds.
 */
function backoffDelayMs(attempt: number, initial: number, max: number): number {
  const base = Math.min(max, initial * 2 ** attempt);
  const jitter = Math.floor(Math.random() * Math.min(250, base));
  return Math.min(max, base + jitter);
}

/**
 * Fetch a URL with per-request timeout and automatic retry logic.
 *
 * Behaviour:
 *   - Each attempt gets its own `AbortController` wired to a `setTimeout` so
 *     hung TCP connections don't block the process indefinitely.
 *   - Retries on transient network errors (non-abort `Error` throws) and on
 *     retryable HTTP status codes (429, 5xx).
 *   - Abort errors (i.e., genuine timeouts) are **not** retried because the
 *     server already took longer than `timeoutMs`; retrying would just waste
 *     more time against a slow host.
 *   - On a retryable HTTP response the body is drained (`.arrayBuffer()`) to
 *     free the underlying socket before sleeping.
 *
 * @param url  - Target URL.
 * @param init - Native `RequestInit` options forwarded to `fetch` (e.g., method,
 *               headers, body).  `signal` and `redirect` are overridden internally.
 * @param opts - Partial fetch options; missing fields receive validated defaults.
 * @returns Resolved `Response` on success.
 * @throws The last recorded error if all attempts are exhausted.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit | undefined,
  opts: Partial<FetchOptions>
): Promise<Response> {
  const { timeoutMs, maxRetries, initialBackoffMs, maxBackoffMs, userAgent } = FetchOptionsSchema.parse(opts);

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Why a new AbortController per attempt?
    // An aborted controller cannot be reused; aborting it permanently cancels
    // every future request that references its signal.  Creating one per attempt
    // isolates each attempt's lifetime from the others.
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        redirect: 'follow',    // transparently follow 301/302/307/308 chains
        signal: controller.signal,
        headers: {
          'user-agent': userAgent,
          ...(init?.headers ?? {}),  // caller-supplied headers take precedence
        },
      });

      // If we still have retries left and the status is retryable, drain the
      // body to release the connection slot, then wait before trying again.
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
      // AbortError means the timeout fired — do not retry; propagate immediately.
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const canRetry = attempt < maxRetries && !isAbort;
      if (!canRetry) throw err;

      const delay = backoffDelayMs(attempt, initialBackoffMs, maxBackoffMs);
      log('warn', 'Fetch failed; retrying', { url, attempt, delay }, err);
      await sleep(delay);
    } finally {
      // Always clear the timeout so the handle doesn't keep the event loop alive
      // after the request resolves (either success or non-retryable failure).
      clearTimeout(t);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('fetchWithRetry failed');
}

/**
 * Strip DOM boilerplate from an HTML string and return readable plain text.
 *
 * Pipeline:
 *   1. Parse HTML with Cheerio (server-side jQuery-like DOM).
 *   2. Remove elements that contribute noise without semantic value:
 *      scripts, stylesheets, inline SVGs, navigation, footers, sidebars.
 *   3. Extract the text content of `<body>` (or the whole document if there
 *      is no `<body>` tag).
 *   4. Decode HTML entities with the `he` library (handles both named and
 *      numeric references, e.g. `&amp;`, `&#160;`).
 *   5. Normalise whitespace: collapse runs of spaces/tabs, trim trailing
 *      whitespace on each line, and reduce triple+ blank lines to one.
 *
 * The resulting string is suitable as a Claude prompt input — compact,
 * entity-decoded, and free of executable or style noise.
 *
 * @param html - Raw HTML string from a fetch response body.
 * @returns Cleaned plain text.
 */
export function cleanHtmlToText(html: string): string {
  const $ = cheerio.load(html);
  // Remove structural/presentational elements that add noise but no content.
  $('script, style, noscript, svg, canvas, iframe, nav, footer, header, aside').remove();
  const text = $('body').text() || $.text();
  const decoded = he.decode(text);
  return decoded
    .replace(/\u00a0/g, ' ')       // non-breaking spaces → regular spaces
    .replace(/[ \t]+\n/g, '\n')    // trailing whitespace on lines
    .replace(/\n{3,}/g, '\n\n')    // 3+ blank lines → single blank line
    .replace(/[ \t]{2,}/g, ' ')    // runs of spaces/tabs → single space
    .trim();
}

/**
 * The result of fetching and cleaning a single web page.
 *
 * `finalUrl` may differ from `url` when the server issued a redirect.
 * `isHtml` signals whether HTML cleaning was applied (false for PDFs, plain
 * text, JSON APIs, etc.).
 */
export type FetchedPage = {
  /** The URL that was originally requested. */
  url: string;
  /** The URL after all redirects have been followed (from `Response.url`). */
  finalUrl: string;
  /** Value of the `Content-Type` response header, or `null` if absent. */
  contentType: string | null;
  /** HTTP response status code. */
  status: number;
  /** Cleaned page text ready for use as a Claude prompt. */
  text: string;
  /** `true` if the content-type header indicated HTML and cleaning was applied. */
  isHtml: boolean;
};

/**
 * Fetch a web page and return its cleaned text content.
 *
 * Combines `fetchWithRetry` for reliable delivery with `cleanHtmlToText` for
 * HTML normalisation.  Non-HTML content (PDF, JSON, plain text) is returned
 * trimmed but otherwise unchanged — best-effort readability.
 *
 * Error handling:
 *   - HTTP 4xx/5xx responses are returned (not thrown) with the status code
 *     set; callers should check `page.status >= 400`.
 *   - Body-read failures are logged and swallowed; `text` will be empty.
 *
 * @param url       - Target URL.
 * @param timeoutMs - Per-attempt timeout in ms (default 10 000 ms / 10 s).
 * @returns A {@link FetchedPage} describing the fetched content.
 */
export async function fetchPageText(url: string, timeoutMs = 10_000): Promise<FetchedPage> {
  const res = await fetchWithRetry(url, undefined, { timeoutMs, maxRetries: 2 });
  const contentType = res.headers.get('content-type');
  const isHtml = !!contentType && contentType.toLowerCase().includes('text/html');
  // `res.url` reflects the final URL after redirects; fall back to the
  // requested URL if the runtime doesn't expose it.
  const finalUrl = res.url || url;

  let text = '';
  try {
    text = await res.text();
  } catch (err) {
    log('warn', 'Failed reading response body', { url, finalUrl, status: res.status }, err);
  }

  // Apply DOM cleaning only for HTML; all other content types are trimmed as-is.
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

