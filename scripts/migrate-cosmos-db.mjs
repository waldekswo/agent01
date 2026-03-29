/**
 * Migrates all documents from openclaw-db -> malgosha-db
 * Run: node scripts/migrate-cosmos-db.mjs
 * Requires: AZURE_COSMOS_ENDPOINT and AZURE_COSMOS_KEY env vars
 */
import { CosmosClient } from '@azure/cosmos';

const ENDPOINT = process.env.AZURE_COSMOS_ENDPOINT;
const KEY      = process.env.AZURE_COSMOS_KEY;
const SOURCE   = 'openclaw-db';
const TARGET   = 'malgosha-db';
const CONTAINERS = ['timeline', 'facts', 'routines', 'drafts', 'stats'];

if (!ENDPOINT || !KEY) {
  console.error('ERROR: Set AZURE_COSMOS_ENDPOINT and AZURE_COSMOS_KEY env vars');
  process.exit(1);
}

const client = new CosmosClient({ endpoint: ENDPOINT, key: KEY });

async function migrateContainer(name) {
  const src = client.database(SOURCE).container(name);
  const dst = client.database(TARGET).container(name);

  const { resources: docs } = await src.items.readAll().fetchAll();
  console.log(`  ${name}: ${docs.length} document(s) found`);

  if (docs.length === 0) return 0;

  let copied = 0;
  for (const doc of docs) {
    // Remove internal Cosmos metadata before inserting
    const { _rid, _self, _etag, _attachments, _ts, ...clean } = doc;
    await dst.items.upsert(clean);
    copied++;
  }
  console.log(`  ${name}: ${copied} document(s) copied ✓`);
  return copied;
}

console.log(`\nMigrating ${SOURCE} → ${TARGET}\n`);
let total = 0;
for (const c of CONTAINERS) {
  total += await migrateContainer(c);
}
console.log(`\nDone. Total documents migrated: ${total}`);
