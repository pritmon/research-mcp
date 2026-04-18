import { z } from 'zod';
import { claudeJson } from '../utils/claude.js';

export const ExtractEntitiesInputSchema = z.object({
  text: z.string().min(1).max(40_000),
});

export const EntitiesSchema = z.object({
  people: z.array(z.object({ name: z.string(), confidence: z.number().min(0).max(1) })).default([]),
  organizations: z.array(z.object({ name: z.string(), confidence: z.number().min(0).max(1) })).default([]),
  locations: z.array(z.object({ name: z.string(), confidence: z.number().min(0).max(1) })).default([]),
  key_concepts: z.array(z.object({ concept: z.string(), confidence: z.number().min(0).max(1) })).default([]),
  sentiment: z.string(),
  language: z.string(),
});

export type ExtractedEntities = z.infer<typeof EntitiesSchema>;

/**
 * Extract structured entities from text using Claude.
 *
 * Returns:
 * `{ people, organizations, locations, key_concepts, sentiment, language }`
 * with per-entity confidence scores in \([0,1]\).
 */
export async function extractEntities(text: string): Promise<ExtractedEntities> {
  const prompt = [
    'Extract structured entities from the provided text.',
    '',
    'Rules:',
    '- Include confidence scores in [0,1].',
    '- Keep names canonical (e.g., "International Business Machines" not "IBM" unless only acronym appears).',
    '- sentiment must be one of: positive | neutral | negative | mixed',
    '- language must be an ISO 639-1 code when possible (e.g., "en").',
    '',
    'Output JSON schema:',
    JSON.stringify(EntitiesSchema.shape, null, 2),
    '',
    'Text:',
    text,
  ].join('\n');

  return await claudeJson(prompt, EntitiesSchema, { timeoutMs: 30_000, maxRetries: 3 });
}

