import React, { useEffect, useState } from 'react';
import { pb, API_URL } from './lib/pb.js';
import Auth from './pages/Auth.jsx';
import Chat from './pages/Chat.jsx';
import Forum from './pages/Forum.jsx';
import News from './pages/News.jsx';
import Gaming from './pages/Gaming.jsx';
import Storage from './pages/Storage.jsx';

const tabs = [
  { id: 'chat', label: 'Chat' },
  { id: 'forum', label: 'Forum' },
  { id: 'news', label: 'News' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'storage', label: 'Storage' },
];

export default function App() {
  const [authed, setAuthed] = useState(pb.authStore.isValid);
  const [tab, setTab] = useState(() => location.hash.slice(1) || 'chat');

  useEffect(() => {
    window.addEventListener('hashchange', () =>
      setTab(location.hash.slice(1) || 'chat')
    );
  }, []);

  if (!authed) return <Auth onAuth={() => setAuthed(true)} />;

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
          <div style={{ flex: 1 }} />
          <a
            className="btn small ghost"
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
      </nav>
      <div className="container">
        {tab === 'chat' && <Chat />}
        {tab === 'forum' && <Forum />}
        {tab === 'news' && <News />}
        {tab === 'gaming' && <Gaming />}
        {tab === 'storage' && <Storage />}
      </div>
    </div>
  );
}

export { API_URL };