import React, { useEffect, useState } from 'react';
import { api, pb } from '../lib/pb.js';

export default function Gaming() {
  const me = pb.authStore.model;
  const [mc, setMc] = useState(null);
  const [roblox, setRoblox] = useState(null);
  const [smash, setSmash] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [matchForm, setMatchForm] = useState({ player1: '', player2: '', winner: '', character1: '', character2: '', stage: '' });
  const [matchMsg, setMatchMsg] = useState('');

  useEffect(() => {
    api('/api/house/minecraft/status').then(setMc).catch(() => setMc({ configured: false, status: 'unknown' }));
    api('/api/house/roblox').then(setRoblox).catch(() => {});
    api('/api/house/smash').then(setSmash).catch(() => {});
    pb.collection('users').getFullList().then(setUsers).catch(() => {});
  }, []);

  const logMatch = async (e) => {
    e.preventDefault();
    setMatchMsg('');
    if (!matchForm.player1 || !matchForm.player2 || !matchForm.winner) {
      setMatchMsg('Pick player1, player2, and winner');
      return;
    }
    try {
      await api('/api/house/smash/matches', {
        method: 'POST',
        body: JSON.stringify({ ...matchForm, is_ranked: true }),
      });
      setMatchMsg('Match logged!');
      setMatchForm({ player1: '', player2: '', winner: '', character1: '', character2: '', stage: '' });
      const s = await api('/api/house/smash');
      setSmash(s);
    } catch (ex) { setMatchMsg(ex.message || String(ex)); }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      {/* Minecraft */}
      <div className="card">
        <h3 style={{ marginBottom: 10 }}>⛏️ Minecraft Server</h3>
        {mc ? (
          <>
            {!mc.configured && <div className="muted">No server configured. Admin can set mc_server_host in settings.</div>}
            {mc.configured && (
              <>
                <p>Status:{' '}
                  {mc.status === 'online' ? (
                    <span style={{ color: 'var(--green)' }}>Online</span>
                  ) : mc.status === 'offline' ? (
                    <span style={{ color: 'var(--red)' }}>Offline</span>
                  ) : (
                    <span className="muted">Unknown</span>
                  )}
                </p>
                {mc.status === 'online' && (
                  <>
                    <p>Players: <strong>{mc.player_count ?? 0}</strong>/{mc.max_players ?? '—'}</p>
                    {mc.version && <p className="muted">Version: {mc.version}</p>}
                    {mc.motd && <p className="muted">"{mc.motd}"</p>}
                    {mc.players && mc.players.length > 0 && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        Online: {mc.players.join(', ')}
                      </div>
                    )}
                  </>
                )}
                {mc.message && <p className="muted" style={{ fontSize: 12 }}>{mc.message}</p>}
              </>
            )}
          </>
        ) : (
          <div className="muted">Loading…</div>
        )}
      </div>

      {/* Roblox */}
      <div className="card">
        <h3 style={{ marginBottom: 10 }}>🤖 Roblox</h3>
        {roblox && !roblox.configured && (
          <div className="muted">{roblox.message || 'Admin can set roblox_watchlist in settings.'}</div>
        )}
        {roblox?.games?.length ? (
          roblox.games.map((g) => (
            <div key={g.universe_id} className="row" style={{ gap: 10, marginBottom: 8, alignItems: 'center' }}>
              {g.thumbnail_url && (
                <img src={g.thumbnail_url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{g.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>👥 {g.playing_count ?? 0} playing</div>
              </div>
            </div>
          ))
        ) : (
          <div className="muted">No games on the watchlist yet.</div>
        )}
        {roblox?.online?.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Friends online:</div>
            {roblox.online.map((o, i) => (
              <div key={i} className="muted" style={{ fontSize: 12 }}>
                {o.username || '—'} · {o.lastLocation || 'Online'}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Smash Rankings */}
      <div className="card" style={{ gridColumn: 'span 2' }}>
        <h3 style={{ marginBottom: 10 }}>🏆 Smash Rankings</h3>
        {smash && smash.rankings && smash.rankings.length ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr className="muted" style={{ textAlign: 'left' }}>
                <th style={{ padding: '6px 8px' }}>Rank</th>
                <th>Player</th>
                <th>Rating</th>
                <th>Games</th>
              </tr>
            </thead>
            <tbody>
              {smash.rankings.map((p) => (
                <tr key={p.user_id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px' }}>{p.rank}</td>
                  <td>{p.username}</td>
                  <td>{Math.round(p.rating)}</td>
                  <td>{p.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="muted">No rankings yet. Log matches to seed them.</div>
        )}

        {/* Log Match Form */}
        <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <h4 style={{ marginBottom: 8 }}>Log a Match</h4>
          {matchMsg && <div className={matchMsg.includes('!') ? 'muted' : 'error'} style={{ fontSize: 12, marginBottom: 6 }}>{matchMsg}</div>}
          <form onSubmit={logMatch}>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <select value={matchForm.player1} onChange={(e) => setMatchForm({ ...matchForm, player1: e.target.value })} required>
                <option value="">Player 1</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.username || u.email}</option>)}
              </select>
              <select value={matchForm.player2} onChange={(e) => setMatchForm({ ...matchForm, player2: e.target.value })} required>
                <option value="">Player 2</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.username || u.email}</option>)}
              </select>
              <select value={matchForm.winner} onChange={(e) => setMatchForm({ ...matchForm, winner: e.target.value })} required>
                <option value="">Winner</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.username || u.email}</option>)}
              </select>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <input placeholder="Your character" value={matchForm.character1}
                onChange={(e) => setMatchForm({ ...matchForm, character1: e.target.value })} style={{ flex: 1 }} />
              <input placeholder="Their character" value={matchForm.character2}
                onChange={(e) => setMatchForm({ ...matchForm, character2: e.target.value })} style={{ flex: 1 }} />
              <input placeholder="Stage (optional)" value={matchForm.stage}
                onChange={(e) => setMatchForm({ ...matchForm, stage: e.target.value })} style={{ flex: 1 }} />
            </div>
            <button className="btn small" style={{ marginTop: 8 }}>Log Match</button>
          </form>
        </div>
      </div>
    </div>
  );
}