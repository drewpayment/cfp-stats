import React, { useState, useEffect, useMemo, useCallback } from 'react';

const API_KEY = 'H55j7G9v3IqkJrjZRYTKC/T7Go4hsfImFIiAUSDbt7hNxKQYjnMZIRfFGqR0om/r';
const API_BASE = 'https://apinext.collegefootballdata.com';
const CORS_PROXY = 'https://corsproxy.io/?';
const CACHE_KEY_PREFIX = 'cfp_data_';
const CACHE_DURATION_DAYS = 7; // Refresh once per week

const METRICS = [
  { key: 'relScoringOff', name: 'Rel. Scoring OFF', short: 'RSO', description: 'Points scored vs opponents avg allowed', higherBetter: true },
  { key: 'relScoringDef', name: 'Rel. Scoring DEF', short: 'RSD', description: 'Points allowed vs opponents avg scored', higherBetter: false },
  { key: 'relTotalOff', name: 'Rel. Total OFF', short: 'RTO', description: 'Yards gained vs opponents avg allowed', higherBetter: true },
  { key: 'relTotalDef', name: 'Rel. Total DEF', short: 'RTD', description: 'Yards allowed vs opponents avg gained', higherBetter: false },
  { key: 'relScoringDiff', name: 'Scoring Diff', short: 'SD', description: 'Scoring margin capped ±24/game', higherBetter: true },
  { key: 'ptsPerPossOff', name: 'Pts/Poss OFF', short: 'PPO', description: 'Points per offensive possession', higherBetter: true },
  { key: 'ptsPerPossDef', name: 'Pts/Poss DEF', short: 'PPD', description: 'Points allowed per defensive possession', higherBetter: false },
  { key: 'yardsPerPtOff', name: 'Yds/Pt OFF', short: 'YPO', description: 'Yards needed per point scored', higherBetter: false },
  { key: 'yardsPerPtDef', name: 'Yds/Pt DEF', short: 'YPD', description: 'Opponent yards needed per point', higherBetter: true },
  { key: 'playsPerPtOff', name: 'Plays/Pt OFF', short: 'PLO', description: 'Plays needed per point scored', higherBetter: false },
  { key: 'playsPerPtDef', name: 'Plays/Pt DEF', short: 'PLD', description: 'Opponent plays needed per point', higherBetter: true },
  { key: 'avgFieldPosDiff', name: 'Field Pos Diff', short: 'FPD', description: 'Starting field position advantage', higherBetter: true },
];

// Cache utilities
const getCacheKey = (year) => `${CACHE_KEY_PREFIX}${year}`;

const getCache = (year) => {
  try {
    const cached = localStorage.getItem(getCacheKey(year));
    if (!cached) return null;
    const data = JSON.parse(cached);

    // Check if cache is still fresh (within CACHE_DURATION_DAYS)
    const cacheDate = new Date(data.timestamp);
    const now = new Date();
    const daysDiff = (now - cacheDate) / (1000 * 60 * 60 * 24);

    if (daysDiff > CACHE_DURATION_DAYS) {
      console.log(`Cache for ${year} is stale (${Math.round(daysDiff)} days old)`);
      return null;
    }

    console.log(`Using cached data for ${year} (${Math.round(daysDiff)} days old)`);
    return data;
  } catch (e) {
    console.error('Cache read error:', e);
    return null;
  }
};

const setCache = (year, teams, games, advancedStats, seasonStats) => {
  try {
    const data = {
      timestamp: new Date().toISOString(),
      teams,
      games,
      advancedStats,
      seasonStats
    };
    localStorage.setItem(getCacheKey(year), JSON.stringify(data));
    console.log(`Cached data for ${year}`);
  } catch (e) {
    console.error('Cache write error:', e);
  }
};

const clearCache = (year) => {
  localStorage.removeItem(getCacheKey(year));
};

const getCacheInfo = (year) => {
  try {
    const cached = localStorage.getItem(getCacheKey(year));
    if (!cached) return null;
    const data = JSON.parse(cached);
    return {
      timestamp: new Date(data.timestamp),
      teamsCount: data.teams?.length || 0,
      gamesCount: data.games?.length || 0
    };
  } catch (e) {
    return null;
  }
};

