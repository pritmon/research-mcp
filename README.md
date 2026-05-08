<div align="center">

# 🔬 research-mcp

**Production-ready AI research server — MCP + REST API**

[![Node CI](https://github.com/pritmon/research-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/pritmon/research-mcp/actions/workflows/ci.yml)
[![Live Demo](https://img.shields.io/badge/live-demo-brightgreen?logo=render)](https://research-mcp-dbwy.onrender.com)
[![MCP Compatible](https://img.shields.io/badge/MCP-compatible-blue?logo=anthropic)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Claude Sonnet 4.6](https://img.shields.io/badge/Claude-Sonnet%204.6-blueviolet?logo=anthropic)](https://anthropic.com)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Summarize URLs · Search Wikipedia · Extract entities · Compare sources — all from Claude Desktop or any HTTP client.

**[→ Try the live demo](https://research-mcp-dbwy.onrender.com)**

</div>

---

## What it does

| Tool | Endpoint | Description |
|------|----------|-------------|
| `summarize_url` | `POST /summarize` | Fetch any URL and return an AI bullet-point summary |
| `search_and_summarize` | `POST /search` | Search Wikipedia, summarize each result with Claude |
| `extract_entities` | `POST /entities` | Extract people, orgs, locations, concepts & sentiment |
| `compare_sources` | `POST /compare` | Fetch multiple URLs and produce a structured analysis |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   research-mcp                      │
│                                                     │
│  ┌──────────────┐        ┌───────────────────────┐  │
│  │  MCP Server  │        │    HTTP REST Server   │  │
│  │  (stdio)     │        │    (Fastify v5)       │  │
│  │              │        │                       │  │
│  │ Claude       │        │  POST /summarize      │  │
│  │ Desktop ─────┤        │  POST /search         │  │
│  │ Cursor       │        │  POST /entities       │  │
│  │ Any MCP ─────┤        │  POST /compare        │  │
│  │ client       │        │  GET  /  (demo UI)    │  │
│  └──────┬───────┘        └──────────┬────────────┘  │
│         │                           │               │
│         └───────────┬───────────────┘               │
│                     ▼                               │
│         ┌───────────────────────┐                   │
│         │     Tool Layer        │                   │
│         │  summarize / search   │                   │
│         │  entities / compare   │                   │
│         └───────────┬───────────┘                   │
│                     │                               │
│          ┌──────────┴──────────┐                    │
│          ▼                     ▼                    │
│   ┌─────────────┐     ┌──────────────────┐          │
│   │ Anthropic   │     │  Web / Wikipedia │          │
│   │ Claude API  │     │  fetch + parse   │          │
│   └─────────────┘     └──────────────────┘          │
└─────────────────────────────────────────────────────┘
```

---

## Quick start

### Prerequisites
- Node.js >= 18
- An [Anthropic API key](https://console.anthropic.com)

### Install & run

```bash
git clone https://github.com/pritmon/research-mcp.git
cd research-mcp
npm install
npm run build

# Start the HTTP server
ANTHROPIC_API_KEY=sk-ant-... npm start

# Or start the MCP server (stdio, for Claude Desktop)
ANTHROPIC_API_KEY=sk-ant-... npm run start:mcp
```

---

## REST API

Base URL (hosted): `https://research-mcp-dbwy.onrender.com`

### `POST /summarize`
Fetch a URL and return an AI-generated summary.

```bash
curl -X POST https://research-mcp-dbwy.onrender.com/summarize \
  -H "Content-Type: application/json" \
  -d '{"url": "https://en.wikipedia.org/wiki/Artificial_intelligence"}'
```

```json
{
  "url": "https://en.wikipedia.org/wiki/Artificial_intelligence",
  "summary": "- **Definition**: AI refers to the simulation of human intelligence...\n- ..."
}
```

### `POST /search`
Search Wikipedia and summarize results.

```bash
curl -X POST https://research-mcp-dbwy.onrender.com/search \
  -H "Content-Type: application/json" \
  -d '{"query": "Model Context Protocol", "num_results": 3}'
```

```json
{
  "query": "Model Context Protocol",
  "results": [
    {
      "url": "https://en.wikipedia.org/wiki/...",
      "title": "Model Context Protocol",
      "summary": "- **Purpose**: Open protocol for LLM-tool integration...",
      "relevance_score": 1.0
    }
  ]
}
```

### `POST /entities`
Extract structured entities from text.

```bash
curl -X POST https://research-mcp-dbwy.onrender.com/entities \
  -H "Content-Type: application/json" \
  -d '{"text": "Anthropic released Claude 4 in San Francisco alongside OpenAI and Google DeepMind."}'
```

```json
{
  "people": [],
  "organizations": [
    { "name": "Anthropic", "confidence": 0.99 },
    { "name": "OpenAI", "confidence": 0.99 }
  ],
  "locations": [{ "name": "San Francisco", "confidence": 0.98 }],
  "key_concepts": [{ "concept": "Claude 4", "confidence": 0.95 }],
  "sentiment": "neutral",
  "language": "en"
}
```

### `POST /compare`
Compare multiple URLs with structured analysis.

```bash
curl -X POST https://research-mcp-dbwy.onrender.com/compare \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://source-a.com/article", "https://source-b.com/article"]}'
```

```json
{
  "sources": [
    { "url": "https://source-a.com/article", "summary": "..." },
    { "url": "https://source-b.com/article", "summary": "..." }
  ],
  "agreements": ["Both sources agree that..."],
  "contradictions": ["Source A claims X while Source B claims Y"],
  "consensus": "Overall, both sources...",
  "confidence": "high"
}
```

---

## Claude Desktop setup

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "research-mcp": {
      "command": "/usr/local/bin/node",
      "args": ["/absolute/path/to/research-mcp/dist/src/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-your-key-here"
      }
    }
  }
}
```

Restart Claude Desktop. All 4 research tools are immediately available.

---

## Project structure

```
research-mcp/
├── src/
│   ├── index.ts          # MCP server (stdio transport)
│   ├── server.ts         # HTTP server + interactive demo UI
│   ├── tools/
│   │   ├── summarize.ts  # summarize_url
│   │   ├── search.ts     # search_and_summarize (Wikipedia + Claude)
│   │   ├── entities.ts   # extract_entities
│   │   └── compare.ts    # compare_sources
│   └── utils/
│       ├── claude.ts     # Anthropic client — retries, timeouts, JSON parsing
│       ├── fetch.ts      # HTTP fetch — retries, HTML cleaning (cheerio)
│       └── logger.ts     # Structured JSON logger (stderr)
├── test.ts               # End-to-end integration tests
├── render.yaml           # Render.com deployment config
├── tsconfig.json
└── package.json
```

---

## Key design decisions

| Concern | Approach |
|---------|----------|
| Reliability | Exponential backoff with jitter on all Claude + HTTP calls |
| Speed | Wikipedia REST summary API (no HTML parsing) + parallel fetches |
| Safety | Zod validation on all inputs; errors never leak stack traces |
| Logging | Structured JSON to stderr (stdout reserved for MCP protocol) |
| Deployment | Single `render.yaml` — zero-config deploy on Render free tier |
| DX | `stdio` MCP transport — drop into Claude Desktop in 2 minutes |

---

## Development

```bash
npm run build          # compile TypeScript → dist/
npm run dev            # watch mode (HTTP server)
npm run start:mcp      # run MCP stdio server
npm run test:tools     # end-to-end integration tests (requires ANTHROPIC_API_KEY)
```

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

```bash
git clone https://github.com/pritmon/research-mcp.git
cd research-mcp
npm install
npm run build
```

Open an [issue](https://github.com/pritmon/research-mcp/issues) to discuss before sending a large PR.

---

## License

[MIT](LICENSE) © Pritam Mondal
