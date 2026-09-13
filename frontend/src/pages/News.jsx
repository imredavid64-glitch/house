import React, { useEffect, useState } from 'react';
import { api } from '../lib/pb.js';

const cats = [
  ['tech', '💻 Tech'],
  ['gaming', '🎮 Gaming'],
  ['anime', '🍥 Anime'],
  ['minecraft', '⛏️ Minecraft'],
  ['smash', '🏆 Smash'],
  ['roblox', '🤖 Roblox'],
];

export default function News() {
  const [cat, setCat] = useState('tech');
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let alive = true;
    setError('');
    setItems([]);
    api(`/api/house/news?category=${cat}`)
      .then((r) => { if (alive) setItems(r.items || []); })
      .catch((e) => alive && setError(e.message));
    return () => (alive = false);
  }, [cat]);

  const refresh = async () => {
    setRefreshing(true);
    setError('');
    try {
      const r = await api('/api/house/news/refresh', { method: 'POST', body: JSON.stringify({}) });
      if (!r.refreshed) setError(r.message || 'Nothing to refresh right now');
      const fresh = await api(`/api/house/news?category=${cat}`);
      setItems(fresh.items || []);
    } catch (e) { setError(e.message); }
    finally { setRefreshing(false); }
  };

  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {cats.map(([id, label]) => (
            <button key={id} className={`btn small ${cat === id ? '' : 'ghost'}`}
              onClick={() => setCat(id)}>
              {label}
            </button>
          ))}
        </div>
        <button className="btn small" onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Fetching…' : '↻ Refresh'}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      {items.length === 0 && !error && <div className="muted">No news yet.</div>}
      {items.map((n) => (
        <div key={n.id} className="card" style={{ marginBottom: 10, background: 'var(--panel2)' }}>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            {n.thumbnail_url && (
              <a href={n.url} target="_blank" rel="noreferrer">
                <img src={n.thumbnail_url} alt="" style={{ width: 80, height: 60, borderRadius: 6, objectFit: 'cover' }} />
              </a>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <a href={n.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600, fontSize: 14 }}>
                {n.title}
              </a>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {n.source_name || '—'} ·{' '}
                {n.published_at
                  ? new Date(n.published_at).toLocaleDateString()
                  : n.fetched_at
                    ? new Date(n.fetched_at).toLocaleDateString()
                    : '—'}
                {n.metadata?.score != null && <span> · ▲ {n.metadata.score}</span>}
              </div>
              {n.summary && (
                <div className="muted" style={{ fontSize: 12, marginTop: 3, whiteSpace: 'pre-wrap' }}>
                  {n.summary.slice(0, 200)}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}