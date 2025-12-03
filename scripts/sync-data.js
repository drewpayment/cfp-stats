const { createClient } = require('@libsql/client');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
const API_KEY = process.env.NEXT_PUBLIC_CFBD_API_KEY;
const API_BASE = 'https://apinext.collegefootballdata.com';

if (!url || !API_KEY) {
  console.error('Error: Missing environment variables.');
  process.exit(1);
}

const client = createClient({ url, authToken });

const YEAR = 2024; // Default year
const SEASON_TYPE = 'regular';

async function fetchData(endpoint, params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}${endpoint}?${query}`, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) throw new Error(`API Error ${res.status}: ${res.statusText}`);
  return res.json();
}

async function sync() {
  try {
    console.log(`Starting sync for ${YEAR}...`);

    // 1. Fetch Rankings (AP Top 25)
    console.log('Fetching AP Top 25...');
    const rankingsData = await fetchData('/rankings', { year: YEAR, seasonType: SEASON_TYPE });
    
    // Find the latest week
    const latestRanking = rankingsData.sort((a, b) => b.week - a.week)[0];
    if (!latestRanking) throw new Error('No rankings found');
    
    // Store Rankings for all polls
    const targetPolls = ['AP Top 25', 'Coaches Poll', 'Playoff Committee Rankings'];
    const availablePolls = latestRanking.polls.filter(p => targetPolls.includes(p.poll));
    
    console.log(`Found polls: ${availablePolls.map(p => p.poll).join(', ')}`);

    for (const poll of availablePolls) {
      for (const rank of poll.ranks) {
        await client.execute({
          sql: `INSERT INTO rankings (season, week, poll, rank, school, conference, points, first_place_votes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(season, week, poll, school) DO UPDATE SET
                rank=excluded.rank, points=excluded.points, last_updated=CURRENT_TIMESTAMP`,
          args: [YEAR, latestRanking.week, poll.poll, rank.rank, rank.school, rank.conference, rank.points, rank.firstPlaceVotes || 0]
        });
      }
    }

    // User said: "pull the list of rankings ... and for all of the top 25 teams in the AP Top 25 ranking then go through those teams"
    // So we stick to AP Top 25 for the "Advanced Stats" fetch list, as per instructions.
    const apPoll = latestRanking.polls.find(p => p.poll === 'AP Top 25');
    const top25Teams = apPoll ? apPoll.ranks.map(r => r.school) : [];

    // 2. Fetch All FBS Teams
    console.log('Fetching all FBS teams...');
    const teams = await fetchData('/teams', { year: YEAR }); // Default is FBS? Or need division=fbs?
    // CFBD /teams returns all by default, but let's filter or just store all.
    // Actually, let's just fetch FBS to be safe if needed, but /teams usually returns all.
    // Let's stick to the plan: Fetch all FBS.
    // The API /teams endpoint doesn't have a year param, it returns all teams.
    // We can filter by classification if needed, but storing all is fine.
    
    // 3. Fetch Season Stats (Bulk)
    console.log('Fetching bulk season stats...');
    const seasonStats = await fetchData('/stats/season', { year: YEAR });
    const advancedSeasonStats = await fetchData('/stats/season/advanced', { year: YEAR });
    
    const seasonStatsMap = new Map();
    seasonStats.forEach(s => {
      if (!seasonStatsMap.has(s.team)) seasonStatsMap.set(s.team, []);
      seasonStatsMap.get(s.team).push(s);
    });

    const advancedStatsMap = new Map(advancedSeasonStats.map(s => [s.team, s]));

    console.log(`Processing ${teams.length} teams...`);

    for (const team of teams) {
      // Only store FBS teams? Or all? Let's store all for now.
      const sStats = seasonStatsMap.get(team.school) || [];
      const aStats = advancedStatsMap.get(team.school) || null;

      await client.execute({
        sql: `INSERT INTO teams (id, school, mascot, logos, conference, division, color, alt_color, season_stats, advanced_season_stats)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
              school=excluded.school, mascot=excluded.mascot, logos=excluded.logos,
              conference=excluded.conference, division=excluded.division,
              color=excluded.color, alt_color=excluded.alt_color,
              season_stats=excluded.season_stats, advanced_season_stats=excluded.advanced_season_stats,
              last_updated=CURRENT_TIMESTAMP`,
        args: [
          team.id, 
          team.school, 
          team.mascot || null, 
          JSON.stringify(team.logos || []),
          team.conference || null, 
          team.division || null, 
          team.color || null, 
          team.alt_color || null,
          JSON.stringify(sStats),
          aStats ? JSON.stringify(aStats) : null
        ]
      });

      // Also insert into team_season_stats
      await client.execute({
        sql: `INSERT INTO team_season_stats (season, team_id, team, season_stats, advanced_season_stats)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(season, team_id) DO UPDATE SET
              season_stats=excluded.season_stats, advanced_season_stats=excluded.advanced_season_stats,
              last_updated=CURRENT_TIMESTAMP`,
        args: [
          YEAR,
          team.id,
          team.school,
          JSON.stringify(sStats),
          aStats ? JSON.stringify(aStats) : null
        ]
      });
    }

    // 4. Fetch All Games (Regular + Postseason)
    console.log('Fetching all games...');
    const regularGames = await fetchData('/games', { year: YEAR, seasonType: 'regular' });
    const postGames = await fetchData('/games', { year: YEAR, seasonType: 'postseason' });
    const allGames = [...regularGames, ...postGames];
    
    console.log(`Processing ${allGames.length} games...`);

    // We still need game_stats (box scores) for yardage if we want granular game-level data.
    // But for "Feature Parity", the original tool used `seasonStats` (bulk) for total yards if available,
    // OR it used game-level data if we want to be precise.
    // The original tool had: `team.offTotalYards = stat.offense.totalYards` from advanced stats.
    // AND it iterated games for points.
    // To fully replicate, we should have game data.
    // Fetching box scores for ALL games might be slow/heavy (800+ games).
    // The original tool fetched `/stats/season` and `/stats/season/advanced`.
    // It did NOT fetch box scores for every game. It calculated W/L and Points from `/games`.
    // It got Yardage from `/stats/season/advanced` (offense.totalYards).
    // So we DON'T need granular box scores for every game to match the original tool!
    // We just need the bulk stats we already fetched.
    
    for (const game of allGames) {
      await client.execute({
        sql: `INSERT INTO games (
                id, season, week, season_type, start_date, completed, neutral_site, conference_game,
                venue_id, venue, home_id, home_team, home_conference, home_points,
                away_id, away_team, away_conference, away_points
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
              completed=excluded.completed, home_points=excluded.home_points, away_points=excluded.away_points,
              last_updated=CURRENT_TIMESTAMP`,
        args: [
          game.id, game.season, game.week, game.seasonType, game.startDate, game.completed,
          game.neutralSite, game.conferenceGame, game.venueId || null, game.venue || null,
          game.homeId, game.homeTeam, game.homeConference || null, game.homePoints || 0,
          game.awayId, game.awayTeam, game.awayConference || null, game.awayPoints || 0
        ]
      });
    }

    console.log('Sync complete!');

  } catch (err) {
    console.error('Sync failed:', err);
  } finally {
    client.close();
  }
}

sync();
