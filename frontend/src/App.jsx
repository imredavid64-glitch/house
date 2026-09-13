import React, { useEffect, useRef, useState } from 'react';
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
  { id: 'chat', label: 'Chat' },
  { id: 'forum', label: 'Forum' },
  { id: 'news', label: 'News' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'storage', label: 'Storage' },
];

export default function App() {
  const [authed, setAuthed] = useState(pb.authStore.isValid);
  const [tab, setTab] = useState(() => location.hash.split('/')[1] || 'chat');
  const [profile, setProfile] = useState(null);
  const me = pb.authStore.model;

  useEffect(() => {
    const onHash = () => setTab(location.hash.split('/')[1] || 'chat');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    setProfileHandler(setProfile);
    return () => setProfileHandler(null);
  }, []);

  if (!authed) return <Auth onAuth={() => setAuthed(true)} />;

  const isAdmin = me && me.role === 'admin';
  const meName = (me && (me.username || me.name || me.email)) || 'Me';

  return (
    <div>
      <nav className="nav">
        <div className="nav-inner">
          <a href="#/" style={{ fontWeight: 800, color: 'var(--text)', letterSpacing: 0.5 }}>
            HOUSE
          </a>
          {tabs.map((t) => (
            <a key={t.id} href={`#/${t.id}`} className={tab === t.id ? 'active' : ''}>
              {t.label}
            </a>
          ))}
          {isAdmin && (
            <a href="#/admin" className={tab === 'admin' ? 'active' : ''}>
              Admin
            </a>
          )}
          <div style={{ flex: 1 }} />
          <NotificationsBell />
          <a
            className="btn small ghost"
            href="#/"
            onClick={(e) => {
              e.preventDefault();
              if (me) setProfile(me.id);
            }}
            title="View profile"
          >
            {meName.slice(0, 10)}
          </a>
          <a
            className="btn small ghost"
            onClick={(e) => {
              e.preventDefault();
              pb.authStore.clear();
              setAuthed(false);
            }}
            href="#/"
          >
            Sign out
          </a>
        </div>
      </nav>
      <div className="container">
        {tab === 'chat' && <Chat />}
        {tab === 'forum' && <Forum />}
        {tab === 'news' && <News />}
        {tab === 'gaming' && <Gaming />}
        {tab === 'storage' && <Storage />}
        {tab === 'admin' && isAdmin && <Admin />}
      </div>
      {profile && <ProfileModal userId={profile} onClose={() => setProfile(null)} />}
    </div>
  );
}

export { API_URL };