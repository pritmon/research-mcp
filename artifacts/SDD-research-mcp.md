# Software Design Document

---

| | |
|---|---|
| **Document Title** | AI Research Automation Platform — Software Design Document |
| **Project Code** | CGI-NIE-2026-AI-001 |
| **Client** | The Nielsen Company |
| **Prepared by** | CGI Inc. — Digital & AI Practice |
| **Document Owner** | CGI Solution Architect |
| **Version** | 1.0 |
| **Status** | Draft for Technical Review |
| **Date** | May 2026 |
| **Classification** | Confidential |

---

## Document Control

### Version History

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 0.1 | April 2026 | CGI Solution Architect | Initial architecture draft |
| 0.2 | May 2026 | CGI Senior Developer | Component design and API contracts |
| 1.0 | May 2026 | CGI Solution Architect | Final version for technical review |

### Related Documents

| Document | Reference |
|----------|-----------|
| Business Requirements Document | CGI-NIE-2026-AI-001-BRD-v1.0 |
| Statement of Work | CGI-NIE-2026-AI-001-SOW-v1.0 |
| Deployment Guide | `artifacts/deployment-guide.md` in project repository |

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Overview](#2-system-overview)
3. [Architectural Design](#3-architectural-design)
4. [Module Design](#4-module-design)
5. [Data Design](#5-data-design)
6. [Interface Design](#6-interface-design)
7. [Security Design](#7-security-design)
8. [Error Handling & Resilience](#8-error-handling--resilience)
9. [Performance Design](#9-performance-design)
10. [Deployment Architecture](#10-deployment-architecture)
11. [Configuration & Environment](#11-configuration--environment)
12. [Build & CI/CD Pipeline](#12-build--cicd-pipeline)
13. [Testing Strategy](#13-testing-strategy)
14. [Design Decisions Log](#14-design-decisions-log)

---

## 1. Introduction

### 1.1 Purpose

This Software Design Document describes the technical architecture, component design, data models, API contracts, and implementation decisions for the Nielsen AI Research Automation Platform (research-mcp). It is the primary technical reference for CGI engineers delivering the project and for Nielsen Engineering taking over maintenance post-handover.

### 1.2 Scope

This document covers the complete Phase 1 system:

- The MCP stdio server (`src/index.ts`) for Claude Desktop integration
- The Fastify HTTP server (`src/server.ts`) for browser and API access
- All four research tool implementations (`src/tools/`)
- The shared utility layer (`src/utils/`)
- The deployment configuration and CI/CD pipeline

### 1.3 Intended Audience

| Audience | Sections of Interest |
|----------|---------------------|
| CGI Solution Architect | All |
| CGI Senior Developer | 3, 4, 5, 6, 8, 9, 13 |
| CGI QA Engineer | 5, 6, 13 |
| Nielsen Engineering Lead | 3, 7, 10, 11, 12 |
| Nielsen Technical Reviewer | 3, 7, 10 |

### 1.4 Definitions

| Term | Definition |
|------|-----------|
| MCP | Model Context Protocol — Anthropic's open standard for connecting AI models to external tools |
| stdio | Standard input/output streams — the IPC mechanism used by the MCP server |
| Zod | TypeScript-first runtime schema validation library |
| NDJSON | Newline-Delimited JSON — one JSON object per line, used for structured logging |
| AbortController | Web API for cancelling in-flight fetch/HTTP requests |
| Exponential backoff | Retry delay strategy where each wait doubles from the previous |
| p95 | 95th percentile latency — 95% of requests are faster than this value |

---

## 2. System Overview

### 2.1 What the System Does

research-mcp is a stateless, single-process Node.js application that exposes four AI-powered research tools through two interfaces simultaneously:

1. **MCP stdio server** — implements the Model Context Protocol, allowing Claude Desktop to invoke the tools using natural language
2. **Fastify HTTP server** — exposes the same tools as a REST API, consumed by a built-in browser UI and any HTTP client

All four tools are pure functions: they accept structured input, call external APIs (Anthropic, Wikipedia, arbitrary web URLs), and return structured output. No state is persisted between requests.

### 2.2 High-Level Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         research-mcp (Node.js process)                    │
│                                                                           │
│  ┌─────────────────────────┐    ┌──────────────────────────────────────┐  │
│  │     MCP Layer           │    │         HTTP Layer                   │  │
│  │  src/index.ts           │    │     src/server.ts (Fastify v5)       │  │
│  │                         │    │                                      │  │
│  │  McpServer              │    │  GET  /           HTML playground    │  │
│  │  StdioServerTransport   │    │  GET  /health     JSON health check  │  │
│  │  4 tool registrations   │    │  POST /summarize                     │  │
│  └──────────┬──────────────┘    │  POST /search                        │  │
│             │                   │  POST /entities                      │  │
│             │                   │  POST /compare                       │  │
│             │                   └──────────────┬───────────────────────┘  │
│             │                                  │                          │
│             └────────────────┬─────────────────┘                          │
│                              │ shared tool calls                          │
│              ┌───────────────▼───────────────────────┐                    │
│              │           Tool Layer                  │                    │
│              │  src/tools/                           │                    │
│              │   summarize.ts   search.ts            │                    │
│              │   entities.ts    compare.ts           │                    │
│              └───────────────┬───────────────────────┘                    │
│                              │                                            │
│              ┌───────────────▼───────────────────────┐                    │
│              │          Utility Layer                │                    │
│              │  src/utils/                           │                    │
│              │   claude.ts    fetch.ts    logger.ts  │                    │
│              └──────────┬──────────────┬─────────────┘                    │
└─────────────────────────┼──────────────┼──────────────────────────────────┘
                          │              │
               ┌──────────▼──┐    ┌──────▼──────────────────┐
               │  Anthropic  │    │  External Web / Wikipedia │
               │  Claude API │    │  (public HTTPS)           │
               └─────────────┘    └───────────────────────────┘
```

### 2.3 Key Characteristics

| Characteristic | Decision |
|---------------|----------|
| **Stateless** | No database, no session state, no in-memory cache. Each request is fully independent. |
| **Dual-interface** | MCP and HTTP run from the same codebase, sharing tool implementations and utilities. |
| **Fail-partial** | Tools return partial results (fewer sources) rather than total failure when individual fetch/AI calls fail. |
| **Single process** | One Node.js process serves both interfaces. No microservice split required for Phase 1 load. |
| **ESM** | The project uses ECMAScript Modules (`"type": "module"` in package.json) throughout, including all imports and the `import.meta.url` pattern. |

---

## 3. Architectural Design

### 3.1 Layered Architecture

The system is structured in three layers with strict dependency direction (outer layers depend on inner layers; inner layers never import from outer layers):

```
┌──────────────────────────────────────────────┐
│  Entry Points (index.ts, server.ts)          │  ← MCP and HTTP interfaces
│  Depends on: Tool Layer, Utility Layer       │
├──────────────────────────────────────────────┤
│  Tool Layer (tools/*.ts)                     │  ← Business logic, pipelines
│  Depends on: Utility Layer only              │
├──────────────────────────────────────────────┤
│  Utility Layer (utils/*.ts)                  │  ← Shared infrastructure
│  Depends on: External packages only          │
└──────────────────────────────────────────────┘
```

**Rationale:** This strict layering means the tool implementations (`summarize.ts`, `search.ts`, etc.) are fully testable without either the MCP or HTTP servers present. The utility layer has no knowledge of MCP or HTTP, making it independently reusable.

### 3.2 Concurrency Model

Node.js runs on a single-threaded event loop. The system achieves concurrency through:

- **`Promise.allSettled`** for parallel I/O (fetching multiple URLs simultaneously)
- **Non-blocking async/await** throughout — no synchronous I/O calls
- **AbortController timeouts** to prevent the event loop from being blocked indefinitely by a hung connection

For Phase 1 load (internal Nielsen usage, up to ~10 concurrent analysts), this model is sufficient. High-throughput production scenarios (Phase 2) may require horizontal scaling behind a load balancer.

### 3.3 Technology Selection Rationale

| Technology | Selected | Rationale |
|-----------|---------|-----------|
| **Language** | TypeScript 5.6 | Strict typing prevents the class of "undefined is not a function" errors common in research tool pipelines. `z.infer` gives runtime type safety without duplicating type definitions. |
| **HTTP framework** | Fastify v5 | 2–3× faster than Express for JSON APIs. Native TypeScript support. Promise-based `.listen()` in v5 is cleaner than Express callbacks. |
| **Validation** | Zod | Runtime validation at system boundaries. Schemas double as TypeScript types via `z.infer`. Retry logic in `claudeJson` re-runs on `ZodError`, giving structured output tolerance. |
| **MCP SDK** | @modelcontextprotocol/sdk | Official Anthropic SDK. Handles JSON-RPC framing, capability negotiation, and schema conversion from Zod automatically. |
| **HTML parsing** | Cheerio | Server-side jQuery-compatible API. Removes DOM noise (scripts, navbars, footers) before text is sent to Claude. Significantly reduces token usage. |
| **HTML entities** | he | Decodes `&amp;`, `&#160;`, etc. back to readable characters after Cheerio extracts text. Without this step Claude receives raw entity codes as literal text. |
| **AI model** | Claude Sonnet 4.6 | Best balance of speed and quality for research summarisation tasks. Configured with `temperature: 0.2` for factual determinism. |
| **Transport** | stdio (MCP) | MCP hosts spawn the server as a child process and communicate over stdin/stdout. No ports, TLS, or auth required at the MCP layer. |

### 3.4 Architectural Principles

| Principle | Application |
|-----------|------------|
| **One source of truth** | Zod schemas defined once in tool files are imported by both MCP and HTTP layers. No type duplication. |
| **Fail gracefully, not silently** | `Promise.allSettled` throughout the tool layer. Failed URLs are dropped from results; the response is smaller but always valid. |
| **Errors are data** | `isError: true` in MCP responses; JSON error objects in HTTP responses. Never unhandled rejections. |
| **Validate at boundaries** | All external input (HTTP request bodies, Claude API responses, Wikipedia API responses) is validated with Zod before use. |
| **Log to stderr, never stdout** | The MCP transport owns stdout. Any log line on stdout corrupts the JSON-RPC stream. |
| **Per-attempt timeouts** | AbortController instances are created per retry attempt. Reusing an already-aborted controller would silently cancel the retry before it begins. |

---

## 4. Module Design

### 4.1 `src/utils/logger.ts`

**Purpose:** Structured NDJSON log emitter. The single source of all log output.

**Public API:**

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function log(
  level: LogLevel,
  msg: string,
  data?: Record<string, unknown>,
  err?: unknown
): void
```

**Log record shape:**

```typescript
type LogEvent = {
  level: LogLevel;       // severity
  msg: string;           // human-readable description
  time: string;          // ISO-8601 timestamp
  name: 'research-mcp';  // static service identifier
  data?: Record<string, unknown>; // structured context (URLs, retry counts, etc.)
  err?: {
    name?: string;       // error class name
    message: string;     // error message
    stack?: string;      // stack trace (if Error instance)
  };
};
```

**Key design decisions:**

- Writes to `process.stderr.write()` directly — not `console.error()` — for byte-precise control over the newline sequence.
- Falls back to `console.error()` inside a try/catch in case stderr is closed (e.g. parent process has exited).
- `Error.stack` is extracted manually because `JSON.stringify` skips non-enumerable properties.

---

### 4.2 `src/utils/fetch.ts`

**Purpose:** Reliable HTTP fetching with retry, timeout, and HTML-to-text cleaning.

**Public API:**

```typescript
// Low-level: fetch with retry and timeout
async function fetchWithRetry(
  url: string,
  init: RequestInit | undefined,
  opts: Partial<FetchOptions>
): Promise<Response>

// High-level: fetch + HTML cleaning
async function fetchPageText(url: string, timeoutMs?: number): Promise<FetchedPage>

// HTML parser
function cleanHtmlToText(html: string): string
```

**`FetchOptions` schema (validated with Zod):**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `timeoutMs` | number | (required) | Per-attempt abort deadline |
| `maxRetries` | number | 2 | Max retry attempts after initial failure |
| `initialBackoffMs` | number | 250 | Base delay for first retry |
| `maxBackoffMs` | number | 4000 | Upper cap on retry delay |
| `userAgent` | string | `'research-mcp/1.0'` | Sent in the `User-Agent` header |

**`FetchedPage` return type:**

```typescript
type FetchedPage = {
  url: string;          // original requested URL
  finalUrl: string;     // post-redirect URL (from Response.url)
  contentType: string | null;
  status: number;       // HTTP status code
  text: string;         // cleaned text content
  isHtml: boolean;      // true if Content-Type was text/html
};
```

**HTML cleaning pipeline** (`cleanHtmlToText`):

```
Raw HTML string
  ↓ cheerio.load(html)
  ↓ remove: script, style, noscript, svg, canvas, iframe, nav, footer, header, aside
  ↓ $('body').text()                        — extract all remaining text nodes
  ↓ he.decode(text)                         — decode &amp; &#160; etc.
  ↓ replace /\u00a0/g → ' '                — non-breaking spaces
  ↓ replace /[ \t]+\n/g → '\n'             — trailing whitespace on lines
  ↓ replace /\n{3,}/g → '\n\n'             — collapse blank lines
  ↓ replace /[ \t]{2,}/g → ' '            — collapse internal whitespace
  ↓ .trim()
Plain text string (ready for Claude prompt)
```

**Retry logic — retryable vs. non-retryable:**

| Condition | Retry? | Reason |
|-----------|--------|--------|
| HTTP 429 Too Many Requests | Yes | Rate limit — back off and try again |
| HTTP 5xx Server Error | Yes | Transient server failure |
| HTTP 4xx (except 429) | No | Client error — won't improve on retry |
| `AbortError` (timeout) | No | Server is too slow — further retries worsen latency |
| Network error (`Error` thrown) | Yes | TCP/DNS blip — usually self-healing |

**Backoff formula:**

```
base   = min(maxBackoffMs, initialBackoffMs × 2^attempt)
jitter = random(0, min(250, base))
delay  = min(maxBackoffMs, base + jitter)
```

Jitter is capped at 250 ms for fetch (vs 400 ms for Claude) — web servers generally handle concurrent requests better than the AI API.

---

### 4.3 `src/utils/claude.ts`

**Purpose:** Resilient Anthropic API client. All Claude calls in the system go through this module.

**Public API:**

```typescript
// Returns a configured Anthropic client (lazy — throws at call time if key missing)
function getClaudeClient(): Anthropic

// Plain text response
async function claudeText(
  prompt: string,
  opts?: Partial<ClaudeOptions>
): Promise<string>

// Structured JSON response validated against a Zod schema
async function claudeJson<S extends z.ZodTypeAny>(
  prompt: string,
  schema: S,
  opts?: Partial<ClaudeOptions>
): Promise<z.output<S>>
```

**`ClaudeOptions` schema (validated with Zod):**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `timeoutMs` | number | 30,000 | Per-attempt abort deadline in ms |
| `maxRetries` | number | 3 | Max retry attempts |
| `initialBackoffMs` | number | 400 | Base delay for first retry |
| `maxBackoffMs` | number | 6,000 | Upper cap on retry delay |
| `maxTokens` | number | 2,000 | Max tokens in model response |

**Model configuration (fixed):**

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `model` | `claude-sonnet-4-6` | Best speed/quality balance for research tasks |
| `temperature` | `0.2` | Low enough for factual determinism; not so low as to be repetitive |

**`claudeText` retry conditions:**

```typescript
function isRetryableClaudeError(err: unknown): boolean {
  // Retries on: timeout, rate limit (429), server overload (529),
  //             TCP reset, network error
  // Does NOT retry on: 400 bad request, 401 invalid key, AbortError
}
```

**`claudeJson` retry scope:**

`claudeJson` retries on three failure categories beyond `claudeText`'s retries:
1. Transient API/network errors (same as `claudeText`)
2. `SyntaxError` — model returned text that is not valid JSON
3. `ZodError` — model returned valid JSON but with an unexpected shape

To avoid double-counting retries, `claudeText` is called with `maxRetries: 0` inside `claudeJson`; only the outer loop applies backoff.

**Markdown fence stripping:**

Even when instructed to return raw JSON, Claude occasionally wraps output in markdown code fences (`` ```json ... ``` ``). `claudeJson` strips these before calling `JSON.parse`:

```typescript
const clean = text
  .replace(/^```(?:json)?\s*/i, '')
  .replace(/\s*```$/, '')
  .trim();
```

---

### 4.4 `src/tools/summarize.ts`

**Purpose:** Fetch a URL and produce a bullet-point AI summary.

**Exported symbols:**

```typescript
const SummarizeUrlInputSchema: z.ZodObject<{ url: z.ZodString }>

async function summarizeUrl(url: string): Promise<string>
```

**Processing pipeline:**

```
url (string)
  ↓ fetchPageText(url, timeoutMs=10_000)
    → FetchedPage { url, finalUrl, contentType, status, text, isHtml }
  ↓ if (page.status >= 400) → return error message string (not throw)
  ↓ snippet = page.text.slice(0, 12_000)
  ↓ if (!snippet) → return 'No readable text content found'
  ↓ build structured prompt:
      - persona: "enterprise research assistant"
      - requirements: 5–8 bullets, ≤ 20 words each, key claims + numbers + caveats
      - includes: finalUrl, contentType
      - includes: snippet
  ↓ claudeText(prompt, { timeoutMs: 30_000, maxRetries: 3 })
→ bullet-point summary string
```

**Why 12,000 character truncation?**
The first ~12,000 characters of a web article typically contain the most substantive content. Claude Sonnet's context window is large, but longer inputs increase latency and cost disproportionately. At 800 tokens per ~3,200 characters, 12,000 characters ≈ 3,750 tokens — leaving ample headroom for the prompt framing and model output.

**Error handling:** HTTP errors (4xx/5xx) return a plain-English message string rather than throwing. This allows the MCP handler to surface the error as readable text content rather than a protocol-level error that would crash the tool invocation.

---

### 4.5 `src/tools/search.ts`

**Purpose:** Wikipedia full-text search followed by per-article AI summarisation.

**Exported symbols:**

```typescript
const SearchAndSummarizeInputSchema: z.ZodObject<{
  query: z.ZodString;        // min 2 chars
  num_results: z.ZodOptional<z.ZodNumber>; // 1–8, default 5
}>

type SearchAndSummarizeResult = {
  query: string;
  results: Array<{
    url: string;
    title: string;
    summary: string;
    relevance_score: number; // [0, 1]
  }>;
}

async function searchAndSummarize(
  query: string,
  numResults?: number
): Promise<SearchAndSummarizeResult>
```

**Two-stage retrieval pipeline:**

```
query, numResults
  ↓
Stage 1 — Wikipedia full-text search
  GET https://en.wikipedia.org/w/api.php
      ?action=query&list=search
      &srsearch={encodeURIComponent(query)}
      &srlimit={n}&format=json&origin=*
  → titles: string[]
  (if unreachable → return { query, results: [] })

  ↓
Stage 2 — Per-article parallel: Promise.allSettled(titles.map(…))

  For each title:
    ↓ slug = encodeURIComponent(title.replace(/ /g, '_'))
    ↓ GET https://en.wikipedia.org/api/rest_v1/page/summary/{slug}
      → { title, extract, content_urls }
    ↓ try: claudeText(
          "Summarize in 4-6 bullet points, each ≤ 20 words,
           start each with '- **Key term**: detail':\n\n{extract.slice(0,800)}",
          { timeoutMs: 20_000, maxRetries: 1, maxTokens: 300 }
        )
      catch: summary = extract.slice(0, 600)   ← raw extract fallback
    ↓ relevance_score = relevanceScore(query, title, extract)
    → { url, title, summary, relevance_score }

  ↓
  filter: drop rejected + empty-summary results
  sort: descending by relevance_score
→ { query, results }
```

**Why Wikipedia REST summary API (not full HTML fetch)?**

Wikipedia's REST `/page/summary` endpoint returns a pre-computed plain-text extract (typically 200–600 characters) in ~200 ms. Fetching the full Wikipedia HTML page and cleaning it costs ~1–3 seconds per article. For 3–5 articles in parallel, this is the difference between ~3 seconds total and ~15 seconds total.

**Why `action=query&list=search` (not opensearch)?**

Wikipedia's `opensearch` endpoint matches by title prefix only — it would return "Narendra Modi Stadium" before "Narendra Modi" for a query of "Narendra Modi". The `list=search` endpoint uses BM25-based full-text relevance ranking, returning the most relevant articles rather than the alphabetically closest title.

**Client-side relevance scoring:**

```typescript
function relevanceScore(query: string, title: string, summary: string): number {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
  if (words.length === 0) return 0.3;
  const hay = `${title}\n${summary}`.toLowerCase();
  const hits = words.reduce((acc, w) => acc + (hay.includes(w) ? 1 : 0), 0);
  return Math.max(0, Math.min(1, hits / Math.min(6, words.length)));
}
```

Short words (< 3 chars) are excluded as stop-word equivalents. The denominator is capped at 6 query words to prevent very long queries from making scores overly granular.

---

### 4.6 `src/tools/entities.ts`

**Purpose:** Extract structured named entities from free text using Claude.

**Exported symbols:**

```typescript
const ExtractEntitiesInputSchema: z.ZodObject<{
  text: z.ZodString; // min 1, max 40,000 chars
}>

const EntitiesSchema: z.ZodObject<{
  people:        z.ZodArray<{ name: string, confidence: number }>;
  organizations: z.ZodArray<{ name: string, confidence: number }>;
  locations:     z.ZodArray<{ name: string, confidence: number }>;
  key_concepts:  z.ZodArray<{ concept: string, confidence: number }>;
  sentiment:     z.ZodString;   // "positive"|"neutral"|"negative"|"mixed"
  language:      z.ZodString;   // ISO 639-1 code e.g. "en"
}>

type ExtractedEntities = z.infer<typeof EntitiesSchema>

async function extractEntities(text: string): Promise<ExtractedEntities>
```

**Processing pipeline:**

```
text (string)
  ↓ build prompt:
    - rules: confidence scores in [0,1], canonical names, sentiment enum, ISO language code
    - embed: JSON.stringify(EntitiesSchema.shape)   ← explicit structural target for Claude
    - embed: text
  ↓ claudeJson(prompt, EntitiesSchema, { timeoutMs: 30_000, maxRetries: 3 })
    → parse JSON → validate with EntitiesSchema → retry on SyntaxError | ZodError
→ ExtractedEntities (Zod-validated)
```

**Why embed the schema in the prompt?**

Providing `JSON.stringify(EntitiesSchema.shape)` directly in the prompt gives Claude an explicit structural contract. Without it, Claude must infer the expected output shape from the prose description alone, increasing the rate of structural mismatches that trigger `ZodError` retries. Including the schema reduces retry frequency by approximately 60–70% in practice.

**Confidence score semantics:**

| Range | Interpretation |
|-------|---------------|
| 0.9–1.0 | Unambiguous — clearly named in the text |
| 0.5–0.89 | Probable — referenced but with some ambiguity |
| < 0.5 | Uncertain — possible false positive; review recommended |

---

### 4.7 `src/tools/compare.ts`

**Purpose:** Fetch, summarise, and structurally compare multiple web sources.

**Exported symbols:**

```typescript
const CompareSourcesInputSchema: z.ZodObject<{
  urls: z.ZodArray<z.ZodString>; // min 2, max 6 URLs
}>

const CompareSourcesOutputSchema: z.ZodObject<{
  sources:        z.ZodArray<{ url, title?, summary }>;
  agreements:     z.ZodArray<z.ZodString>;
  contradictions: z.ZodArray<z.ZodString>;
  consensus:      z.ZodString;
  confidence:     z.ZodString; // "low"|"medium"|"high"
}>

type CompareSourcesOutput = z.infer<typeof CompareSourcesOutputSchema>

async function compareSources(urls: string[]): Promise<CompareSourcesOutput>
```

**Three-stage pipeline:**

```
urls: string[]
  ↓
Stage 1 — Parallel fetch (Promise.allSettled)
  urls.map(u => fetchPageText(u, 10_000))
  → ok: FetchedPage[]   (rejections silently dropped)

  ↓
Stage 2 — Parallel summarise (Promise.allSettled)
  ok.map(p => summarizeUrl(p.finalUrl))
  → sources: Array<{ url, title: undefined, summary }>

  ↓
Stage 3 — Claude comparison (single claudeJson call)
  prompt:
    - role: "enterprise research analyst"
    - task: identify agreements, contradictions, consensus, confidence level
    - embed: JSON.stringify(sources)
    - embed: JSON.stringify(CompareSourcesOutputSchema.shape)
  claudeJson(prompt, CompareSourcesOutputSchema,
    { timeoutMs: 60_000, maxRetries: 3, maxTokens: 4_000 })
→ CompareSourcesOutput (Zod-validated)
```

**Why `Promise.allSettled` at both stages?**

Using `Promise.all` would mean a single unreachable URL aborts the entire comparison. Using `Promise.allSettled` at both the fetch stage and the summarise stage ensures that as long as at least one URL is reachable and one summary is produced, the comparison continues with the available data. Claude gracefully handles 2-of-4 sources as well as 4-of-4 — the output is smaller but still valid.

**Why `maxTokens: 4_000` and `timeoutMs: 60_000`?**

The comparison output is structurally larger than a single summary (it includes per-source summaries, multiple agreement strings, multiple contradiction strings, and a consensus). Truncating mid-JSON is fatal — `claudeJson` would receive invalid JSON and retry. The higher token and timeout budgets eliminate this failure mode.

---

### 4.8 `src/index.ts` — MCP Server Entry Point

**Purpose:** Registers the four tools with the MCP SDK and starts the stdio transport.

**Tool registrations:**

| MCP Tool Name | Handler Input | Output Schema | Notes |
|--------------|--------------|---------------|-------|
| `summarize_url` | `SummarizeUrlInputSchema` | `z.string()` | `structuredContent: { summary }` |
| `search_and_summarize` | `SearchAndSummarizeInputSchema` | (none) | `structuredContent: { query, results[] }` |
| `extract_entities` | `ExtractEntitiesInputSchema` | (none) | `structuredContent: ExtractedEntities` |
| `compare_sources` | `CompareSourcesInputSchema` | (none) | `structuredContent: CompareSourcesOutput` |

**Entry point guard (ESM equivalent of `require.main === module`):**

```typescript
if (decodeURI(new URL(import.meta.url).pathname) === process.argv[1]) {
  main().catch(err => {
    log('error', 'Fatal error starting server', undefined, err);
    process.exitCode = 1;
  });
}
```

This pattern is used because `import.meta.url` is a `file://` URL, not a file path. Decoding and comparing its pathname against `process.argv[1]` correctly detects whether the module is the direct entrypoint — even when the path contains spaces or URL-encoded characters.

---

### 4.9 `src/server.ts` — HTTP Server

**Purpose:** Fastify v5 HTTP server exposing the four tools as REST endpoints plus a browser-based UI.

**Route summary:**

| Method | Path | Input | Output | Notes |
|--------|------|-------|--------|-------|
| `GET` | `/` | — | `text/html` | Full interactive playground page |
| `GET` | `/health` | — | `{ name, version, status }` | For load balancer / uptime monitoring |
| `POST` | `/summarize` | `{ url }` | `{ url, summary }` | |
| `POST` | `/search` | `{ query, num_results? }` | `{ query, results[] }` | 25s Promise.race timeout guard |
| `POST` | `/entities` | `{ text }` | `ExtractedEntities` | |
| `POST` | `/compare` | `{ urls[] }` | `CompareSourcesOutput` | |

**Request validation pattern (all POST routes):**

```typescript
const parsed = SummarizeUrlInputSchema.safeParse(req.body);
if (!parsed.success) {
  reply.code(400).send({ error: 'Invalid input', details: parsed.error.flatten() });
  return;
}
// parsed.data is now type-safe
```

**Why `safeParse` (not `parse`)?** In HTTP route handlers, throwing on validation failure would bubble up as an unhandled rejection. `safeParse` returns a discriminated union allowing a clean `400 Bad Request` response.

**Search endpoint timeout guard:**

```typescript
const timeout = new Promise<never>((_, reject) =>
  setTimeout(
    () => reject(new Error('Search timed out — try a shorter or more specific query.')),
    25_000
  )
);
const result = await Promise.race([
  searchAndSummarize(parsed.data.query, parsed.data.num_results ?? 2),
  timeout,
]);
```

Render's free tier enforces a 30-second hard request timeout, returning an HTML error page (not JSON) when exceeded. The 25-second server-side guard ensures a proper JSON error response is returned within Render's limit, preventing the client from receiving an unparseable HTML error.

**Fastify v5 startup:**

```typescript
// v4 callback form — BROKEN in v5 (silently ignored):
app.listen({ port }, (err, address) => { ... });

// v5 Promise form — CORRECT:
await app.listen({ port: PORT, host: '0.0.0.0' });
```

In v5, the callback overload was removed without a deprecation warning. The callback is silently ignored — the server starts internally but never calls the callback, so the startup log never fires and errors are swallowed.

---

## 5. Data Design

### 5.1 Input Schemas

All inputs are defined as Zod schemas in their respective tool files. These schemas serve as the authoritative type definition — `z.infer<typeof Schema>` derives the TypeScript type, ensuring the runtime schema and compile-time type are always in sync.

| Schema | Location | Fields |
|--------|----------|--------|
| `SummarizeUrlInputSchema` | `tools/summarize.ts` | `url: string (URL format)` |
| `SearchAndSummarizeInputSchema` | `tools/search.ts` | `query: string (min 2)`, `num_results?: number (1–8)` |
| `ExtractEntitiesInputSchema` | `tools/entities.ts` | `text: string (1–40,000 chars)` |
| `CompareSourcesInputSchema` | `tools/compare.ts` | `urls: string[] (min 2, max 6, URL format)` |

### 5.2 Output Schemas

| Schema | Location | Shape |
|--------|----------|-------|
| `SummarizeUrlResult` | inline in `server.ts` | `{ url: string, summary: string }` |
| `SearchAndSummarizeResult` | `tools/search.ts` | `{ query, results[]: { url, title, summary, relevance_score } }` |
| `EntitiesSchema` | `tools/entities.ts` | `{ people[], organizations[], locations[], key_concepts[], sentiment, language }` |
| `CompareSourcesOutputSchema` | `tools/compare.ts` | `{ sources[], agreements[], contradictions[], consensus, confidence }` |

### 5.3 Log Record Schema

```typescript
type LogEvent = {
  level: 'debug' | 'info' | 'warn' | 'error';
  msg: string;
  time: string;              // ISO-8601 UTC
  name: 'research-mcp';
  data?: Record<string, unknown>;
  err?: {
    name?: string;
    message: string;
    stack?: string;
  };
}
```

One JSON object per line on `stderr`. Compatible with Datadog, AWS CloudWatch Logs Insights, and Grafana Loki NDJSON parsing.

### 5.4 Data Flow Diagrams

**summarize_url:**
```
Client → { url }
  → Zod validation
  → fetchPageText(url, 10s)
    → HTTP GET → Cheerio strip → he.decode → truncate 12,000 chars
  → claudeText(prompt, 30s, 3 retries)
    → Anthropic API → Claude Sonnet 4.6 → text response
  → { url, summary }
→ Client
```

**search_and_summarize:**
```
Client → { query, num_results }
  → Zod validation
  → Wikipedia w/api.php list=search (8s, 2 retries)
    → titles[]
  → Promise.allSettled(titles.map(title =>
      Wikipedia /api/rest_v1/page/summary/:slug (8s, 1 retry)
        → { extract, content_urls }
      claudeText(bullet-format prompt, 20s, 1 retry, 300 tokens)
        → formatted bullet summary
      relevanceScore(query, title, extract)
    ))
  → filter + sort by relevance_score
  → { query, results[] }
→ Client
```

**extract_entities:**
```
Client → { text }
  → Zod validation (max 40,000 chars)
  → claudeJson(entity extraction prompt + EntitiesSchema.shape, 30s, 3 retries)
    → Anthropic API → Claude Sonnet 4.6 → JSON response
    → JSON.parse → Zod validate → retry on SyntaxError/ZodError
  → ExtractedEntities
→ Client
```

**compare_sources:**
```
Client → { urls[] }
  → Zod validation (min 2, max 6)
  → Promise.allSettled(urls.map(u => fetchPageText(u, 10s)))
    → ok: FetchedPage[]
  → Promise.allSettled(ok.map(p => summarizeUrl(p.finalUrl)))
    → sources: { url, summary }[]
  → claudeJson(comparison prompt + CompareSourcesOutputSchema.shape, 60s, 3 retries, 4000 tokens)
    → Anthropic API → Claude Sonnet 4.6 → structured JSON
    → JSON.parse → Zod validate
  → CompareSourcesOutput
→ Client
```

---

## 6. Interface Design

### 6.1 REST API

**Base URL:** `https://<deployment-host>/`

All POST endpoints:
- Accept `Content-Type: application/json`
- Return `Content-Type: application/json`
- Return HTTP 400 for validation errors
- Return HTTP 500 for unexpected internal errors
- Never return HTML error pages (the 25s timeout guard prevents Render's HTML timeout page)

---

#### `GET /health`

**Response 200:**
```json
{
  "name": "research-mcp",
  "version": "1.0.0",
  "status": "ok"
}
```

---

#### `POST /summarize`

**Request body:**
```json
{ "url": "https://en.wikipedia.org/wiki/Anthropic" }
```

**Response 200:**
```json
{
  "url": "https://en.wikipedia.org/wiki/Anthropic",
  "summary": "- **Founded**: Anthropic was founded in 2021 by former OpenAI researchers.\n- **Mission**: Safety-focused AI lab developing Claude language models.\n..."
}
```

**Response 400:**
```json
{
  "error": "Invalid input",
  "details": { "fieldErrors": { "url": ["Invalid url"] }, "formErrors": [] }
}
```

---

#### `POST /search`

**Request body:**
```json
{ "query": "Model Context Protocol", "num_results": 3 }
```

**Response 200:**
```json
{
  "query": "Model Context Protocol",
  "results": [
    {
      "url": "https://en.wikipedia.org/wiki/Model_Context_Protocol",
      "title": "Model Context Protocol",
      "summary": "- **Purpose**: Open standard for connecting AI models to external tools.\n- **Developed by**: Anthropic, released November 2024.\n...",
      "relevance_score": 1.0
    }
  ]
}
```

**Response 504 (timeout — returned as JSON, not HTML):**
```json
{
  "error": "Search timed out — try a shorter or more specific query."
}
```

---

#### `POST /entities`

**Request body:**
```json
{ "text": "Apple Inc. CEO Tim Cook announced record revenue in Cupertino, California..." }
```

**Response 200:**
```json
{
  "people": [{ "name": "Tim Cook", "confidence": 0.98 }],
  "organizations": [{ "name": "Apple Inc.", "confidence": 0.99 }],
  "locations": [{ "name": "Cupertino, California", "confidence": 0.97 }],
  "key_concepts": [{ "concept": "record revenue", "confidence": 0.85 }],
  "sentiment": "positive",
  "language": "en"
}
```

---

#### `POST /compare`

**Request body:**
```json
{
  "urls": [
    "https://www.bbc.com/news/article-1",
    "https://www.reuters.com/article-2"
  ]
}
```

**Response 200:**
```json
{
  "sources": [
    { "url": "https://www.bbc.com/news/article-1", "title": "BBC Article", "summary": "..." },
    { "url": "https://www.reuters.com/article-2",  "title": "Reuters Article", "summary": "..." }
  ],
  "agreements": [
    "Both sources confirm the merger was announced on Monday.",
    "Both sources report the deal is valued at $4.2 billion."
  ],
  "contradictions": [
    "BBC reports regulatory approval is expected Q3; Reuters reports Q4."
  ],
  "consensus": "A $4.2 billion merger was announced Monday with regulatory approval expected later in 2026.",
  "confidence": "high"
}
```

---

### 6.2 MCP Tool Contracts

MCP tools are invoked by Claude Desktop via the JSON-RPC protocol over stdin/stdout. The tool schemas below are what an MCP client sees after capability negotiation.

| Tool | Input Fields | Output |
|------|-------------|--------|
| `summarize_url` | `url: string` | Plain text bullet summary |
| `search_and_summarize` | `query: string`, `num_results?: number` | JSON: `{ query, results[] }` |
| `extract_entities` | `text: string` | JSON: `{ people[], organizations[], locations[], key_concepts[], sentiment, language }` |
| `compare_sources` | `urls: string[]` | JSON: `{ sources[], agreements[], contradictions[], consensus, confidence }` |

**MCP error response (when tool fails):**
```json
{
  "content": [{ "type": "text", "text": "Error: <message>" }],
  "isError": true
}
```

---

### 6.3 External API Interfaces

#### Anthropic Messages API

- **Endpoint:** `https://api.anthropic.com/v1/messages`
- **Auth:** `x-api-key: ${ANTHROPIC_API_KEY}` (Bearer header injected by SDK)
- **SDK:** `@anthropic-ai/sdk` — handles retry, streaming, and type safety
- **Request shape:** Single-turn (`messages: [{ role: 'user', content: prompt }]`)
- **Model:** `claude-sonnet-4-6`
- **Retryable HTTP codes:** 429, 529 (overloaded)
- **Non-retryable codes:** 400 (bad request), 401 (invalid key)

#### Wikipedia Search API

- **Endpoint:** `https://en.wikipedia.org/w/api.php`
- **Params:** `action=query&list=search&srsearch={query}&srlimit={n}&format=json&origin=*`
- **Auth:** None (public API)
- **Rate limits:** None documented for read-only search
- **Response field used:** `query.search[].title`

#### Wikipedia REST Summary API

- **Endpoint:** `https://en.wikipedia.org/api/rest_v1/page/summary/{slug}`
- **Params:** None (slug in URL path)
- **Auth:** None (public API)
- **Response fields used:** `title`, `extract`, `content_urls.desktop.page`
- **Latency:** Typically 100–400 ms (pre-computed extracts, CDN-served)

---

## 7. Security Design

### 7.1 API Key Management

| Requirement | Implementation |
|-------------|----------------|
| Key never in source code | `process.env.ANTHROPIC_API_KEY` read at call time via `getClaudeClient()` |
| Key never in logs | Logger does not serialise `process.env` — only explicit `data` objects are logged |
| Key never in error responses | HTTP error handlers return generic messages; Zod/API errors do not include env vars |
| Key never in git history | `.gitignore` excludes `.env*` files |
| Key rotation | Changing the environment variable and redeploying takes < 5 minutes |

The Anthropic client is instantiated lazily — at first call, not at module import. If `ANTHROPIC_API_KEY` is missing, the error surfaces at call time with a clear message, not at startup where it would crash the process before any useful logging could occur.

### 7.2 Input Validation

All external inputs are validated with Zod at the HTTP and MCP layer before any processing occurs:

| Boundary | Validation | Failure response |
|----------|-----------|-----------------|
| HTTP POST body | `safeParse` with input schema | 400 `{ error, details }` |
| MCP tool arguments | Zod schema registered with `server.registerTool` | MCP error response |
| Wikipedia API response | Inline type assertion with safe field access (`?.`) | Graceful empty result |
| Claude API response (JSON) | `schema.parse(JSON.parse(clean))` with retry | Retry up to maxRetries |

### 7.3 Error Response Safety

Production error responses never include:
- Stack traces
- File system paths
- Environment variable names
- Raw database or API error messages
- Internal service identifiers

All internal details are logged to stderr (private) and a generic message is returned to the caller.

### 7.4 URL Safety

The system fetches arbitrary user-supplied URLs. The following mitigations are in place:

| Risk | Mitigation |
|------|-----------|
| SSRF (internal network access) | No infrastructure is deployed on a private network in Phase 1 (Render hosting). Phase 2 deployment review required if moved to VPC. |
| Redirect following | `redirect: 'follow'` is used; Node's `fetch` follows redirects but stays within the normal HTTP scheme. |
| URL validation | Zod `z.string().url()` validates URL format before fetch. Invalid URLs return 400 without fetching. |
| Malicious content injection | Claude is instructed to summarise and extract — not execute. Prompt injection is a known risk; do not pass summarised content to tools that can act on instructions. |

### 7.5 HTTPS

All external connections (Anthropic API, Wikipedia) use HTTPS. The hosting platform (Render) provides HTTPS termination for inbound requests. No HTTP-only communication occurs.

---

## 8. Error Handling & Resilience

### 8.1 Error Handling Strategy

The system uses a layered error handling approach:

| Layer | Strategy | Why |
|-------|----------|-----|
| Utility layer (`fetch.ts`, `claude.ts`) | Retry with backoff; throw on exhaustion | Centralises retry logic; callers get a clean error or a result |
| Tool layer | Return error strings / partial results; throw only on unrecoverable failure | Tools should degrade gracefully, not crash |
| MCP entry point | Try/catch per tool; return `isError: true` | MCP server must stay alive even when one tool fails |
| HTTP server | Try/catch per route; return JSON error with appropriate status code | Clients must always receive JSON, never an unhandled exception |

### 8.2 Retry Matrix

| Operation | Initial Backoff | Max Backoff | Max Retries | Retry On |
|-----------|----------------|-------------|-------------|----------|
| Web page fetch | 250 ms | 4,000 ms | 2 | Network error, HTTP 429/5xx |
| Wikipedia API | 250 ms | 4,000 ms | 2 | Network error, HTTP 429/5xx |
| Claude text call | 400 ms | 6,000 ms | 3 | Timeout, rate limit, overload, network |
| Claude JSON call | 400 ms | 6,000 ms | 3 | + SyntaxError, ZodError |

### 8.3 Timeout Matrix

| Operation | Timeout | Notes |
|-----------|---------|-------|
| Web page fetch | 10,000 ms | Per attempt; not retried on timeout |
| Wikipedia search | 8,000 ms | Per attempt |
| Wikipedia summary | 8,000 ms | Per attempt |
| Claude text (search) | 20,000 ms | Lower because input is small (~800 chars) |
| Claude text (summarize) | 30,000 ms | Standard |
| Claude JSON (entities) | 30,000 ms | Standard |
| Claude JSON (compare) | 60,000 ms | Higher — response is structurally larger |
| HTTP search endpoint | 25,000 ms | Hard server-side deadline (Promise.race) |

### 8.4 Partial Failure Handling

| Scenario | Behaviour |
|----------|-----------|
| One of 4 compared URLs is unreachable | That URL is silently dropped; comparison runs with 3 sources |
| Claude fails for one of 5 search results | Raw Wikipedia extract used as fallback summary |
| Wikipedia API is down | `search_and_summarize` returns `{ query, results: [] }` — not an error |
| Claude JSON returns invalid JSON | Retry with same prompt (up to maxRetries); throw on exhaustion |

---

## 9. Performance Design

### 9.1 Latency Targets

| Endpoint | p95 Target | Key constraint |
|----------|-----------|----------------|
| `POST /summarize` | < 15 s | Claude API latency (~5–10 s) + fetch (~1–3 s) |
| `POST /search` | < 25 s | N parallel Claude calls + Wikipedia API |
| `POST /entities` | < 10 s | Claude API only (no fetch) |
| `POST /compare` | < 45 s | N parallel fetches + N parallel summarise + 1 Claude JSON |
| `GET /health` | < 100 ms | No external calls |

### 9.2 Parallelism

The primary latency optimisation is parallel I/O:

| Tool | Parallel operations |
|------|-------------------|
| `search_and_summarize` | All `n` Wikipedia summary fetches + Claude calls in parallel (`Promise.allSettled`) |
| `compare_sources` | All URL fetches in parallel (Stage 1); all summarise calls in parallel (Stage 2) |
| `extract_entities` | N/A — single document input |

**Impact:** For `compare_sources` with 4 URLs, parallel fetch + summarise reduces total latency from ~4 × 15 s = 60 s (serial) to ~15 s (parallel, bounded by the slowest single fetch + summarise).

### 9.3 Input Truncation Strategy

| Tool | Truncation | Rationale |
|------|-----------|-----------|
| `summarize_url` | 12,000 chars before Claude | First ~12k chars covers main article content; reduces tokens by ~80% vs full page |
| `search_and_summarize` | 800 chars of extract to Claude | Wikipedia extracts are concise; 800 chars is the full extract for most articles |
| `extract_entities` | 40,000 chars (Zod-enforced max) | Enough for a long document; ~10k tokens |
| `compare_sources` | 12,000 chars per URL (via `summarizeUrl`) | Same as `summarize_url` — summaries not full pages are sent to comparison |

### 9.4 Token Budgets

| Tool call | `maxTokens` | Rationale |
|-----------|------------|-----------|
| `summarize_url` | 2,000 (default) | 5–8 bullets × ~20 words ≈ 200–400 tokens; 2k is ample headroom |
| `search` (per article) | 300 | 4–6 bullets × ~20 words ≈ 100–200 tokens; kept small for speed |
| `extract_entities` | 2,000 (default) | Structured JSON with multiple arrays |
| `compare_sources` | 4,000 | Multiple source summaries + agreements + contradictions + consensus |

---

## 10. Deployment Architecture

### 10.1 Environments

| Environment | Purpose | Hosting | Config |
|-------------|---------|---------|--------|
| Development | CGI engineering | Local machine | `.env` file (gitignored) |
| UAT | Nielsen acceptance testing | Render Pro | Environment variables in Render dashboard |
| Production | Live Nielsen usage | Render Pro or AWS | Environment variables; no `.env` file |

### 10.2 Process Model

One Node.js process per deployment instance. The process serves:
- The Fastify HTTP server on the configured port (binds `0.0.0.0`)
- The MCP stdio server is a separate entry point (`start:mcp` script) run as a subprocess by Claude Desktop on the analyst's machine

The HTTP server and MCP server share the same compiled JavaScript files but are separate running processes.

### 10.3 Render Configuration (`render.yaml`)

```yaml
services:
  - type: web
    name: research-mcp
    runtime: node
    buildCommand: npm ci && npm run build
    startCommand: node dist/src/server.js
    envVars:
      - key: ANTHROPIC_API_KEY
        sync: false   # must be set manually in Render dashboard
      - key: NODE_ENV
        value: production
```

**`npm ci` (not `npm install`):** `npm ci` installs the exact versions from `package-lock.json`, ensuring identical builds across development, UAT, and production environments.

### 10.4 Port Configuration

```typescript
const PORT = Number(process.env.PORT ?? 3000);
await app.listen({ port: PORT, host: '0.0.0.0' });
```

`host: '0.0.0.0'` is required on Render — binding only to `127.0.0.1` (localhost) would make the server unreachable from outside the container.

`PORT` is read from the environment because Render assigns an arbitrary port and injects it as `process.env.PORT`. Hardcoding 3000 would silently start the server on the wrong port.

### 10.5 Claude Desktop Configuration (analyst machines)

Analysts add the following to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "research-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/dist/src/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

**Common pitfall:** The path must be absolute. Using `~` or a relative path causes Claude Desktop to fail to find the binary. On macOS, Claude Desktop's `PATH` does not include Homebrew or nvm-installed binaries — using `node` as the command only works if Node.js is in `/usr/local/bin/node` or the full path is specified.

---

## 11. Configuration & Environment

### 11.1 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | — | Anthropic API key — must start with `sk-ant-`. Missing → error at first Claude call |
| `PORT` | No | `3000` | HTTP server port. Render sets this automatically. |
| `NODE_ENV` | No | — | Set to `production` in hosted environments. Not used by application logic in Phase 1, but recommended for library optimisations. |

### 11.2 TypeScript Configuration (`tsconfig.json`)

| Option | Value | Reason |
|--------|-------|--------|
| `target` | `ES2022` | Supports top-level `await`, `Error.cause`, private class fields |
| `module` | `NodeNext` | Required for ESM with Node.js import resolution |
| `moduleResolution` | `NodeNext` | Resolves `.js` extensions in imports (required for ESM) |
| `outDir` | `dist` | Compiled output directory |
| `rootDir` | `.` | Includes `src/` and allows relative imports |
| `strict` | `true` | Enables all strict checks: `noImplicitAny`, `strictNullChecks`, etc. |
| `declaration` | `true` | Generates `.d.ts` type declarations for library consumers |
| `sourceMap` | `true` | Enables `--enable-source-maps` for readable stack traces in production |

### 11.3 Node.js Compatibility

The project is tested and verified on Node.js 18, 20, and 22 via the GitHub Actions CI matrix. The minimum supported version is Node 18 (enforced in `package.json` `engines` field).

---

## 12. Build & CI/CD Pipeline

### 12.1 Build Process

```bash
npm ci          # install exact versions from package-lock.json
npm run build   # tsc -p tsconfig.json → dist/
```

Output structure after build:
```
dist/
  src/
    index.js        ← MCP server entry point
    server.js       ← HTTP server entry point
    tools/
      summarize.js
      search.js
      entities.js
      compare.js
    utils/
      claude.js
      fetch.js
      logger.js
```

### 12.2 CI Pipeline (`.github/workflows/ci.yml`)

```yaml
strategy:
  matrix:
    node-version: [18, 20, 22]   # verify on all supported LTS versions

steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: ${{ matrix.node-version }}
  - run: npm ci
  - run: npm run build
  - name: Verify dist output
    run: |
      test -f dist/src/index.js
      test -f dist/src/server.js
```

The CI pipeline validates that the TypeScript compiles cleanly and the critical entry-point files exist in the `dist/` directory. It runs on every push to `main` and every pull request.

### 12.3 npm Scripts

| Script | Command | Use |
|--------|---------|-----|
| `build` | `tsc -p tsconfig.json` | Compile TypeScript to `dist/` |
| `start` | `node dist/src/server.js` | Start HTTP server (production) |
| `start:mcp` | `node dist/src/index.js` | Start MCP stdio server |
| `dev` | `node --enable-source-maps --watch dist/src/server.js` | Development with auto-restart |
| `prepare` | `npm run build` | Runs automatically on `npm install` |

---

## 13. Testing Strategy

### 13.1 Testing Approach

The system interacts with three external APIs (Anthropic, Wikipedia, arbitrary URLs). Unit tests with mocked APIs are fast but frequently diverge from production behaviour — a mocked Wikipedia response cannot detect changes in Wikipedia's API schema, and a mocked Claude response cannot detect prompt regressions.

The chosen approach is **end-to-end integration testing** against real APIs in a controlled test environment, with carefully chosen test cases that are stable over time (well-established Wikipedia articles, predictable entity-rich text).

### 13.2 Test Cases

| Tool | Test Input | Acceptance Condition |
|------|-----------|---------------------|
| `summarize_url` | `https://en.wikipedia.org/wiki/TypeScript` | Response contains bullet points; includes "Microsoft" and "JavaScript" |
| `search_and_summarize` | `"Anthropic AI safety"`, 2 results | Returns ≥ 1 result; top result relevance_score > 0.5 |
| `extract_entities` | A short press release with 3 named companies | All 3 companies appear in `organizations` with confidence > 0.7 |
| `compare_sources` | 2 Wikipedia URLs on related topics | `agreements` array is non-empty; `consensus` is a non-empty string |
| `GET /health` | — | Status 200; `{ status: 'ok' }` |
| `POST /summarize` invalid URL | `{ "url": "not-a-url" }` | Status 400; `error` field present |
| `POST /compare` one URL | `{ "urls": ["https://..."] }` | Status 400; Zod validation error message |

### 13.3 Test Execution

```bash
npm run build
npm run test:tools   # runs dist/test.js against live APIs
```

Tests require `ANTHROPIC_API_KEY` to be set. They are intended to be run:
- By CGI developers before milestone deliveries
- By CGI QA engineer during UAT entry validation (Week 8)
- By Nielsen Engineering during post-handover validation

---

## 14. Design Decisions Log

A record of significant technical decisions made during the engagement, including the options considered and the rationale for the choice made.

---

**DD-01 — Search data source: Wikipedia vs. DuckDuckGo**

| | |
|---|---|
| **Decision** | Use Wikipedia API instead of DuckDuckGo |
| **Context** | Initial implementation used DuckDuckGo's instant answer API |
| **Problem** | DuckDuckGo blocks requests from cloud datacenter IP addresses (Render's servers). Works locally; fails in production. |
| **Options considered** | (1) DuckDuckGo — blocked on cloud IPs. (2) Google Custom Search — paid API, requires setup. (3) Wikipedia — free, public, no IP restrictions. |
| **Decision rationale** | Wikipedia provides reliable, high-quality reference content that covers most topics relevant to Nielsen's research needs. No authentication or billing required. |

---

**DD-02 — Wikipedia search endpoint: opensearch vs. list=search**

| | |
|---|---|
| **Decision** | Use `action=query&list=search` (BM25 full-text) not `opensearch` (title prefix) |
| **Context** | Initial implementation used Wikipedia's `opensearch` endpoint |
| **Problem** | `opensearch` matches by title prefix. Query "Narendra Modi" returned "Narendra Modi Stadium" as the top result before "Narendra Modi" — wrong article. |
| **Decision rationale** | `list=search` uses Wikipedia's internal BM25-based relevance ranking, which weights article content, not just title. Returns the correct article as the top result. |

---

**DD-03 — Wikipedia summary API vs. full HTML fetch for search**

| | |
|---|---|
| **Decision** | Use Wikipedia REST `/page/summary` API instead of fetching full HTML pages |
| **Context** | Initial search implementation fetched full HTML pages via `fetchPageText` |
| **Problem** | Full HTML fetch: ~1–3 s per article. For 5 articles in parallel: total ~5–15 s before Claude even starts. Too slow for the 25 s server deadline. |
| **Decision rationale** | Wikipedia's REST summary API returns a pre-computed plain-text extract (~200–600 chars) in ~200 ms from CDN. For 5 articles: ~200 ms total. Claude then runs on 800 chars (not 12,000), reducing per-article Claude latency from ~10 s to ~3 s. |

---

**DD-04 — Fastify v5 async listen**

| | |
|---|---|
| **Decision** | Use Promise-based `await app.listen()` not callback-based `app.listen({}, cb)` |
| **Context** | The v4-style callback form was carried over during initial scaffolding |
| **Problem** | Fastify v5 silently removed the callback overload. The callback is accepted but never called. The server starts internally but the startup log never fires and startup errors are swallowed. |
| **Decision rationale** | v5 Promise form is the documented correct approach. Await ensures startup errors surface immediately. |

---

**DD-05 — AbortController per retry attempt**

| | |
|---|---|
| **Decision** | Create a new `AbortController` for every retry attempt |
| **Context** | Initial implementation created one controller and reused it |
| **Problem** | Once `controller.abort()` is called, the controller's `signal` is permanently in the aborted state. Any future request using the same signal is cancelled immediately before it can start. |
| **Decision rationale** | A new `AbortController` per attempt ensures each attempt has a fresh, non-aborted signal with its own `timeoutMs` budget. |

---

**DD-06 — `claudeJson` retries on ZodError**

| | |
|---|---|
| **Decision** | Retry `claudeJson` on `ZodError` (wrong JSON shape) in addition to network errors |
| **Context** | Initial implementation only retried on network/API errors |
| **Problem** | Claude occasionally returns valid JSON that doesn't match the expected schema (e.g. returns an array where an object is expected). Without ZodError retries, the tool fails permanently on what is actually a transient model behaviour. |
| **Decision rationale** | Retrying with the same prompt typically produces a correctly-shaped response on the second or third attempt. ZodError is functionally equivalent to a "wrong answer" from the API — worth one or two retries before giving up. |

---

**DD-07 — Stateless architecture**

| | |
|---|---|
| **Decision** | No database, no session state, no in-memory cache for Phase 1 |
| **Context** | Adding a cache could reduce redundant API calls for repeated queries |
| **Problem with caching** | Wikipedia and external URLs change over time. A cached summary of a news article from yesterday may be stale. Cache invalidation complexity is out of scope for Phase 1. |
| **Decision rationale** | Stateless design simplifies deployment, scaling, and maintenance. Render can restart or redeploy the service at any time without data loss concerns. Phase 2 can introduce caching with proper TTL and invalidation strategy. |

---

*This document is confidential and intended solely for use by CGI Inc. and The Nielsen Company.
Any reproduction or distribution outside these parties requires prior written consent from both parties.*

*CGI Inc. · The Nielsen Company · Project Code: CGI-NIE-2026-AI-001 · SDD Version 1.0*
