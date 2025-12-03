const { createClient } = require('@libsql/client');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function inspectSchema() {
  try {
    const result = await client.execute(`PRAGMA table_info(rankings)`);
    console.log('Rankings Table Schema:', result.rows);
  } catch (e) {
    console.error(e);
  } finally {
    client.close();
  }
}

inspectSchema();
