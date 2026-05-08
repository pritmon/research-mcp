# Learning Points — MCP, AI, TypeScript & Building Real Systems

Everything we learned while building this project, explained in plain English.
No unnecessary jargon. Just clear answers you can actually understand and remember.

---

## Model Context Protocol (MCP)

**What is MCP and why does it exist?**

Imagine you want Claude to be able to search the web, read files, or call your
database. Without MCP, you'd have to write custom glue code for every combination
of AI model and tool. With MCP, you write the tool once as an MCP server, and
it works with Claude Desktop, Cursor, Zed, or any other MCP-compatible app
automatically.

MCP is basically a universal plug socket for AI tools. One server, works everywhere.

---

**How does an MCP server actually talk to Claude Desktop?**

There are two ways:

- **stdio (standard input/output)** — Claude Desktop launches your server as a
  background program and they talk through the terminal's input and output streams.
  Think of it like two people passing notes through a slot in a wall. No internet
  connection needed. This is what we use.

- **HTTP + SSE** — The server runs as a website, and Claude connects to it over
  the internet. Better when the server needs to be shared across multiple users
  or machines.

For a local tool running on your own computer, stdio is simpler — no ports to
configure, no security to set up.

---

**What is `content` vs `structuredContent` in a tool response?**

When a tool returns data, it sends two versions of the result:

- `content` — the human-readable version. This is what Claude shows to the user
  in the chat. Plain text or markdown.
- `structuredContent` — the machine-readable version. This is a JSON object that
  Claude or other tools can use programmatically.

You can think of it like a receipt: `content` is the printed receipt you give
the customer, `structuredContent` is the data record saved in your accounting system.

---

**What does `isError: true` mean?**

When a tool fails, instead of crashing the whole server, it returns a response
with `isError: true`. This tells Claude Desktop "the tool ran but something went
wrong" — Claude can then show the user a friendly error message.

The alternative — letting the error crash the server — would disconnect Claude
Desktop from all your tools until you restarted everything. `isError: true` keeps
things running gracefully.

---

**How does MCP know what inputs a tool accepts?**

Every tool has a schema — a description of what data it expects. In this project
we use **Zod** to define these schemas. The MCP SDK automatically converts the
Zod schema into the format Claude Desktop needs to understand the tool.

This means you define the rules once and they work everywhere — validation in
your code, documentation in Claude Desktop, all from the same definition.

---

## Working with Claude (the AI API)

**What is the difference between `claudeText` and `claudeJson`?**

Both call Claude. The difference is what they do with the response:

- `claudeText` — asks Claude something and gives you back the raw text answer.
  Used for summaries, bullet points, anything that's meant to be read by humans.

- `claudeJson` — asks Claude to return a specific JSON structure. After getting
  Claude's response, it removes any markdown formatting Claude might have added,
  parses the JSON, and checks it matches the expected shape. If something is wrong
  it tries again automatically.

Think of `claudeText` as "just tell me the answer" and `claudeJson` as "give me
the answer in a specific form I can use in my code."

---

**Why is temperature set to 0.2?**

Temperature controls how "creative" or "random" Claude's responses are.

- **Temperature 0** — Claude always gives the most predictable, safe answer.
  Good for consistency but can sometimes produce repetitive or robotic text.
- **Temperature 1** — Claude gets creative and varied. Good for writing, bad for
  structured data where you need precision.
- **Temperature 0.2** — Mostly consistent and factual, but with just enough
  variation to avoid robotic repetition. The sweet spot for research and extraction tasks.

For tasks like extracting names from text or comparing sources, you want Claude
to be accurate, not creative. Low temperature keeps it focused.

---

**What is exponential backoff and why do we use it?**

When an API call fails (because the server is busy or the network hiccupped),
you want to try again. But if you try immediately and fail again, and try again,
and again — you're just hammering a server that's already struggling.

Exponential backoff means: wait a bit before retrying. Wait a bit longer next
time. Wait even longer after that.

```
Attempt 1 fails → wait 0.4 seconds
Attempt 2 fails → wait 0.8 seconds
Attempt 3 fails → wait 1.6 seconds
```

