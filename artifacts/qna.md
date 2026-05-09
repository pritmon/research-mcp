# MCP, AI, TypeScript & Building Real Systems

Everything we learned while building this project.
Colour guide: 🔵 concept · 🟢 tip · 🟣 rule · 🟡 watch out · 🔴 never do this

---

## 🧠 Model Context Protocol (MCP)

---

### 1. What is MCP and why does it exist?

> [!NOTE]
> MCP is a universal plug socket for AI tools. You write the tool once as an MCP
> server, and it works with Claude Desktop, Cursor, Zed, or any other MCP-compatible
> app automatically — without writing custom glue code for every combination.

Without MCP, every AI app would need its own custom integration for every tool.
With MCP, one server works everywhere.

---

### 2. How does an MCP server talk to Claude Desktop?

> [!NOTE]
> There are two ways:
> - **stdio** — Claude Desktop launches your server as a background process and
>   they communicate through the terminal's input/output streams. Like two people
>   passing notes through a slot in a wall. No internet needed.
> - **HTTP + SSE** — The server runs as a website and Claude connects over the
>   internet. Better when the server needs to be shared across multiple machines.

> [!TIP]
> For a local tool on your own computer, **stdio is simpler** — no ports to configure,
> no security to set up. This is what we use in this project.

---

### 3. What is content vs structuredContent in a tool response?

> [!NOTE]
> When a tool returns data, it sends two versions:
> - **content** — the human-readable version shown to the user in chat (plain text or markdown)
> - **structuredContent** — the JSON version that Claude or other tools can use in code

Think of it like a receipt: content is the printed receipt for the customer,
structuredContent is the data record saved in the accounting system.

---

### 4. What does isError: true mean?

> [!IMPORTANT]
> When a tool fails, return isError: true instead of throwing an error.
> This tells Claude Desktop "the tool ran but something went wrong" — Claude shows
> a friendly error to the user and keeps running.

> [!CAUTION]
> If you throw an unhandled error instead, it can crash the entire MCP server
> process — disconnecting Claude Desktop from all your tools until you restart.

---

### 5. How does MCP know what inputs a tool accepts?

> [!NOTE]
> Every tool has a schema — a description of what data it expects. We define these
> with Zod. The MCP SDK automatically converts the Zod schema into the format
> Claude Desktop needs. Define the rules once, they work everywhere.

---

## 🤖 Working with Claude (the AI API)

---

### 6. What is the difference between claudeText and claudeJson?

> [!NOTE]
> - **claudeText** — asks Claude something and gives you back the raw text answer.
>   Used for summaries, bullet points, anything read by humans.
> - **claudeJson** — asks Claude to return a specific JSON structure. Strips any
>   markdown formatting, parses the JSON, validates the shape, and retries if anything is wrong.

> [!TIP]
> Think of claudeText as "just tell me the answer" and claudeJson as
> "give me the answer in a specific machine-readable form."

---

### 7. Why is temperature set to 0.2?

> [!NOTE]
> Temperature controls how creative Claude is:
> - **0** = always the most predictable, safe answer (can be repetitive)
> - **1** = very creative and varied (good for writing, bad for data extraction)
> - **0.2** = mostly consistent and factual, with just enough variation to avoid robotic repetition

> [!TIP]
> For research and data extraction tasks, keep temperature low (0.1–0.3).
> You want accuracy, not creativity.

---

### 8. What is exponential backoff and why do we use it?

> [!NOTE]
> When an API call fails, you wait before retrying — and wait longer each time:
>
> Attempt 1 fails → wait 0.4 seconds
> Attempt 2 fails → wait 0.8 seconds
> Attempt 3 fails → wait 1.6 seconds
>
> The "jitter" adds a small random extra wait so 100 apps do not all retry at the
> exact same moment and crash the server again.

> [!CAUTION]
> Retrying immediately in a tight loop makes things worse — you hammer an already
> struggling server. Always add a wait between retries.

---

### 9. What is max_tokens and how do you set it?

