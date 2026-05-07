# 🔬 research-mcp

![Node CI](https://img.shields.io/badge/node%20ci-passing-brightgreen?logo=github)
![Live Demo](https://img.shields.io/badge/live-demo-brightgreen)
![MCP](https://img.shields.io/badge/MCP-compatible-blue?logo=anthropic)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Claude Sonnet](https://img.shields.io/badge/Claude-Sonnet%204.6-blueviolet?logo=anthropic)
![License](https://img.shields.io/badge/license-MIT-green)

A **production-ready MCP (Model Context Protocol) server** for AI-powered enterprise research workflows — summarize URLs, search the web, extract entities, and compare sources, all from any MCP-compatible client like Claude Desktop.

Built with TypeScript, the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk), and Claude Sonnet 4.6.

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

## Live Demo (REST API)

The server is deployed at **`https://research-mcp.onrender.com`** (update after deploy).

```bash
# Summarize a URL
curl -X POST https://research-mcp.onrender.com/summarize \
  -H "Content-Type: application/json" \
  -d '{"url": "https://en.wikipedia.org/wiki/Artificial_intelligence"}'

# Extract entities
curl -X POST https://research-mcp.onrender.com/entities \
  -H "Content-Type: application/json" \
  -d '{"text": "Anthropic released Claude 4 in San Francisco."}'

# Compare sources
curl -X POST https://research-mcp.onrender.com/compare \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://source-a.com", "https://source-b.com"]}'
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
