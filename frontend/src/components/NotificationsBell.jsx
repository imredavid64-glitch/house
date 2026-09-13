import React, { useEffect, useRef, useState } from 'react';
import { pb } from '../lib/pb.js';

export default function NotificationsBell() {
  const me = pb.authStore.model;
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);

  useEffect(() => {
    if (!me) return;
    const load = () =>
      pb
        .collection('notifications')
        .getList(1, 20, { filter: `user = "${me.id}"`, sort: '-created' })
        .then((r) => setItems(r.items || []))
        .catch(() => {});
    load();
    let sub;
    pb.collection('notifications')
      .subscribe('*', () => load(), { filter: `user = "${me.id}"` })
      .then((t) => (sub = t))
      .catch(() => {});
    const onDoc = (e) => {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => {
      if (sub) pb.collection('notifications').unsubscribe(sub);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [me]);

  const unread = items.filter((n) => !n.is_read).length;

  const markAll = async () => {
    const un = items.filter((n) => !n.is_read);
    for (const n of un) {
      await pb.collection('notifications').update(n.id, { is_read: true }).catch(() => {});
    }
    setItems((xs) => xs.map((x) => ({ ...x, is_read: true })));
  };

  return (
    <div style={{ position: 'relative' }} ref={wrap}>
      <a className="btn small ghost" onClick={(e) => { e.preventDefault(); setOpen(!open); }} href="#/">
        🔔{unread > 0 && <span className="badge tiny" style={{ marginLeft: 4 }}>{unread}</span>}
      </a>
      {open && (
        <div
          className="card"
          style={{
            position: 'absolute', right: 0, top: 40, width: 300, maxHeight: 360,
            overflow: 'auto', zIndex: 50, boxShadow: '0 6px 24px rgba(0,0,0,.35)',
          }}
        >
          <div className="row between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
            <strong style={{ fontSize: 13 }}>Notifications</strong>
            {unread > 0 && <button className="btn tiny ghost" onClick={markAll}>Mark all read</button>}
          </div>
          {items.length === 0 && <div className="muted" style={{ padding: 10 }}>Nothing yet.</div>}
          {items.map((n) => (
            <div key={n.id} className={`notif ${n.is_read ? '' : 'unread'}`}
              style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: n.is_read ? 400 : 600 }}>
                {n.title}
              </div>
              {n.body && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{n.body}</div>}
              {n.link && (
                <a href={n.link} style={{ fontSize: 12, color: 'var(--accent)' }} onClick={() => setOpen(false)}>
                  Open →
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}