import React, { useEffect, useState } from 'react';
import { pb, fileUrl } from '../lib/pb.js';

export default function ProfileModal({ userId, onClose }) {
  const [u, setU] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    pb.collection('users')
      .getOne(userId)
      .then(setU)
      .catch((e) => setErr(e.message));
  }, [userId]);

  if (err) {
    return (
      <div className="modal-wrap" onClick={onClose}>
        <div className="modal card" onClick={(e) => e.stopPropagation()}>
          <div className="error">{err}</div>
        </div>
      </div>
    );
  }
  if (!u) return null;

  const isAdmin = u.role === 'admin';
  const last = u.last_active ? new Date(u.last_active).toLocaleString() : '—';
  const joined = u.created ? new Date(u.created).toLocaleDateString() : '—';

  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h3>{u.username}</h3>
          <button className="btn small ghost" onClick={onClose}>✕</button>
        </div>
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          {u.avatar ? (
            <img
              src={fileUrl('users', u.id, u.avatar)}
              alt="avatar"
              style={{ width: 72, height: 72, borderRadius: 36, objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: 72, height: 72, borderRadius: 36,
                background: 'var(--panel2)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 28,
              }}
            >
              {(u.username || '?')[0]}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: 6 }}>
              <span className={isAdmin ? 'badge admin' : 'badge'}>{isAdmin ? 'ADMIN' : 'MEMBER'}</span>
            </div>
            <div className="muted">Joined {joined}</div>
            <div className="muted">Karma ⬆ {u.karma ?? 0}</div>
            <div className="muted spacer">Last seen {last}</div>
          </div>
        </div>
        {u.bio && <p style={{ marginTop: 12 }}>{u.bio}</p>}
        {u.smash_main && (
          <div className="muted spacer">
            🥊 Smash main: <strong>{u.smash_main}</strong>
          </div>
        )}
      </div>
    </div>
  );
}