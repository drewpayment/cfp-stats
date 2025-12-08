'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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

export default function RankingDashboard({ initialData, currentPoll, currentYear }: { initialData: any[], currentPoll: string, currentYear: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [sortBy, setSortBy] = useState('composite');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [conferenceFilter, setConferenceFilter] = useState('all');
  const [teamSearch, setTeamSearch] = useState('');
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [savedGroups, setSavedGroups] = useState<any[]>([]);
  const [isLegendOpen, setIsLegendOpen] = useState(false);

  const conferences = useMemo(() => {
    const confs = new Set(initialData.map(t => t.conference).filter(Boolean));
    return Array.from(confs).sort();
  }, [initialData]);

  const sortedTeams = useMemo(() => {
    let filtered = initialData;

    if (showComparison) {
      return filtered.filter(t => selectedTeams.includes(t.team)).sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];
        const metric = METRICS.find(m => m.key === sortBy);

        if (sortBy === 'pollRank') {
          if (aVal === null && bVal === null) return 0;
          if (aVal === null) return 1;
          if (bVal === null) return -1;
          return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        }

        if (sortBy === 'composite' || sortBy === 'team' || sortBy === 'record') {
          if (sortBy === 'record') {
            return sortDir === 'desc' ? b.wins - a.wins : a.wins - b.wins;
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

    if (conferenceFilter !== 'all') {
      filtered = filtered.filter(t => t.conference === conferenceFilter);
    }

    if (teamSearch.trim()) {
      const search = teamSearch.toLowerCase().trim();
      filtered = filtered.filter(t =>
        t.team.toLowerCase().includes(search) ||
        t.conference?.toLowerCase().includes(search)
      );
    }

    return [...filtered].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      const metric = METRICS.find(m => m.key === sortBy);

      if (sortBy === 'pollRank') {
        if (aVal === null && bVal === null) return 0;
        if (aVal === null) return 1;
        if (bVal === null) return -1;
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }

      if (sortBy === 'composite' || sortBy === 'team' || sortBy === 'record') {
        if (sortBy === 'record') {
          return sortDir === 'desc' ? b.wins - a.wins : a.wins - b.wins;
        }
        return sortDir === 'desc' ? (bVal > aVal ? 1 : -1) : (aVal > bVal ? 1 : -1);
      }

      if (metric) {
        if (metric.higherBetter) {
          return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
        } else {
          return sortDir === 'desc' ? aVal - bVal : bVal - aVal;
        }
      }

      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [initialData, sortBy, sortDir, conferenceFilter, teamSearch, showComparison, selectedTeams]);

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(key);
      if (key === 'pollRank') {
        setSortDir('asc');
        return;
      }
      const metric = METRICS.find(m => m.key === key);
      setSortDir(metric && metric.higherBetter === false ? 'asc' : 'desc');
    }
  };

  const toggleTeamSelection = (teamName: string, e: React.SyntheticEvent) => {
    e.stopPropagation();
    setSelectedTeams(prev => {
      if (prev.includes(teamName)) return prev.filter(t => t !== teamName);
      return [...prev, teamName];
    });
  };

  const saveGroup = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (selectedTeams.length === 0) return;
    setNewGroupName('');
    setIsSaveModalOpen(true);
  };

  const confirmSaveGroup = () => {
    if (!newGroupName.trim()) return;
    const newGroup = {
      id: Date.now().toString(),
      name: newGroupName.trim(),
      teams: selectedTeams
    };
    setSavedGroups(prev => [...prev, newGroup]);
    setIsSaveModalOpen(false);
  };

  const deleteGroup = (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure?')) {
      setSavedGroups(prev => prev.filter(g => g.id !== groupId));
    }
  };

  const getColorForPercentile = (pctl: number) => {
    if (pctl >= 90) return '#10b981';
    if (pctl >= 75) return '#22c55e';
    if (pctl >= 50) return '#eab308';
    if (pctl >= 25) return '#f97316';
    return '#ef4444';
  };

  const thStyle = {
    padding: '12px',
    textAlign: 'center' as const,
    fontWeight: '700',
    color: '#94a3b8',
    borderBottom: '2px solid #334155',
    whiteSpace: 'nowrap' as const,
    userSelect: 'none' as const,
  };

  const tdStyle = {
    padding: '10px 12px',
    borderBottom: '1px solid #1e293b',
    whiteSpace: 'nowrap' as const,
  };

  const handlePollChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPoll = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    params.set('poll', newPoll);
    router.push(`/?${params.toString()}`);
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newYear = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    params.set('year', newYear);
    router.push(`/?${params.toString()}`);
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

      {/* Controls Row 1: Poll & Year */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '12px',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: '600' }}>POLL:</label>
          <select
            value={currentPoll}
            onChange={handlePollChange}
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
            <option value="AP Top 25">AP Top 25</option>
            <option value="Coaches Poll">Coaches Poll</option>
            <option value="Playoff Committee Rankings">CFP Rankings</option>
            <option value="All FBS">All FBS Teams</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: '600' }}>YEAR:</label>
          <select
            value={currentYear}
            onChange={handleYearChange}
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
            {Array.from({ length: new Date().getFullYear() - 1988 + 1 }, (_, i) => new Date().getFullYear() - i).map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Controls Row 2: Conference & Search */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: '600' }}>CONFERENCE:</label>
          <select
            value={conferenceFilter}
            onChange={(e) => setConferenceFilter(e.target.value)}
            style={{ background: '#1e293b', border: '2px solid #8b5cf6', color: '#f1f5f9', padding: '8px 14px', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
          >
            <option value="all">All Conferences</option>
            {conferences.map((c: any) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: '600' }}>SEARCH:</label>
          <input
            type="text"
            value={teamSearch}
            onChange={(e) => setTeamSearch(e.target.value)}
            placeholder="Team name..."
            style={{ background: '#1e293b', border: '2px solid #ec4899', color: '#f1f5f9', padding: '8px 14px', borderRadius: '6px', fontSize: '0.85rem', width: '180px' }}
          />
        </div>

        {/* Saved Groups */}
        {savedGroups.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  const g = savedGroups.find(grp => grp.id === e.target.value);
                  if (g) {
                    setSelectedTeams(g.teams);
                    setSelectionMode(true);
                  }
                }
                e.target.value = '';
              }}
              style={{ background: '#1e293b', border: '1px solid #64748b', color: '#f1f5f9', padding: '8px 10px', borderRadius: '6px', fontSize: '0.8rem', maxWidth: '150px', cursor: 'pointer' }}
            >
              <option value="">📂 Load Group...</option>
              {savedGroups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.teams.length})</option>)}
            </select>
            <button onClick={() => setIsManageModalOpen(true)} style={{ background: '#334155', border: '1px solid #64748b', color: '#94a3b8', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}>⚙️</button>
          </div>
        )}

        <button onClick={() => setIsLegendOpen(true)} style={{ background: '#1e293b', border: '1px solid #94a3b8', color: '#94a3b8', padding: '8px 14px', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer', marginLeft: 'auto' }}>
          ℹ️ Legend
        </button>

        <button
          onClick={() => {
            if (showComparison) {
              setShowComparison(false);
            } else {
              if (selectionMode) {
                // Done Selecting -> Clear selection
                setSelectedTeams([]);
              }
              setSelectionMode(!selectionMode);
            }
          }}
          style={{
            background: selectionMode || showComparison ? '#3b82f6' : '#1e293b',
            border: '2px solid #3b82f6',
            color: selectionMode || showComparison ? 'white' : '#f1f5f9',
            padding: '8px 14px', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: '600'
          }}
        >
          {showComparison ? 'Exit Comparison' : selectionMode ? 'Done Selecting' : 'Select Teams'}
        </button>

        {selectionMode && !showComparison && (
          <button
            onClick={() => setShowComparison(true)}
            disabled={selectedTeams.length < 2}
            style={{
              background: '#8b5cf6', border: '2px solid #8b5cf6', color: 'white', padding: '8px 14px', borderRadius: '6px', fontSize: '0.85rem',
              cursor: selectedTeams.length < 2 ? 'not-allowed' : 'pointer', opacity: selectedTeams.length < 2 ? 0.5 : 1, fontWeight: '600'
            }}
          >
            Compare ({selectedTeams.length})
          </button>
        )}

        {selectionMode && selectedTeams.length > 0 && (
          <button
            onClick={saveGroup}
            style={{ background: '#059669', border: '2px solid #059669', color: 'white', padding: '8px 14px', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: '600' }}
          >
            💾 Save
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ background: '#1e293b' }}>
              {(selectionMode || showComparison) && <th style={{ ...thStyle, width: '30px' }}></th>}
              <th style={{ ...thStyle, width: '40px' }}>#</th>
              <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => handleSort('pollRank')}>
                RANK {sortBy === 'pollRank' && (sortDir === 'asc' ? '▲' : '▼')}
              </th>
              <th style={{ ...thStyle, cursor: 'pointer', textAlign: 'left', minWidth: '140px' }} onClick={() => handleSort('team')}>
                TEAM {sortBy === 'team' && (sortDir === 'desc' ? '▼' : '▲')}
              </th>
              <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => handleSort('record')}>
                REC {sortBy === 'record' && (sortDir === 'desc' ? '▼' : '▲')}
              </th>
              <th style={{ ...thStyle, cursor: 'pointer', background: sortBy === 'composite' ? '#3b82f6' : '#2563eb' }} onClick={() => handleSort('composite')}>
                SCORE {sortBy === 'composite' && (sortDir === 'desc' ? '▼' : '▲')}
              </th>
              {METRICS.map(m => (
                <th
                  key={m.key}
                  style={{ ...thStyle, cursor: 'pointer', background: sortBy === m.key ? '#3b82f6' : undefined, fontSize: '0.6rem', padding: '8px 4px' }}
                  onClick={() => handleSort(m.key)}
                  title={`${m.name}: ${m.description}`}
                >
                  {m.short}
                  <span style={{ color: m.higherBetter ? '#86efac' : '#fca5a5', fontSize: '0.5rem' }}>{m.higherBetter ? '↑' : '↓'}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedTeams.map((team, idx) => (
              <tr
                key={team.team}
                style={{ background: idx % 2 === 0 ? 'rgba(30, 41, 59, 0.3)' : 'transparent', borderBottom: '1px solid #334155', cursor: 'pointer' }}
                onClick={() => setSelectedTeam(selectedTeam === team.team ? null : team.team)}
              >
                {(selectionMode || showComparison) && (
                  <td style={{ ...tdStyle, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedTeams.includes(team.team)}
                      onChange={(e) => toggleTeamSelection(team.team, e)}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                  </td>
                )}
                <td style={{ ...tdStyle, fontWeight: '700', color: idx < 12 ? '#fbbf24' : '#3b82f6' }}>{idx + 1}</td>
                <td style={{ ...tdStyle, fontWeight: '700', color: '#f1f5f9' }}>
                  {team.pollRank ? `#${team.pollRank}` : '-'}
                </td>
                <td style={{ ...tdStyle, textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {team.logo && <img src={team.logo} alt="" style={{ width: '22px', height: '22px', objectFit: 'contain' }} onError={(e: any) => e.target.style.display = 'none'} />}
                    <div>
                      <div style={{ fontWeight: '600' }}>{team.team}</div>
                      <div style={{ fontSize: '0.6rem', color: '#64748b' }}>{team.conference}</div>
                    </div>
                  </div>
                </td>
                <td style={{ ...tdStyle, fontWeight: '600' }}>{team.record}</td>
                <td style={{ ...tdStyle, fontWeight: '900', fontSize: '0.95rem', color: getColorForPercentile(team.composite) }}>{team.composite}</td>
                {METRICS.map(m => {
                  const pctlKey = `${m.key}Pctl`;
                  const isTwoTeamComparison = showComparison && sortedTeams.length === 2;
                  const otherTeam = isTwoTeamComparison ? sortedTeams.find(t => t.team !== team.team) : null;
                  const isBetter = isTwoTeamComparison && otherTeam && (team[pctlKey] || 0) > (otherTeam[pctlKey] || 0);
                  const showBackground = !isTwoTeamComparison || isBetter;
                  const bgColor = showBackground
                    ? `rgba(${team[pctlKey] > 75 ? '16, 185, 129' : team[pctlKey] > 50 ? '234, 179, 8' : '239, 68, 68'}, ${(team[pctlKey] || 0) / 350})`
                    : 'transparent';
                  return (
                    <td key={m.key} style={{ ...tdStyle, background: bgColor, fontSize: '0.7rem', fontWeight: isBetter ? '700' : '400', opacity: isTwoTeamComparison && !isBetter ? 0.5 : 1 }}>
                      {team[m.key]}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend Modal */}
      {isLegendOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }} onClick={() => setIsLegendOpen(false)}>
          <div style={{ background: '#1e293b', padding: '28px', borderRadius: '16px', maxWidth: '600px', width: '100%', border: '2px solid #64748b', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#f1f5f9' }}>Metrics Legend</h2>
              <button onClick={() => setIsLegendOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {METRICS.map(m => (
                <div key={m.key} style={{ background: '#0f172a', padding: '12px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>{m.short}</span>
                    <span style={{ fontSize: '0.7rem', color: m.higherBetter ? '#86efac' : '#fca5a5' }}>{m.higherBetter ? 'Higher is Better' : 'Lower is Better'}</span>
                  </div>
                  <div style={{ fontWeight: '600', fontSize: '0.9rem', marginBottom: '4px' }}>{m.name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: '1.4' }}>{m.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Team Detail Modal */}
      {selectedTeam && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }} onClick={() => setSelectedTeam(null)}>
          <div style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', padding: '28px', borderRadius: '16px', maxWidth: '700px', width: '100%', border: '3px solid #3b82f6', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            {(() => {
              const team = sortedTeams.find(t => t.team === selectedTeam);
              if (!team) return null;
              const rank = sortedTeams.findIndex(t => t.team === selectedTeam) + 1;
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {team.logo && <img src={team.logo} alt="" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />}
                      <div>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#f1f5f9' }}>#{rank} {team.team}</h2>
                        <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>{team.conference} · {team.record}</div>
                      </div>
                    </div>
                    <button onClick={() => setSelectedTeam(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                    {METRICS.map(m => (
                      <div key={m.key} style={{ background: '#0f172a', padding: '12px', borderRadius: '10px', border: '1px solid #334155' }}>
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginBottom: '4px' }}>{m.name} {m.higherBetter ? '↑' : '↓'}</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: '700', color: getColorForPercentile(team[`${m.key}Pctl`] || 0) }}>{team[m.key]}</div>
                        <div style={{ fontSize: '0.6rem', color: '#64748b' }}>{Math.round(team[`${m.key}Pctl`] || 0)}th percentile</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '20px', padding: '20px', background: 'linear-gradient(90deg, #1e3a5f, #312e81)', borderRadius: '12px', textAlign: 'center' }}>
                    <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '4px' }}>COMPOSITE SCORE</div>
                    <div style={{ fontSize: '3.5rem', fontWeight: '900', color: getColorForPercentile(team.composite) }}>{team.composite}</div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Save Group Modal */}
      {isSaveModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }} onClick={() => setIsSaveModalOpen(false)}>
          <div style={{ background: '#1e293b', border: '2px solid #3b82f6', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: '#f1f5f9' }}>Save Team Group</h3>
            <input type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="e.g., Top Contenders" autoFocus style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #475569', background: '#0f172a', color: 'white', marginBottom: '20px', fontSize: '1rem' }} />
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setIsSaveModalOpen(false)} style={{ background: 'transparent', border: '1px solid #475569', color: '#cbd5e1', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmSaveGroup} disabled={!newGroupName.trim()} style={{ background: '#3b82f6', border: 'none', color: 'white', padding: '8px 16px', borderRadius: '6px', fontWeight: '600', cursor: !newGroupName.trim() ? 'not-allowed' : 'pointer' }}>Save Group</button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Groups Modal */}
      {isManageModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }} onClick={() => setIsManageModalOpen(false)}>
          <div style={{ background: '#1e293b', border: '2px solid #64748b', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#f1f5f9' }}>Manage Saved Groups</h3>
              <button onClick={() => setIsManageModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {savedGroups.length === 0 ? <div style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>No saved groups</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {savedGroups.map(group => (
                    <div key={group.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a', padding: '12px', borderRadius: '8px', border: '1px solid #334155' }}>
                      <div><div style={{ fontWeight: '600', color: '#f1f5f9' }}>{group.name}</div><div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{group.teams.length} teams</div></div>
                      <button onClick={(e) => deleteGroup(group.id, e)} style={{ background: '#7f1d1d', border: '1px solid #ef4444', color: '#fca5a5', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>🗑️ Delete</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button onClick={() => setIsManageModalOpen(false)} style={{ background: '#3b82f6', border: 'none', color: 'white', padding: '8px 16px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
