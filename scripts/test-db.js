const { createClient } = require('@libsql/client');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function test() {
  try {
    const result = await client.execute(`
      SELECT r.rank, r.school, r.points 
      FROM rankings r 
      WHERE r.poll = 'AP Top 25' 
      ORDER BY r.rank ASC 
      LIMIT 5
    `);
    console.log('Top 5 Teams:', result.rows);
  } catch (e) {
    console.error(e);
  } finally {
    client.close();
  }
}

test();
