/**
 * @module tools/entities
 *
 * `extract_entities` tool — identify and classify named entities in free text.
 *
 * Role in the system:
 *   Given an arbitrary text passage (e.g., a news article or research note),
 *   this tool asks Claude to extract structured entities — people, organisations,
 *   locations, key concepts — along with per-entity confidence scores, an overall
 *   sentiment label, and a detected language code.
 *
 * Output contract:
 *   The response is validated against `EntitiesSchema` by `claudeJson`, which
 *   retries if Claude returns malformed or invalid JSON.  Consumers can rely on
 *   the Zod-inferred type `ExtractedEntities` being fully populated (array
 *   fields default to `[]` if the model returns nothing for a category).
 *
 * Prompt strategy:
 *   The schema shape is serialised into the prompt so Claude has an explicit
 *   structural contract to target.  This reduces the rate of schema mismatches
 *   that would trigger a validation retry.
 */

import { z } from 'zod';
import { claudeJson } from '../utils/claude.js';

/**
 * Input schema for the `extract_entities` MCP tool.
 *
 * The 40 000-char cap limits prompt size to roughly 10 000 tokens — enough for
 * a long article while preventing accidental abuse with very large documents.
 */
export const ExtractEntitiesInputSchema = z.object({
  text: z.string().min(1).max(40_000),
});

/**
 * Zod schema describing the structured entity extraction output.
 *
 * All array fields default to `[]` so the caller always gets a valid object
 * even if Claude finds no entities in a given category.
 *
 * Confidence scores are in [0, 1]:
 *   - 0.9+ : unambiguous, high-confidence extraction
 *   - 0.5–0.89 : probable but context-dependent
 *   - < 0.5 : uncertain; may be a false positive
 *
 * `sentiment` is constrained by prompt instruction (not Zod enum) to:
 *   "positive" | "neutral" | "negative" | "mixed"
 *
 * `language` is an ISO 639-1 code when possible (e.g., "en", "fr", "de").
 */
export const EntitiesSchema = z.object({
  people: z.array(z.object({ name: z.string(), confidence: z.number().min(0).max(1) })).default([]),
  organizations: z.array(z.object({ name: z.string(), confidence: z.number().min(0).max(1) })).default([]),
  locations: z.array(z.object({ name: z.string(), confidence: z.number().min(0).max(1) })).default([]),
  key_concepts: z.array(z.object({ concept: z.string(), confidence: z.number().min(0).max(1) })).default([]),
  sentiment: z.string(),
  language: z.string(),
});

/** TypeScript type inferred from `EntitiesSchema` — the shape returned by `extractEntities`. */
export type ExtractedEntities = z.infer<typeof EntitiesSchema>;

/**
 * Extract structured named entities and metadata from a text passage.
 *
 * Uses `claudeJson` (rather than `claudeText`) so the response is automatically
 * validated against `EntitiesSchema`.  If Claude returns malformed JSON or a
 * structurally invalid object, `claudeJson` will retry up to `maxRetries` times
 * before propagating the error.
 *
 * Prompt notes:
 *   - "Keep names canonical" reduces noise from abbreviations vs. full names
 *     (e.g., avoids duplicating "IBM" and "International Business Machines").
 *   - Embedding `EntitiesSchema.shape` in the prompt gives Claude an explicit
 *     JSON schema to target, reducing structural mismatch retries.
 *
 * @param text - The text to analyse (max 40 000 chars per `ExtractEntitiesInputSchema`).
 * @returns A fully validated `ExtractedEntities` object.
 * @throws If Claude repeatedly returns invalid responses or if the API is unavailable.
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
    // Serialising the schema shape directly into the prompt gives Claude a
    // precise structural target and reduces ZodError retries.
    'Output JSON schema:',
    JSON.stringify(EntitiesSchema.shape, null, 2),
    '',
    'Text:',
    text,
  ].join('\n');

  return await claudeJson(prompt, EntitiesSchema, { timeoutMs: 30_000, maxRetries: 3 });
}

