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
 */
export async function main(): Promise<void> {
  const server = new McpServer(
    { name: 'research-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

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
        return { content: [{ type: 'text', text: summary }], structuredContent: { summary } };
      } catch (err) {
        log('error', 'summarize_url failed', { url }, err);
        return { content: [{ type: 'text', text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

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

  const transport = new StdioServerTransport();
  await server.connect(transport);

  log('info', 'research-mcp server started', { transport: 'stdio' });
}

// Run when executed as a CLI entrypoint.
if (decodeURI(new URL(import.meta.url).pathname) === process.argv[1]) {
  main().catch(err => {
    log('error', 'Fatal error starting server', undefined, err);
    process.exitCode = 1;
  });
}

