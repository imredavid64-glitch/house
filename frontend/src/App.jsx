import React, { useEffect, useState, useCallback } from 'react';
import { pb, API_URL } from './lib/pb.js';
import { setProfileHandler } from './lib/nav.js';
import Auth from './pages/Auth.jsx';
import Chat from './pages/Chat.jsx';
import Forum from './pages/Forum.jsx';
import News from './pages/News.jsx';
import Gaming from './pages/Gaming.jsx';
import Storage from './pages/Storage.jsx';
import Admin from './pages/Admin.jsx';
import ProfileModal from './components/ProfileModal.jsx';
import NotificationsBell from './components/NotificationsBell.jsx';

const tabs = [
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'forum', label: 'Forum', icon: '📋' },
  { id: 'news', label: 'News', icon: '📰' },
  { id: 'gaming', label: 'Gaming', icon: '🎮' },
  { id: 'storage', label: 'Storage', icon: '💾' },
];

export default function App() {
  const [authed, setAuthed] = useState(pb.authStore.isValid);
  const [tab, setTab] = useState(() => location.hash.split('/')[1] || 'chat');
  const [profile, setProfile] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const me = pb.authStore.model;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const onHash = () => setTab(location.hash.split('/')[1] || 'chat');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    setProfileHandler(setProfile);
    return () => setProfileHandler(null);
  }, []);

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);

  useEffect(() => {
    window.__showToast = showToast;
    return () => { delete window.__showToast; };
  }, [showToast]);

  if (!authed) return <Auth onAuth={() => setAuthed(true)} />;

  const isAdmin = me && me.role === 'admin';
  const meName = (me && (me.username || me.name || me.email)) || 'Me';

  const signOut = async (e) => {
    e.preventDefault();
    pb.authStore.clear();
    setAuthed(false);
  };

  const allTabs = isAdmin ? [...tabs, { id: 'admin', label: 'Admin', icon: '🛠️' }] : tabs;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <nav className="nav" role="navigation" aria-label="Main navigation">
        <div className="nav-inner">
          <a href="#/" className="nav-brand" aria-label="House Home">HOUSE</a>
          <div className="nav-tabs" role="tablist">
            {tabs.map((t) => (
              <a key={t.id} href={`#/${t.id}`} className={tab === t.id ? 'active' : ''} role="tab" aria-selected={tab === t.id}>
                {t.icon} {t.label}
              </a>
            ))}
            {isAdmin && (
              <a href="#/admin" className={tab === 'admin' ? 'active' : ''} role="tab" aria-selected={tab === 'admin'}>
                🛠️ Admin
              </a>
            )}
          </div>
          <div className="nav-spacer" />
          <div className="nav-actions">
            <button
              className="btn small ghost"
              onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={theme === 'dark' ? '☀️ Light mode' : '🌙 Dark mode'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <NotificationsBell />
            <button
              className="btn small ghost"
              onClick={() => setProfile(me.id)}
              aria-label="Profile"
              style={{ marginRight: 4 }}
            >
              {meName.slice(0, 12)}
            </button>
            <button
              className="btn small ghost mobile-only"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Menu"
              aria-expanded={sidebarOpen}
            >
              ☰
            </button>
            <a className="btn small ghost desktop-only" onClick={signOut} href="#/">Sign out</a>
          </div>
        </div>
      </nav>

      {sidebarOpen && (
        <div className="sidebar open" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div style={{ padding: 16 }}>
            <div className="row between" style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
              <strong>Menu</strong>
              <button className="btn small ghost" onClick={() => setSidebarOpen(false)} aria-label="Close menu">✕</button>
            </div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {allTabs.map((t) => (
                <a
                  key={t.id}
                  href={`#/${t.id}`}
                  className={`btn ${tab === t.id ? '' : 'ghost'}`}
                  style={{ textAlign: 'left', justifyContent: 'flex-start', width: '100%' }}
                  onClick={() => setSidebarOpen(false)}
                >
                  {t.icon} {t.label}
                </a>
              ))}
              <hr style={{ borderColor: 'var(--border)', margin: '12px 0' }} />
              <a
                className="btn ghost"
                style={{ textAlign: 'left', justifyContent: 'flex-start', width: '100%' }}
                onClick={() => { setSidebarOpen(false); setProfile(me.id); }}
              >
                👤 Profile
              </a>
              <button className="btn danger" style={{ textAlign: 'left', justifyContent: 'flex-start', width: '100%' }} onClick={signOut}>
                🚪 Sign out
              </button>
            </nav>
          </div>
        </div>
      )}

      {sidebarOpen && <div className="modal-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}

      <main className="container" role="main" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {tab === 'chat' && <Chat />}
        {tab === 'forum' && <Forum />}
        {tab === 'news' && <News />}
        {tab === 'gaming' && <Gaming />}
        {tab === 'storage' && <Storage />}
        {tab === 'admin' && isAdmin && <Admin />}
      </main>

      <nav className="mobile-nav" role="navigation" aria-label="Mobile bottom navigation">
        {allTabs.map((t) => (
          <a key={t.id} href={`#/${t.id}`} className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined}>
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </a>
        ))}
      </nav>

      {profile && <ProfileModal userId={profile} onClose={() => setProfile(null)} />}

      <div className="toast-container" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`} role="alert">{t.message}</div>
        ))}
      </div>
    </div>
  );
}

export { API_URL };