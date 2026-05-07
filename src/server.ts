import Fastify from 'fastify';
import { z } from 'zod';
import { summarizeUrl } from './tools/summarize.js';
import { searchAndSummarize } from './tools/search.js';
import { extractEntities } from './tools/entities.js';
import { compareSources } from './tools/compare.js';
import { log } from './utils/logger.js';

const app = Fastify({ logger: false });

// ── Health / landing ──────────────────────────────────────────────────────────
app.get('/', async (_req, reply) => {
  reply.type('application/json').send({
    name: 'research-mcp',
    version: '1.0.0',
    status: 'ok',
    tools: [
      { method: 'POST', path: '/summarize',  body: '{ "url": "https://..." }' },
      { method: 'POST', path: '/search',     body: '{ "query": "...", "num_results": 3 }' },
      { method: 'POST', path: '/entities',   body: '{ "text": "..." }' },
      { method: 'POST', path: '/compare',    body: '{ "urls": ["https://...", "https://..."] }' },
    ],
  });
});

// ── POST /summarize ───────────────────────────────────────────────────────────
app.post('/summarize', async (req, reply) => {
  const parsed = z.object({ url: z.string().url() }).safeParse(req.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
  try {
    const summary = await summarizeUrl(parsed.data.url);
    return reply.send({ url: parsed.data.url, summary });
  } catch (err) {
    log('error', 'POST /summarize failed', {}, err);
    return reply.status(500).send({ error: (err as Error).message });
  }
});

// ── POST /search ──────────────────────────────────────────────────────────────
app.post('/search', async (req, reply) => {
  const parsed = z.object({
    query: z.string().min(2),
    num_results: z.number().int().min(1).max(8).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
  try {
    const result = await searchAndSummarize(parsed.data.query, parsed.data.num_results ?? 5);
    return reply.send(result);
  } catch (err) {
    log('error', 'POST /search failed', {}, err);
    return reply.status(500).send({ error: (err as Error).message });
  }
});

// ── POST /entities ────────────────────────────────────────────────────────────
app.post('/entities', async (req, reply) => {
  const parsed = z.object({ text: z.string().min(1).max(40_000) }).safeParse(req.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
  try {
    const entities = await extractEntities(parsed.data.text);
    return reply.send(entities);
  } catch (err) {
    log('error', 'POST /entities failed', {}, err);
    return reply.status(500).send({ error: (err as Error).message });
  }
});

// ── POST /compare ─────────────────────────────────────────────────────────────
app.post('/compare', async (req, reply) => {
  const parsed = z.object({
    urls: z.array(z.string().url()).min(2).max(6),
  }).safeParse(req.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
  try {
    const result = await compareSources(parsed.data.urls);
    return reply.send(result);
  } catch (err) {
    log('error', 'POST /compare failed', {}, err);
    return reply.status(500).send({ error: (err as Error).message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? '3000', 10);

app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    log('error', 'Server failed to start', {}, err);
    process.exit(1);
  }
  log('info', 'research-mcp HTTP server started', { address });
});
