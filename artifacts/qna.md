# Q&A — MCP, AI APIs, TypeScript & Production Systems

A reference guide covering the core concepts behind this project and the
technologies it is built on.

---

## Model Context Protocol (MCP)

**What is the Model Context Protocol?**
MCP is an open standard (released by Anthropic in Nov 2024) that defines how AI
models communicate with external tools and data sources. It decouples the tool
implementation from the AI host — any MCP server can plug into any MCP client
(Claude Desktop, Cursor, Zed, etc.) without custom integration code.

**What transport mechanisms does MCP support?**
Two primary transports:
- **stdio** — the host spawns the server as a child process; communication
  happens over stdin/stdout using JSON-RPC 2.0 framing. Zero network config.
- **HTTP + SSE** — the server runs as an HTTP service; the client connects via
  Server-Sent Events for streaming. Better for remote or multi-client scenarios.

**Why is stdio preferred for local MCP servers?**
No port management, no TLS, no authentication overhead. The host controls the
process lifecycle. One process per host session means no shared state between users.

**What is the difference between `content` and `structuredContent` in an MCP tool response?**
`content` is the human-readable payload (rendered by the host UI — e.g. shown
to the user in a chat). `structuredContent` is the machine-readable payload that
the host or downstream tools can programmatically consume. Both can be returned
simultaneously.

**What does `isError: true` mean in an MCP response?**
It signals to the host that the tool call failed. The host can then display an
error to the user or handle it programmatically. The alternative — throwing an
unhandled exception — would crash the server process.

**How are MCP tool schemas defined?**
Via Zod schemas in the TypeScript SDK. The SDK converts Zod schemas to JSON Schema
for capability negotiation with the host. This keeps validation logic DRY — the
same schema validates inputs at runtime.

---

## LLMs & the Anthropic API

**What is the difference between `claudeText` and `claudeJson` in this project?**
`claudeText` calls Claude and returns raw text. `claudeJson` wraps `claudeText`,
strips markdown fences from the response, JSON-parses the result, and validates it
against a Zod schema. It retries on `SyntaxError` and `ZodError` in addition to
transient API errors.

**Why is `temperature: 0.2` used instead of 0 or 1?**
Near-zero temperature makes outputs deterministic and factual — important for
structured extraction (entities, JSON) and summaries where hallucination is a
risk. A small non-zero value (0.2) avoids degenerate repetition that can occur at
exactly 0 on some model versions.

**What is exponential backoff with jitter and why is it used?**
On a transient failure, the client waits `base * 2^attempt + random_jitter`
milliseconds before retrying. The jitter (random component) prevents multiple
clients from retrying in lockstep — a phenomenon called "thundering herd" — which
would overwhelm the API server when it recovers.

**What is `max_tokens` and how should it be set?**
`max_tokens` caps the length of Claude's response. Setting it too low truncates
responses mid-sentence (causing JSON parse failures for structured output). Setting
it too high wastes quota. Rule of thumb: for bullet summaries (~300 words) use
600–1000 tokens; for structured JSON comparisons use 2000–4000 tokens.

**Why does `claudeJson` pass `maxRetries: 0` to its inner `claudeText` call?**
`claudeJson` manages its own retry loop at the outer level, including retries for
JSON parse failures. Allowing `claudeText` to also retry internally would create a
nested retry loop with multiplicative delays and make the total retry budget hard
to reason about.

**What are the main error categories when calling the Anthropic API?**
1. **Transient network errors** — timeouts, connection resets (retry with backoff)
2. **Rate limits (429)** — too many requests per minute (retry with backoff)
3. **Overloaded (529)** — model capacity issue (retry with backoff)
4. **Auth errors (401)** — invalid API key (do not retry — fail fast)
5. **Input errors (400)** — prompt too long, invalid parameters (do not retry)

---

## TypeScript & Zod

**What is Zod and why use it instead of TypeScript types alone?**
TypeScript types are erased at runtime — they provide no validation at execution
time. Zod defines schemas that validate data at runtime and infer TypeScript types
from them. This is especially important at API boundaries (incoming HTTP bodies,
Claude JSON responses) where the data shape is not guaranteed by the compiler.

**What is `z.infer<typeof Schema>` and when is it useful?**
`z.infer` extracts the TypeScript type implied by a Zod schema. Instead of
maintaining a separate `type` or `interface` that can drift out of sync with the
runtime schema, you define the schema once and derive the type from it.

```typescript
const UserSchema = z.object({ name: z.string(), age: z.number() });
type User = z.infer<typeof UserSchema>; // { name: string; age: number }
```

**What is the difference between `parse` and `safeParse` in Zod?**
- `parse` throws a `ZodError` on invalid input — suitable when you want to let
  the error propagate to an error handler.
- `safeParse` returns `{ success: true, data }` or `{ success: false, error }` —
  suitable in route handlers where you want to return a structured 400 response
  rather than throwing.

**What is strict TypeScript mode and what does it enable?**
`"strict": true` in `tsconfig.json` enables a group of checks:
- `noImplicitAny` — variables must have explicit types
- `strictNullChecks` — `null` and `undefined` are not assignable to other types
- `strictFunctionTypes` — function parameters are checked contravariantly
These catch entire classes of bugs (null dereferences, untyped callbacks) at
compile time rather than runtime.

**What is `Promise.allSettled` and how does it differ from `Promise.all`?**
`Promise.all` rejects as soon as any promise rejects — a single failure cancels
all results. `Promise.allSettled` waits for every promise and returns an array of
`{ status: 'fulfilled', value }` or `{ status: 'rejected', reason }` objects.
Use `allSettled` when partial results are better than no results (e.g. fetching
five URLs in parallel — a single unreachable site should not discard the other four).