> [!NOTE]
> max_tokens tells Claude "stop writing after this many words." (roughly 3/4 of a word per token)

> [!IMPORTANT]
> Size it per call — not one global number for everything:
>
> | Use case | Recommended |
> |----------|-------------|
> | Short bullet summary | 600–1000 tokens |
> | Detailed analysis | 2000–3000 tokens |
> | Structured JSON comparison | 3000–4000 tokens |

> [!WARNING]
> Too low → response gets cut off mid-sentence. Especially bad for JSON —
> half a JSON object is completely useless and causes parse errors.

---

### 10. Which API errors should you retry and which should you stop on?

> [!IMPORTANT]
> | Error | Meaning | Action |
> |-------|---------|--------|
> | Network timeout | Server was slow | Retry with backoff |
> | Rate limit 429 | Too many requests | Retry after waiting |
> | Server overloaded 529 | Claude is busy | Retry after waiting |
> | Wrong API key 401 | Key is invalid | Stop — retrying will not help |
> | Bad request 400 | Your prompt is wrong | Stop — retrying sends the same bad data |

> [!TIP]
> Simple rule: if retrying the same request with the same data gets the same
> error, it is a permanent failure — stop immediately.

---

## 🔷 TypeScript and Zod

---

### 11. Why use Zod when TypeScript already has types?

> [!NOTE]
> TypeScript types disappear completely when the code runs. They only help while
> you are writing code — at runtime, TypeScript has no idea what shape your data is.
>
> Zod validates data at runtime — when real requests from real users arrive. If
> someone sends {"url": 12345} instead of {"url": "https://..."}, Zod catches
> it and returns a proper error. TypeScript alone would let it through and crash
> somewhere unexpected.

> [!TIP]
> Simple rule: TypeScript types tell you what your code expects.
> Zod checks that reality matches those expectations.

---

### 12. What is z.infer and why is it useful?

> [!NOTE]
> z.infer generates a TypeScript type automatically from your Zod schema —
> so you do not write the same definition twice:
>
>     const UserSchema = z.object({ name: z.string(), age: z.number() });
>     type User = z.infer<typeof UserSchema>; // { name: string; age: number }
>
> One source of truth. Change the schema, the type updates automatically.

> [!CAUTION]
> Writing a Zod schema AND a separate TypeScript type for the same thing is a
> maintenance trap — they will drift out of sync over time. Use z.infer instead.

---

### 13. What is the difference between parse and safeParse?

> [!NOTE]
> Both validate data. The difference is what happens on failure:
> - **parse** — throws an error immediately. Good inside functions where you want the error to propagate.
> - **safeParse** — returns success: true with data, or success: false with error. Good in
>   API route handlers where you want to send a proper 400 response instead of crashing.

> [!TIP]
> Use safeParse in route handlers. Use parse everywhere else.

---

### 14. What is TypeScript strict mode?

> [!NOTE]
> "strict": true in tsconfig.json turns on extra safety checks:
> - **noImplicitAny** — every variable must have a clear type
> - **strictNullChecks** — you must handle null or undefined before using a value

> [!IMPORTANT]
> Always enable strict mode on new projects. It catches the most common runtime
> crash — "Cannot read properties of undefined" — at compile time, before it
> ever reaches a real user.

---

### 15. What is Promise.allSettled vs Promise.all?

> [!NOTE]
> Both run multiple async operations at the same time. The difference is what
> happens when one fails:
> - **Promise.all** — one failure stops everything. You get nothing.
> - **Promise.allSettled** — waits for all to finish. You get results from
>   the ones that succeeded and errors from the ones that failed.

> [!TIP]
> Use Promise.allSettled when partial results are better than nothing. Example:
> fetching 5 URLs — if one website is down, you still want the other 4 results.

---

## 🌐 HTTP Servers and Fastify

---

### 16. Why Fastify and not Express?

> [!NOTE]
> - 2–3 times faster than Express
> - TypeScript support built in from day one
> - Modern async/await design — cleaner code, fewer bugs
> - Actively maintained with regular updates