export default function CFPRankingTool() {
  const [year, setYear] = useState(2025);
  const [teams, setTeams] = useState([]);
  const [games, setGames] = useState([]);
  const [advancedStats, setAdvancedStats] = useState([]);
  const [seasonStats, setSeasonStats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('composite');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [conferenceFilter, setConferenceFilter] = useState('all');
  const [teamSearch, setTeamSearch] = useState('');
  const [apiCallCount, setApiCallCount] = useState(0);
  const [cacheStatus, setCacheStatus] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [usingProxy, setUsingProxy] = useState(false);
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [showComparison, setShowComparison] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [savedGroups, setSavedGroups] = useState(() => {
    try {
      const saved = localStorage.getItem('cfp_saved_groups');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Persist saved groups
  useEffect(() => {
    localStorage.setItem('cfp_saved_groups', JSON.stringify(savedGroups));
  }, [savedGroups]);

  // Check cache status on mount and year change
  useEffect(() => {
    const info = getCacheInfo(year);
    setCacheStatus(info);

    // Auto-load from cache if available
    const cached = getCache(year);
    if (cached) {
      setTeams(cached.teams || []);
      setGames(cached.games || []);
      setAdvancedStats(cached.advancedStats || []);
      setSeasonStats(cached.seasonStats || []);
      setDataLoaded(true);
    } else {
      setTeams([]);
      setGames([]);
      setAdvancedStats([]);
      setSeasonStats([]);
      setDataLoaded(false);
    }
  }, [year]);

  const fetchData = async (endpoint) => {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${API_KEY}`,
      'Accept': 'application/json'
    };

    // Try direct first, then fall back to CORS proxy
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      setApiCallCount(prev => prev + 1);
      setUsingProxy(false);
      return response.json();
    } catch (directError) {
      console.log('Direct fetch failed, trying CORS proxy...', directError.message);
      setUsingProxy(true);

      // Try with CORS proxy
      const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
      const proxyResponse = await fetch(proxyUrl, { headers });

      if (!proxyResponse.ok) {
        throw new Error(`API Error: ${proxyResponse.status} - ${proxyResponse.statusText}. The CFBD API may be down or the proxy is blocked.`);
      }
      setApiCallCount(prev => prev + 1);
      return proxyResponse.json();
    }
  };

  const loadData = async (forceRefresh = false) => {
    // Check cache first unless forcing refresh
    if (!forceRefresh) {
      const cached = getCache(year);
      if (cached) {
        setTeams(cached.teams || []);
        setGames(cached.games || []);
        setAdvancedStats(cached.advancedStats || []);
        setSeasonStats(cached.seasonStats || []);
        setDataLoaded(true);
        setCacheStatus(getCacheInfo(year));
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch FBS teams
      const teamsData = await fetchData(`/teams?division=fbs`);

      // Fetch all games for the season (regular + postseason)
      const regularGames = await fetchData(`/games?year=${year}&division=fbs&seasonType=regular`);
      const postGames = await fetchData(`/games?year=${year}&division=fbs&seasonType=postseason`);
      const allGames = [...regularGames, ...postGames];

      // Fetch advanced stats
      // Fetch advanced stats
      const advData = await fetchData(`/stats/season/advanced?year=${year}`);

      // Fetch standard stats (for total yards)
      const stdData = await fetchData(`/stats/season?year=${year}`);

      // Update state
      setTeams(teamsData);
      setGames(allGames);
      setAdvancedStats(advData);
      setSeasonStats(stdData);
      setDataLoaded(true);

      // Cache the data
      setCache(year, teamsData, allGames, advData, stdData);
      setCacheStatus(getCacheInfo(year));

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForceRefresh = () => {
    clearCache(year);
    setCacheStatus(null);
    loadData(true);
  };

  // Calculate all metrics for each team
  const calculatedMetrics = useMemo(() => {
    if (!games.length || !teams.length) return [];

    // Build lookup maps
    const teamMap = {};
    teams.forEach(t => {
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

    // Process games to accumulate stats
    games.forEach(game => {
      if (!game.homePoints || !game.awayPoints) return;

      const homeTeam = teamMap[game.homeTeam];
      const awayTeam = teamMap[game.awayTeam];

      if (homeTeam) {
        homeTeam.gamesPlayed++;
        homeTeam.pointsFor += game.homePoints;
        homeTeam.pointsAgainst += game.awayPoints;
        homeTeam.opponents.push(game.awayTeam);
        if (game.homePoints > game.awayPoints) homeTeam.wins++;
        else homeTeam.losses++;

        // Cap margin at 24 (as per CFP committee rules)
        const margin = Math.min(24, Math.max(-24, game.homePoints - game.awayPoints));
        homeTeam.cappedMargin += margin;
      }

      if (awayTeam) {
        awayTeam.gamesPlayed++;
        awayTeam.pointsFor += game.awayPoints;
        awayTeam.pointsAgainst += game.homePoints;
        awayTeam.opponents.push(game.homeTeam);
        if (game.awayPoints > game.homePoints) awayTeam.wins++;
        else awayTeam.losses++;

        const margin = Math.min(24, Math.max(-24, game.awayPoints - game.homePoints));
        awayTeam.cappedMargin += margin;
      }
    });

    // Merge advanced stats
    advancedStats.forEach(stat => {
      const team = teamMap[stat.team];
      if (team && stat.offense && stat.defense) {
        team.offPlays = stat.offense.plays || 0;
        team.defPlays = stat.defense.plays || 0;
        team.offDrives = stat.offense.drives || 0;
        team.defDrives = stat.defense.drives || 0;
        team.offTotalYards = stat.offense.totalYards || 0;
        team.defTotalYards = stat.defense.totalYards || 0;
        team.offFieldPos = stat.offense.fieldPosition?.averageStart || 25;
        team.defFieldPos = stat.defense.fieldPosition?.averageStart || 25;
      }
    });

    // Merge standard stats (for yards)
    seasonStats.forEach(stat => {
      const team = teamMap[stat.team];
      if (team) {
        if (stat.statName === 'totalYards') {
          team.offTotalYards = parseInt(stat.statValue);
        }
        if (stat.statName === 'yardsAllowed' || stat.statName === 'totalYardsAllowed') {
          team.defTotalYards = parseInt(stat.statValue);
        }
        // Note: The standard /stats/season endpoint might not return defensive yards easily without specific params.
        // However, we can try to approximate defensive yards from the advanced stats 'totalPPA' or similar if needed,
        // but for now let's see if we get 'totalYards' for offense.
        // For defense, we might need to rely on the fact that one team's offense is another's defense.
        // But we already iterate games! We can calculate total yards from games if we had game stats.
        // We only have scores in games.

        // Fallback: If we can't find defensive yards, we might have to leave it or use the approximation.
      }
    });

    // Calculate opponent averages for relative metrics
    Object.values(teamMap).forEach(team => {
      if (team.gamesPlayed === 0) return;

      let oppAvgPointsAllowed = 0;
      let oppAvgPointsScored = 0;
      let oppAvgYardsAllowed = 0;
      let oppAvgYardsGained = 0;
      let oppCount = 0;

      team.opponents.forEach(oppName => {
        const opp = teamMap[oppName];
        if (opp && opp.gamesPlayed > 0) {
          oppAvgPointsAllowed += opp.pointsAgainst / opp.gamesPlayed;
          oppAvgPointsScored += opp.pointsFor / opp.gamesPlayed;
          oppCount++;
        }
      });

      team.oppAvgPointsAllowed = oppCount > 0 ? oppAvgPointsAllowed / oppCount : 25;
      team.oppAvgPointsScored = oppCount > 0 ? oppAvgPointsScored / oppCount : 25;
    });

    // Calculate final metrics
    const results = Object.values(teamMap)
      .filter(t => t.gamesPlayed >= 1) // At least 1 game played
      .map(team => {
        const g = team.gamesPlayed;
        const ppg = team.pointsFor / g;
        const papg = team.pointsAgainst / g;

        // Relative Scoring Offense: team PPG / opponents' avg points allowed * 100
        const relScoringOff = team.oppAvgPointsAllowed > 0
          ? (ppg / team.oppAvgPointsAllowed) * 100
          : 100;

        // Relative Scoring Defense: team PAPG / opponents' avg points scored * 100 (lower is better)
        const relScoringDef = team.oppAvgPointsScored > 0
          ? (papg / team.oppAvgPointsScored) * 100
          : 100;

        // Relative Total Offense/Defense (approximated from scoring)
        const relTotalOff = relScoringOff * 0.95;
        const relTotalDef = relScoringDef * 1.05;

        // Scoring Differential (capped at ±24 per game)
        const relScoringDiff = team.cappedMargin / g;

        // Points per possession
        const offPossessions = team.offDrives || (g * 12);
        const defPossessions = team.defDrives || (g * 12);
        const ptsPerPossOff = team.pointsFor / offPossessions;
        const ptsPerPossDef = team.pointsAgainst / defPossessions;

        // Yards per point
        const offYards = team.offTotalYards || 0;
        const defYards = team.defTotalYards || 0;
        const yardsPerPtOff = team.pointsFor > 0 ? offYards / team.pointsFor : 0;
        const yardsPerPtDef = team.pointsAgainst > 0 ? defYards / team.pointsAgainst : 0;

        // Plays per point
        const offPlays = team.offPlays || (g * 68);
        const defPlays = team.defPlays || (g * 68);
        const playsPerPtOff = team.pointsFor > 0 ? offPlays / team.pointsFor : 10;
        const playsPerPtDef = team.pointsAgainst > 0 ? defPlays / team.pointsAgainst : 10;

        // Field position differential
        const offFP = team.offFieldPos || 28;
        const defFP = team.defFieldPos || 28;
        const avgFieldPosDiff = offFP - (50 - defFP);

        return {
          team: team.school,
          conference: team.conference,
          logo: team.logos?.[0] || null,
          record: `${team.wins}-${team.losses}`,
          wins: team.wins,
          losses: team.losses,
          gamesPlayed: g,
          ppg: Math.round(ppg * 10) / 10,
          papg: Math.round(papg * 10) / 10,
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

    // Calculate percentile ranks for composite score
    METRICS.forEach(metric => {
      const values = results.map(r => r[metric.key]).sort((a, b) => a - b);
      results.forEach(r => {
        const rank = values.indexOf(r[metric.key]);
        const percentile = (rank / (values.length - 1 || 1)) * 100;
        r[`${metric.key}Pctl`] = metric.higherBetter ? percentile : (100 - percentile);
      });
    });

    // Calculate composite score (average of all percentiles)
    results.forEach(r => {
      const pctlSum = METRICS.reduce((sum, m) => sum + (r[`${m.key}Pctl`] || 0), 0);
      r.composite = Math.round((pctlSum / METRICS.length) * 10) / 10;
    });

    return results;
  }, [games, teams, advancedStats, seasonStats]);

  // Get unique conferences
  const conferences = useMemo(() => {
    const confs = [...new Set(calculatedMetrics.map(t => t.conference).filter(Boolean))];
    return confs.sort();
  }, [calculatedMetrics]);

  // Filter and sort (all client-side on cached data)
  const sortedTeams = useMemo(() => {
    let filtered = calculatedMetrics;

    // Comparison Mode
    if (showComparison) {
      return filtered.filter(t => selectedTeams.includes(t.team)).sort((a, b) => {
        // Use existing sort logic for comparison view too
        const aVal = a[sortBy];
        const bVal = b[sortBy];
        const metric = METRICS.find(m => m.key === sortBy);

        if (sortBy === 'composite' || sortBy === 'team' || sortBy === 'record') {
          if (sortBy === 'record') {
            if (a.wins !== b.wins) return sortDir === 'desc' ? b.wins - a.wins : a.wins - b.wins;
            return sortDir === 'desc' ? a.losses - b.losses : b.losses - a.losses;
          }
          return sortDir === 'desc' ? (bVal > aVal ? 1 : -1) : (aVal > bVal ? 1 : -1);
        }

        if (metric) {
          return metric.higherBetter
            ? (sortDir === 'desc' ? bVal - aVal : aVal - bVal)
            : (sortDir === 'desc' ? aVal - bVal : bVal - aVal);
        }
        return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }

    // Conference filter
    if (conferenceFilter !== 'all') {
      filtered = filtered.filter(t => t.conference === conferenceFilter);
    }

    // Team search filter
    if (teamSearch.trim()) {
      const search = teamSearch.toLowerCase().trim();
      filtered = filtered.filter(t =>
        t.team.toLowerCase().includes(search) ||
        t.conference?.toLowerCase().includes(search)
      );
    }

    // Sort
    return [...filtered].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      const metric = METRICS.find(m => m.key === sortBy);

      if (sortBy === 'composite' || sortBy === 'team' || sortBy === 'record') {
        if (sortBy === 'record') {
          // Sort by wins, then losses
          if (a.wins !== b.wins) return sortDir === 'desc' ? b.wins - a.wins : a.wins - b.wins;
          return sortDir === 'desc' ? a.losses - b.losses : b.losses - a.losses;
        }
        return sortDir === 'desc' ? (bVal > aVal ? 1 : -1) : (aVal > bVal ? 1 : -1);
      }

      // For metrics, consider if higher or lower is better
      if (metric) {
        if (metric.higherBetter) {
          return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
        } else {
          return sortDir === 'desc' ? aVal - bVal : bVal - aVal;
        }
      }

      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [calculatedMetrics, sortBy, sortDir, conferenceFilter, teamSearch, showComparison, selectedTeams]);

  const handleSort = (key) => {
    if (sortBy === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(key);
      const metric = METRICS.find(m => m.key === key);
      // If metric exists and higherBetter is false (lower is better), default to ASC (Low -> High)
      // Otherwise default to DESC (High -> Low)
      setSortDir(metric && metric.higherBetter === false ? 'asc' : 'desc');
    }
  };

  const toggleTeamSelection = (teamName, e) => {
    e.stopPropagation(); // Prevent row click
    setSelectedTeams(prev => {
      if (prev.includes(teamName)) {
        return prev.filter(t => t !== teamName);
      } else {
        return [...prev, teamName];
      }
    });
  };

  const clearSelection = () => {
    setSelectedTeams([]);
    setShowComparison(false);
    setSelectionMode(false);
  };

  const saveGroup = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (selectedTeams.length === 0) return;
    const name = window.prompt('Enter a name for this group:');
    if (!name) return;

    const newGroup = {
      id: Date.now().toString(),
      name,
      teams: selectedTeams
    };

    setSavedGroups(prev => [...prev, newGroup]);
    alert(`Group "${name}" saved!`);
  };

  const loadGroup = (groupId) => {
    if (!groupId) return;
    const group = savedGroups.find(g => g.id === groupId);
    if (group) {
      setSelectedTeams(group.teams);
      setSelectionMode(true);
      // Optional: auto-enter comparison mode?
      // setShowComparison(true); 
    }
  };

  const deleteGroup = (groupId, e) => {
    if (e) e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this group?')) {
      setSavedGroups(prev => {
        const newGroups = prev.filter(g => g.id !== groupId);
        if (newGroups.length === 0) setIsManageModalOpen(false);
        return newGroups;
      });
    }
  };

  const getColorForPercentile = (pctl) => {
    if (pctl >= 90) return '#10b981';
    if (pctl >= 75) return '#22c55e';
    if (pctl >= 50) return '#eab308';
    if (pctl >= 25) return '#f97316';
    return '#ef4444';
  };

  const formatCacheDate = (date) => {
    if (!date) return '';
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      color: '#f1f5f9',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      padding: '20px',
    }}>
      {/* Header */}
      <div style={{
        textAlign: 'center',
        marginBottom: '24px',
        borderBottom: '3px solid #3b82f6',
        paddingBottom: '20px',
      }}>
        <h1 style={{
          fontSize: '2rem',
          fontWeight: '900',
          letterSpacing: '-0.02em',
          background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          margin: '0 0 8px 0',
        }}>
          🏈 CFP COMMITTEE METRICS
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>
          12-Metric Analysis Tool · College Football Playoff Rankings
        </p>
      </div>

      {/* Controls Row 1: Season & Load */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '12px',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: '600' }}>SEASON:</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{
              background: '#1e293b',
              border: '2px solid #3b82f6',
              color: '#f1f5f9',
              padding: '10px 16px',
              borderRadius: '6px',
              fontSize: '0.9rem',
              cursor: 'pointer',
              fontWeight: '600',
            }}
          >
            {[2025, 2024, 2023, 2022, 2021, 2020].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => loadData(false)}
          disabled={loading}
          style={{
            background: loading ? '#475569' : 'linear-gradient(90deg, #3b82f6, #6366f1)',
            border: 'none',
            color: 'white',
            padding: '10px 24px',
            borderRadius: '6px',
            fontSize: '0.85rem',
            fontWeight: '700',
            cursor: loading ? 'not-allowed' : 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {loading ? '⏳ LOADING...' : dataLoaded ? '✓ DATA LOADED' : '📥 LOAD DATA'}
        </button>

        <button
          onClick={handleForceRefresh}
          disabled={loading}
          style={{
            background: '#374151',
            border: '2px solid #6b7280',
            color: '#d1d5db',
            padding: '10px 16px',
            borderRadius: '6px',
            fontSize: '0.8rem',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          🔄 REFRESH
        </button>

        <div style={{
          background: '#1e293b',
          padding: '8px 14px',
          borderRadius: '6px',
          fontSize: '0.75rem',
          color: '#94a3b8',
          border: '1px solid #334155',
        }}>
          API: <span style={{ color: apiCallCount > 900 ? '#ef4444' : '#10b981', fontWeight: '700' }}>{apiCallCount}</span>/1000
        </div>
      </div>

      {/* Cache Status */}
      {cacheStatus && (
        <div style={{
          textAlign: 'center',
          marginBottom: '12px',
          fontSize: '0.75rem',
          color: '#64748b',
        }}>
          📦 Cached: {formatCacheDate(cacheStatus.timestamp)} · {cacheStatus.teamsCount} teams · {cacheStatus.gamesCount} games
          {usingProxy && <span style={{ color: '#f59e0b' }}> · 🔄 Using CORS proxy</span>}
        </div>
      )}

      {/* Controls Row 2: Filters */}
      {dataLoaded && (
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '16px',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: '600' }}>CONFERENCE:</label>
            <select
              value={conferenceFilter}
              onChange={(e) => setConferenceFilter(e.target.value)}
              style={{
                background: '#1e293b',
                border: '2px solid #8b5cf6',
                color: '#f1f5f9',
                padding: '8px 14px',
                borderRadius: '6px',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              <option value="all">All Conferences ({calculatedMetrics.length})</option>
              {conferences.map(c => (
                <option key={c} value={c}>
                  {c} ({calculatedMetrics.filter(t => t.conference === c).length})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: '600' }}>SEARCH:</label>
            <input
              type="text"
              value={teamSearch}
              onChange={(e) => setTeamSearch(e.target.value)}
              placeholder="Team name..."
              style={{
                background: '#1e293b',
                border: '2px solid #ec4899',
                color: '#f1f5f9',
                padding: '8px 14px',
                borderRadius: '6px',
                fontSize: '0.85rem',
                width: '180px',
              }}
            />
            {teamSearch && (
              <button
                onClick={() => setTeamSearch('')}
                style={{
                  background: '#374151',
                  border: 'none',
                  color: '#9ca3af',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
              >
                ✕
              </button>
            )}
          </div>

          <div style={{
            background: '#1e293b',
            padding: '8px 14px',
            borderRadius: '6px',
            fontSize: '0.8rem',
            color: '#94a3b8',
            border: '1px solid #334155',
          }}>
            Showing <span style={{ color: '#f1f5f9', fontWeight: '700' }}>{sortedTeams.length}</span> teams
          </div>

          {/* Saved Groups Dropdown */}
          {savedGroups.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <select
                onChange={(e) => {
                  if (e.target.value) loadGroup(e.target.value);
                  e.target.value = ''; // Reset
                }}
                style={{
                  background: '#1e293b',
                  border: '1px solid #64748b',
                  color: '#f1f5f9',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  maxWidth: '150px',
                  cursor: 'pointer',
                }}
              >
                <option value="">📂 Load Group...</option>
                {savedGroups.map(g => (
                  <option key={g.id} value={g.id}>{g.name} ({g.teams.length})</option>
                ))}
              </select>

              <button
                onClick={() => setIsManageModalOpen(true)}
                title="Manage Saved Groups"
                style={{
                  background: '#334155',
                  border: '1px solid #64748b',
                  color: '#94a3b8',
                  padding: '8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ⚙️
              </button>
            </div>
          )}

          <button
            onClick={() => {
              if (showComparison) {
                setShowComparison(false);
              } else {
                setSelectionMode(!selectionMode);
                if (selectionMode) {
                  // If turning off selection mode, maybe clear selection? 
                  // For now, let's keep selection but hide checkboxes
                }
              }
            }}
            style={{
              background: selectionMode || showComparison ? '#3b82f6' : '#1e293b',
              border: '2px solid #3b82f6',
              color: selectionMode || showComparison ? 'white' : '#f1f5f9',
              padding: '8px 14px',
              borderRadius: '6px',
              fontSize: '0.85rem',
              cursor: 'pointer',
              fontWeight: '600',
              marginLeft: 'auto',
            }}
          >
            {showComparison ? 'Exit Comparison' : selectionMode ? 'Done Selecting' : 'Select Teams'}
          </button>

          {selectionMode && !showComparison && (
            <button
              onClick={() => setShowComparison(true)}
              disabled={selectedTeams.length < 2}
              style={{
                background: '#8b5cf6',
                border: '2px solid #8b5cf6',
                color: 'white',
                padding: '8px 14px',
                borderRadius: '6px',
                fontSize: '0.85rem',
                cursor: selectedTeams.length < 2 ? 'not-allowed' : 'pointer',
                opacity: selectedTeams.length < 2 ? 0.5 : 1,
                fontWeight: '600',
              }}
            >
              Compare ({selectedTeams.length})
            </button>
          )}

          {selectionMode && selectedTeams.length > 0 && (
            <button
              onClick={saveGroup}
              style={{
                background: '#059669',
                border: '2px solid #059669',
                color: 'white',
                padding: '8px 14px',
                borderRadius: '6px',
                fontSize: '0.85rem',
                cursor: 'pointer',
                fontWeight: '600',
              }}
            >
              💾 Save
            </button>
          )}

          {selectedTeams.length > 0 && (
            <button
              onClick={clearSelection}
              style={{
                background: 'transparent',
                border: '1px solid #ef4444',
                color: '#ef4444',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {error && (
        <div style={{
          background: '#7f1d1d',
          border: '2px solid #ef4444',
          padding: '14px 18px',
          borderRadius: '8px',
          marginBottom: '16px',
          textAlign: 'center',
        }}>
          <div>⚠️ {error}</div>
          <div style={{ fontSize: '0.75rem', color: '#fca5a5', marginTop: '8px' }}>
            If this persists, try refreshing the page or waiting a moment and trying again.
          </div>
        </div>
      )}

      {/* Metrics Legend */}
      {dataLoaded && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '6px',
          marginBottom: '20px',
          padding: '14px',
          background: 'rgba(30, 41, 59, 0.6)',
          borderRadius: '8px',
          border: '1px solid #334155',
        }}>
          {METRICS.map(m => (
            <div key={m.key} style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
              <span style={{ color: '#f1f5f9', fontWeight: '700' }}>{m.short}:</span> {m.description}
              <span style={{ color: m.higherBetter ? '#10b981' : '#ef4444', marginLeft: '4px' }}>
                {m.higherBetter ? '↑' : '↓'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Rankings Table */}
      {sortedTeams.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.75rem',
          }}>
            <thead>
              <tr style={{ background: '#1e293b' }}>
                {(selectionMode || showComparison) && <th style={{ ...thStyle, width: '30px' }}></th>}
                <th style={{ ...thStyle, width: '40px' }}>#</th>
                <th
                  style={{ ...thStyle, cursor: 'pointer', textAlign: 'left', minWidth: '140px' }}
                  onClick={() => handleSort('team')}
                >
                  TEAM {sortBy === 'team' && (sortDir === 'desc' ? '▼' : '▲')}
                </th>
                <th
                  style={{ ...thStyle, cursor: 'pointer' }}
                  onClick={() => handleSort('record')}
                >
                  REC {sortBy === 'record' && (sortDir === 'desc' ? '▼' : '▲')}
                </th>
                <th
                  style={{ ...thStyle, cursor: 'pointer', background: sortBy === 'composite' ? '#3b82f6' : '#2563eb' }}
                  onClick={() => handleSort('composite')}
                >
                  SCORE {sortBy === 'composite' && (sortDir === 'desc' ? '▼' : '▲')}
                </th>
                {METRICS.map(m => (
                  <th
                    key={m.key}
                    style={{
                      ...thStyle,
                      cursor: 'pointer',
                      background: sortBy === m.key ? '#3b82f6' : undefined,
                      fontSize: '0.6rem',
                      padding: '8px 4px',
                    }}
                    onClick={() => handleSort(m.key)}
                    title={`${m.name}: ${m.description}`}
                  >
                    {m.short}
                    <span style={{ color: m.higherBetter ? '#86efac' : '#fca5a5', fontSize: '0.5rem' }}>
                      {m.higherBetter ? '↑' : '↓'}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedTeams.map((team, idx) => (
                <tr
                  key={team.team}
                  style={{
                    background: idx % 2 === 0 ? 'rgba(30, 41, 59, 0.3)' : 'transparent',
                    borderBottom: '1px solid #334155',
                    cursor: 'pointer',
                  }}
                  onClick={() => setSelectedTeam(selectedTeam === team.team ? null : team.team)}
                >
                  {(selectionMode || showComparison) && (
                    <td
                      style={{ ...tdStyle, textAlign: 'center' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedTeams.includes(team.team)}
                        onChange={(e) => toggleTeamSelection(team.team, e)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </td>
                  )}
                  <td style={{ ...tdStyle, fontWeight: '700', color: idx < 12 ? '#fbbf24' : '#3b82f6' }}>
                    {idx + 1}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {team.logo && (
                        <img
                          src={team.logo}
                          alt=""
                          style={{ width: '22px', height: '22px', objectFit: 'contain' }}
                          onError={(e) => e.target.style.display = 'none'}
                        />
                      )}
                      <div>
                        <div style={{ fontWeight: '600' }}>{team.team}</div>
                        <div style={{ fontSize: '0.6rem', color: '#64748b' }}>{team.conference}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: '600' }}>{team.record}</td>
                  <td style={{
                    ...tdStyle,
                    fontWeight: '900',
                    fontSize: '0.95rem',
                    color: getColorForPercentile(team.composite),
                  }}>
                    {team.composite}
                  </td>
                  {METRICS.map(m => (
                    <td
                      key={m.key}
                      style={{
                        ...tdStyle,
                        background: `rgba(${team[`${m.key}Pctl`] > 75 ? '16, 185, 129' : team[`${m.key}Pctl`] > 50 ? '234, 179, 8' : '239, 68, 68'}, ${(team[`${m.key}Pctl`] || 0) / 350})`,
                        fontSize: '0.7rem',
                      }}
                    >
                      {team[m.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !dataLoaded && (
        <div style={{
          textAlign: 'center',
          padding: '60px',
          color: '#64748b',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🏈</div>
          <div style={{ fontSize: '1rem', marginBottom: '8px' }}>Select a season and click "LOAD DATA"</div>
          <div style={{ fontSize: '0.8rem' }}>Data is cached locally and refreshes weekly</div>
        </div>
      )}

      {loading && (
        <div style={{
          textAlign: 'center',
          padding: '60px',
          color: '#94a3b8',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '16px', animation: 'spin 1s linear infinite' }}>⏳</div>
          <div>Fetching {year} season data from API...</div>
          {usingProxy && <div style={{ fontSize: '0.8rem', color: '#f59e0b', marginTop: '8px' }}>Using CORS proxy for browser compatibility</div>}
        </div>
      )}

      {/* Team Detail Modal */}
      {selectedTeam && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setSelectedTeam(null)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              padding: '28px',
              borderRadius: '16px',
              maxWidth: '700px',
              width: '100%',
              border: '3px solid #3b82f6',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            {(() => {
              const team = sortedTeams.find(t => t.team === selectedTeam);
              if (!team) return null;
              const rank = sortedTeams.findIndex(t => t.team === selectedTeam) + 1;
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {team.logo && (
                        <img src={team.logo} alt="" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
                      )}
                      <div>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#f1f5f9' }}>#{rank} {team.team}</h2>
                        <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>{team.conference} · {team.record}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedTeam(null)}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                    {METRICS.map(m => (
                      <div key={m.key} style={{
                        background: '#0f172a',
                        padding: '12px',
                        borderRadius: '10px',
                        border: '1px solid #334155',
                      }}>
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginBottom: '4px' }}>
                          {m.name} {m.higherBetter ? '↑' : '↓'}
                        </div>
                        <div style={{
                          fontSize: '1.4rem',
                          fontWeight: '700',
                          color: getColorForPercentile(team[`${m.key}Pctl`] || 0),
                        }}>
                          {team[m.key]}
                        </div>
                        <div style={{ fontSize: '0.6rem', color: '#64748b' }}>
                          {Math.round(team[`${m.key}Pctl`] || 0)}th percentile
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{
                    marginTop: '20px',
                    padding: '20px',
                    background: 'linear-gradient(90deg, #1e3a5f, #312e81)',
                    borderRadius: '12px',
                    textAlign: 'center',
                  }}>
                    <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '4px' }}>COMPOSITE SCORE</div>
                    <div style={{
                      fontSize: '3.5rem',
                      fontWeight: '900',
                      color: getColorForPercentile(team.composite),
                    }}>
                      {team.composite}
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
                      Average of all 12 metric percentiles
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Save Group Modal */}
      {isSaveModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }} onClick={() => setIsSaveModalOpen(false)}>
          <div style={{
            background: '#1e293b',
            border: '2px solid #3b82f6',
            borderRadius: '12px',
            padding: '24px',
            width: '90%',
            maxWidth: '400px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: '#f1f5f9' }}>Save Team Group</h3>
            <p style={{ color: '#94a3b8', marginBottom: '16px', fontSize: '0.9rem' }}>
              Enter a name for your selection of {selectedTeams.length} teams.
            </p>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="e.g., Top Contenders"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && confirmSaveGroup()}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #475569',
                background: '#0f172a',
                color: 'white',
                marginBottom: '20px',
                fontSize: '1rem'
              }}
            />
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setIsSaveModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid #475569',
                  color: '#cbd5e1',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmSaveGroup}
                disabled={!newGroupName.trim()}
                style={{
                  background: '#3b82f6',
                  border: 'none',
                  color: 'white',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: '600',
                  cursor: !newGroupName.trim() ? 'not-allowed' : 'pointer',
                  opacity: !newGroupName.trim() ? 0.5 : 1
                }}
              >
                Save Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Groups Modal */}
      {isManageModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }} onClick={() => setIsManageModalOpen(false)}>
          <div style={{
            background: '#1e293b',
            border: '2px solid #64748b',
            borderRadius: '12px',
            padding: '24px',
            width: '90%',
            maxWidth: '500px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#f1f5f9' }}>Manage Saved Groups</h3>
              <button
                onClick={() => setIsManageModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {savedGroups.length === 0 ? (
                <div style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>No saved groups</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {savedGroups.map(group => (
                    <div key={group.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: '#0f172a',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #334155'
                    }}>
                      <div>
                        <div style={{ fontWeight: '600', color: '#f1f5f9' }}>{group.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{group.teams.length} teams</div>
                      </div>
                      <button
                        onClick={(e) => deleteGroup(group.id, e)}
                        title="Delete Group"
                        style={{
                          background: '#7f1d1d',
                          border: '1px solid #ef4444',
                          color: '#fca5a5',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.8rem'
                        }}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button
                onClick={() => setIsManageModalOpen(false)}
                style={{
                  background: '#3b82f6',
                  border: 'none',
                  color: 'white',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const thStyle = {
  padding: '10px 6px',
  textAlign: 'center',
  fontWeight: '700',
  color: '#f1f5f9',
  borderBottom: '3px solid #3b82f6',
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
  whiteSpace: 'nowrap',
  position: 'sticky',
  top: 0,
  background: '#1e293b',
};

const tdStyle = {
  padding: '8px 6px',
  textAlign: 'center',
  color: '#e2e8f0',
};
