import React, { useEffect, useState } from 'react';
import { api } from '../lib/pb.js';

const FIELDS = [
  ['storage_limit_bytes', 'Storage limit (bytes)', 'number'],
  ['vote_window_hours', 'Deletion vote window (hours)', 'number'],
  ['vote_approval_pct', 'Approval % (0-100)', 'number'],
  ['vote_min_voters', 'Min voters', 'number'],
  ['auto_propose_at_bytes', 'Auto-propose at (bytes used)', 'number'],
  ['news_ttl_minutes', 'News TTL (minutes)', 'number'],
  ['mc_server_host', 'Minecraft server host', 'text'],
  ['roblox_watchlist', 'Roblox watchlist (comma-separated universe IDs)', 'array'],
];

export default function Admin() {
  const [settings, setSettings] = useState({});
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const [inviteCount, setInviteCount] = useState(5);
  const [invites, setInvites] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/house/settings').then(setSettings).catch((e) => setError(e.message));
  }, []);

  const fmt = (v) => {
    if (v === null || v === undefined) return '';
    return typeof v === 'object' ? v.join(', ') : String(v);
  };

  const parse = (key, s) => {
    const field = FIELDS.find(([k]) => k === key);
    if (!field) return s;
    if (field[2] === 'number') {
      const n = Number(s);
      return isNaN(n) ? undefined : n;
    }
    if (field[2] === 'array') return s.split(',').map((x) => x.trim()).filter(Boolean);
    return s;
  };

  const save = async () => {
    setBusy(true);
    setSaved('');
    setError('');
    const body = {};
    for (const [k] of FIELDS) body[k] = settings[k];
    try {
      const r = await api('/api/house/settings', { method: 'POST', body: JSON.stringify(body) });
      if (r.success) {
        setSaved('Saved.');
        setTimeout(() => setSaved(''), 2500);
      }
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const genInvites = async () => {
    setBusy(true);
    setInvites('');
    setError('');
    try {
      const r = await api('/api/house/invites', { method: 'POST', body: JSON.stringify({ count: inviteCount }) });
      setInvites((r.keys || []).join('\n'));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <div className="card">
        <h3 style={{ marginBottom: 10 }}>⚙️ Settings</h3>
        {error && <div className="error">{error}</div>}
        {saved && <div style={{ color: 'var(--green)', marginBottom: 8 }}>{saved}</div>}
        {FIELDS.map(([key, label]) => (
          <label key={key} style={{ display: 'block', marginBottom: 8 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>{label}</div>
            <input
              value={fmt(settings[key])}
              onChange={(e) => setSettings({ ...settings, [key]: parse(key, e.target.value) })}
            />
          </label>
        ))}
        <button className="btn small" onClick={save} disabled={busy}>Save settings</button>
      </div>
      <div className="card">
        <h3 style={{ marginBottom: 10 }}>🔑 Invite Keys</h3>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <input
            type="number" min={1} max={100} value={inviteCount}
            onChange={(e) => setInviteCount(Number(e.target.value))}
            style={{ width: 80 }}
          />
          <button className="btn small" onClick={genInvites} disabled={busy}>Generate</button>
        </div>
        {invites && (
          <pre style={{ marginTop: 10, padding: 10, background: 'var(--panel2)', borderRadius: 8, whiteSpace: 'pre-wrap' }}>
            {invites}
          </pre>
        )}
      </div>
    </div>
  );
}