/**
 * @module claude
 *
 * Thin, resilient wrapper around the Anthropic Messages API.
 *
 * Role in the system:
 *   Every tool that needs AI generation (`summarize`, `entities`, `compare`,
 *   `search`) imports either `claudeText` or `claudeJson` from this module.
 *   Centralising the API call here means retry logic, timeouts, and the model
 *   choice are maintained in one place rather than duplicated across tools.
 *
 * Key design decisions:
 *   - `claudeText` handles plain-text responses; `claudeJson` layers structured
 *     output and Zod validation on top of `claudeText`, retrying on both
 *     transient API errors *and* parse/validation failures.
 *   - Per-request AbortController timeouts rather than a global SDK timeout so
 *     each retry attempt gets a fresh `timeoutMs` budget.
 *   - Temperature 0.2: low enough to produce deterministic, factual answers but
 *     not so rigid that entity/summary outputs feel stilted.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { log } from './logger.js';

/** Model to use for all Claude API calls in this server. */
const CLAUDE_MODEL = 'claude-sonnet-4-6';

/**
 * Zod schema that validates and provides sensible defaults for every Claude
 * call.  Callers pass `Partial<ClaudeOptions>` and get a fully-resolved config
 * back via `ClaudeOptionsSchema.parse(opts ?? {})`.
 */
const ClaudeOptionsSchema = z.object({
  /** Hard per-attempt wall-clock timeout in ms before the request is aborted. */
  timeoutMs: z.number().int().positive().default(30_000),
  /** Maximum number of retry attempts after the first failure. */
  maxRetries: z.number().int().min(0).max(8).default(3),
  /** Backoff delay (ms) for the first retry; doubles on each subsequent attempt. */
  initialBackoffMs: z.number().int().positive().default(400),
  /** Upper bound on any single backoff delay in ms. */
  maxBackoffMs: z.number().int().positive().default(6_000),
  /** Maximum tokens the model may generate in a single response. */
  maxTokens: z.number().int().positive().default(2_000),
});

type ClaudeOptions = z.infer<typeof ClaudeOptionsSchema>;

/**
 * Async sleep helper — centralised so it is easy to stub in tests.
 *
 * @param ms - Duration in milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Compute the next backoff delay using truncated exponential backoff + jitter.
 *
 * Uses `min(400, base)` as the jitter cap (slightly larger than the fetch
 * utility's 250 ms cap) to spread concurrent Claude retries more broadly,
 * reducing the chance of a coordinated "thundering herd" against the API.
 *
 * @param attempt - Zero-based retry index.
 * @param initial - Base delay in ms.
 * @param max     - Hard cap in ms.
 */
function backoffDelayMs(attempt: number, initial: number, max: number): number {
  const base = Math.min(max, initial * 2 ** attempt);
  const jitter = Math.floor(Math.random() * Math.min(400, base));
  return Math.min(max, base + jitter);
}

/**
 * Heuristically decide whether a Claude SDK error is worth retrying.
 *
 * We inspect the error message string because the Anthropic SDK surfaces many
 * failure modes as plain `Error` objects with descriptive messages rather than
 * distinct subclasses.  Keywords covered:
 *   - "timeout" / "etimedout"   — network or API timeout
 *   - "rate"                    — 429 rate-limited
 *   - "overloaded" / "temporarily" — Anthropic service degradation
 *   - "network" / "econnreset"  — TCP-level transient failures
 *
 * @param err - The caught error value from a `messages.create` call.
 */
function isRetryableClaudeError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('rate') ||
    msg.includes('overloaded') ||
    msg.includes('temporarily') ||
    msg.includes('network') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout')
  );
}

/**
 * Instantiate an Anthropic SDK client using the API key from the environment.
 *
 * Why a factory function rather than a module-level singleton?
 *   - A singleton would throw at import time if `ANTHROPIC_API_KEY` is absent,
 *     making it hard to load the module in test environments without a real key.
 *   - Calling `getClaudeClient()` lazily inside each tool invocation means the
 *     error surfaces at call time with a clear message rather than crashing the
 *     process during startup.
 *
 * @returns A configured `Anthropic` client instance.
 * @throws {Error} If `ANTHROPIC_API_KEY` is not set in the environment.
 */
export function getClaudeClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY in environment');
  }
  return new Anthropic({ apiKey });
}

/**
 * Send a single-turn prompt to Claude and return the response as a plain string.
 *
 * Retry behaviour:
 *   - Retries up to `maxRetries` times on transient API/network errors.
 *   - Each attempt gets its own `AbortController` timeout so a hung request
 *     does not consume the full retry budget.
 *   - Abort (genuine timeout) errors are **not** retried — the API already took
 *     longer than `timeoutMs`; retrying would exceed the caller's latency budget.
 *
 * @param prompt - The full user-turn text to send.
 * @param opts   - Optional overrides for timeout, retries, token limit, etc.
 * @returns The assistant's response text (all `text` content blocks joined).
 * @throws {Error} On non-retryable errors or when all retries are exhausted.
 */