> [!TIP]
> For new TypeScript projects, Fastify is the better default. Both work, but
> Fastify was designed with TypeScript in mind from the start.

---

### 17. What broke in Fastify version 5?

> [!WARNING]
> In v4 you could pass a callback to .listen(). In v5 this callback was removed
> without any error or warning. The server still starts internally but the callback
> is silently ignored — no startup log, no error handling, no response to requests.

> [!IMPORTANT]
> Always use the Promise form in Fastify v5:
>
>     // BROKEN in v5 — callback silently ignored
>     app.listen({ port: 3000 }, (err, address) => { ... });
>
>     // CORRECT in v5
>     app.listen({ port: 3000 })
>       .then(address => console.log('Running on', address))
>       .catch(err => process.exit(1));

---

### 18. What does Content-Type: application/json do?

> [!NOTE]
> It tells the server what format the request body is in. Without this header,
> Fastify does not know how to read the body — req.body comes through as
> empty or undefined.

> [!CAUTION]
> Always include Content-Type: application/json when sending JSON in a POST
> request. Without it, your data silently disappears before reaching your code.

---

### 19. What is Promise.race and why use it for timeouts?

> [!NOTE]
> Promise.race runs multiple promises at once and returns whichever finishes first.
> We use this to add a hard deadline to the search endpoint:
>
>     const result = await Promise.race([
>       searchAndSummarize(query),
>       new Promise((_, reject) =>
>         setTimeout(() => reject(new Error('Timed out')), 25000)
>       )
>     ]);
>
> If search finishes in 10s you get results. If the timer fires first you get
> a clean JSON error. Either way the request always ends in a predictable time.

> [!IMPORTANT]
> Hosting platforms like Render have hard request time limits. If your code takes
> too long, Render kills the connection and returns an HTML error page. Use
> Promise.race to return a proper JSON error before that happens.

---

### 20. What is AbortController and why create a new one per retry?

> [!NOTE]
> AbortController cancels a fetch request that is taking too long. You attach
> its signal to the fetch, then call .abort() to cancel it.

> [!CAUTION]
> Once a controller is aborted it is permanently aborted. Reusing it on a
> retry cancels the new request instantly — before it even starts. Always create
> a fresh AbortController for every single attempt.

---

## 🔍 Web Fetching and HTML Cleaning

---

### 21. What does Cheerio do?

> [!NOTE]
> Cheerio strips all the junk from a web page — scripts, styles, navbars, footers,
> cookie banners — and returns just the readable content. Think of it as a
> "give me just the article" button for any web page.

> [!TIP]
> Without Cheerio, Claude would waste most of its reading budget on navigation
> menus and ads instead of the actual content you care about.

---

### 22. Why do we only send the first 12,000 characters to Claude?

> [!NOTE]
> Claude can only read a certain amount of text at once. A long article might have
> 80,000 or more characters. Sending all of it would use most of Claude's context
> window, cost more, and take longer to process.

> [!TIP]
> 12,000 characters is enough for a useful summary. The first part of any article
> almost always contains the most important information. Less input means faster,
> cheaper, more focused responses.

---

### 23. What is he.decode() and why is it needed?

> [!NOTE]
> After Cheerio extracts text, some characters might still appear as HTML codes —
> &amp; instead of &, or &nbsp; instead of a space.
> he.decode() converts them all back into normal readable characters.

> [!WARNING]
> Without decoding, Claude receives raw HTML entity codes as text and might treat
> them as meaningful content — because to Claude, they are just the text it was given.

---

## 📋 Logging

---

### 24. Why write logs to stderr and not stdout?

> [!IMPORTANT]
> The MCP stdio server uses stdout as a communication channel — every line written
> to stdout is treated as a protocol message. Writing log lines to stdout corrupts
> the communication stream between your server and Claude Desktop.

> [!NOTE]
> stderr is a completely separate stream that Claude Desktop ignores. Logs go to
> stderr, protocol messages go to stdout — they never interfere with each other.

---

### 25. What is structured logging and why is it better?

