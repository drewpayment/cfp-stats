const { createClient } = require('@libsql/client');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error('Error: TURSO_DATABASE_URL is not defined in .env.local');
  process.exit(1);
}

const client = createClient({
  url,
  authToken,
});

async function setup() {
  try {
    console.log('Setting up database schema...');

    // Teams Table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY,
        school TEXT NOT NULL,
        mascot TEXT,
        abbreviation TEXT,
        conference TEXT,
        division TEXT,
        color TEXT,
        alt_color TEXT,
        logos TEXT, -- JSON array
        twitter TEXT,
        location TEXT, -- JSON object
        record TEXT, -- e.g. "10-2"
        season_stats TEXT, -- JSON object
        advanced_season_stats TEXT, -- JSON object
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Teams table created');

    // Rankings Table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS rankings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        season INTEGER NOT NULL,
        week INTEGER NOT NULL,
        poll TEXT NOT NULL, -- 'AP Top 25', 'Playoff Committee Rankings', 'Coaches Poll'
        rank INTEGER NOT NULL,
        school TEXT NOT NULL,
        conference TEXT,
        points INTEGER,
        first_place_votes INTEGER,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(season, week, poll, school)
      );
    `);
    console.log('✓ Rankings table created');

    // Team Season Stats Table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS team_season_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        season INTEGER NOT NULL,
        team_id INTEGER NOT NULL,
        team TEXT NOT NULL,
        season_stats TEXT, -- JSON object
        advanced_season_stats TEXT, -- JSON object
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(season, team_id)
      );
    `);
    console.log('✓ Team Season Stats table created');

    // Games Table (with Advanced Stats)
    await client.execute(`
      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY,
        season INTEGER NOT NULL,
        week INTEGER NOT NULL,
        season_type TEXT,
        start_date DATETIME,
        completed BOOLEAN,
        neutral_site BOOLEAN,
        conference_game BOOLEAN,
        attendance INTEGER,
        venue_id INTEGER,
        venue TEXT,
        home_id INTEGER,
        home_team TEXT,
        home_conference TEXT,
        home_points INTEGER,
        home_line_scores TEXT, -- JSON array
        home_post_win_prob REAL,
        home_pregame_elo INTEGER,
        home_postgame_elo INTEGER,
        away_id INTEGER,
        away_team TEXT,
        away_conference TEXT,
        away_points INTEGER,
        away_line_scores TEXT, -- JSON array
        away_post_win_prob REAL,
        away_pregame_elo INTEGER,
        away_postgame_elo INTEGER,
        excitement_index REAL,
        highlights TEXT,
        notes TEXT,
        advanced_stats TEXT, -- JSON object containing PPA, success rates, etc.
        game_stats TEXT, -- JSON object containing standard box score stats (yards, etc.)
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Games table created');

    console.log('Database setup complete!');
  } catch (err) {
    console.error('Error setting up database:', err);
  } finally {
    client.close();
  }
}

setup();