export async function claudeText(
  prompt: string,
  opts?: Partial<ClaudeOptions>
): Promise<string> {
  const { timeoutMs, maxRetries, initialBackoffMs, maxBackoffMs, maxTokens } = ClaudeOptionsSchema.parse(opts ?? {});
  const client = getClaudeClient();

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // A fresh AbortController per attempt — an already-aborted controller
    // cannot be reused; its signal stays permanently aborted.
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const msg = await client.messages.create(
        {
          model: CLAUDE_MODEL,
          max_tokens: maxTokens,
          // Low temperature: encourages factual, reproducible responses
          // rather than creative or stochastic ones — important for research tasks.
          temperature: 0.2,
          messages: [{ role: 'user', content: prompt }],
        },
        { signal: controller.signal }
      );

      // The Messages API can return multiple content blocks (text, tool_use, …).
      // We filter to only `text` blocks and join them; tool_use blocks are never
      // expected here since we don't supply any tools in this call.
      const parts = msg.content
        .filter(c => c.type === 'text')
        .map(c => (c.type === 'text' ? c.text : ''));

      const text = parts.join('\n').trim();
      if (!text) throw new Error('Claude returned empty text');
      return text;
    } catch (err) {
      lastErr = err;
      const retry = attempt < maxRetries && isRetryableClaudeError(err);
      if (!retry) throw err;
      const delay = backoffDelayMs(attempt, initialBackoffMs, maxBackoffMs);
      log('warn', 'Claude call failed; retrying', { attempt, delay }, err);
      await sleep(delay);
    } finally {
      // Always clear the timer to prevent it from firing after a successful
      // response and unnecessarily aborting a future request sharing the same
      // variable scope.
      clearTimeout(t);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('claudeText failed');
}

/**
 * Send a prompt to Claude and parse its response as a Zod-validated JSON object.
 *
 * Contract:
 *   The prompt is suffixed with an instruction to return only raw JSON (no
 *   markdown fences) so the response can be passed straight to `JSON.parse`.
 *   A light fence-strip step handles cases where the model ignores this
 *   instruction despite the explicit wording.
 *
 * Retry scope:
 *   Retries on three distinct failure categories:
 *   1. Transient Claude/network errors (via `isRetryableClaudeError`).
 *   2. `SyntaxError` from `JSON.parse` — model returned invalid JSON.
 *   3. `ZodError` from `schema.parse` — model returned valid JSON but with the
 *      wrong shape.
 *   This means the outer retry loop here covers parse/validation failures
 *   in addition to the network-level retries inside `claudeText`.  To avoid
 *   double-counting retries, `claudeText` is called with `maxRetries: 0` so
 *   only the outer loop backs off.
 *
 * @param prompt - Full user-turn prompt (the JSON instruction is appended).
 * @param schema - Zod schema describing the expected JSON shape.
 * @param opts   - Optional overrides (note: `maxRetries` here controls the
 *                 parse/validate retry loop, not the inner `claudeText` retries).
 * @returns Zod-validated output matching `schema`.
 * @throws The last error if all retries fail (SyntaxError, ZodError, or network).
 */
export async function claudeJson<S extends z.ZodTypeAny>(
  prompt: string,
  schema: S,
  opts?: Partial<ClaudeOptions>
): Promise<z.output<S>> {
  const { timeoutMs, maxRetries, initialBackoffMs, maxBackoffMs } = ClaudeOptionsSchema.parse(opts ?? {});

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Pass `maxRetries: 0` so claudeText doesn't add its own retry loop on
      // top of this one — we want a single unified retry counter.
      const text = await claudeText(
        `${prompt}\n\nReturn ONLY valid JSON with no markdown fences.`,
        { timeoutMs, maxRetries: 0 }
      );

      // Strip accidental markdown code fences (```json … ```) that some
      // model versions emit even when told not to.
      const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(clean) as unknown;
      // Zod validates and coerces the parsed object; throws ZodError if invalid.
      return schema.parse(parsed);
    } catch (err) {
      lastErr = err;
      // Retry on transient API errors OR malformed JSON OR wrong JSON shape.
      const retryable = isRetryableClaudeError(err) || err instanceof SyntaxError || err instanceof z.ZodError;
      const retry = attempt < maxRetries && retryable;
      if (!retry) throw err;
      const delay = backoffDelayMs(attempt, initialBackoffMs, maxBackoffMs);
      log('warn', 'Claude JSON parse/validate failed; retrying', { attempt, delay }, err);
      await sleep(delay);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('claudeJson failed');
}