The "jitter" part adds a small random extra wait. Why? Imagine 100 apps all
got the same error at the same time. Without jitter, they all retry at exactly
the same moment and crash the server again. With jitter, they spread out and
the server recovers.

---

**What is `max_tokens` and how do you decide what to set it to?**

`max_tokens` tells Claude "stop writing after this many words." (A token is
roughly ¾ of a word.)

Set it too low and Claude's response gets cut off in the middle — which is
particularly bad when you need JSON, because half a JSON object is useless.

Set it too high and you waste money and time waiting for Claude to write more
than you need.

**Rough guide:**
- Short summaries (a few bullet points): 600–1000 tokens
- Detailed analysis or comparison: 2000–4000 tokens
- Structured JSON with many fields: 2000–4000 tokens

Size it based on the longest response you'd reasonably expect, not a fixed global number.

---

**Why do we retry on some errors but not others?**

Not all errors are the same. Some are temporary, some are permanent:

| Error | Meaning | What to do |
|-------|---------|------------|
| Network timeout | Server was slow — try again | Retry |
| Rate limit (429) | Too many requests — slow down | Retry after waiting |
| Server overloaded (529) | Claude is busy | Retry after waiting |
| Wrong API key (401) | Your key is invalid | Stop immediately — retrying won't help |
| Bad input (400) | Your prompt is wrong | Stop immediately — retrying sends the same bad data |

Retrying a wrong API key 3 times wastes 3x the time and gets the same result.
Retrying a timeout often succeeds on the next attempt.

---

## TypeScript and Zod

**Why use Zod when TypeScript already has types?**

TypeScript types are like comments — they help you while writing code, but they
disappear completely when the code actually runs. At runtime, TypeScript has no
idea what shape your data is.

Zod is different. It checks data at runtime — when real data from real users
arrives. So when someone sends your API `{"url": 12345}` instead of
`{"url": "https://..."}`, Zod catches it and returns a proper error. TypeScript
alone would have let it through and crashed somewhere unexpected.

**Simple rule:** TypeScript types tell you what your code expects. Zod checks
that reality matches those expectations.

---

**What is `z.infer` and why is it useful?**

Normally you'd write a TypeScript type AND a Zod schema separately — two
definitions of the same thing that can drift out of sync over time.

`z.infer` lets you write the Zod schema once and automatically generate the
TypeScript type from it:

```typescript
// Define the schema once
const UserSchema = z.object({
  name: z.string(),
  age: z.number()
});

// TypeScript type is generated automatically — no duplication
type User = z.infer<typeof UserSchema>;
// User = { name: string; age: number }
```

One source of truth. Change the schema, the type updates automatically.

---

**What is the difference between `parse` and `safeParse` in Zod?**

Both validate data against a schema. The difference is what happens when validation fails:

- `parse` — throws an error immediately. Use this inside functions where you want
  the error to bubble up to a central error handler.

- `safeParse` — returns a result object telling you whether it succeeded or failed.
  Use this in API route handlers where you want to send a proper "400 Bad Request"
  response instead of crashing.

```typescript
// parse — throws if invalid
const data = UserSchema.parse(req.body);

// safeParse — you handle the failure yourself
const result = UserSchema.safeParse(req.body);
if (!result.success) {
  return reply.status(400).send({ error: result.error.flatten() });
}
```

---

**What is strict mode in TypeScript and why enable it?**

Strict mode turns on a set of extra safety checks in TypeScript. The most important ones:

- **noImplicitAny** — every variable must have a clear type. You can't just leave
  things as unknown "any" type.
- **strictNullChecks** — you must handle the possibility that something is `null`
  or `undefined` before using it.

These feel restrictive at first, but they prevent an entire category of bugs —
especially the classic "Cannot read properties of undefined" crash that happens
at runtime on real users' data.

---

**What is `Promise.allSettled` and when should you use it over `Promise.all`?**

Both run multiple async operations at the same time. The difference is what
happens when one fails:

- `Promise.all` — if any one operation fails, everything stops. You get nothing.
- `Promise.allSettled` — waits for all operations to finish regardless. You get
  the results of the ones that succeeded and the errors of the ones that failed.

**Use `Promise.all` when:** all results are required and one failure means the
whole thing is useless.

