# Deployment Guide — Problems Faced & How They Were Resolved

A full record of every real issue encountered while building, deploying, and
running this project — including the root cause and the exact fix applied.

---

## Table of Contents

1. [Claude Desktop — MCP server not starting](#1-claude-desktop--mcp-server-not-starting)
2. [Claude Desktop — `node` command not found](#2-claude-desktop--node-command-not-found)
3. [Anthropic API — 401 Unauthorized](#3-anthropic-api--401-unauthorized)
4. [Anthropic API — deprecated model ID](#4-anthropic-api--deprecated-model-id)
5. [compare_sources — JSON response truncated](#5-compare_sources--json-response-truncated)
6. [Claude — wrapping JSON in markdown fences](#6-claude--wrapping-json-in-markdown-fences)
7. [Render — wrong start command (MCP server instead of HTTP)](#7-render--wrong-start-command-mcp-server-instead-of-http)
8. [Render — Fastify v5 `.listen()` callback silently ignored](#8-render--fastify-v5-listen-callback-silently-ignored)
9. [Render — search returning HTML instead of JSON (504 timeout)](#9-render--search-returning-html-instead-of-json-504-timeout)
10. [Render — DuckDuckGo API blocked on cloud IPs](#10-render--duckduckgo-api-blocked-on-cloud-ips)
11. [Search — empty results due to double-fetching](#11-search--empty-results-due-to-double-fetching)
12. [Search — wrong Wikipedia article returned](#12-search--wrong-wikipedia-article-returned)
13. [Search — too slow (15–25 seconds per query)](#13-search--too-slow-1525-seconds-per-query)
14. [Embedded HTML/JS — escape sequences eaten by TypeScript template literals](#14-embedded-htmljs--escape-sequences-eaten-by-typescript-template-literals)
15. [Demo UI — Run buttons broken (event global not reliable)](#15-demo-ui--run-buttons-broken-event-global-not-reliable)
16. [Demo UI — results showing raw JSON instead of formatted UI](#16-demo-ui--results-showing-raw-json-instead-of-formatted-ui)

---

## 1. Claude Desktop — MCP server not starting

**Symptom**
The MCP server appeared in Claude Desktop's config but tools were never available.
No error was shown — it simply silently did nothing.

**Root cause**
The project lived inside a folder called `CLAUDE CODE` (with a space).
In ESM, `import.meta.url` is a `file://` URL — spaces are percent-encoded as `%20`.
So `import.meta.url` contained `CLAUDE%20CODE` while `process.argv[1]` contained
the literal path with a space. The entrypoint guard:

```typescript
// BROKEN — never true when path contains spaces
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

...always evaluated to `false`, so `main()` was never called and the server
silently exited without connecting to the stdio transport.

**Fix**
Decode the URL before comparing:

```typescript
// FIXED — decodeURI normalises %20 → space before comparison
if (decodeURI(new URL(import.meta.url).pathname) === process.argv[1]) {
  main();
}
```

**Lesson**
Never assume file paths are URL-safe. Any space, parenthesis, or non-ASCII
character in a directory name will be percent-encoded in `import.meta.url`.
Always decode before comparing.

---

## 2. Claude Desktop — `node` command not found

**Symptom**
Even after fixing the entrypoint guard, Claude Desktop logged an error like
`spawn node ENOENT` — it couldn't find the `node` executable.

**Root cause**
Claude Desktop is a GUI application launched by macOS, not from a terminal.
GUI apps on macOS do not inherit the shell `PATH` that you configure in
`.zshrc` or `.bash_profile`. The `node` command resolves correctly in a
terminal because the terminal sets up `PATH` — but Claude Desktop has only
the default system `PATH`, which does not include Homebrew or `nvm` paths.

**Fix**
Use the absolute path to the Node binary in the Claude Desktop config:

```json
// BROKEN
{ "command": "node" }

// FIXED
{ "command": "/usr/local/bin/node" }
```

Find your Node path with `which node` in a terminal.

**Lesson**
For any application launched outside a terminal (Claude Desktop, cron jobs,
launchd, systemd services), never rely on PATH-relative commands. Always use
absolute binary paths.

---

## 3. Anthropic API — 401 Unauthorized

**Symptom**
Every Claude call failed immediately with HTTP 401 and the message
`"invalid x-api-key"`.

**Root cause**
The API key being used had been revoked in the Anthropic Console (either
manually or because it was previously exposed). The SDK does not distinguish
between "wrong key" and "revoked key" — both return 401.

**Fix**
1. Log into [console.anthropic.com](https://console.anthropic.com)
2. Generate a new API key
3. Update the `ANTHROPIC_API_KEY` environment variable in Render's dashboard
   and in the local `.env` / shell config

**Lesson**
API keys should be treated as passwords. Rotate them immediately if they
appear in logs, screenshots, or source code. Never commit them to git.

---

## 4. Anthropic API — deprecated model ID

**Symptom**
Claude API calls returned a 404 or "model not found" error.

**Root cause**
The initial code used `claude-sonnet-4-20250514` — a model ID that had been
retired. Anthropic deprecates model IDs over time as new versions are released.

**Fix**
Update `CLAUDE_MODEL` in `src/utils/claude.ts` to the current model:

```typescript
// BEFORE
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

// AFTER
const CLAUDE_MODEL = 'claude-sonnet-4-6';
```

**Lesson**
Always check the [Anthropic docs](https://docs.anthropic.com/en/docs/about-claude/models)
for the current model ID. Prefer the latest stable model alias rather than
a version-dated snapshot ID to reduce future maintenance.

---

## 5. compare_sources — JSON response truncated

**Symptom**
The `compare_sources` tool returned a partial JSON object that cut off mid-string.
JSON parsing would fail or produce incomplete results.

**Root cause**
`max_tokens` was hardcoded at `800` across all Claude calls. A comparison
across multiple sources requires outputting a large JSON object (sources array
+ agreements + contradictions + consensus). 800 tokens is often not enough.

**Fix**
Made `maxTokens` a configurable option on `claudeText` / `claudeJson`, with a
default of 2000. For `compare_sources` specifically, set it to 4000:

```typescript
// In compare.ts
await claudeJson(prompt, CompareSourcesOutputSchema, {
  timeoutMs: 60_000,
  maxRetries: 3,
  maxTokens: 4_000,   // ← raised from hardcoded 800
});
```

**Lesson**
Always size `max_tokens` based on the maximum expected output length of the
specific call. A single global cap will either waste quota (too high) or
silently truncate responses (too low).

---

## 6. Claude — wrapping JSON in markdown fences

**Symptom**
`claudeJson` threw `SyntaxError: Unexpected token` when parsing Claude's response.
Logging the raw response revealed it contained:

~~~
```json
{ "people": [...] }
```
~~~

**Root cause**
Claude sometimes wraps JSON output in markdown code fences even when instructed
not to. This is a known model behaviour, particularly with smaller or older models.

**Fix**
Strip markdown fences before passing to `JSON.parse`:

```typescript
const clean = text
  .replace(/^```(?:json)?\s*/i, '')
  .replace(/\s*```$/, '')
  .trim();
const parsed = JSON.parse(clean);
```

**Lesson**
Never trust that an LLM will follow formatting instructions 100% of the time.
Always sanitise structured outputs before parsing. Add this stripping to any
code that parses Claude's text as JSON.

---

## 7. Render — wrong start command (MCP server instead of HTTP)

**Symptom**
The Render deploy showed "live" but immediately crashed. Logs showed the process
exiting with code 0 after less than a second.

**Root cause**
The initial Render Start Command was `node dist/src/index.js` — the MCP stdio
server. The stdio server blocks waiting for JSON-RPC messages on stdin. When
run on Render (where there is no MCP host sending messages), stdin is empty,
so the process has nothing to do and exits cleanly.

**Fix**
Change the Render Start Command to the HTTP server:

```
# WRONG — MCP server exits immediately with no stdin input
node dist/src/index.js

# CORRECT — HTTP server binds to a port and stays alive
node dist/src/server.js
```

Update via Render dashboard → Service → Settings → Start Command, or in
`render.yaml`:

```yaml
startCommand: node dist/src/server.js
```

**Lesson**
MCP stdio servers are not web servers. They are designed to be spawned by a
host application and communicate over stdin/stdout. They cannot be deployed as
a long-running HTTP service without wrapping them with an HTTP layer.

---

## 8. Render — Fastify v5 `.listen()` callback silently ignored

**Symptom**
The HTTP server appeared to start (no crash) but never logged the "server started"
message and never responded to requests. The Render health check timed out.

**Root cause**
Fastify v5 changed the API for `.listen()`. In v4, a callback was accepted:

```typescript
// v4 — WORKS
app.listen({ port: 3000 }, (err, address) => {
  if (err) process.exit(1);
  console.log(`Listening on ${address}`);
});
```

In v5, the callback form was **removed**. Passing a callback silently does
nothing — the server still starts but the callback is never invoked, so no
startup log is emitted and any error in the callback is lost.

**Fix**
Use the Promise form:

```typescript
// v5 — CORRECT
app.listen({ port: PORT, host: '0.0.0.0' })
  .then(address => log('info', 'Server started', { address }))
  .catch(err => { log('error', 'Failed to start', {}, err); process.exit(1); });
```

**Lesson**
When upgrading major framework versions, read the breaking changes section.
Silent API changes (callback → Promise) are the hardest to debug because the
code compiles and runs without errors, but the expected side-effect never occurs.

---

## 9. Render — search returning HTML instead of JSON (504 timeout)

**Symptom**
The search endpoint returned an error in the browser:
`Unexpected token '<', "<!DOCTYPE "... is not valid JSON`

The client called `response.json()` and got an HTML page instead of JSON.

**Root cause**
Render's free tier enforces a hard 30-second HTTP request timeout. The search
tool was fetching 3 URLs, making 3 parallel Claude calls (each up to 30 seconds),
and in the worst case taking 35–40 seconds total. Render killed the connection
and returned a `504 Gateway Timeout` HTML error page.

The browser-side code called `res.json()` on the HTML response, which immediately
threw a SyntaxError.

**Fix**
Two changes:

1. **Server-side timeout** — race the search against a 25-second deadline so
   Render never has a chance to return HTML:

```typescript
const timeout = new Promise<never>((_, reject) =>
  setTimeout(() => reject(new Error('Search timed out.')), 25_000)
);
const result = await Promise.race([searchAndSummarize(query, n), timeout]);
```

2. **Client-side guard** — check `Content-Type` before calling `res.json()`:

```javascript
const ct = res.headers.get('content-type') || '';
if (!ct.includes('application/json')) {
  throw new Error('Server error (' + res.status + '). The request may have timed out.');
}
const data = await res.json();
```

**Lesson**
Never call `res.json()` unconditionally. Always check the Content-Type or
`res.ok` first. Hosting platforms (Render, AWS ALB, Cloudflare) can intercept
timed-out or failed requests and return HTML error pages at the infrastructure
layer, bypassing your application's error handlers entirely.

---

## 10. Render — DuckDuckGo API blocked on cloud IPs

**Symptom**
After fixing the timeout, the search endpoint returned `{"query":"...","results":[]}` —
no results for any query, including obvious ones like "Narendra Modi".

Testing with `curl` showed the DuckDuckGo Instant Answer API
(`api.duckduckgo.com`) consistently timing out after 10 seconds from Render's
server, returning an `AbortError`.

**Root cause**
DuckDuckGo's Instant Answer API is designed for desktop clients, not cloud
servers. Render's shared server IP ranges are likely rate-limited or blocked
by DuckDuckGo's backend because cloud provider IPs generate disproportionately
high automated traffic.

**Fix**
Replaced DuckDuckGo with the **Wikipedia search API** — freely accessible
from any server, no API key, no rate limits for reasonable use:

```typescript
// BEFORE — DuckDuckGo (blocked on Render)
const api = `https://api.duckduckgo.com/?q=${query}&format=json`;

// AFTER — Wikipedia full-text search (always accessible)
const api = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}&format=json`;
```

**Lesson**
APIs designed for end-user browser/desktop clients often block or throttle
cloud datacenter IPs. Always test your integrations from a deployed environment,
not just locally, before considering them production-ready.

---

## 11. Search — empty results due to double-fetching

**Symptom**
After switching to Wikipedia, search still returned `results: []` even though
Wikipedia's API responded successfully with article titles.

**Root cause**
The code was fetching each article twice:

```typescript
// First fetch — result used only for page.finalUrl
const page = await fetchPageText(r.url, 10_000);

// Second fetch — summarizeUrl calls fetchPageText internally again
const summary = await summarizeUrl(page.finalUrl);
```

The combined time for two full Wikipedia article fetches + a Claude call
exceeded the 25-second timeout, causing `Promise.allSettled` to time out and
all results to be rejected.

**Fix**
Remove the redundant first fetch — pass the URL directly to `summarizeUrl`:

```typescript
// FIXED — single fetch inside summarizeUrl
const summary = await summarizeUrl(r.url);
```

**Lesson**
Trace the full call chain through all layers before deploying. A function that
"fetches a page" may call another function that also fetches the same page
internally, doubling latency invisibly.

---

## 12. Search — wrong Wikipedia article returned

**Symptom**
Searching "Narendra Modi" returned content about **Narendra Modi Stadium**
(a cricket ground) instead of the Indian Prime Minister.

**Root cause**
Wikipedia's `opensearch` API returns results by title-prefix matching and
alphabetical ordering. "Narendra Modi Stadium" comes before "Narendra Modi" in
alphabetical order and has a high popularity score due to sports traffic, so it
ranked first.

**Fix**
Switch from `action=opensearch` to `action=query&list=search` — Wikipedia's
full-text search with proper BM25-like relevance ranking:

```typescript
// BEFORE — opensearch (title prefix, alphabetical)
const api = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${query}`;

// AFTER — full-text search (relevance-ranked)
const api = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}&format=json`;
```

**Lesson**
"Works for obvious cases" is not the same as "works correctly". Test with
queries where the naive result would be wrong. Title-prefix search is almost
never what you want for a general-purpose search feature.

---

## 13. Search — too slow (15–25 seconds per query)

**Symptom**
Even with correct results, the search endpoint took 15–25 seconds to return,
making it nearly unusable as a demo.

**Root cause**
For each search result the pipeline was:
1. Fetch the full Wikipedia HTML page (~200 KB, 2–4 s)
2. Clean and truncate to 12 000 characters
3. Send to Claude for summarisation (~8–15 s)

With 3 results in parallel, the bottleneck was the slowest Claude call.

**Fix**
Use Wikipedia's **REST summary API** (`/api/rest_v1/page/summary/:slug`) which
returns a pre-computed plain-text extract (~100–400 words) in under 500ms.
Then send only that small extract (~600 chars) to Claude for bullet formatting:

```typescript
// BEFORE — fetch full HTML page + Claude on 12 000 chars (~15s per result)
const page = await fetchPageText(url, 10_000);        // ~3s
const summary = await summarizeUrl(page.finalUrl);    // ~12s

// AFTER — Wikipedia extract API + Claude on 600 chars (~3s per result)
const res = await fetchWithRetry(`/api/rest_v1/page/summary/${slug}`);
const { extract } = await res.json();                 // ~0.3s
const summary = await claudeText(`Format as bullets:\n${extract.slice(0, 800)}`);  // ~3s
```

Total time dropped from 15–25 seconds to **3–8 seconds**.

**Lesson**
Before building a scrape-and-process pipeline, check whether the source offers
a structured data API that returns pre-processed content. Wikipedia's REST API
is an example — it does the heavy lifting of HTML-to-text conversion for you.

---

## 14. Embedded HTML/JS — escape sequences eaten by TypeScript template literals

**Symptom**
JavaScript inside the HTML string in `server.ts` was syntactically broken in
the browser. The `renderSummary` function failed to match bold text and the
`compare` URL splitter never split anything.

**Root cause**
The HTML and JavaScript are embedded inside a TypeScript template literal:

```typescript
reply.send(`... <script>
  text.replace(/\*\*(.+?)\*\*/g, ...)  // ← broken in TS template literal
  urls.split('\n')                      // ← broken in TS template literal
</script>`);
```

Inside a TypeScript (and JavaScript) template literal, `\*` is not a valid
escape sequence — TypeScript interprets `\*` as just `*`, silently dropping
the backslash. Similarly `\n` becomes a real newline character, which is
invalid inside a string literal in the browser's JS parser.

**Fix**
Double-escape all backslashes that should appear as-is in the browser's
JavaScript:

```typescript
// BEFORE — TypeScript eats the backslashes
text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
urls.split('\n')

// AFTER — double-escaped, survives the template literal
text.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
urls.split('\\n')
```

In the HTML output, `\\*` becomes `\*` and `\\n` becomes `\n` — which is
exactly what the browser's JavaScript parser expects.

**Lesson**
Embedding one language inside another (JS inside an HTML string inside a TS
template literal) creates three layers of escaping. When debugging mysterious
syntax errors in embedded scripts, always inspect the raw HTML sent to the
browser (`view-source:`) to see what the string actually contains after all
escape processing.

---

## 15. Demo UI — Run buttons broken (`event` global not reliable)

**Symptom**
Clicking a Run button did nothing. The browser console showed
`TypeError: Cannot read properties of undefined (reading 'target')`.

**Root cause**
The original `onclick` handler referenced `event.target` implicitly:

```html
<button onclick="call('summarize')">Run</button>
```

```javascript
async function call(tool) {
  const btn = event.target;  // ← relies on implicit global `event`
  btn.disabled = true;
  ...
}
```

The implicit `event` global is unreliable in strict mode and across some
browser versions. It was `undefined` when the function was called.

**Fix**
Pass `this` explicitly from the `onclick` attribute:

```html
<button onclick="call('summarize', this)">Run</button>
```

```javascript
async function call(tool, btn) {   // ← btn is always the clicked element
  btn.disabled = true;
  ...
}
```

**Lesson**
Avoid relying on implicit browser globals (`event`, `window.event`). Always
pass required context explicitly. This also makes the code easier to test
and understand.

---

## 16. Demo UI — results showing raw JSON instead of formatted UI

**Symptom**
Search and compare results appeared as a wall of raw JSON text in a monospace
box instead of the styled card layout.

**Root cause**
Two separate issues:

1. The `renderSearch()` and `renderCompare()` JavaScript functions had not been
   added yet in early commits — the `else` branch (`textContent = JSON.stringify`)
   was the catch-all.

2. Even after adding the render functions, the `resultEl.className` assignment
   at the end of the `call()` function **reset the class** from e.g.
   `result compare show` back to just `result show`, which could affect styling.

**Fix**
1. Add dedicated render functions for each tool:

```javascript
function renderSearch(data) { ... }
function renderCompare(data) { ... }
```

2. Call `innerHTML` (not `textContent`) so HTML markup is interpreted:

```javascript
resultEl.innerHTML = renderCompare(data);  // renders HTML elements
// NOT:
resultEl.textContent = JSON.stringify(data);  // renders plain text
```

**Lesson**
`textContent` sets raw text (HTML tags are shown literally). `innerHTML` parses
and renders HTML. Using `textContent` to display HTML-formatted output is a
common mistake that causes tags to appear as raw text instead of being rendered.

---

## Summary — Deployment Checklist

Before deploying a project like this, verify:

- [ ] Entrypoint guard uses `decodeURI(new URL(import.meta.url).pathname)` not a raw string comparison
- [ ] Claude Desktop config uses absolute path to `node` (`/usr/local/bin/node`)
- [ ] `ANTHROPIC_API_KEY` is set in all environments (local, Render, CI)
- [ ] `CLAUDE_MODEL` matches a current, non-deprecated model ID
- [ ] `max_tokens` is sized per call, not shared globally
- [ ] Claude JSON responses have markdown fences stripped before `JSON.parse`
- [ ] `render.yaml` start command points to the HTTP server, not the MCP server
- [ ] Fastify `listen()` uses the Promise form (v5+)
- [ ] Every `res.json()` is guarded by a `Content-Type: application/json` check
- [ ] Long-running endpoints have a server-side timeout (`Promise.race`)
- [ ] Third-party APIs (DuckDuckGo, etc.) are tested from the actual deployment environment
- [ ] No redundant fetches (trace the full call chain)
- [ ] Escape sequences inside embedded `<script>` blocks are double-escaped in TS template literals
- [ ] `onclick` handlers pass `this` explicitly instead of relying on implicit `event`
- [ ] Result render functions use `innerHTML`, not `textContent`