---

## HTTP, REST & Fastify

**Why Fastify instead of Express?**
- Fastify is 2–3× faster than Express on benchmarks (lower per-request overhead).
- Built-in TypeScript support with accurate generics.
- Schema-based validation hooks.
- Active maintenance and modern async-first API.
- `reply.send()` handles serialisation; no need to remember `res.json()`.

**What changed in Fastify v5 that breaks older code?**
The `listen()` callback signature was removed. In v4 you could pass a callback:
`app.listen({ port }, (err, address) => {})`. In v5, `listen()` returns a Promise
that must be awaited or chained with `.then().catch()`.

**What does `Content-Type: application/json` do in a POST request?**
It tells the server how to parse the request body. Fastify (and most frameworks)
read this header to decide which body parser to invoke. Without it, the body is
treated as a raw buffer — `req.body` would be `null` or `undefined`.

**What is a graceful timeout pattern with `Promise.race`?**
```typescript
const result = await Promise.race([
  slowOperation(),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timed out')), 25_000)
  ),
]);
```
If `slowOperation()` takes longer than 25 seconds, the timeout promise rejects
first, the `race` rejects, and the route handler returns a structured JSON error
instead of hanging the connection indefinitely.

**What is `AbortController` and why is a new one created per retry attempt?**
`AbortController` provides a cancellation signal that can abort a `fetch` in
progress. Creating a new controller per attempt is necessary because once a
controller's `.abort()` is called its signal is permanently aborted — reusing it
on a subsequent fetch would cancel that fetch immediately.

---

## Web Scraping & HTML Parsing

**What does Cheerio do?**
Cheerio is a server-side jQuery-like library for parsing and querying HTML. In
this project it is used to strip navigation, scripts, styles, and boilerplate
(`<nav>`, `<footer>`, `<aside>`, `<script>`, etc.) from fetched pages, leaving
only the meaningful body text for Claude to summarise.

**Why truncate page content to 12 000 characters before sending to Claude?**
LLMs have a finite context window (measured in tokens, ~4 chars/token). Sending
the full text of a long article would consume the entire context and increase
cost and latency. 12 000 characters (~3 000 tokens) captures enough content for
a useful summary while leaving room for the system prompt and the response.

**What is `he.decode()` and why is it needed?**
After Cheerio extracts text, HTML entities (`&amp;`, `&nbsp;`, `&#x27;`, etc.)
may still appear in the output. `he.decode()` converts them to their Unicode
equivalents so Claude receives clean readable text rather than escaped HTML.

---

## Logging & Observability

**Why write logs to stderr instead of stdout?**
The MCP stdio transport uses stdin/stdout as a bidirectional JSON-RPC channel.
Any non-protocol bytes written to stdout (including log lines) corrupt the
message framing and break communication with the host. stderr is a separate
stream that the host does not read for protocol data.

**What is structured / NDJSON logging?**
Each log line is a complete JSON object on a single line (Newline-Delimited JSON).
This makes logs trivially parseable by log aggregators (Datadog, Loki, CloudWatch)
without regex fragility. Each event includes `level`, `msg`, `time`, `name`, and
optionally `data` and `err`.

**What information should an error log include?**
At minimum: `err.name`, `err.message`, and `err.stack`. In production, adding
request context (URL, query, attempt number) makes root-cause analysis much
faster. Stack traces should be included in development/staging and optionally
redacted in production logs that are customer-visible.

---

## Deployment & CI/CD

**What is `render.yaml` and how does it work?**
`render.yaml` is Render's Infrastructure-as-Code config file. It declares the
service type (`web`), the build command, the start command, and environment
variable names. When committed to the repo, Render reads it on deploy so the
service configuration is version-controlled alongside the code.

**What is the difference between `npm install` and `npm ci`?**
`npm ci` installs from `package-lock.json` exactly — it never modifies the lock
file and fails if it does not exist. This makes it deterministic and faster in CI
environments. `npm install` resolves ranges and may update the lock file.

**Why test across a Node.js version matrix in CI?**
Node releases introduce new V8 engine features, deprecate APIs, and occasionally
change runtime behaviour. Testing on 18, 20, and 22 simultaneously catches
breakage introduced by version-specific changes before it reaches production.

**What does `npm run prepare` do in this project?**
The `prepare` lifecycle script runs `npm run build` automatically before
`npm publish` and after `npm install` in some contexts. This ensures the `dist/`
output is always built from the latest source before the package is published or
used as a linked local dependency.

---

## Security

**Why should API keys never appear in source code or git history?**
Once committed, a secret is permanently in git history — even after deletion, it
is recoverable via `git log`. Rotate any key that has been committed immediately.
Use environment variables or a secrets manager (Render's env vars, AWS Secrets
Manager, Doppler) instead.

**What is input validation and why is it important at API boundaries?**
External input — HTTP request bodies, URL parameters, query strings — is untrusted
data. Validating it with Zod before passing it to business logic prevents:
- Passing `undefined` or `null` to functions that assume a value exists
- Oversized payloads exhausting memory or token budgets
- Malformed URLs causing unexpected fetch behaviour

**What error information should never be returned to an API caller?**
Internal stack traces, database connection strings, file paths, and environment
variable names. Exposing these gives attackers a map of the system. Return a
generic message to the caller and log the full error server-side only.
