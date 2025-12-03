import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
const API_KEY = process.env.NEXT_PUBLIC_CFBD_API_KEY;
const API_BASE = 'https://apinext.collegefootballdata.com';

if (!url || !API_KEY) {
  throw new Error('Missing environment variables');
}

const client = createClient({ url, authToken });

async function fetchData(endpoint: string, params: Record<string, any> = {}) {
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

export async function syncData(year: number) {
  console.log(`Starting sync for ${year}...`);

  // 1. Fetch Rankings (AP Top 25)
  console.log('Fetching AP Top 25...');
  const rankingsData = await fetchData('/rankings', { year, seasonType: 'regular' });
  
  const latestRanking = rankingsData.sort((a: any, b: any) => b.week - a.week)[0];
  if (!latestRanking) throw new Error('No rankings found');
  
  const targetPolls = ['AP Top 25', 'Coaches Poll', 'Playoff Committee Rankings'];
  const availablePolls = latestRanking.polls.filter((p: any) => targetPolls.includes(p.poll));
  
  console.log(`Found polls: ${availablePolls.map((p: any) => p.poll).join(', ')}`);

  for (const poll of availablePolls) {
    for (const rank of poll.ranks) {
      await client.execute({
        sql: `INSERT INTO rankings (season, week, poll, rank, school, conference, points, first_place_votes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(season, week, poll, school) DO UPDATE SET
              rank=excluded.rank, points=excluded.points, last_updated=CURRENT_TIMESTAMP`,
        args: [year, latestRanking.week, poll.poll, rank.rank, rank.school, rank.conference, rank.points, rank.firstPlaceVotes || 0]
      });
    }
  }

  // 2. Fetch All FBS Teams
  console.log('Fetching all FBS teams...');
  const teams = await fetchData('/teams', { year });

  // 3. Fetch Season Stats (Bulk)
  console.log('Fetching bulk season stats...');
  const seasonStats = await fetchData('/stats/season', { year });
  const advancedSeasonStats = await fetchData('/stats/season/advanced', { year });
  
  const seasonStatsMap = new Map();
  seasonStats.forEach((s: any) => {
    if (!seasonStatsMap.has(s.team)) seasonStatsMap.set(s.team, []);
    seasonStatsMap.get(s.team).push(s);
  });

  const advancedStatsMap = new Map(advancedSeasonStats.map((s: any) => [s.team, s]));

  console.log(`Processing ${teams.length} teams...`);

  for (const team of teams) {
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
        year,
        team.id,
        team.school,
        JSON.stringify(sStats),
        aStats ? JSON.stringify(aStats) : null
      ]
    });
  }

  // 4. Fetch All Games (Regular + Postseason)
  console.log('Fetching all games...');
  const regularGames = await fetchData('/games', { year, seasonType: 'regular' });
  const postGames = await fetchData('/games', { year, seasonType: 'postseason' });
  const allGames = [...regularGames, ...postGames];
  
  console.log(`Processing ${allGames.length} games...`);
  
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
}