> [!NOTE]
> Instead of plain text like:
>     Error fetching URL https://example.com — timeout
>
> Structured logging writes one JSON object per line:
>     {"level":"error","msg":"Fetch failed","url":"https://example.com","time":"2026-05-08T11:30:00Z"}

> [!TIP]
> Structured logs can be searched, filtered, and fed into monitoring tools
> (Datadog, Grafana, CloudWatch) automatically. Plain text logs require writing
> fragile regex patterns just to extract basic information.

---

### 26. What should every error log include?

> [!IMPORTANT]
> Every error log needs:
> - **What went wrong** — the error message
> - **Where it went wrong** — error type and stack trace
> - **What was being processed** — the URL, query, or input that caused it
>
> The more context you include, the faster you can diagnose and fix the problem.

---

## 🚀 Deployment

---

### 27. What is render.yaml and why does it matter?

> [!NOTE]
> render.yaml tells Render how to deploy your project — build command, start
> command, environment variable names — committed to git alongside your code.

> [!TIP]
> Config as code: your deployment settings are version controlled just like your
> source code. No more "I changed something in the dashboard and forgot what."

---

### 28. What is the difference between npm install and npm ci?

> [!NOTE]
> - **npm install** — figures out which versions to install. May vary slightly between runs.
> - **npm ci** — installs exactly the versions in package-lock.json. Identical every time.

> [!IMPORTANT]
> Always use npm ci in automated build and deploy pipelines. You want every
> build to be identical — npm install can silently introduce variation between builds.

---

### 29. Why test across multiple Node.js versions in CI?

> [!NOTE]
> Node.js updates its JavaScript engine regularly. Code that works in Node 18 might
> behave differently in Node 22 due to engine changes.

> [!TIP]
> Testing against Node 18, 20, and 22 simultaneously catches these differences
> before they hit real users — and proves your project works for people who
> have not updated Node yet.

---

## 🔒 Security

---

### 30. Why must API keys never be in code or git history?

> [!CAUTION]
> Once something is committed to git, it stays in history forever — even if you
> delete the file later. Anyone who clones the repo can run git log and find the key.
> GitHub automatically scans public repos and alerts providers when keys are detected.

> [!IMPORTANT]
> Always use environment variables for API keys. If a key is accidentally committed,
> revoke it immediately — deleting the file is not enough.

---

### 31. Why validate user input before using it?

> [!NOTE]
> Data from outside your system — user requests, API responses, form inputs —
> cannot be trusted. It might be missing, in the wrong format, or intentionally malformed.

> [!IMPORTANT]
> Validate at the boundary before data goes anywhere in your code:
> - Your functions receive exactly the type they expect
> - One place handles all "what if the data is bad?" logic
> - Attackers cannot crash your server with unexpected input
>
> Think of it like checking IDs at the door. Once inside, you trust them.
> But you check everyone before they enter.

---

### 32. What should you never include in an API error response?

> [!CAUTION]
> Never expose to users:
> - Stack traces — shows exactly where your code lives and how it works
> - File paths — reveals your server's directory structure
> - Database error messages — can expose table names or connection details
> - Environment variable names — hints at what secrets you use

> [!TIP]
> Return a simple message to the user: "Something went wrong. Please try again."
> Log the full detailed error server-side only — where only you can see it.

---

## 🛠️ How to Build Something Like This

---

### 33. Where do you start when building an AI-powered server?

> [!TIP]
> Start from the inside out, not the outside in.
>
> **Wrong order:** Build the server first, wire up routes, then wonder what they should do.
> **Right order:** Write the core logic (one tool, no server), make it work end-to-end,
> then wrap it in HTTP and MCP.
>
> We built `summarizeUrl()` as a plain function first — just input and output.
> Only after that was proven working did we plug it into Fastify and MCP.

