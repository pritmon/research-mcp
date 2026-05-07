# research-mcp

A **production-ready MCP (Model Context Protocol) server** for AI-powered enterprise research workflows — summarize URLs, search the web, extract entities, and compare sources, all from any MCP-compatible client like Claude Desktop.

**Production features:** strict TypeScript · Zod input validation · retries with exponential backoff · configurable timeouts · structured JSON logging · stdio transport (Claude Desktop compatible)

Built with TypeScript, the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk), and Claude Sonnet.

---

## Tools

| Tool | Description |
|------|-------------|
| `summarize_url` | Fetches a URL and returns an AI-generated summary |
| `search_and_summarize` | Searches DuckDuckGo, fetches results in parallel, summarizes each |
| `extract_entities` | Extracts people, orgs, locations, concepts, sentiment from text |
| `compare_sources` | Fetches multiple URLs and produces a structured comparative analysis |

---

## Requirements

- Node.js >= 18
- An [Anthropic API key](https://console.anthropic.com)

---

## Installation

```bash
git clone https://github.com/pritmon/research-mcp.git
cd research-mcp
npm install
npm run build
```

---

## Claude Desktop Setup

Add the following to your Claude Desktop MCP config file:

**Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "research-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/research-mcp/dist/src/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Then restart Claude Desktop. The 4 research tools will be available automatically.

---

## Usage Examples

**Summarize a URL:**
```
summarize_url({ "url": "https://example.com/article" })
```

**Search and summarize:**
```
search_and_summarize({ "query": "climate change 2025", "num_results": 3 })
```

**Extract entities:**
```
extract_entities({ "text": "Anthropic released Claude 4 in San Francisco..." })
```

**Compare sources:**
```
compare_sources({ "urls": ["https://source-a.com", "https://source-b.com"] })
```

---

## Project Structure

```
research-mcp/
├── src/
│   ├── index.ts          # MCP server entry point
│   ├── tools/
│   │   ├── summarize.ts  # summarize_url tool
│   │   ├── search.ts     # search_and_summarize tool
│   │   ├── entities.ts   # extract_entities tool
│   │   └── compare.ts    # compare_sources tool
│   └── utils/
│       ├── claude.ts     # Anthropic API client (retries, timeouts)
│       ├── fetch.ts      # HTTP fetch with timeout and HTML cleaning
│       └── logger.ts     # Structured JSON logger
├── test.ts               # End-to-end tool tests
├── package.json
└── tsconfig.json
```

---

## Features

- **stdio transport** — compatible with Claude Desktop and any MCP client
- **Zod validation** on all tool inputs
- **Retries with exponential backoff** on API failures
- **Configurable timeouts** — 10s for web fetches, 30–60s for Claude calls
- **Structured JSON logging** to stderr (stdout reserved for MCP protocol)
- **Strict TypeScript** throughout

---

## Development

```bash
npm run build        # compile TypeScript
npm run dev          # watch mode
npm run test:tools   # run end-to-end tool tests
```

---

## License

MIT
