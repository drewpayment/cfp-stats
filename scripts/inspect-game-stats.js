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
      SELECT count(*) as total FROM games
    `);
    console.log('Total games:', result.rows[0].total);

    const resultStats = await client.execute(`
      SELECT count(*) as total FROM games WHERE game_stats IS NOT NULL
    `);
    console.log('Games with game_stats:', resultStats.rows[0].total);

    const resultAdv = await client.execute(`
      SELECT count(*) as total FROM games WHERE advanced_stats IS NOT NULL
    `);
    console.log('Games with advanced_stats:', resultAdv.rows[0].total);

    const sample = await client.execute(`
      SELECT id, home_team, away_team, game_stats, advanced_stats
      FROM games
      WHERE game_stats IS NOT NULL
      LIMIT 1
    `);
    
    if (sample.rows.length > 0) {
      const row = sample.rows[0];
      console.log(`Sample Game: ${row.home_team} vs ${row.away_team}`);
      if (row.game_stats) {
        console.log('Game Stats Structure:', JSON.stringify(JSON.parse(row.game_stats), null, 2));
      }
      if (row.advanced_stats) {
        console.log('Advanced Stats Structure:', JSON.stringify(JSON.parse(row.advanced_stats), null, 2));
      }
    } else {
      console.log('No games with game_stats found to sample.');
    }
  } catch (e) {
    console.error(e);
  } finally {
    client.close();
  }
}

inspect();