> [!NOTE]
> The layers in this project reflect that order:
> - **utils/** first — fetch and Claude wrappers with no business logic
> - **tools/** second — business logic with no HTTP or MCP awareness
> - **server.ts / index.ts** last — just thin wiring that connects inputs to outputs

---

### 34. What is the first thing to build when starting a TypeScript project?

> [!IMPORTANT]
> Set up TypeScript strictly before writing a single line of real code:
> - `"strict": true` in tsconfig.json from day one
> - `"module": "NodeNext"` and `"moduleResolution": "NodeNext"` for ESM
> - `"sourceMap": true` so stack traces point to your `.ts` source, not compiled `.js`
>
> Retrofitting strict mode onto an existing codebase is painful.
> Starting strict means every function you write is correct by design.

> [!WARNING]
> The most common TypeScript+Node ESM mistake: forgetting `.js` extensions on imports.
> Write `import { log } from './logger.js'` even though the file is `logger.ts`.
> Node resolves the compiled output, not the source — so the extension must match
> what will exist in `dist/`.

---

### 35. How do you build a utility layer that every tool can share?

> [!NOTE]
> A utility is something that has no opinion about what you are building —
> it just solves one problem reliably. Good utilities in this project:
> - `fetchWithRetry` — fetches a URL reliably. Knows nothing about Wikipedia or Claude.
> - `claudeText` — calls Claude reliably. Knows nothing about summaries or entities.
> - `log` — writes a structured log line. Knows nothing about routes or tools.
>
> If your utility imports from a specific tool, it is no longer a utility — it is
> business logic that got lost.

> [!TIP]
> Write each utility as if someone else will use it in a completely different project.
> That constraint forces you to keep it clean and generic.

---

### 36. How do you design a tool function?

> [!NOTE]
> Every tool in this project follows the same pattern:
> 1. **One input, one output** — a plain async function with typed arguments and return value
> 2. **No side effects beyond logging** — no global state, no writing to disk
> 3. **Fail partial, not total** — return something useful even when part of the process fails
> 4. **Return errors as values, not throws** — so callers can display them, not crash on them

> [!TIP]
> Design the function signature first. Write the types. Then fill in the body.
> If the function signature is hard to explain in one sentence, split it into two functions.

---

### 37. How do you prompt Claude effectively?

> [!NOTE]
> Treat your prompt like a job description. The clearer you describe the role, the task,
> and the output format, the better the response.
>
> A good prompt has:
> 1. **A role** — "You are an enterprise research analyst"
> 2. **A task** — "Summarise this article for a busy colleague"
> 3. **Specific requirements** — "5–8 bullet points, each under 20 words"
> 4. **Constraints** — "Do not add information not in the source text"
> 5. **The input** — the actual content at the end

> [!IMPORTANT]
> For JSON outputs, embed the exact schema in the prompt:
>
>     Return JSON strictly matching this shape:
>     { "name": string, "confidence": number }
>
> Without this, Claude guesses the shape. With it, ZodError retries drop dramatically.

> [!WARNING]
> Vague prompts produce vague results. "Summarise this" gives you something. "Summarise
> this as 5 bullet points, each starting with a bold key term, each under 20 words,
> for a senior business analyst" gives you something useful.

---

### 38. How do you handle the case where an external API is slow or down?

> [!NOTE]
> There are three kinds of failure:
> - **Slow** — the API responds eventually but takes too long. Fix: AbortController timeout.
> - **Transient** — the API fails briefly then recovers. Fix: retry with exponential backoff.
> - **Permanent** — the API is genuinely down or you sent bad data. Fix: fail fast, do not retry.

> [!TIP]
> Build your fetch wrapper before building any tool. Every tool will need it.
> Adding retry and timeout logic per-tool creates duplication and inconsistency —
> you end up with five slightly different retry implementations that break in five
> different ways.

> [!IMPORTANT]
> The decision tree for retrying:
> - HTTP 429 or 5xx → retry (server problem, might recover)
> - HTTP 4xx (except 429) → do not retry (your request is wrong)
> - Timeout / AbortError → do not retry (server is too slow; retry wastes more time)
> - Network error (TCP reset, DNS fail) → retry (usually a blip)

---

### 39. What order should you test things as you build?

> [!TIP]
> Test the smallest piece first, then build outward:
>
> 1. **Test the utility** — does `fetchWithRetry` return a page? Does `claudeText` respond?
> 2. **Test the tool function directly** — call `summarizeUrl("https://en.wikipedia.org/wiki/TypeScript")` from a plain Node script. No server needed.
> 3. **Test the HTTP route** — use `curl` or Postman before building the UI.
> 4. **Test the MCP tool** — add it to Claude Desktop config and try it in conversation.
>
> Each layer tests the one below it. If step 2 works, step 3 is just wiring.
> If step 2 is broken, fixing step 4 is impossible.

> [!NOTE]
> We kept a `test.js` script in the project specifically for step 2.
> Running `node dist/test.js` after every significant change takes 30 seconds
> and catches 90% of regressions before they reach the server.

---

### 40. How do you structure error handling across a whole project?

> [!NOTE]
> Think of error handling in three zones:
>
> **Zone 1 — Utilities (fetch, claude):** Retry internally. If all retries fail, throw.
> The caller should not need to know about retries.
>
> **Zone 2 — Tools (summarize, search, entities, compare):** Catch utility errors.
> Return a plain-English string on failure rather than throwing.
> Partial results are better than nothing.
>
> **Zone 3 — Entry points (server.ts, index.ts):** Catch everything.
> Return a JSON error response (HTTP) or isError:true response (MCP).
> The server must never crash because one tool request failed.

> [!CAUTION]
> If you throw errors all the way up through every layer, a single bad URL in a
> comparison request of 4 URLs crashes the whole request. Catch early, fail gracefully,
> keep the service running.

---

### 41. How do you know when your architecture is too complicated?

> [!TIP]
> This project follows one rule: **add complexity only when the simple version breaks.**
>
> - We did not add a cache until repeated fetches were a real measured problem. (We never needed one.)
> - We did not add a queue until concurrency caused failures. (It never did for this load.)
> - We did not add a database until we needed to store something across requests. (We never did.)
>
> Three files that each do one thing clearly are better than a framework
> that handles every future requirement imaginable.

> [!WARNING]
> The most common mistake in junior-to-mid engineers: over-engineering early.
> Building abstractions for problems that do not exist yet produces code that is
> harder to read and debug than the simple version would have been.

---

### 42. What does a good development loop look like day-to-day?

> [!TIP]
> We followed this cycle for every feature:
>
> 1. **Write the function signature and return type first** — forces you to think before coding
> 2. **Implement the happy path** — make it work for the normal case
> 3. **Add one error case at a time** — what happens if the URL is down? If Claude times out?
> 4. **Run `npm run build`** — catch TypeScript errors before they become runtime errors
> 5. **Test with `node dist/test.js`** — verify end-to-end with real external APIs
> 6. **Commit working code** — small, frequent commits with clear messages
>
> Never skip step 4. TypeScript errors that compile away do not show up in step 5
> until something is already in production.

> [!NOTE]
> The `--watch` flag in the dev script (`node --watch dist/src/server.js`) restarts
> the server automatically when compiled files change. Pair it with `tsc --watch`
> in a separate terminal for an instant feedback loop while developing.

---

### 43. What are the most important things to get right from day one?

> [!IMPORTANT]
> Five things that cost a lot to retrofit but are free if you start with them:
>
> 1. **Strict TypeScript** — catches bugs at compile time, not in production
> 2. **Zod validation at every boundary** — user input, API responses, Claude outputs
> 3. **Structured logging to stderr from the start** — essential for debugging on cloud hosts
> 4. **Secrets in environment variables only** — a single accidental commit can invalidate your whole project
> 5. **One concern per file** — fetch logic in one file, Claude logic in another, tool logic in another

> [!CAUTION]
> The most expensive mistake: mixing concerns. A fetch function that also formats
> summaries, a tool function that also writes logs in its own format, a server route
> that also contains retry logic. Each shortcut costs 10× the time when you need
> to change that behaviour later.
