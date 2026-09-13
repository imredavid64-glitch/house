import React, { useEffect, useState } from 'react';
import { api, pb } from '../lib/pb.js';

const SMASH_CHARACTERS = [
  'Mario', 'Donkey Kong', 'Link', 'Samus', 'Dark Samus', 'Yoshi', 'Kirby', 'Fox',
  'Pikachu', 'Luigi', 'Ness', 'Captain Falcon', 'Jigglypuff', 'Peach', 'Daisy',
  'Bowser', 'Ice Climbers', 'Sheik', 'Zelda', 'Dr. Mario', 'Pichu', 'Falco',
  'Marth', 'Lucina', 'Young Link', 'Ganondorf', 'Mewtwo', 'Roy', 'Chrom',
  'Mr. Game & Watch', 'Meta Knight', 'Pit', 'Dark Pit', 'Zero Suit Samus',
  'Wario', 'Snake', 'Ike', 'Pokémon Trainer', 'Diddy Kong', 'Lucas', 'Sonic',
  'King Dedede', 'Olimar', 'Lucario', 'R.O.B.', 'Toon Link', 'Wolf', 'Villager',
  'Mega Man', 'Wii Fit Trainer', 'Rosalina & Luma', 'Little Mac', 'Greninja',
  'Mii Brawler', 'Mii Swordfighter', 'Mii Gunner', 'Palutena', 'Pac-Man',
  'Robin', 'Shulk', 'Bowser Jr.', 'Duck Hunt', 'Ryu', 'Ken', 'Cloud',
  'Corrin', 'Bayonetta', 'Inkling', 'Ridley', 'Simon', 'Richter', 'King K. Rool',
  'Isabelle', 'Incineroar', 'Piranha Plant', 'Joker', 'Hero', 'Banjo & Kazooie',
  'Terry', 'Byleth', 'Min Min', 'Steve', 'Sephiroth', 'Pyra/Mythra', 'Kazuya',
  'Sora',
];

const STAGES = [
  'Final Destination', 'Battlefield', 'Small Battlefield', 'Smashville',
  'Town & City', 'Pokémon Stadium 2', 'Lylat Cruise', 'Kalos Pokémon League',
  'Unova Pokémon League', 'Castle Siege', 'Rainbow Cruise', 'Frigate Orpheon',
  'Green Greens', 'Corneria', 'Yoshi\'s Story', 'Yoshi\'s Island',
  'Fountain of Dreams', 'Green Hill Zone', 'Mushroom Kingdom U',
  'Mushroomy Kingdom', 'Wrecking Crew', 'Pac-Land', 'Mario Bros.',
  'Mario Circuit', 'Wuhu Island', 'Pilotwings', 'Spirit Train', 'Windy Hill Zone',
  'Mushroom Kingdom', 'Princess Peach\'s Castle', 'Bowser\'s Castle',
  'Super Mario Maker', 'New Donk City Hall', 'Great Plateau Tower',
  'Moray Towers', 'New Pork City', 'Mario Galaxy', 'Dracula\'s Castle',
  'Midgar', 'Distant Planet', 'Great Cave Offensive', 'Shadow Moses Island',
  'Duck Hunt', 'Gamer', 'Living Room', 'Tomodachi Life', 'PictoChat 2',
  'Mementos', 'Spring Stadium', 'Dojo', 'Find Mii', 'Golden Plains',
  'Super Mario Maker 2', 'Cave of the Forgotten', 'Sakurai\'s Castle',
];

