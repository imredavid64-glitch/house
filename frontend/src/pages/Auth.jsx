import React, { useState } from 'react';
import { pb, API_URL } from '../lib/pb.js';

export default function Auth({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await pb.collection('users').authWithPassword(identity, password);
        onAuth();
      } else {
        const res = await fetch(`${API_URL}/api/house/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: identity,
            password,
            name: name || identity.split('@')[0],
            invite_key: invite.trim(),
          }),
        });
        if (!res.ok) {
          let m = 'Registration failed';
          try {
            m = (await res.json()).message;
          } catch {}
          throw new Error(m);
        }
        await pb.collection('users').authWithPassword(identity, password);
        onAuth();
      }
    } catch (ex) {
      setErr(ex.message || String(ex));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div className="card" style={{ width: 360 }}>
        <h1 style={{ letterSpacing: 1, marginBottom: 4 }}>HOUSE</h1>
        <div className="muted" style={{ marginBottom: 18 }}>
          {API_URL}
        </div>
        <div className="row" style={{ marginBottom: 14 }}>
          {['login', 'register'].map((m) => (
            <button
              key={m}
              className={`btn small ${mode === m ? '' : 'ghost'}`}
              onClick={() => {
                setMode(m);
                setErr('');
              }}
            >
              {m === 'login' ? 'Log in' : 'Join with invite'}
            </button>
          ))}
        </div>
        <form onSubmit={submit}>
          {mode === 'register' && (
            <input
              placeholder="Display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ marginBottom: 10 }}
            />
          )}
          <input
            placeholder="Email"
            type="email"
            required
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          <input
            placeholder="Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ marginBottom: mode === 'register' ? 10 : 16 }}
          />
          {mode === 'register' && (
            <input
              placeholder="Invite key (HOUSE-XXXX-XXXX-XXXX)"
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              style={{ marginBottom: 16 }}
            />
          )}
          {err && <div className="error">{err}</div>}
          <button className="btn" style={{ width: '100%' }} disabled={busy}>
            {busy ? '…' : mode === 'login' ? 'Log in' : 'Join House'}
          </button>
        </form>
      </div>
    </div>
  );
}