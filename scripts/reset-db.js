const { createClient } = require('@libsql/client');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function reset() {
  try {
    console.log('Dropping tables...');
    await client.execute('DROP TABLE IF EXISTS games');
    await client.execute('DROP TABLE IF EXISTS rankings');
    await client.execute('DROP TABLE IF EXISTS teams');
    console.log('Tables dropped.');
  } catch (e) {
    console.error(e);
  } finally {
    client.close();
  }
}

reset();