export default function Gaming() {
  const [mc, setMc] = useState(null);
  const [roblox, setRoblox] = useState(null);
  const [smash, setSmash] = useState(null);
  const [smashMatches, setSmashMatches] = useState([]);
  const [error, setError] = useState('');
  const [showMatchForm, setShowMatchForm] = useState(false);
  const [form, setForm] = useState({
    player1: '', player2: '', winner: '',
    character1: '', character2: '', stage: '',
    is_ranked: true,
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api('/api/house/minecraft/status').then(setMc).catch(() => { setMc({ online: false }); });
    api('/api/house/roblox').then(setRoblox).catch(() => {});
    api('/api/house/smash').then(setSmash).catch(() => {});
    loadSmashMatches();
  }, []);

  const loadSmashMatches = async () => {
    try {
      const res = await api('/api/house/smash/matches');
      setSmashMatches(res.matches || []);
    } catch (e) {}
  };

  const handleSubmitMatch = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.player1 || !form.player2 || !form.winner) {
      setFormError('Player 1, Player 2, and Winner are required');
      return;
    }
    if (form.player1 === form.player2) {
      setFormError('Players must be different');
      return;
    }
    if (form.winner !== form.player1 && form.winner !== form.player2) {
      setFormError('Winner must be Player 1 or Player 2');
      return;
    }
    setSubmitting(true);
    try {
      await api('/api/house/smash/matches', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm({ player1: '', player2: '', winner: '', character1: '', character2: '', stage: '', is_ranked: true });
      setShowMatchForm(false);
      loadSmashMatches();
      api('/api/house/smash').then(setSmash).catch(() => {});
    } catch (ex) {
      setFormError(ex.message || String(ex));
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  const me = pb.authStore.model;
  const friends = (smash?.rankings || []).map(r => ({ id: r.user_id, username: r.username }));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <div className="card">
        <div className="row between" style={{ marginBottom: 10 }}>
          <h3>⛏️ Minecraft Server</h3>
          <button className="btn small ghost" onClick={() => api('/api/house/minecraft/status').then(setMc).catch(() => {})}>↻</button>
        </div>
        {mc ? (
          <>
            <div className="row" style={{ gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{
                padding: '4px 12px',
                borderRadius: 20,
                background: mc.online ? 'rgba(52, 211, 115, 0.2)' : 'rgba(248, 113, 113, 0.2)',
                color: mc.online ? 'var(--green)' : 'var(--red)',
                fontWeight: 600,
                fontSize: 13,
              }}>
                {mc.online ? '● Online' : '○ Offline'}
              </span>
              {mc.version && <span className="muted" style={{ fontSize: 12 }}>v{mc.version}</span>}
            </div>
            {mc.motd && <p className="muted" style={{ marginBottom: 8, fontStyle: 'italic' }}>"{mc.motd.clean || mc.motd}"</p>}
            {mc.players && (
              <div style={{ marginBottom: 12 }}>
                <div className="row between" style={{ marginBottom: 4 }}>
                  <span>Players</span>
                  <strong>{mc.players.online}/{mc.players.max}</strong>
                </div>
                <div style={{ height: 6, background: 'var(--panel2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.min(100, (mc.players.online / Math.max(1, mc.players.max)) * 100)}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--accent2), var(--accent))',
                    borderRadius: 3,
                    transition: 'width 0.3s',
                  }} />
                </div>
              </div>
            )}
            {mc.players && mc.players.list && mc.players.list.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>Online Players ({mc.players.list.length})</summary>
                <ul style={{ marginTop: 6, paddingLeft: 20, fontSize: 13 }}>
                  {mc.players.list.map(p => <li key={p}>{p}</li>)}
                </ul>
              </details>
            )}
            {mc.outdated && <p className="muted" style={{ marginTop: 8 }}>⚠ Version outdated</p>}
          </>
        ) : (
          <div className="muted">Loading…</div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 10 }}>🤖 Roblox</h3>
        {roblox?.online?.length ? (
          <>
            <div className="muted" style={{ marginBottom: 8, fontSize: 13 }}>Friends Online</div>
            {roblox.online.map((p) => (
              <div key={p.userId} className="card" style={{ marginBottom: 6, padding: 8, background: 'var(--panel2)' }}>
                <div className="row between">
                  <strong>{p.username || 'Unknown'}</strong>
                  <span className="muted" style={{ fontSize: 12 }}>{p.lastOnline || 'Now'}</span>
                </div>
                {p.lastLocation && <div className="muted" style={{ fontSize: 12 }}>{p.lastLocation}</div>}
                {p.gameId && <div className="muted" style={{ fontSize: 11 }}>Game ID: {p.gameId}</div>}
              </div>
            ))}
          </>
        ) : roblox?.games?.length ? (
          <>
            <div className="muted" style={{ marginBottom: 8, fontSize: 13 }}>Watchlist</div>
            {roblox.games.map((g) => (
              <div key={g.id} className="row between" style={{ marginBottom: 6 }}>
                <span>{g.name}</span>
                <span className="muted">👥 {g.playing_count || 0}</span>
              </div>
            ))}
          </>
        ) : (
          <div className="muted">No games on the watchlist yet. Admin can configure in Settings.</div>
        )}
      </div>

      <div className="card" style={{ gridColumn: 'span 2' }}>
        <div className="row between" style={{ marginBottom: 12, alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>🏆 Smash Bros</h3>
          <button className="btn small" onClick={() => setShowMatchForm(!showMatchForm)}>
            {showMatchForm ? 'Hide Match Logger' : '⚔️ Log Match'}
          </button>
        </div>

        {showMatchForm && (
          <form onSubmit={handleSubmitMatch} style={{ marginBottom: 16, padding: 12, background: 'var(--panel2)', borderRadius: 8 }}>
            <div className="row" style={{ gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 4 }}>Player 1</label>
                <select value={form.player1} onChange={e => setForm({ ...form, player1: e.target.value })} required style={{ width: '100%' }}>
                  <option value="">Select Player 1</option>
                  {friends.map(f => <option key={f.id} value={f.id}>{f.username}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 4 }}>Player 2</label>
                <select value={form.player2} onChange={e => setForm({ ...form, player2: e.target.value })} required style={{ width: '100%' }}>
                  <option value="">Select Player 2</option>
                  {friends.map(f => <option key={f.id} value={f.id}>{f.username}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 4 }}>Winner</label>
                <select value={form.winner} onChange={e => setForm({ ...form, winner: e.target.value })} required style={{ width: '100%' }}>
                  <option value="">Select Winner</option>
                  {form.player1 && <option value={form.player1}>{friends.find(f => f.id === form.player1)?.username || form.player1}</option>}
                  {form.player2 && <option value={form.player2}>{friends.find(f => f.id === form.player2)?.username || form.player2}</option>}
                </select>
              </div>
            </div>
            <div className="row" style={{ gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 4 }}>P1 Character</label>
                <select value={form.character1} onChange={e => setForm({ ...form, character1: e.target.value })} style={{ width: '100%' }}>
                  <option value="">Select Character</option>
                  {SMASH_CHARACTERS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 4 }}>P2 Character</label>
                <select value={form.character2} onChange={e => setForm({ ...form, character2: e.target.value })} style={{ width: '100%' }}>
                  <option value="">Select Character</option>
                  {SMASH_CHARACTERS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label className="muted" style={{ display: 'block', marginBottom: 4 }}>Stage</label>
                <select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })} style={{ width: '100%' }}>
                  <option value="">Select Stage (optional)</option>
                  {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="row" style={{ gap: 12, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_ranked} onChange={e => setForm({ ...form, is_ranked: e.target.checked })} />
                <span>Ranked Match (affects Elo)</span>
              </label>
              {formError && <span className="error" style={{ flex: 1 }}>{formError}</span>}
            </div>
            <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn small ghost" onClick={() => setShowMatchForm(false)}>Cancel</button>
              <button className="btn" type="submit" disabled={submitting}>
                {submitting ? 'Logging…' : 'Log Match'}
              </button>
            </div>
          </form>
        )}

        {smash && smash.rankings && smash.rankings.length ? (
          <>
            <div style={{ overflow: 'auto', marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr className="muted" style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '8px 8px', width: 50 }}>#</th>
                    <th style={{ padding: '8px 8px' }}>Player</th>
                    <th style={{ padding: '8px 8px', width: 80 }}>Rating</th>
                    <th style={{ padding: '8px 8px', width: 60 }}>Games</th>
                    <th style={{ padding: '8px 8px', width: 80 }}>Win %</th>
                  </tr>
                </thead>
                <tbody>
                  {smash.rankings.map((p) => (
                    <tr key={p.user_id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 8px', fontWeight: 600, color: p.rank === 1 ? 'var(--amber)' : p.rank === 2 ? '#c0c0c0' : p.rank === 3 ? '#cd7f32' : 'inherit' }}>
                        {p.rank}
                      </td>
                      <td style={{ padding: '8px 8px' }}>
                        {p.username}
                        {me && p.user_id === me.id && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--accent)' }}>(You)</span>}
                      </td>
                      <td style={{ padding: '8px 8px', fontFamily: 'monospace' }}>{p.rating}</td>
                      <td style={{ padding: '8px 8px' }}>{p.games}</td>
                      <td style={{ padding: '8px 8px' }}>
                        {p.games > 0 ? `${Math.round((p.wins || 0) / p.games * 100)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="muted" style={{ textAlign: 'center', padding: 20 }}>No rankings yet. Log matches to seed them.</div>
        )}

        <hr style={{ borderColor: 'var(--border)', margin: '16px 0' }} />

        <h4 style={{ marginBottom: 10 }}>Recent Matches</h4>
        {smashMatches.length > 0 ? (
          <div style={{ maxHeight: 300, overflow: 'auto' }}>
            {smashMatches.slice(0, 20).map((m) => (
              <div key={m.id} className="card" style={{ marginBottom: 8, background: 'var(--panel2)', padding: 10 }}>
                <div className="row between" style={{ marginBottom: 6 }}>
                  <span>
                    <strong>{m.expand?.player1?.username || m.player1}</strong>
                    {m.character1 && <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{m.character1}</span>}
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>{formatDate(m.created)}</span>
                </div>
                <div className="row between" style={{ marginBottom: 6 }}>
                  <span>
                    <strong>{m.expand?.player2?.username || m.player2}</strong>
                    {m.character2 && <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{m.character2}</span>}
                  </span>
                  <span style={{ color: 'var(--green)', fontWeight: 600, fontSize: 12 }}>
                    Winner: {m.expand?.winner?.username || m.winner}
                  </span>
                </div>
                <div className="row between" style={{ fontSize: 11 }}>
                  <span className="muted">{m.stage || 'No stage'}</span>
                  <span className="muted">{m.is_ranked ? '🏅 Ranked' : '🎮 Friendly'}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted" style={{ textAlign: 'center', padding: 20 }}>No matches logged yet.</div>
        )}
      </div>
    </div>
  );
}