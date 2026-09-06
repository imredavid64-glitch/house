import React, { useEffect, useState } from 'react';
import { api } from '../lib/pb.js';

export default function Gaming() {
  const [mc, setMc] = useState(null);
  const [roblox, setRoblox] = useState(null);
  const [smash, setSmash] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/house/minecraft/status').then(setMc).catch(() => {
      setMc({ online: false });
    });
    api('/api/house/roblox').then(setRoblox).catch(() => {});
    api('/api/house/smash')
      .then(setSmash)
      .catch(() => {});
  }, []);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <div className="card">
        <h3 style={{ marginBottom: 10 }}>⛏️ Minecraft Server</h3>
        {mc ? (
          <>
            <p>
              Status:{' '}
              {mc.online ? (
                <span style={{ color: 'var(--green)' }}>Online</span>
              ) : (
                <span style={{ color: 'var(--red)' }}>Offline</span>
              )}
            </p>
            {mc.outdated && <p className="muted">Version outdated ⚠</p>}
            {mc.players && (
              <p>
                Players: <strong>{mc.players.online}</strong>/{mc.players.max}
              </p>
            )}
            {mc.version && (
              <p className="muted">Version: {mc.version.name || mc.version}</p>
            )}
            {mc.motd && <p className="muted">"{mc.motd.clean || mc.motd}"</p>}
          </>
        ) : (
          <div className="muted">Loading…</div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 10 }}>🤖 Roblox</h3>
        {roblox?.games?.length ? (
          roblox.games.map((g) => (
            <div key={g.id} className="row between" style={{ marginBottom: 6 }}>
              <span>{g.name}</span>
              <span className="muted">👥 {g.playing || 0}</span>
            </div>
          ))
        ) : (
          <div className="muted">No games on the watchlist yet.</div>
        )}
      </div>

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
                  <td>{p.rating}</td>
                  <td>{p.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="muted">No rankings yet. Log matches to seed them.</div>
        )}
      </div>
    </div>
  );
}