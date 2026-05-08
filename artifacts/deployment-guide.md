# Deployment Guide — Problems & Solutions

This is a real story of every problem we hit while building and deploying
this project. Each problem explains what went wrong,
why it happened, and exactly how we fixed it.

---

## Table of Contents

1. [MCP server did nothing in Claude Desktop (space in folder name)](#1-mcp-server-did-nothing-in-claude-desktop)
2. [Claude Desktop couldn't find the `node` command](#2-claude-desktop-couldnt-find-the-node-command)
3. [API calls failed with "401 Unauthorized"](#3-api-calls-failed-with-401-unauthorized)
4. [Claude returned "model not found"](#4-claude-returned-model-not-found)
5. [Compare tool cut off the response halfway](#5-compare-tool-cut-off-the-response-halfway)
6. [Claude returned JSON wrapped in code fences](#6-claude-returned-json-wrapped-in-code-fences)
7. [Render deployed successfully but then crashed instantly](#7-render-deployed-successfully-but-then-crashed-instantly)
8. [The HTTP server started but never responded](#8-the-http-server-started-but-never-responded)
9. [Search returned an HTML page instead of JSON](#9-search-returned-an-html-page-instead-of-json)
10. [Search always returned zero results on Render](#10-search-always-returned-zero-results-on-render)
11. [Wikipedia results were empty even though the API responded](#11-wikipedia-results-were-empty-even-though-the-api-responded)
12. [Searching "Narendra Modi" returned a cricket stadium](#12-searching-narendra-modi-returned-a-cricket-stadium)
13. [Search took 15–25 seconds — way too slow](#13-search-took-1525-seconds--way-too-slow)
14. [JavaScript inside the demo page was completely broken](#14-javascript-inside-the-demo-page-was-completely-broken)
15. [Clicking "Run" did nothing at all](#15-clicking-run-did-nothing-at-all)
16. [Results showed raw JSON instead of a nice UI](#16-results-showed-raw-json-instead-of-a-nice-ui)

---

## 1. MCP server did nothing in Claude Desktop

**What happened**
We added the MCP server to Claude Desktop's config file. Claude Desktop showed
no error — but the research tools were never available. It just silently did nothing.

**Why it happened**
The project folder was named `CLAUDE CODE` — with a space in the name.

When Node.js builds a file URL, it converts spaces into `%20` (because URLs
can't have spaces). So the file path in Node looked like `CLAUDE%20CODE/...`.

But the actual path on disk looked like `CLAUDE CODE/...` (with a real space).

The code was checking: *"Am I being run directly?"* by comparing these two
strings. Since `CLAUDE%20CODE` ≠ `CLAUDE CODE`, the comparison was always
false — and the server never actually started.

```
What Node saw:   file:///Users/.../CLAUDE%20CODE/dist/src/index.js
What we compared: /Users/.../CLAUDE CODE/dist/src/index.js
↑ These are never equal, so the server never started.
```

**How we fixed it**
Decode the URL before comparing, so `%20` gets converted back to a space first:

```typescript
// BROKEN — compares encoded URL to plain path, always fails
if (import.meta.url === `file://${process.argv[1]}`) { ... }

// FIXED — decode first, then compare
if (decodeURI(new URL(import.meta.url).pathname) === process.argv[1]) { ... }
```

**The lesson**
If your project folder has a space in its name, file URL comparisons will
silently fail. Always decode URLs before comparing them to file paths.

---

## 2. Claude Desktop couldn't find the `node` command

**What happened**
Even after fixing problem #1, Claude Desktop showed an error:
`spawn node ENOENT` — meaning it literally could not find `node`.

**Why it happened**
When you open a terminal, your computer loads a configuration file
(`.zshrc` or `.bash_profile`) that tells it where to find programs like `node`.
This is called the `PATH`.

Claude Desktop is not opened from a terminal — it's a normal Mac app opened
from the Dock. Mac apps like this don't load your terminal config, so they
don't know where `node` lives.

Typing `node` in a terminal works because your terminal set up `PATH`.
Claude Desktop has no idea what `PATH` is — it only knows the basic system
paths, which don't include where Homebrew or nvm installed Node.

**How we fixed it**
Instead of writing just `"node"`, we wrote the full path to where node is installed:

```json
// BROKEN — Claude Desktop doesn't know where "node" is
{ "command": "node" }

// FIXED — tell it exactly where to find node
{ "command": "/usr/local/bin/node" }
```

Run `which node` in your terminal to find the right path on your machine.

**The lesson**
Whenever a program is launched outside a terminal (Claude Desktop, scheduled
tasks, system services), never use short command names. Always use the full
path like `/usr/local/bin/node`.

---

## 3. API calls failed with "401 Unauthorized"

**What happened**
Every single call to Claude failed immediately with the error `invalid x-api-key`.

**Why it happened**
The API key being used had been revoked. This can happen if you previously
shared it by accident, or deleted it in the Anthropic dashboard. A revoked
key looks exactly like a wrong key to the API — both return 401.

**How we fixed it**
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create a new API key
3. Update the key in Render's environment variables dashboard
4. Update it locally too

**The lesson**
API keys are like passwords. If one gets exposed (in a screenshot, log file,
or accidentally pushed to git), revoke it immediately and create a new one.
Never put API keys directly in your code.

---

## 4. Claude returned "model not found"

**What happened**
Claude API calls returned a 404 error — the model we asked for didn't exist.

**Why it happened**
The code was using `claude-sonnet-4-20250514` — a specific dated version of
Claude that had been retired. Anthropic regularly replaces old model versions
with newer ones. The old ID simply stops working.

**How we fixed it**
Updated the model name in `src/utils/claude.ts`:

```typescript
// BEFORE — old, retired model
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

// AFTER — current model
const CLAUDE_MODEL = 'claude-sonnet-4-6';
```

**The lesson**
Always check the [Anthropic models page](https://docs.anthropic.com/en/docs/about-claude/models)
for the latest model ID. Dated model IDs get retired — use the current name.

---

## 5. Compare tool cut off the response halfway

**What happened**
The `compare_sources` tool returned a broken, incomplete JSON object — the
response just stopped in the middle of a sentence. JSON parsing would fail.

**Why it happened**
There was a setting called `max_tokens` that told Claude "stop after this many
words." It was set to 800 globally for all calls. Comparing multiple sources
requires Claude to write a lot more — sources, agreements, contradictions,
and a consensus. 800 was not enough, so Claude got cut off mid-response.

**How we fixed it**
Made the limit configurable per call, and set it much higher for the
compare tool:

```typescript
// compare.ts — give Claude enough room to write a full comparison
await claudeJson(prompt, schema, {
  maxTokens: 4_000,   // raised from the old hardcoded 800
  timeoutMs: 60_000,
});
```

**The lesson**
Don't use one token limit for all Claude calls. Short summaries need ~600,
but complex structured outputs like comparisons need 2000–4000+. Size the
limit for what you're actually asking Claude to write.

---

## 6. Claude returned JSON wrapped in code fences

**What happened**
The code tried to parse Claude's response as JSON, but it kept crashing with
`SyntaxError: Unexpected token`. Looking at the raw response revealed why:

~~~
```json
{ "people": [...], "organizations": [...] }
```
~~~

Claude wrapped the JSON in markdown code block markers. `JSON.parse` doesn't
understand markdown — it only understands pure JSON.

**Why it happened**
Even when you tell Claude "return only JSON", it sometimes adds `` ```json ``
and `` ``` `` around the output anyway. This is a known behaviour — models
are trained on lots of markdown content and sometimes add formatting by habit.

**How we fixed it**
Strip the code fence markers before parsing:

```typescript
const clean = text
  .replace(/^```(?:json)?\s*/i, '')  // remove opening ```json
  .replace(/\s*```$/, '')            // remove closing ```
  .trim();
const parsed = JSON.parse(clean);    // now this works
```

**The lesson**
Never fully trust that an AI will follow formatting instructions 100% of the
time. Always clean up the output before processing it. For JSON specifically,
always strip markdown fences before calling `JSON.parse`.

---

## 7. Render deployed successfully but then crashed instantly

**What happened**
The Render dashboard showed a successful build and deploy — then immediately
showed the service as crashed. The logs showed the process exited with code 0
(success) after less than one second.

**Why it happened**
The start command was set to `node dist/src/index.js` — the MCP server.

The MCP server works by sitting and waiting for messages from a host program
(like Claude Desktop) that communicates through the terminal's standard input
stream. On Render, there is no host program sending messages — so the server
started, found nothing to do, and immediately exited cleanly.

It was like opening a walkie-talkie store in the middle of nowhere and
waiting for someone to call. Nobody ever calls, so you close up and go home.

**How we fixed it**
The MCP server is not a web server. We needed to run the HTTP server instead:

```yaml
# render.yaml

# WRONG — MCP server exits immediately when there's no host
startCommand: node dist/src/index.js

# CORRECT — HTTP server binds to a port and stays running
startCommand: node dist/src/server.js
```

**The lesson**
MCP servers and HTTP servers are two completely different things. MCP servers
talk through terminal streams. HTTP servers listen on a network port. For
web deployment, you need the HTTP server.

---

## 8. The HTTP server started but never responded

**What happened**
After switching to the HTTP server, Render showed the service as running —
but no requests ever got a response. The health check kept timing out. There
was no error in the logs. Nothing.

**Why it happened**
We upgraded to Fastify version 5, which changed how you start the server.

In the old version (v4), you could start the server like this:

```typescript
// v4 — WORKED
app.listen({ port: 3000 }, (err, address) => {
  console.log(`Running on ${address}`);
});
```

In version 5, this callback style was **removed without any warning or error**.
Fastify v5 still started the server internally, but it completely ignored
the callback — so our startup log was never printed, any startup errors were
silently lost, and we had no idea the server was even running.

**How we fixed it**
Use the modern Promise style instead of a callback:

```typescript
// v5 — CORRECT
app.listen({ port: PORT, host: '0.0.0.0' })
  .then(address => log('info', 'Server started', { address }))
  .catch(err => { log('error', 'Failed to start', {}, err); process.exit(1); });
```

**The lesson**
When upgrading a major library version, always read the breaking changes.
A silent API change (where old code runs without errors but no longer works)
is one of the hardest bugs to diagnose.

---

## 9. Search returned an HTML page instead of JSON

**What happened**
When clicking "Run" on the search tool in the demo, the browser showed:
`Error: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`

The browser was trying to parse an HTML page as JSON.

**Why it happened**
Render's free tier has a hard rule: **if a request takes longer than 30 seconds,
Render kills it** and sends back a generic HTML error page (a 504 Gateway Timeout).

The search tool was making 3 parallel Claude calls, each of which could take
up to 30 seconds. In the worst case this took 35–40 seconds total — longer
than Render's 30-second limit. Render killed the request and returned an HTML
error page. The browser received that HTML, tried to parse it as JSON, and crashed.

**How we fixed it**

Step 1 — Add a 25-second server-side deadline so **our code** returns an error
before Render's infrastructure can:

```typescript
const timeout = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Search timed out.')), 25_000)
);
// Whichever finishes first "wins"
const result = await Promise.race([searchAndSummarize(query), timeout]);
```

Step 2 — In the browser, check that the response is actually JSON before
trying to parse it:

```javascript
const ct = res.headers.get('content-type') || '';
if (!ct.includes('application/json')) {
  throw new Error('Server error (' + res.status + '). Try again.');
}
const data = await res.json(); // safe to call now
```

**The lesson**
Always protect against long-running operations on hosted platforms — they all
have timeouts. Also never call `response.json()` without first checking that
the response is actually JSON. Infrastructure can return HTML error pages at
any time.

---

## 10. Search always returned zero results on Render

**What happened**
After fixing the timeout issue, search returned `{"results": []}` for every
query — even obvious ones like "Narendra Modi" or "Artificial Intelligence".

Testing with curl showed that requests to the DuckDuckGo API were consistently
timing out after 10 seconds from Render's server.

**Why it happened**
DuckDuckGo's Instant Answer API is designed for apps installed on personal
computers — not cloud servers. Render's servers share IP addresses with
thousands of other apps. DuckDuckGo sees traffic from these shared cloud IPs
as likely automated/bot traffic and blocks or rate-limits them.

From a laptop the API responds instantly. From Render it just hangs forever.

**How we fixed it**
Switched from DuckDuckGo to **Wikipedia's free search API** — which is
publicly accessible from any server, requires no API key, and has no
restrictions on cloud usage:

```typescript
// BEFORE — DuckDuckGo (blocked on cloud servers)
const api = `https://api.duckduckgo.com/?q=${query}&format=json`;

// AFTER — Wikipedia (always accessible)
const api = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}&format=json`;
```

**The lesson**
Always test your third-party API integrations from the actual deployed server,
not just your laptop. APIs that work perfectly locally can be blocked on cloud
servers.

---

## 11. Wikipedia results were empty even though the API responded

**What happened**
After switching to Wikipedia, the API was responding correctly — we could see
it returning article titles. But the final results were still `[]`.

**Why it happened**
The code was fetching each Wikipedia article **twice**:

```typescript
// First fetch — loaded the full page HTML
const page = await fetchPageText(r.url);

// Second fetch — summarizeUrl also loads the full page HTML internally!
const summary = await summarizeUrl(page.finalUrl);
```

Nobody noticed that `summarizeUrl` already fetches the URL internally. So
for each article we were downloading the full Wikipedia HTML page twice —
each download taking up to 10 seconds. Two downloads + a Claude call = ~25
seconds per article, which exceeded the 25-second timeout. All results timed
out, so the array came back empty.

**How we fixed it**
Remove the first fetch. Pass the URL directly to `summarizeUrl` and let it
do the one fetch it needs:

```typescript
// FIXED — single fetch, not double
const summary = await summarizeUrl(r.url);
```

**The lesson**
Before deploying, trace every function call all the way down to understand
what network requests it actually makes. A function called `summarizeUrl`
obviously fetches the URL — don't fetch it again before calling it.

---

## 12. Searching "Narendra Modi" returned a cricket stadium

**What happened**
Searching for "Narendra Modi" (the Indian Prime Minister) returned content
about the **Narendra Modi Stadium** — a cricket ground in Ahmedabad — as the
top result.

**Why it happened**
We were using Wikipedia's `opensearch` API, which works like an autocomplete —
it returns results based on how well the title **starts with** your query.

`opensearch` for "Narendra Modi" returns results alphabetically:
1. Narendra Modi Stadium ← comes first alphabetically
2. Narendra Modi ← comes second

The stadium article also gets heavy traffic from sports fans, boosting its
ranking further.

**How we fixed it**
Switched to Wikipedia's proper **full-text search** API, which ranks results
by how relevant the entire article is — not just the title order:

```typescript
// BEFORE — autocomplete (alphabetical, often wrong)
action=opensearch&search=narendra+modi

// AFTER — full-text search (relevance-ranked, correct)
action=query&list=search&srsearch=narendra+modi
```

**The lesson**
Autocomplete-style search and relevance-ranked search are very different things.
Always use relevance ranking for a general-purpose search feature, and always
test with queries where the obvious result is not the first alphabetically.

---

## 13. Search took 15–25 seconds — way too slow

**What happened**
Search was returning correct results now, but users had to wait 15–25 seconds
for every query. That's far too slow for a demo.

**Why it happened**
For each search result, the pipeline was:
1. Download the full Wikipedia article HTML page (~200KB of HTML — takes 2–4 seconds)
2. Strip all the HTML tags to get plain text
3. Take the first 12,000 characters and send them to Claude
4. Wait for Claude to write a summary (~8–15 seconds)

Doing this for 3 results in parallel still meant waiting for the slowest one —
often 20+ seconds total.

**How we fixed it**
Wikipedia already has a separate API that returns a short, clean, pre-written
summary of every article — no HTML, no cleaning, no processing needed:

```
https://en.wikipedia.org/api/rest_v1/page/summary/Narendra_Modi
```

This returns a clean 2–3 paragraph text summary in under half a second.
We then send just that short text (~600 characters) to Claude for bullet
formatting instead of 12,000 characters.

```
BEFORE:  Download 200KB HTML → strip tags → send 12,000 chars to Claude → wait 15–25s
AFTER:   Get 600-char summary from Wikipedia API → send to Claude → wait 3–5s
```

**The lesson**
Before building a complex scrape-and-process pipeline, check whether the
website already offers a clean data API. Wikipedia's summary API does all
the hard work for you. Using it cut search time from 25 seconds to 5 seconds.

---

## 14. JavaScript inside the demo page was completely broken

**What happened**
The demo page loaded fine but none of the JavaScript worked. The
`renderSummary` function never applied bold text. The compare tool never
split URLs by line. Browser console showed syntax errors in the scripts.

**Why it happened**
The entire HTML page (including the JavaScript) lives inside a TypeScript
template literal string (the backtick strings). This creates a problem:

When TypeScript sees `\n` inside a backtick string, it converts it to an
actual newline character. When TypeScript sees `\*`, it just becomes `*`
(the backslash is removed).

So this code in TypeScript:

```typescript
// What we wrote in TypeScript
text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
urls.split('\n')
```

After TypeScript processes the template literal, the browser receives:

```javascript
// What the browser actually got
text.replace(/**(.+?)**/g, ...)   // ← broken regex, no backslashes!
urls.split('
')                                  // ← actual newline in the middle of a string!
```

Both are JavaScript syntax errors.

**How we fixed it**
Use double backslashes in TypeScript so that after TypeScript removes one
backslash, one is still left for the browser:

```typescript
// FIXED — double backslash in TypeScript = single backslash in browser
text.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
urls.split('\\n')
```

**The lesson**
When you put one programming language inside another (JavaScript inside an
HTML string inside a TypeScript template literal), each layer processes
the escape characters. Think of it like passing a message through three
translators — what comes out the end may look nothing like what you wrote.
Always check the raw HTML the browser receives when debugging embedded scripts.

---

## 15. Clicking "Run" did nothing at all

**What happened**
Every Run button on the demo page was completely unresponsive. No loading
state, no results, no errors. Clicking did absolutely nothing. The browser
console showed: `TypeError: Cannot read properties of undefined (reading 'target')`.

**Why it happened**
The button's click handler called a function that relied on a variable called
`event` — a built-in browser global that is supposed to represent the current
click event:

```html
<button onclick="call('summarize')">Run</button>
```

```javascript
function call(tool) {
  const btn = event.target;  // ← assumes "event" global is available
  btn.disabled = true;
}
```

The problem: `event` as a global variable is unreliable. In some browsers and
in strict mode, it's simply `undefined`. The code crashed on line 1 without
ever doing anything.

**How we fixed it**
Pass the button directly using `this`, which always refers to the element
that was clicked:

```html
<button onclick="call('summarize', this)">Run</button>
```

```javascript
function call(tool, btn) {   // btn is passed directly — always works
  btn.disabled = true;
}
```

**The lesson**
Don't rely on hidden browser globals. Always pass what your function needs
as a direct argument. `this` in an `onclick` attribute always refers to the
clicked element — use it.

---

## 16. Results showed raw JSON instead of a nice UI

**What happened**
After clicking Run on the search and compare tools, the result box showed a
wall of raw JSON text like `{"sources":[{"url":"...","summary":"..."}]}` instead
of the formatted cards with headings, links, and bullet points.

**Why it happened**
Two things were wrong:

**Problem A** — The render functions (`renderSearch`, `renderCompare`) didn't
exist yet in early versions. The code had a catch-all that just dumped raw JSON.

**Problem B** — Even after adding the render functions, there was a subtle bug:
the code was using `textContent` to write the HTML output instead of `innerHTML`:

```javascript
// WRONG — textContent treats everything as plain text
// HTML tags like <div> and <strong> show up literally on screen
resultEl.textContent = renderCompare(data);

// CORRECT — innerHTML parses and renders the HTML tags
resultEl.innerHTML = renderCompare(data);
```

`textContent` shows HTML tags as literal characters on screen.
`innerHTML` actually renders them as visual elements.

**How we fixed it**
Added the render functions and switched to `innerHTML`:

```javascript
if (tool === 'compare') {
  resultEl.innerHTML = renderCompare(data);  // renders the HTML correctly
}
```

**The lesson**
`textContent` and `innerHTML` do very different things. Use `textContent`
when displaying plain text (safe, no HTML injection risk). Use `innerHTML`
when displaying HTML that you've built yourself and know is safe.

---

## Deployment Checklist

Before going live, verify each of these:

**Node & Environment**
- [ ] The entrypoint check uses `decodeURI(new URL(import.meta.url).pathname)` — not a raw string comparison
- [ ] Claude Desktop config uses the full path to node: `/usr/local/bin/node`
- [ ] `ANTHROPIC_API_KEY` is set in all environments — local, deployed server, and CI

**Claude API**
- [ ] Model name is current (check the Anthropic docs — old dated IDs get retired)
- [ ] `max_tokens` is set per call based on how long the response will be
- [ ] JSON responses strip markdown fences before `JSON.parse`

**Deployment**
- [ ] The Render/cloud start command points to the **HTTP server**, not the MCP server
- [ ] Fastify `listen()` uses the Promise form (required in Fastify v5)
- [ ] Long-running endpoints have a server-side timeout to avoid platform-level HTML errors

**Third-party APIs**
- [ ] Every external API has been tested from the actual deployed server, not just locally
- [ ] There are no redundant fetches (trace every function call to see what network requests it makes)

**Frontend**
- [ ] Every `response.json()` call first checks that the response Content-Type is `application/json`
- [ ] Backslashes inside embedded `<script>` blocks are double-escaped in TypeScript template literals
- [ ] `onclick` handlers pass `this` explicitly instead of relying on the `event` global
- [ ] Rich HTML output uses `innerHTML`, not `textContent`
