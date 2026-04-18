# research-mcp

Production-ready **MCP (Model Context Protocol) server** that demonstrates **multi-tool AI agent orchestration** for enterprise research workflows using **TypeScript/Node.js**, the official **`@modelcontextprotocol/sdk`**, and **Claude Sonnet 4**.

## What it does

This MCP server exposes 4 tools:

- **`summarize_url(url)` → string**: fetches a URL, cleans HTML, and returns a Claude-generated summary (handles redirects/timeouts/non-HTML best-effort).
- **`search_and_summarize(query, num_results?)` → object**: queries DuckDuckGo Instant Answer API (no key), fetches results in parallel via `Promise.allSettled`, summarizes each page, and returns relevance scores.
- **`extract_entities(text)` → object**: Claude extracts structured entities with confidence scores plus sentiment and language.
- **`compare_sources(urls[])` → object**: fetches and summarizes each URL in parallel, then Claude produces a structured comparative analysis.

Operational features:

- **stdio transport** (Claude Desktop compatible)
- **strict TypeScript**
- **Zod validation** on all tool inputs
- **timeouts**: web \(10s\), Claude \(30s\)
- **retries with exponential backoff** on API failures
- **structured JSON logging to stderr** (stdout reserved for MCP protocol)

## Install / build

```bash
npm install
npm run build
```

## Claude Desktop config

Add this to your Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "research-mcp": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH_TO>/research-mcp/dist/src/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "YOUR_KEY_HERE"
      }
    }
  }
}
```

## Example tool calls

- Summarize a URL:
  - `summarize_url({ "url": "https://example.com/report" })`

- Search and summarize:
  - `search_and_summarize({ "query": "ISO 27001 implementation guidance", "num_results": 3 })`

- Extract entities:
  - `extract_entities({ "text": "Acme Corp announced a partnership with Globex in Paris..." })`

- Compare sources:
  - `compare_sources({ "urls": ["https://source-a.com", "https://source-b.com"] })`

## Architecture (ASCII)

```
              (Claude Desktop / any MCP client)
                         |
                         | stdio (JSON-RPC over stdin/stdout)
                         v
                  +-----------------+
                  |   MCP Server    |
                  |  src/index.ts   |
                  +-----------------+
                   |   |    |    |
                   |   |    |    +------------------+
                   |   |    |                       |
                   v   v    v                       v
            summarize  search  entities         compare_sources
           (tool)     (tool)   (tool)             (tool)
              |          |        |                 |
              |          |        +--------+        |
              |          |                 |        |
              v          v                 v        v
        utils/fetch  DuckDuckGo API   utils/claude  utils/fetch
        (timeout,    (instant answer) (retry/timeout)
         retry,
         html clean)
                         |
                         v
                   Anthropic API
                (claude-sonnet-4)
```

## Notes

- Set `ANTHROPIC_API_KEY` in the environment for all Claude-dependent tools.
- Run `node dist/test.js` (after build) to exercise all tools with real data.

