# Contributing to research-mcp

Thank you for your interest! Here's everything you need to get started.

## Getting started

```bash
git clone https://github.com/pritmon/research-mcp.git
cd research-mcp
npm install
npm run build
```

Set your API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-your-key
```

## Development workflow

| Command | What it does |
|---------|-------------|
| `npm run build` | Compile TypeScript |
| `npm run dev` | Watch mode — rebuilds on change |
| `npm start` | Start HTTP server on port 3000 |
| `npm run start:mcp` | Start MCP stdio server |
| `npm run test:tools` | End-to-end tests (makes real API calls) |

## Project layout

```
src/tools/     — one file per MCP tool
src/utils/     — shared Claude client, fetch helpers, logger
src/index.ts   — MCP server (stdio)
src/server.ts  — HTTP server + demo UI
test.ts        — integration tests
```

## Adding a new tool

1. Create `src/tools/your-tool.ts` — export an `async function` and a Zod input schema
2. Register the MCP tool in `src/index.ts`
3. Add a REST endpoint in `src/server.ts`
4. Add a test case in `test.ts`
5. Document the endpoint in `README.md`

## Code style

- **TypeScript strict mode** — no `any`, no implicit returns
- **Zod** for all input validation
- **No `console.log`** — use `log()` from `src/utils/logger.ts`
- Keep functions small and single-purpose
- All HTTP calls go through `fetchWithRetry`; all Claude calls go through `claudeText` / `claudeJson`

## Submitting a PR

1. Fork the repo and create a branch: `git checkout -b feat/my-feature`
2. Make your changes and ensure `npm run build` passes
3. Open a PR with the provided template filled in
4. A maintainer will review within a few days

## Reporting bugs

Use the [bug report template](https://github.com/pritmon/research-mcp/issues/new?template=bug_report.yml).

## License

By contributing, you agree your code will be licensed under the [MIT License](LICENSE).
