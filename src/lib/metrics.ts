import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  throw new Error('Missing TURSO_DATABASE_URL');
}

const client = createClient({
  url,
  authToken,
});

export async function getRankings(pollName: string = 'AP Top 25', year?: number) {
  // 1. Fetch Rankings
  // First get the latest season/week OR use provided year
  let season: number, week: number;

  if (year) {
    const result = await client.execute({
      sql: `SELECT season, week FROM rankings WHERE season = ? ORDER BY week DESC LIMIT 1`,
      args: [year]
    });
    if (result.rows.length === 0) return []; // No data for this year
    season = result.rows[0].season as number;
    week = result.rows[0].week as number;
  } else {
    const latestResult = await client.execute(`SELECT season, week FROM rankings ORDER BY season DESC, week DESC LIMIT 1`);
    if (latestResult.rows.length === 0) return [];
    season = latestResult.rows[0].season as number;
    week = latestResult.rows[0].week as number;
  }
  
  let rankedTeams: string[] = [];
  
  // Fetch rankings for the determined season/week
  const rankingResult = await client.execute({
    sql: `SELECT school, rank FROM rankings WHERE season = ? AND week = ? AND poll = ? ORDER BY rank ASC`,
    args: [season, week, pollName]
  });
  
  const rankMap = new Map<string, number>();
  rankingResult.rows.forEach((r: any) => {
    rankMap.set(r.school as string, r.rank as number);
  });
  
  rankedTeams = Array.from(rankMap.keys());

  // 2. Fetch All Teams & Games for Metrics
  const teamsResult = await client.execute('SELECT * FROM teams');
  
  // Fetch Season Stats for the specific season
  const statsResult = await client.execute({
    sql: 'SELECT * FROM team_season_stats WHERE season = ?',
    args: [season]
  });

  // Fetch Games for the specific season
  const gamesResult = await client.execute({
    sql: 'SELECT * FROM games WHERE completed = 1 AND season = ?',
    args: [season]
  });

  const seasonStatsMap = new Map();
  statsResult.rows.forEach((row: any) => {
    seasonStatsMap.set(row.team_id, {
      season_stats: JSON.parse(row.season_stats as string || '[]'),
      advanced_season_stats: JSON.parse(row.advanced_season_stats as string || 'null')
    });
  });

  const teams = teamsResult.rows.map(row => {
    // Override with season-specific stats if available
    const specificStats = seasonStatsMap.get(row.id);
    return {
      ...row,
      logos: JSON.parse(row.logos as string || '[]'),
      season_stats: specificStats ? specificStats.season_stats : JSON.parse(row.season_stats as string || '[]'),
      advanced_season_stats: specificStats ? specificStats.advanced_season_stats : JSON.parse(row.advanced_season_stats as string || 'null')
    };
  });

  const games = gamesResult.rows;

  // 3. Build Team Map & Accumulate Basic Stats
  const teamMap: any = {};
  teams.forEach((t: any) => {
    teamMap[t.school] = {
      ...t,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      cappedMargin: 0,
      opponents: [],
    };
  });

  games.forEach((game: any) => {
    const homeTeam = teamMap[game.home_team];
    const awayTeam = teamMap[game.away_team];

    if (homeTeam) {
      homeTeam.gamesPlayed++;
      homeTeam.pointsFor += game.home_points;
      homeTeam.pointsAgainst += game.away_points;
      homeTeam.opponents.push(game.away_team);
      if (game.home_points > game.away_points) homeTeam.wins++;
      else homeTeam.losses++;

      const margin = Math.min(24, Math.max(-24, game.home_points - game.away_points));
      homeTeam.cappedMargin += margin;
    }

    if (awayTeam) {
      awayTeam.gamesPlayed++;
      awayTeam.pointsFor += game.away_points;
      awayTeam.pointsAgainst += game.home_points;
      awayTeam.opponents.push(game.home_team);
      if (game.away_points > game.home_points) awayTeam.wins++;
      else awayTeam.losses++;

      const margin = Math.min(24, Math.max(-24, game.away_points - game.home_points));
      awayTeam.cappedMargin += margin;
    }
  });

  // 4. Merge Advanced Stats & Calculate Opponent Averages
  Object.values(teamMap).forEach((team: any) => {
    // Merge Advanced Stats
    if (team.advanced_season_stats) {
      const stat = team.advanced_season_stats;
      if (stat.offense && stat.defense) {
        team.offPlays = stat.offense.plays || 0;
        team.defPlays = stat.defense.plays || 0;
        team.offDrives = stat.offense.drives || 0;
        team.defDrives = stat.defense.drives || 0;
        // Advanced stats object doesn't have totalYards at top level usually, 
        // it has component yards. We should rely on season_stats for total yards.
        team.offFieldPos = stat.offense.fieldPosition?.averageStart || 25;
        team.defFieldPos = stat.defense.fieldPosition?.averageStart || 25;
      }
    }

    // Merge Standard Stats (Primary source for yards)
    if (team.season_stats) {
       team.season_stats.forEach((s: any) => {
         if (s.statName === 'totalYards') team.offTotalYards = parseInt(s.statValue);
         if (s.statName === 'totalYardsOpponent') team.defTotalYards = parseInt(s.statValue);
       });
    }

    // Calculate Opponent Averages
    if (team.gamesPlayed > 0) {
      let oppAvgPointsAllowed = 0;
      let oppAvgPointsScored = 0;
      let oppCount = 0;

      team.opponents.forEach((oppName: string) => {
        const opp = teamMap[oppName];
        if (opp && opp.gamesPlayed > 0) {
          oppAvgPointsAllowed += opp.pointsAgainst / opp.gamesPlayed;
          oppAvgPointsScored += opp.pointsFor / opp.gamesPlayed;
          oppCount++;
        }
      });

      team.oppAvgPointsAllowed = oppCount > 0 ? oppAvgPointsAllowed / oppCount : 25;
      team.oppAvgPointsScored = oppCount > 0 ? oppAvgPointsScored / oppCount : 25;
    }
  });

  // 5. Calculate Final Metrics
  const results = Object.values(teamMap)
    .filter((t: any) => t.gamesPlayed >= 1)
    .map((team: any) => {
      const g = team.gamesPlayed;
      const ppg = team.pointsFor / g;
      const papg = team.pointsAgainst / g;

      // Metrics
      const relScoringOff = team.oppAvgPointsAllowed > 0 ? (ppg / team.oppAvgPointsAllowed) * 100 : 100;
      const relScoringDef = team.oppAvgPointsScored > 0 ? (papg / team.oppAvgPointsScored) * 100 : 100;
      const relTotalOff = relScoringOff * 0.95; // Approx
      const relTotalDef = relScoringDef * 1.05; // Approx
      const relScoringDiff = team.cappedMargin / g;

      const offPossessions = team.offDrives || (g * 12);
      const defPossessions = team.defDrives || (g * 12);
      const ptsPerPossOff = team.pointsFor / offPossessions;
      const ptsPerPossDef = team.pointsAgainst / defPossessions;

      const offYards = team.offTotalYards || 0;
      const defYards = team.defTotalYards || 0;
      const yardsPerPtOff = team.pointsFor > 0 ? offYards / team.pointsFor : 0;
      const yardsPerPtDef = team.pointsAgainst > 0 ? defYards / team.pointsAgainst : 0;

      const offPlays = team.offPlays || (g * 68);
      const defPlays = team.defPlays || (g * 68);
      const playsPerPtOff = team.pointsFor > 0 ? offPlays / team.pointsFor : 10;
      const playsPerPtDef = team.pointsAgainst > 0 ? defPlays / team.pointsAgainst : 10;

      const offFP = team.offFieldPos || 28;
      const defFP = team.defFieldPos || 28;
      const avgFieldPosDiff = offFP - (50 - defFP);

      return {
        team: team.school,
        pollRank: rankMap.get(team.school) || null, // Add poll rank
        conference: team.conference,
        logo: team.logos?.[0] || null,
        record: `${team.wins}-${team.losses}`,
        wins: team.wins,
        losses: team.losses,
        gamesPlayed: g,
        
        // Raw Metrics
        relScoringOff: Math.round(relScoringOff * 10) / 10,
        relScoringDef: Math.round(relScoringDef * 10) / 10,
        relTotalOff: Math.round(relTotalOff * 10) / 10,
        relTotalDef: Math.round(relTotalDef * 10) / 10,
        relScoringDiff: Math.round(relScoringDiff * 10) / 10,
        ptsPerPossOff: Math.round(ptsPerPossOff * 100) / 100,
        ptsPerPossDef: Math.round(ptsPerPossDef * 100) / 100,
        yardsPerPtOff: Math.round(yardsPerPtOff * 10) / 10,
        yardsPerPtDef: Math.round(yardsPerPtDef * 10) / 10,
        playsPerPtOff: Math.round(playsPerPtOff * 10) / 10,
        playsPerPtDef: Math.round(playsPerPtDef * 10) / 10,
        avgFieldPosDiff: Math.round(avgFieldPosDiff * 10) / 10,
      };
    });

  // 6. Calculate Percentiles & Composite
  const METRICS = [
    { key: 'relScoringOff', higherBetter: true },
    { key: 'relScoringDef', higherBetter: false },
    { key: 'relTotalOff', higherBetter: true },
    { key: 'relTotalDef', higherBetter: false },
    { key: 'relScoringDiff', higherBetter: true },
    { key: 'ptsPerPossOff', higherBetter: true },
    { key: 'ptsPerPossDef', higherBetter: false },
    { key: 'yardsPerPtOff', higherBetter: false },
    { key: 'yardsPerPtDef', higherBetter: true },
    { key: 'playsPerPtOff', higherBetter: false },
    { key: 'playsPerPtDef', higherBetter: true },
    { key: 'avgFieldPosDiff', higherBetter: true },
  ];

  METRICS.forEach(metric => {
    // Filter out zero/invalid values before calculating percentiles
    const validResults = results.filter((r: any) => r[metric.key] > 0);
    const values = validResults.map((r: any) => r[metric.key]).sort((a: number, b: number) => a - b);
    results.forEach((r: any) => {
      if (r[metric.key] <= 0) {
        r[`${metric.key}Pctl`] = 50; // Default for missing data
        return;
      }
      const rank = values.indexOf(r[metric.key]);
      const percentile = (rank / (values.length - 1 || 1)) * 100;
      r[`${metric.key}Pctl`] = metric.higherBetter ? percentile : (100 - percentile);
    });
  });

  results.forEach((r: any) => {
    const pctlSum = METRICS.reduce((sum, m) => sum + (r[`${m.key}Pctl`] || 0), 0);
    r.composite = Math.round((pctlSum / METRICS.length) * 10) / 10;
  });

  // 7. Filter for Requested Poll
  // Sort by composite by default
  results.sort((a: any, b: any) => b.composite - a.composite);

  // Filter if needed
  if (pollName === 'All FBS') {
    return results;
  }

  if (rankedTeams.length > 0) {
    // Return only ranked teams, but keep their calculated metrics (which used all teams for percentiles)
    return results.filter((r: any) => rankedTeams.includes(r.team));
  }

  // If no specific poll or poll not found, return top 25 by composite
  return results.slice(0, 25);
}
