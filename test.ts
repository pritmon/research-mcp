import { summarizeUrl } from './src/tools/summarize.js';
import { searchAndSummarize } from './src/tools/search.js';
import { extractEntities } from './src/tools/entities.js';
import { compareSources } from './src/tools/compare.js';

async function run(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Set ANTHROPIC_API_KEY to run test.ts (real Claude calls required).');
  }

  const url1 = 'https://en.wikipedia.org/wiki/Model_Context_Protocol';
  const url2 = 'https://modelcontextprotocol.io/specification';

  console.log('--- summarize_url ---');
  const s1 = await summarizeUrl(url1);
  console.log(s1);

  console.log('\n--- search_and_summarize ---');
  const search = await searchAndSummarize('Model Context Protocol SDK', 3);
  console.log(JSON.stringify(search, null, 2));

  console.log('\n--- extract_entities ---');
  const ents = await extractEntities(s1);
  console.log(JSON.stringify(ents, null, 2));

  console.log('\n--- compare_sources ---');
  const cmp = await compareSources([url1, url2]);
  console.log(JSON.stringify(cmp, null, 2));
}

run().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