**Use `Promise.allSettled` when:** partial results are better than nothing.
Example: fetching 5 URLs — if one website is down, you still want the other 4.

In this project, we use `Promise.allSettled` everywhere so that one slow or
broken website doesn't cancel all the other good results.

---

## HTTP Servers and Fastify

**Why Fastify and not Express?**

Express is the most popular, but Fastify has real advantages:

- It's 2–3 times faster than Express (matters when you have many users)
- TypeScript support is built in — no fighting with types
- Modern async/await design — cleaner code, fewer bugs
- Actively maintained with regular updates

Both work. Fastify is just a better choice for new TypeScript projects.

---

**What broke in Fastify version 5?**

In the old version (v4), you started the server with a callback:

```typescript
app.listen({ port: 3000 }, (err, address) => {
  console.log('Running on', address);
});
```

In version 5, this callback was completely removed — without any compile error or
warning. The server still started internally, but the callback was silently ignored.
No startup log, no error handling, no idea if it worked.

The fix is to use the modern Promise style:

```typescript
app.listen({ port: 3000 })
  .then(address => console.log('Running on', address))
  .catch(err => process.exit(1));
```

This was one of the hardest bugs to find because everything looked fine on the
surface — the process was running, just not responding.

---

**What does `Content-Type: application/json` do?**

When you send data to a server, you include a header that says what format the
data is in. `Content-Type: application/json` tells the server "my request body
is JSON — please parse it as JSON."

Without this header, Fastify doesn't know how to read the body, so `req.body`
comes through as empty or undefined — and your validation fails for no obvious reason.

Always include `Content-Type: application/json` when sending JSON in a POST request.

---

**What is `Promise.race` and why do we use it for timeouts?**

`Promise.race` runs multiple promises at the same time and returns whichever one
finishes first — the others are ignored.

We use this to add a hard deadline to the search endpoint:

```typescript
const result = await Promise.race([
  searchAndSummarize(query),              // the real work
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timed out')), 25_000)  // the deadline
  )
]);
```

If the search finishes in 10 seconds — great, we get the results.
If it takes longer than 25 seconds — the timeout "wins" the race, and we return
a clean JSON error instead of hanging forever or letting the hosting platform
return an HTML error page.

---

**What is `AbortController` and why create a new one each retry?**

`AbortController` is a way to cancel a fetch request that's taking too long.
You create a controller, attach its "signal" to the fetch, then call `.abort()`
to cancel it.

The important rule: once you abort a controller, it's permanently aborted.
If you reuse the same controller for a retry, the new request gets cancelled
immediately — before it even starts.

So we create a fresh `AbortController` for every attempt. Each attempt gets a
clean, unaborted signal.

---

## Web Fetching and HTML Cleaning

**What does Cheerio do and why do we need it?**

When you fetch a web page, you get raw HTML — hundreds of lines of `<div>`,
`<nav>`, `<script>`, `<footer>`, and other tags that have nothing to do with
the actual content. If you sent all of that to Claude, it would waste most of
its reading budget on navigation menus and cookie banners.

Cheerio strips all the junk (scripts, styles, navbars, footers) and extracts
just the readable text. Think of it as a "give me just the article, nothing else"
button for any web page.

---

**Why do we only send the first 12,000 characters to Claude?**

Claude can only read a certain amount of text at once (its "context window").
A long Wikipedia article might have 80,000 characters — sending all of it would:
- Use most of Claude's context window, leaving little room for its response
- Cost more (you pay per token)
- Take longer to process

12,000 characters is enough to understand what an article is about and write
a good summary. The first part of an article almost always contains the most
important information anyway.

---

**What is `he.decode()` and why is it needed?**

After Cheerio extracts text from HTML, some characters might still appear as
HTML escape codes — like `&amp;` instead of `&`, or `&nbsp;` instead of a space.

`he.decode()` converts all those codes back into normal readable characters so
Claude gets clean text instead of a string full of `&amp;` and `&#x27;`.

Without it, Claude might summarise an article that contains "&amp;amp;amp;" as
meaningful content — which it isn't.

---

## Logging

**Why do we write logs to stderr and not stdout?**

The MCP stdio server communicates with Claude Desktop through stdout — every line
written to stdout is treated as a message in the MCP protocol.

