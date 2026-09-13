import React, { useState, useEffect } from 'react';
import { pb, api, fileUrl, API_URL } from '../lib/pb.js';
import { fmtBytes } from '../lib/pb.js';

export default function ProfileModal({ user, isOwnProfile, onClose }) {
  const me = pb.authStore.model;
  const [avatar, setAvatar] = useState(user.avatar?.[0] || null);
  const [name, setName] = useState(user.name || '');
  const [bio, setBio] = useState(user.bio || '');
  const [smashMain, setSmashMain] = useState(user.smash_main || '');
  const [robloxId, setRobloxId] = useState(user.roblox_id || '');
  const [karma, setKarma] = useState(user.karma || 0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setAvatar(user.avatar?.[0] || null);
      setName(user.name || '');
      setBio(user.bio || '');
      setSmashMain(user.smash_main || '');
      setRobloxId(user.roblox_id || '');
      setKarma(user.karma || 0);
    }
  }, [user]);

  const saveProfile = async () => {
    if (!isOwnProfile) return;
    setSaving(true);
    setError('');
    try {
      await pb.collection('users').update(me.id, {
        name,
        bio: bio.slice(0, 250),
        smash_main: smashMain.slice(0, 40),
        roblox_id: robloxId ? Number(robloxId) : 0,
      });
      if (onClose) onClose();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const avatarUrl = avatar ? fileUrl('users', user.id, avatar) : null;

  return (
    <div
      className="card"
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '100%',
        maxWidth: 420,
        maxHeight: '90vh',
        overflow: 'auto',
        zIndex: 200,
        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
      }}
    >
      <div className="row between" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>{isOwnProfile ? 'Edit Profile' : 'Profile'}</h3>
        <button className="btn small ghost" onClick={onClose}>✕</button>
      </div>

      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div
          className="avatar"
          style={{
            width: 80, height: 80, fontSize: 30,
            margin: '0 auto 12px',
            background: 'var(--accent2)',
          }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            (user.name || user.username || '?')[0].toUpperCase()
          )}
        </div>
        <div style={{ fontWeight: 600, fontSize: 18 }}>{user.name || user.username}</div>
        <div className="muted">@{user.username}</div>
        {user.role === 'admin' && (
          <span style={{ display: 'inline-block', marginTop: 6, padding: '2px 8px', background: 'var(--accent)', borderRadius: 4, fontSize: 11 }}>
            ADMIN
          </span>
        )}
        <div style={{ marginTop: 8, color: 'var(--amber)' }}>⬆ {karma} karma</div>
      </div>

      {isOwnProfile ? (
        <>
          {error && <div className="error">{error}</div>}
          <div style={{ marginBottom: 12 }}>
            <label className="muted" style={{ display: 'block', marginBottom: 4 }}>Display Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={40}
              placeholder="Your display name"
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="muted" style={{ display: 'block', marginBottom: 4 }}>Bio (max 250 chars)</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              maxLength={250}
              rows={3}
              placeholder="Tell friends about yourself..."
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="muted" style={{ display: 'block', marginBottom: 4 }}>Smash Bros Main</label>
            <input
              value={smashMain}
              onChange={e => setSmashMain(e.target.value)}
              maxLength={40}
              placeholder="e.g., Joker, Fox, Steve, Pikachu"
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="muted" style={{ display: 'block', marginBottom: 4 }}>Roblox User ID</label>
            <input
              value={robloxId}
              onChange={e => setRobloxId(e.target.value)}
              type="number"
              placeholder="Your Roblox numeric ID (for presence)"
            />
          </div>
          <button className="btn" style={{ width: '100%' }} onClick={saveProfile} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </>
      ) : (
        <>
          <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            {bio || 'No bio yet'}
          </div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            <strong>Smash Main:</strong> {smashMain || 'Not set'}
          </div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            <strong>Roblox:</strong> {robloxId ? `User ID ${robloxId}` : 'Not linked'}
          </div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            <strong>Joined:</strong> {user.created ? new Date(user.created).toLocaleDateString() : 'Unknown'}
          </div>
          <button className="btn ghost" style={{ width: '100%' }} onClick={onClose}>
            Close
          </button>
        </>
      )}
    </div>
  );
}