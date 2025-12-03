const { createClient } = require('@libsql/client');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function verifyYPO(teamName) {
  try {
    console.log(`Verifying YPO/YPD for ${teamName}...`);

    // 1. Get Team Data
    const teamResult = await client.execute({
      sql: `SELECT * FROM teams WHERE school = ?`,
      args: [teamName]
    });
    const team = teamResult.rows[0];
    if (!team) throw new Error('Team not found');

    const seasonStats = JSON.parse(team.season_stats || '[]');
    const advancedStats = JSON.parse(team.advanced_season_stats || 'null');

    console.log('--- Bulk Stats ---');
    if (advancedStats) {
        console.log('Advanced Stats (Offense):', advancedStats.offense);
        console.log('Advanced Stats (Defense):', advancedStats.defense);
    } else {
        console.log('No Advanced Stats found.');
    }

    // 2. Get Game Data (Aggregated)
    const gamesResult = await client.execute({
        sql: `SELECT * FROM games WHERE (home_team = ? OR away_team = ?) AND completed = 1`,
        args: [teamName, teamName]
    });

    let totalPointsFor = 0;
    let totalPointsAgainst = 0;
    let gamesPlayed = 0;

    gamesResult.rows.forEach(g => {
        gamesPlayed++;
        if (g.home_team === teamName) {
            totalPointsFor += g.home_points;
            totalPointsAgainst += g.away_points;
        } else {
            totalPointsFor += g.away_points;
            totalPointsAgainst += g.home_points;
        }
    });

    console.log('--- Game Aggregation ---');
    console.log(`Games Played: ${gamesPlayed}`);
    console.log(`Total Points For: ${totalPointsFor}`);
    console.log(`Total Points Against: ${totalPointsAgainst}`);

    // 3. Calculate YPO/YPD
    // Formula: Total Yards / Total Points
    let offTotalYards = 0;
    let defTotalYards = 0;

    // Check season_stats first (Primary)
    if (seasonStats.length > 0) {
        console.log('Using Season Stats...');
        seasonStats.forEach(s => {
            if (s.statName === 'totalYards') offTotalYards = parseInt(s.statValue);
            if (s.statName === 'totalYardsOpponent') defTotalYards = parseInt(s.statValue);
        });
    } else if (advancedStats && advancedStats.offense && advancedStats.defense) {
         // Fallback (though we know this was missing totalYards)
        offTotalYards = advancedStats.offense.totalYards || 0;
        defTotalYards = advancedStats.defense.totalYards || 0;
    }

    const ypo = totalPointsFor > 0 ? offTotalYards / totalPointsFor : 0;
    const ypd = totalPointsAgainst > 0 ? defTotalYards / totalPointsAgainst : 0;

    console.log('--- Calculated Metrics ---');
    console.log(`YPO: ${ypo.toFixed(2)} (Lower is better usually, but context matters)`);
    console.log(`YPD: ${ypd.toFixed(2)} (Higher is better)`);

  } catch (e) {
    console.error(e);
  } finally {
    client.close();
  }
}

verifyYPO('Georgia');