If we also wrote log lines to stdout, Claude Desktop would receive both real
protocol messages AND log lines mixed together. It would be like trying to have
a phone conversation while someone randomly reads out unrelated sentences into
the same phone.

stderr is a completely separate output stream that Claude Desktop ignores. So
logs go to stderr and stay out of the way.

---

**What is structured logging and why is it better than `console.log`?**

A `console.log` line might look like:
```
Error fetching URL https://example.com timeout after 10000ms
```

A structured log line looks like:
```json
{"level":"error","msg":"Fetch failed","url":"https://example.com","timeoutMs":10000,"time":"2026-05-08T11:30:00Z"}
```

The structured version is a proper JSON object. This means you can:
- Filter all errors with `level === "error"` automatically
- Search for all events involving a specific URL
- Feed it into monitoring tools like Datadog or Grafana

Plain text logs require someone to write regex patterns just to extract basic
information. Structured logs are queryable from day one.

---

**What should every error log include?**

At minimum:
- **What went wrong** — the error message
- **Where it went wrong** — the error type and stack trace
- **What was being processed** — the URL, query, or input that caused the error

The more context you include, the faster you can find and fix the problem.
Stack traces especially — without them, you know something broke but not where.

---

## Deployment

**What is `render.yaml` and why does it matter?**

`render.yaml` is a file that tells Render exactly how to deploy your project —
what command to use to build it, what command to start it, what environment
variables it needs.

Without this file, you'd have to configure all of that manually in the Render
dashboard every time. With the file committed to git, the configuration is
part of the code — if you change the build command, the change is tracked,
reviewed, and applied automatically on the next deploy.

**Config as code** — your deployment settings are version controlled just like
your code. No more "I changed something in the dashboard and forgot what."

---

**What is the difference between `npm install` and `npm ci`?**

- `npm install` — figures out which versions of packages to install based on
  the rules in `package.json`. It might install slightly different versions than
  last time. Used during local development.

- `npm ci` — installs exactly the versions recorded in `package-lock.json`. No
  guessing, no variation. If the lock file is missing, it fails loudly.

In CI/CD pipelines (automated build and deploy), use `npm ci`. You want the
build to be identical every single time. `npm install` can silently install
slightly different package versions and introduce unexpected differences between
builds.

---

**Why run CI tests across multiple Node.js versions (18, 20, 22)?**

Node.js releases contain updates to the JavaScript engine. Occasionally these
updates change behaviour — a function that works in Node 18 might behave
differently in Node 22.

Testing against multiple versions means you catch these differences before
they affect real users. It also proves your project works for users who haven't
updated to the latest Node version yet.

If your CI only tests one version and a user runs a different one, you might
ship code that works for you but breaks for them.

---

## Security

**Why must API keys never be in the code or git history?**

Once something is committed to git, it stays in the history forever — even if
you delete the file in a later commit. Anyone who clones the repo (now or in the
future) can run `git log` and find the key.

GitHub even scans public repositories for API keys and alerts the service
provider automatically. In many cases the key gets revoked within minutes of
being pushed.

Keep API keys in environment variables. Render, Vercel, and similar platforms
have a dashboard specifically for storing these secrets safely.

---

**Why do we validate user input before using it?**

Data that comes from outside your system — from a user's request, an API
response, or a form — cannot be trusted. It might be missing, in the wrong
format, or intentionally malformed.

Validating at the boundary (before the data goes anywhere in your code) means:
- Your functions receive exactly the type of data they expect
- One consistent place handles all the "what if the data is bad?" logic
- Attackers can't crash your server by sending unexpected input

Think of it like checking IDs at the door. Once someone is inside, you trust them.
But you check everyone before they enter.

---

**What should you never include in an API error response?**

Never expose to users:
- Stack traces (shows exactly where your code lives and how it's structured)
- File paths (reveals your server's directory layout)
- Database errors (can expose table names, column names, or connection details)
- Environment variable names (hints at what secrets you're using)

Return a simple, vague message to the user: *"Something went wrong. Please try again."*

Log the full detailed error server-side where only you can see it. The user
gets a friendly message. You get the full information needed to debug.
