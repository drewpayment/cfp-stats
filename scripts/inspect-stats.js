const { createClient } = require('@libsql/client');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function inspect() {
  try {
    const result = await client.execute(`
      SELECT id, home_team, away_team, advanced_stats
      FROM games
      WHERE advanced_stats IS NOT NULL
      LIMIT 1
    `);
    
    if (result.rows.length > 0) {
      const row = result.rows[0];
      console.log(`Game: ${row.home_team} vs ${row.away_team}`);
      console.log('Advanced Stats:', JSON.stringify(JSON.parse(row.advanced_stats), null, 2));
    } else {
      console.log('No games with advanced stats found.');
    }
  } catch (e) {
    console.error(e);
  } finally {
    client.close();
  }
}

inspect();
