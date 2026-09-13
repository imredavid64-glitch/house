import React, { useEffect, useState, useCallback } from 'react';
import { pb, API_URL } from './lib/pb.js';
import Auth from './pages/Auth.jsx';
import Chat from './pages/Chat.jsx';
import Forum from './pages/Forum.jsx';
import News from './pages/News.jsx';
import Gaming from './pages/Gaming.jsx';
import Storage from './pages/Storage.jsx';
import Notifications from './components/Notifications.jsx';
import ProfileModal from './components/ProfileModal.jsx';

const tabs = [
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'forum', label: 'Forum', icon: '📋' },
  { id: 'news', label: 'News', icon: '📰' },
  { id: 'gaming', label: 'Gaming', icon: '🎮' },
  { id: 'storage', label: 'Storage', icon: '💾' },
];

export default function App() {
  const [authed, setAuthed] = useState(pb.authStore.isValid);
  const [tab, setTab] = useState(() => location.hash.slice(1) || 'chat');
  const [profileUser, setProfileUser] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    window.addEventListener('hashchange', () =>
      setTab(location.hash.slice(1) || 'chat')
    );
  }, []);

  if (!authed) return <Auth onAuth={() => setAuthed(true)} />;

  const me = pb.authStore.model;

  const openProfile = (user) => {
    setProfileUser(user);
    setShowProfile(true);
  };

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);

  // Make showToast available globally for components
  useEffect(() => {
    window.__showToast = showToast;
    return () => { delete window.__showToast; };
  }, [showToast]);

  const currentTab = tabs.find(t => t.id === tab) || tabs[0];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navigation */}
      <nav className="nav" role="navigation" aria-label="Main navigation">
        <div className="nav-inner">
          <a href="#/" className="nav-brand" aria-label="House Home">
            HOUSE
          </a>
          <div className="nav-tabs" role="tablist">
            {tabs.map((t) => (
              <a
                key={t.id}
                href={`#/${t.id}`}
                className={tab === t.id ? 'active' : ''}
                role="tab"
                aria-selected={tab === t.id}
              >
                {t.icon} {t.label}
              </a>
            ))}
          </div>
          <div className="nav-spacer" />
          <div className="nav-actions">
            <button
              className="btn small ghost"
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={theme === 'dark' ? '☀️ Light mode' : '🌙 Dark mode'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <Notifications />
            <button
              className="btn small ghost"
              onClick={() => openProfile(me)}
              aria-label="Profile"
              style={{ marginRight: 4 }}
            >
              {me.avatar?.[0] ? (
                <img src={API_URL + '/api/files/users/' + me.id + '/' + me.avatar[0]} alt="" className="avatar avatar-sm" />
              ) : (
                <div className="avatar avatar-sm" style={{ width: 28, height: 28, fontSize: 12 }}>{(me.name || me.username || '?')[0].toUpperCase()}</div>
              )}
            </button>
            <button
              className="btn small ghost mobile-only"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Menu"
              aria-expanded={sidebarOpen}
            >
              ☰
            </button>
            <a
              className="btn small ghost desktop-only"
              onClick={async (e) => {
                e.preventDefault();
                pb.authStore.clear();
                setAuthed(false);
              }}
              href="#/"
            >
              Sign out
            </a>
          </div>
        </div>
      </nav>

      {/* Mobile sidebar drawer */}
      {sidebarOpen && (
        <div
          className="sidebar open"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div style={{ padding: 16 }}>
            <div className="row between" style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
              <strong>Menu</strong>
              <button className="btn small ghost" onClick={() => setSidebarOpen(false)} aria-label="Close menu">✕</button>
            </div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {tabs.map((t) => (
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
                onClick={() => openProfile(me)}
              >
                👤 Profile
              </a>
              <button
                className="btn danger"
                style={{ textAlign: 'left', justifyContent: 'flex-start', width: '100%' }}
                onClick={async (e) => {
                  e.preventDefault();
                  pb.authStore.clear();
                  setAuthed(false);
                  setSidebarOpen(false);
                }}
              >
                🚪 Sign out
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main content */}
      <main className="container" role="main" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {tab === 'chat' && <Chat />}
        {tab === 'forum' && <Forum />}
        {tab === 'news' && <News />}
        {tab === 'gaming' && <Gaming />}
        {tab === 'storage' && <Storage />}
      </main>

      {/* Mobile bottom navigation */}
      <nav className="mobile-nav" role="navigation" aria-label="Mobile bottom navigation">
        {tabs.map((t) => (
          <a
            key={t.id}
            href={`#/${t.id}`}
            className={tab === t.id ? 'active' : ''}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </a>
        ))}
      </nav>

      {/* Profile Modal */}
      {showProfile && profileUser && (
        <ProfileModal
          user={profileUser}
          isOwnProfile={profileUser.id === me.id}
          onClose={() => { setShowProfile(false); setProfileUser(null); }}
        />
      )}
      {showProfile && (
        <div
          className="modal-backdrop"
          onClick={() => { setShowProfile(false); setProfileUser(null); }}
          aria-hidden="true"
        />
      )}

      {/* Toast notifications */}
      <div className="toast-container" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`} role="alert">
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

export { API_URL };