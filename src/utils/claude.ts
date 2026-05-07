import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { log } from './logger.js';

const CLAUDE_MODEL = 'claude-sonnet-4-6';

const ClaudeOptionsSchema = z.object({
  timeoutMs: z.number().int().positive().default(30_000),
  maxRetries: z.number().int().min(0).max(8).default(3),
  initialBackoffMs: z.number().int().positive().default(400),
  maxBackoffMs: z.number().int().positive().default(6_000),
  maxTokens: z.number().int().positive().default(2_000),
});

type ClaudeOptions = z.infer<typeof ClaudeOptionsSchema>;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function backoffDelayMs(attempt: number, initial: number, max: number): number {
  const base = Math.min(max, initial * 2 ** attempt);
  const jitter = Math.floor(Math.random() * Math.min(400, base));
  return Math.min(max, base + jitter);
}

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
 * Create an Anthropic client from environment.
 *
 * @throws if `ANTHROPIC_API_KEY` is not set.
 */
export function getClaudeClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ANTHROPIC_API_KEY in environment');
  }
  return new Anthropic({ apiKey });
}

/**
 * Call Claude and return plain text, with retries and a hard timeout.
 */
export async function claudeText(
  prompt: string,
  opts?: Partial<ClaudeOptions>
): Promise<string> {
  const { timeoutMs, maxRetries, initialBackoffMs, maxBackoffMs, maxTokens } = ClaudeOptionsSchema.parse(opts ?? {});
  const client = getClaudeClient();

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const msg = await client.messages.create(
        {
          model: CLAUDE_MODEL,
          max_tokens: maxTokens,
          temperature: 0.2,
          messages: [{ role: 'user', content: prompt }],
        },
        { signal: controller.signal }
      );

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
      clearTimeout(t);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('claudeText failed');
}

/**
 * Call Claude and parse a JSON object from its response.
 *
 * This uses a strict "return ONLY JSON" contract plus Zod validation and will
 * retry on transient Claude/API errors and on JSON parse/validation failures.
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
      const text = await claudeText(
        `${prompt}\n\nReturn ONLY valid JSON with no markdown fences.`,
        { timeoutMs, maxRetries: 0 }
      );

      const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(clean) as unknown;
      return schema.parse(parsed);
    } catch (err) {
      lastErr = err;
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

