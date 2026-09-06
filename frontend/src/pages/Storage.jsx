import React, { useEffect, useState } from 'react';
import { api, pb, fmtBytes } from '../lib/pb.js';

export default function Storage() {
  const me = pb.authStore.model;
  const isAdmin = me?.role === 'admin';
  const [st, setSt] = useState(null);
  const [invites, setInvites] = useState([]);
  const [newInvites, setNewInvites] = useState(1);
  const [props, setProps] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = () => {
    api('/api/house/storage').then(setSt).catch((e) => setError(e.message));
    api('/api/house/deletion/proposals')
      .then((r) => setProps(Array.isArray(r) ? r : r.proposals || []))
      .catch(() => {});
    if (isAdmin) api('/api/house/invites').then(setInvites).catch(() => {});
  };

  useEffect(load, []);

  const makeInvites = async () => {
    setBusy('invites');
    try {
      const r = await api('/api/house/invites', {
        method: 'POST',
        body: JSON.stringify({ count: Number(newInvites), expires_days: 30 }),
      });
      setInvites((v) => [...r.keys, ...v]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const createProposal = async () => {
    setBusy('proposal');
    try {
      await api('/api/house/deletion/proposals', {
        method: 'POST',
        body: JSON.stringify({ type: 'old_files', criteria: { source: 'chat', ageDays: 90 } }),
      });
      setError('');
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const vote = async (id, choice) => {
    try {
      await api(`/api/house/deletion/proposals/${id}/vote`, {
        method: 'POST',
        body: JSON.stringify({ choice }),
      });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const forceRefresh = async () => {
    setBusy('refresh');
    try {
      await api('/api/house/storage/refresh', { method: 'POST', body: JSON.stringify({}) });
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const execute = async (id) => {
    if (!confirm('Approve deletion now? This is permanent.')) return;
    setBusy('exec');
    try {
      await api(`/api/house/deletion/proposals/${id}/execute`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const pct = st ? Math.round((st.used_bytes / st.limit_bytes) * 10000) / 100 : 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <div className="card">
        <h3 style={{ marginBottom: 10 }}>💾 Storage</h3>
        {st ? (
          <>
            <div className="row between">
              <strong>{fmtBytes(st.used_bytes)}</strong>
              <span className="muted">/ {fmtBytes(st.limit_bytes)} (10 GB)</span>
            </div>
            <div className="expander" style={{ margin: '10px 0' }}>
              <div style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <div className="muted">{pct}% used · {st.percent > 90 ? '⚠ close to full' : ''}</div>
            <button className="btn small ghost" onClick={forceRefresh} style={{ marginTop: 10 }}>
              {busy === 'refresh' ? 'Scanning…' : 'Refresh sizes'}
            </button>

            <h4 style={{ margin: '16px 0 8px' }}>Largest files</h4>
            {st.largest && st.largest.length ? (
              st.largest.slice(0, 8).map((f) => (
                <div key={f.id} className="row between" style={{ fontSize: 13, marginBottom: 4 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.original_name || f.record_id}
                  </span>
                  <span className="muted" style={{ flexShrink: 0 }}>
                    {fmtBytes(f.stored_size)} {f.algorithm !== 'none' ? `(${f.algorithm})` : ''}
                  </span>
                </div>
              ))
            ) : (
              <div className="muted">No files uploaded yet.</div>
            )}
          </>
        ) : (
          <div className="muted">Loading…</div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 10 }}>🏛️ Deletion Voting</h3>
        {props.map((p) => {
          const total = (p.votes_yes || 0) + (p.votes_no || 0);
          const voting = p.status === 'voting';
          return (
            <div key={p.id} className="card" style={{ background: 'var(--panel2)', marginBottom: 10 }}>
              <div className="row between">
                <strong>{p.title}</strong>
                <span className="muted">{p.status}</span>
              </div>
              <div className="muted" style={{ margin: '4px 0' }}>
                {p.type} · proposed by {p.proposed_by || '—'} · {new Date(p.created_at || Date.now()).toLocaleDateString()}
              </div>
              <div className="row between" style={{ fontSize: 13 }}>
                <span style={{ color: 'var(--green)' }}>Yes {p.votes_yes || 0}</span>
                <span style={{ color: 'var(--red)' }}>No {p.votes_no || 0}</span>
              </div>
              {voting && (
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn small" onClick={() => vote(p.id, 1)}>Vote Yes</button>
                  <button className="btn small ghost" onClick={() => vote(p.id, -1)}>Vote No</button>
                  {isAdmin && (
                    <button className="btn small danger" onClick={() => execute(p.id)}>Execute now</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!props.length && (
          <button
            className="btn small"
            onClick={createProposal}
            disabled={busy === 'proposal'}
          >
            {busy === 'proposal' ? 'Creating…' : 'Propose cleanup: chat files older than 90 days'}
          </button>
        )}
        {error && <div className="error">{error}</div>}
      </div>

      {isAdmin && (
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h3 style={{ marginBottom: 10 }}>🔑 Invite Keys</h3>
          <div className="row" style={{ marginBottom: 12 }}>
            <input
              type="number" min="1" max="50"
              value={newInvites}
              onChange={(e) => setNewInvites(e.target.value)}
              style={{ width: 90 }}
            />
            <button className="btn small" onClick={makeInvites} disabled={busy === 'invites'}>
              Generate
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {invites.map((k) => (
              <span
                key={k.id}
                className="card"
                style={{
                  padding: '6px 10px',
                  fontSize: 13,
                  background: k.is_used ? 'var(--panel)' : 'var(--panel2)',
                  opacity: k.is_used ? 0.5 : 1,
                }}
              >
                {k.key_code} {k.is_used ? '(used)' : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}