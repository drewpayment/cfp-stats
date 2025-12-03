const { createClient } = require('@libsql/client');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function inspectStats(teamName) {
  try {
    const teamResult = await client.execute({
      sql: `SELECT season_stats FROM teams WHERE school = ?`,
      args: [teamName]
    });
    const team = teamResult.rows[0];
    if (!team) throw new Error('Team not found');

    const seasonStats = JSON.parse(team.season_stats || '[]');
    console.log('Season Stats Keys:', seasonStats.map(s => s.statName));
    console.log('Full Season Stats:', JSON.stringify(seasonStats, null, 2));

  } catch (e) {
    console.error(e);
  } finally {
    client.close();
  }
}

inspectStats('Georgia');
