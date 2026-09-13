import React, { useEffect, useState, useRef } from 'react';
import { pb, api, fileUrl } from '../lib/pb.js';

export default function Notifications({ onClose }) {
  const me = pb.authStore.model;
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const bellRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await pb.collection('notifications')
          .getList(1, 50, {
            filter: `user = "${me.id}"`,
            sort: '-created',
          });
        setNotifications(res.items || []);
        setUnreadCount((res.items || []).filter(n => !n.is_read).length);
      } catch (e) {}
    };
    load();

    let sub;
    pb.collection('notifications')
      .subscribe((e) => {
        if (e.record.user !== me.id) return;
        if (e.action === 'create') {
          setNotifications(n => [e.record, ...n].slice(0, 50));
          setUnreadCount(c => c + 1);
        }
        if (e.action === 'update') {
          setNotifications(n => n.map(x => x.id === e.record.id ? e.record : x));
          setUnreadCount(n => n.filter(x => !x.is_read).length);
        }
        if (e.action === 'delete') {
          setNotifications(n => n.filter(x => x.id !== e.record.id));
        }
      }, { filter: `user = "${me.id}"` })
      .then(t => sub = t)
      .catch(() => {});
    return () => { if (sub) pb.collection('notifications').unsubscribe(sub); };
  }, [me.id]);

  const markAsRead = async (id) => {
    try {
      const n = notifications.find(x => x.id === id);
      if (!n || n.is_read) return;
      await pb.collection('notifications').update(id, { is_read: true });
      setNotifications(ns => ns.map(x => x.id === id ? { ...x, is_read: true } : x));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch (e) {}
  };

  const markAllAsRead = async () => {
    try {
      const unread = notifications.filter(n => !n.is_read);
      for (const n of unread) {
        await pb.collection('notifications').update(n.id, { is_read: true });
      }
      setNotifications(ns => ns.map(x => ({ ...x, is_read: true })));
      setUnreadCount(0);
    } catch (e) {}
  };

  const handleNotificationClick = (n) => {
    markAsRead(n.id);
    if (n.link) {
      window.location.hash = n.link;
    }
    setOpen(false);
  };

  const formatTime = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <>
      <button
        ref={bellRef}
        className="btn ghost small"
        onClick={() => setOpen(!open)}
        style={{ position: 'relative', minWidth: 44 }}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: -4, right: -4,
            background: 'var(--red)',
            color: '#fff',
            fontSize: 10,
            padding: '2px 5px',
            borderRadius: 10,
            minWidth: 16,
            textAlign: 'center',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="card"
          style={{
            position: 'fixed',
            top: 60,
            right: 20,
            width: 360,
            maxHeight: '60vh',
            overflow: 'auto',
            zIndex: 100,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          <div className="row between" style={{ marginBottom: 10 }}>
            <strong>Notifications</strong>
            {unreadCount > 0 && (
              <button className="btn small ghost" onClick={markAllAsRead}>
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="muted" style={{ textAlign: 'center', padding: 20 }}>
              No notifications yet
            </div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                className={`card ${!n.is_read ? '' : 'muted'}`}
                style={{
                  marginBottom: 8,
                  background: n.is_read ? 'var(--panel)' : 'var(--panel2)',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onClick={() => handleNotificationClick(n)}
              >
                <div className="row between">
                  <strong style={{ fontSize: 13 }}>{n.title}</strong>
                  <span className="muted" style={{ fontSize: 11 }}>{formatTime(n.created)}</span>
                </div>
                <div className="muted" style={{ marginTop: 4, fontSize: 13, whiteSpace: 'pre-wrap' }}>
                  {n.body}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}