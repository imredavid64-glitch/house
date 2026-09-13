import React, { useEffect, useState } from 'react';
import { pb, fileUrl } from '../lib/pb.js';

export default function ProfileModal({ userId, onClose }) {
  const me = pb.authStore.model;
  const [u, setU] = useState(null);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [smashMain, setSmashMain] = useState('');
  const [robloxId, setRobloxId] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  useEffect(() => {
    pb.collection('users')
      .getOne(userId)
      .then((r) => {
        setU(r);
        setName(r.name || '');
        setBio(r.bio || '');
        setSmashMain(r.smash_main || '');
        setRobloxId(Number(r.roblox_id) || 0);
      })
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
  const isOwn = u.id === me?.id;
  const last = u.last_active ? new Date(u.last_active).toLocaleString() : '—';
  const joined = u.created ? new Date(u.created).toLocaleDateString() : '—';
  const avatarUrl = u.avatar ? fileUrl('users', u.id, u.avatar) : null;

  const saveProfile = async () => {
    setSaveErr('');
    setSaving(true);
    try {
      await pb.collection('users').update(me.id, {
        name: name.slice(0, 40),
        bio: bio.slice(0, 250),
        smash_main: smashMain.slice(0, 40),
        roblox_id: robloxId ? Number(robloxId) : 0,
      });
      setSaveErr('Saved ✓');
    } catch (e) {
      setSaveErr(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h3>{isOwn ? 'Edit profile' : u.username}</h3>
          <button className="btn small ghost" onClick={onClose}>✕</button>
        </div>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="avatar" style={{ width: 80, height: 80, borderRadius: 40, objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 80, height: 80, borderRadius: 40, background: 'var(--panel2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, margin: '0 auto' }}>
              {(u.username || '?')[0].toUpperCase()}
            </div>
          )}
        </div>
        <div style={{ marginBottom: 6 }}>
          <span className={isAdmin ? 'badge admin' : 'badge'}>{isAdmin ? 'ADMIN' : 'MEMBER'}</span>
        </div>
        <div className="muted">@{u.username} · Karma ⬆ {u.karma ?? 0}</div>
        <div className="muted">Joined {joined}</div>
        <div className="muted spacer">Last seen {last}</div>

        {isOwn ? (
          <div style={{ marginTop: 12 }}>
            {saveErr && <div className={saveErr === 'Saved ✓' ? 'ok' : 'error'}>{saveErr}</div>}
            <div style={{ marginBottom: 10 }}>
              <label className="muted" style={{ display: 'block', marginBottom: 4 }}>Display Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label className="muted" style={{ display: 'block', marginBottom: 4 }}>Bio (max 250 chars)</label>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={250} rows={3} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label className="muted" style={{ display: 'block', marginBottom: 4 }}>Smash Bros Main</label>
              <input value={smashMain} onChange={(e) => setSmashMain(e.target.value)} maxLength={40} placeholder="e.g., Joker, Fox, Steve" />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label className="muted" style={{ display: 'block', marginBottom: 4 }}>Roblox User ID</label>
              <input value={String(robloxId)} onChange={(e) => setRobloxId(e.target.value)} type="number" placeholder="Numeric Roblox ID" />
            </div>
            <button className="btn" style={{ width: '100%' }} onClick={saveProfile} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        ) : (
          <>
            {u.bio && <p style={{ marginTop: 12 }}>{u.bio}</p>}
            {u.smash_main && (
              <div className="muted spacer">🥊 Smash main: <strong>{u.smash_main}</strong></div>
            )}
            {u.roblox_id > 0 && (
              <div className="muted spacer">🤖 Roblox: <strong>User ID {u.roblox_id}</strong></div>
            )}
          </>
        )}
      </div>
    </div>
  );
}