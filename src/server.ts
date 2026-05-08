import Fastify from 'fastify';
import { z } from 'zod';
import { summarizeUrl } from './tools/summarize.js';
import { searchAndSummarize } from './tools/search.js';
import { extractEntities } from './tools/entities.js';
import { compareSources } from './tools/compare.js';
import { log } from './utils/logger.js';

const app = Fastify({ logger: false });

// ── Health / landing ──────────────────────────────────────────────────────────
app.get('/health', async (_req, reply) => {
  reply.type('application/json').send({ name: 'research-mcp', version: '1.0.0', status: 'ok' });
});

app.get('/', async (_req, reply) => {
  reply.type('text/html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>research-mcp</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0d1117;
      color: #e6edf3;
      min-height: 100vh;
    }
    header {
      background: linear-gradient(135deg, #161b22 0%, #1c2128 100%);
      border-bottom: 1px solid #30363d;
      padding: 48px 24px;
      text-align: center;
    }
    header h1 { font-size: 2.4rem; font-weight: 700; letter-spacing: -0.5px; }
    header h1 span { color: #58a6ff; }
    header p { margin-top: 12px; color: #8b949e; font-size: 1.05rem; max-width: 560px; margin-inline: auto; margin-top: 12px; }
    .badges { display: flex; gap: 8px; justify-content: center; margin-top: 20px; flex-wrap: wrap; }
    .badge {
      background: #21262d;
      border: 1px solid #30363d;
      border-radius: 20px;
      padding: 4px 14px;
      font-size: 0.8rem;
      color: #58a6ff;
    }
    .badge.green { color: #3fb950; }
    main { max-width: 900px; margin: 48px auto; padding: 0 24px; }
    h2 { font-size: 1.2rem; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 20px; }
    .tools { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 20px; margin-bottom: 48px; }
    .tool-card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 12px;
      padding: 24px;
      transition: border-color 0.2s;
    }
    .tool-card:hover { border-color: #58a6ff; }
    .tool-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .method { background: #1f6feb; color: white; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 4px; }
    .path { font-family: 'SF Mono', monospace; font-size: 1rem; color: #58a6ff; font-weight: 600; }
    .tool-desc { color: #8b949e; font-size: 0.9rem; margin-bottom: 16px; line-height: 1.5; }
    textarea, input[type=text] {
      width: 100%;
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 8px;
      color: #e6edf3;
      font-family: 'SF Mono', monospace;
      font-size: 0.82rem;
      padding: 10px 12px;
      resize: vertical;
      outline: none;
      transition: border-color 0.2s;
    }
    textarea:focus, input[type=text]:focus { border-color: #58a6ff; }
    button {
      margin-top: 10px;
      background: #238636;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 8px 20px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #2ea043; }
    button:disabled { background: #21262d; color: #484f58; cursor: not-allowed; }
    .result {
      margin-top: 12px;
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 12px;
      font-family: 'SF Mono', monospace;
      font-size: 0.78rem;
      color: #3fb950;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 260px;
      overflow-y: auto;
      display: none;
    }
    .result.error { color: #f85149; }
    .result.show { display: block; }
    .result.entities { font-family: sans-serif; color: #e6edf3; }
    .result.summary {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 0.88rem;
      color: #e6edf3;
      line-height: 1.7;
    }
    .result.summary h3 { color: #58a6ff; font-size: 1rem; margin-bottom: 8px; }
    .result.summary ul { padding-left: 18px; margin: 4px 0; }
    .result.summary li { margin-bottom: 6px; }
    .result.summary strong { color: #f0f6fc; }
    .ent-group { margin-bottom: 10px; }
    .ent-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1px; color: #8b949e; margin-bottom: 6px; font-family: sans-serif; }
    .ent-items { display: flex; flex-wrap: wrap; gap: 6px; }
    .badge-item { background: #21262d; border: 1px solid #30363d; border-radius: 20px; padding: 3px 10px; font-size: 0.8rem; color: #e6edf3; font-family: sans-serif; }
    .conf { color: #3fb950; font-size: 0.72rem; margin-left: 4px; }
    footer {
      text-align: center;
      padding: 32px;
      color: #484f58;
      font-size: 0.85rem;
      border-top: 1px solid #21262d;
    }
    footer a { color: #58a6ff; text-decoration: none; }
  </style>
</head>
<body>
  <header>
    <h1>🔬 <span>research</span>-mcp</h1>
    <p>Production-ready AI research API — summarize URLs, extract entities, search the web, and compare sources.</p>
    <div class="badges">
      <span class="badge green">● Live</span>
      <span class="badge">MCP Compatible</span>
      <span class="badge">Claude Sonnet 4.6</span>
      <span class="badge">TypeScript</span>
    </div>
  </header>

  <main>
    <h2>Try the API</h2>
    <div class="tools">

      <!-- Summarize -->
      <div class="tool-card">
        <div class="tool-header">
          <span class="method">POST</span>
          <span class="path">/summarize</span>
        </div>
        <p class="tool-desc">Fetch any public URL and get an AI-generated bullet-point summary.</p>
        <input type="text" id="summarize-url" placeholder="https://en.wikipedia.org/wiki/Artificial_intelligence" />
        <button onclick="call('summarize', this)">Run</button>
        <pre class="result summary" id="summarize-result"></pre>
      </div>

      <!-- Entities -->
      <div class="tool-card">
        <div class="tool-header">
          <span class="method">POST</span>
          <span class="path">/entities</span>
        </div>
        <p class="tool-desc">Extract people, organizations, locations and key concepts from text.</p>
        <textarea id="entities-text" rows="3" placeholder="Anthropic released Claude 4 in San Francisco alongside OpenAI and Google DeepMind..."></textarea>
        <button onclick="call('entities', this)">Run</button>
        <pre class="result entities" id="entities-result"></pre>
      </div>

      <!-- Search -->
      <div class="tool-card">
        <div class="tool-header">
          <span class="method">POST</span>
          <span class="path">/search</span>
        </div>
        <p class="tool-desc">Search DuckDuckGo, fetch results in parallel, and summarize each source.</p>
        <input type="text" id="search-query" placeholder="Model Context Protocol 2025" />
        <button onclick="call('search', this)">Run</button>
        <pre class="result" id="search-result"></pre>
      </div>

      <!-- Compare -->
      <div class="tool-card">
        <div class="tool-header">
          <span class="method">POST</span>
          <span class="path">/compare</span>
        </div>
        <p class="tool-desc">Compare multiple URLs and get a structured analysis of agreements and contradictions.</p>
        <textarea id="compare-urls" rows="3" placeholder="https://en.wikipedia.org/wiki/Artificial_intelligence&#10;https://en.wikipedia.org/wiki/Machine_learning"></textarea>
        <button onclick="call('compare', this)">Run</button>
        <pre class="result" id="compare-result"></pre>
      </div>

    </div>
  </main>

  <footer>
    Built with TypeScript · <a href="https://github.com/pritmon/research-mcp" target="_blank">GitHub</a> · Powered by Claude Sonnet 4.6
  </footer>

  <script>
    function badge(name, score) {
      return '<span class="badge-item">' + name + ' <span class="conf">' + Math.round(score * 100) + '%</span></span>';
    }
    function section(label, items, key) {
      if (!items || !items.length) return '';
      return '<div class="ent-group"><div class="ent-label">' + label + '</div><div class="ent-items">' +
        items.map(function(i) { return badge(i[key], i.confidence); }).join('') +
        '</div></div>';
    }
    function renderSummary(text) {
      return text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
        .replace(/^## (.+)$/gm, '<h3>$1</h3>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/\\n\\n/g, '<br/>');
    }
    function renderEntities(d) {
      return section('People', d.people, 'name') +
        section('Organizations', d.organizations, 'name') +
        section('Locations', d.locations, 'name') +
        section('Key Concepts', d.key_concepts, 'concept') +
        '<div class="ent-group"><div class="ent-label">Sentiment</div><div class="ent-items"><span class="badge-item">' + d.sentiment + '</span></div></div>' +
        '<div class="ent-group"><div class="ent-label">Language</div><div class="ent-items"><span class="badge-item">' + d.language + '</span></div></div>';
    }
    async function call(tool, btn) {
      const resultEl = document.getElementById(tool + '-result');
      resultEl.className = 'result show';
      resultEl.textContent = 'Loading...';
      btn.disabled = true;
      let body = {};
      if (tool === 'summarize') {
        const val = document.getElementById('summarize-url').value.trim();
        if (!val) { resultEl.textContent = 'Please enter a URL.'; resultEl.className = 'result error show'; btn.disabled = false; return; }
        body = { url: val };
      } else if (tool === 'entities') {
        const val = document.getElementById('entities-text').value.trim();
        if (!val) { resultEl.textContent = 'Please enter some text.'; resultEl.className = 'result error show'; btn.disabled = false; return; }
        body = { text: val };
      } else if (tool === 'search') {
        const val = document.getElementById('search-query').value.trim();
        if (!val) { resultEl.textContent = 'Please enter a search query.'; resultEl.className = 'result error show'; btn.disabled = false; return; }
        body = { query: val, num_results: 3 };
      } else if (tool === 'compare') {
        const val = document.getElementById('compare-urls').value.trim();
        const urls = val.split('\\n').map(function(u) { return u.trim(); }).filter(Boolean);
        if (urls.length < 2) { resultEl.textContent = 'Please enter at least 2 URLs (one per line).'; resultEl.className = 'result error show'; btn.disabled = false; return; }
        body = { urls: urls };
      }
      try {
        const res = await fetch('/' + tool, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (tool === 'summarize' && data.summary) {
          resultEl.innerHTML = renderSummary(data.summary);
        } else if (tool === 'entities') {
          resultEl.innerHTML = renderEntities(data);
        } else {
          resultEl.textContent = JSON.stringify(data, null, 2);
        }
        resultEl.className = res.ok ? 'result show' : 'result error show';
      } catch (e) {
        resultEl.textContent = 'Error: ' + e.message;
        resultEl.className = 'result error show';
      }
      btn.disabled = false;
    }
  </script>
</body>
</html>`);
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

app.listen({ port: PORT, host: '0.0.0.0' })
  .then(address => log('info', 'research-mcp HTTP server started', { address }))
  .catch(err => {
    log('error', 'Server failed to start', {}, err);
    process.exit(1);
  });
