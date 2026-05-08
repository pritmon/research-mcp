/**
 * @module index
 *
 * MCP server entry point — registers all research tools and starts the stdio transport.
 *
 * Role in the system:
 *   This module is the bridge between the Model Context Protocol SDK and the
 *   tool implementations.  It instantiates an `McpServer`, registers each tool
 *   with its input/output schema and handler, then connects the server to the
 *   stdio transport so an MCP host (e.g. Claude Desktop, Cursor, or any MCP
 *   client) can invoke the tools over stdin/stdout.
 *
 *   The companion `server.ts` exposes the same tools via an HTTP/REST interface
 *   for direct browser or API access.  Both entry points share the same
 *   underlying tool implementations.
 *
 * Transport choice:
 *   `StdioServerTransport` is used because MCP hosts typically spawn the server
 *   as a child process and communicate over the process's standard streams.
 *   This avoids the need to manage ports, TLS, or authentication at the MCP
 *   layer.
 *
 * Error handling per tool:
 *   Each handler wraps its tool call in try/catch and returns `{ isError: true }`
 *   on failure rather than letting the error propagate.  This is the idiomatic
 *   MCP pattern: the host receives a structured error response it can display
 *   to the user rather than an unhandled rejection that could crash the process.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { summarizeUrl, SummarizeUrlInputSchema } from './tools/summarize.js';
import { searchAndSummarize, SearchAndSummarizeInputSchema } from './tools/search.js';
import { extractEntities, ExtractEntitiesInputSchema } from './tools/entities.js';
import { compareSources, CompareSourcesInputSchema } from './tools/compare.js';
import { log } from './utils/logger.js';

/**
 * Create and start the MCP server over stdio.
 *
 * Registers four tools:
 *   - `summarize_url`        : Fetch + AI-summarise a single URL.
 *   - `search_and_summarize` : Wikipedia search + per-result AI summary.
 *   - `extract_entities`     : NER / entity extraction from free text.
 *   - `compare_sources`      : Parallel fetch + summary + cross-source comparison.
 *
 * @returns A promise that resolves once the server is connected and listening.
 */
export async function main(): Promise<void> {
  // Instantiate the MCP server with a human-readable name/version and declare
  // that this server exposes tools (required by the MCP capability negotiation).
  const server = new McpServer(
    { name: 'research-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // ── Tool: summarize_url ────────────────────────────────────────────────────
  // Fetches an arbitrary URL, strips HTML boilerplate, and generates a concise
  // AI bullet-point summary.  `outputSchema: z.string()` signals to the MCP
  // host that the structured content is a plain string (the summary text).
  server.registerTool(
    'summarize_url',
    {
      title: 'Summarize URL',
      description: 'Fetch a URL, clean HTML, and return an AI-generated summary.',
      inputSchema: SummarizeUrlInputSchema,
      outputSchema: z.string(),
    },
    async ({ url }) => {
      try {
        const summary = await summarizeUrl(url);
        // `content` is the human-readable MCP response; `structuredContent` is
        // the machine-readable payload for hosts that consume structured output.
        return { content: [{ type: 'text', text: summary }], structuredContent: { summary } };
      } catch (err) {
        log('error', 'summarize_url failed', { url }, err);
        return { content: [{ type: 'text', text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ── Tool: search_and_summarize ─────────────────────────────────────────────
  // Two-stage Wikipedia search: full-text search for titles, then parallel
  // REST-summary fetch + Claude formatting per result.  No `outputSchema` is
  // registered because the result shape is a rich object (not a scalar).
  server.registerTool(
    'search_and_summarize',
    {
      title: 'Search and Summarize',
      description:
        'Search Wikipedia, fetch each result in parallel, and summarize sources using Claude.',
      inputSchema: SearchAndSummarizeInputSchema,
    },
    async ({ query, num_results }) => {
      try {
        const out = await searchAndSummarize(query, num_results ?? 5);
        return {
          content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
          structuredContent: out,
        };
      } catch (err) {
        log('error', 'search_and_summarize failed', { query }, err);
        return { content: [{ type: 'text', text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ── Tool: extract_entities ─────────────────────────────────────────────────
  // Named entity recognition + sentiment + language detection from free text.
  // Returns a Zod-validated JSON object (people, orgs, locations, concepts).
  server.registerTool(
    'extract_entities',
    {
      title: 'Extract Entities',
      description: 'Extract structured entities and metadata from text using Claude.',
      inputSchema: ExtractEntitiesInputSchema,
    },
    async ({ text }) => {
      try {
        const out = await extractEntities(text);
        return {
          content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
          structuredContent: out,
        };
      } catch (err) {
        log('error', 'extract_entities failed', undefined, err);
        return { content: [{ type: 'text', text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ── Tool: compare_sources ──────────────────────────────────────────────────
  // Multi-step pipeline: fetch all URLs in parallel, summarise each, then ask
  // Claude to identify agreements, contradictions, and produce a consensus.
  server.registerTool(
    'compare_sources',
    {
      title: 'Compare Sources',
      description: 'Fetch, summarize, and compare multiple sources into a structured analysis.',
      inputSchema: CompareSourcesInputSchema,
    },
    async ({ urls }) => {
      try {
        const out = await compareSources(urls);
        return {
          content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
          structuredContent: out,
        };
      } catch (err) {
        log('error', 'compare_sources failed', { urls }, err);
        return { content: [{ type: 'text', text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // Connect to the stdio transport — this wires the MCP JSON-RPC framing to
  // process.stdin (reads) and process.stdout (writes).
  // Why stdio?  MCP hosts spawn the server as a subprocess and communicate over
  // standard streams; this requires no network configuration or port management.
  const transport = new StdioServerTransport();
  await server.connect(transport);

  log('info', 'research-mcp server started', { transport: 'stdio' });
}

// Run when executed as a CLI entrypoint.
// Why `decodeURI(new URL(import.meta.url).pathname) === process.argv[1]`?
// In ESM, `import.meta.url` is a `file://` URL.  Comparing its decoded pathname
// to `process.argv[1]` (the script path Node received) detects whether this
// module is the direct entry point rather than being imported as a dependency —
// the ESM equivalent of the CommonJS `require.main === module` pattern.
if (decodeURI(new URL(import.meta.url).pathname) === process.argv[1]) {
  main().catch(err => {
    log('error', 'Fatal error starting server', undefined, err);
    process.exitCode = 1;
  });
}

