import React, { useEffect, useRef, useState } from 'react';
import { pb, fileUrl, fmtBytes, API_URL } from '../lib/pb.js';

export default function Chat() {
  const [channels, setChannels] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const me = pb.authStore.model;

  useEffect(() => {
    pb.collection('channels')
      .getFullList({ sort: 'name' })
      .then(setChannels)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!active) {
      setMessages([]);
      return;
    }
    let alive = true;
    const load = async () => {
      const res = await pb
        .collection('messages')
        .getList(1, 100, {
          filter: `channel = "${active}"`,
          sort: 'created',
          expand: 'user,parent',
        })
        .catch(() => ({ items: [] }));
      if (alive) setMessages(res.items || []);
    };
    load();

    let sub;
    pb.collection('messages')
      .subscribe(
        (e) => {
          if (e.record.channel !== active) return;
          if (e.action === 'create') setMessages((m) => [...m, e.record].slice(-300));
          if (e.action === 'delete')
            setMessages((m) => m.filter((x) => x.id !== e.record.id));
        },
        { expand: 'user,parent' }
      )
      .then((t) => (sub = t))
      .catch(() => {});
    return () => {
      alive = false;
      if (sub) pb.collection('messages').unsubscribe(sub);
    };
  }, [active]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, active]);

  const send = async (e, files = []) => {
    e?.preventDefault();
    if ((!text.trim() && !files.length) || !active) return;
    setBusy(true);
    setError('');
    try {
      const data = { channel: active, user: me.id, content: text.trim() };
      if (files.length) data.attachments = files;
      await pb.collection('messages').create(data);
      setText('');
    } catch (ex) {
      setError(ex.message || String(ex));
    } finally {
      setBusy(false);
    }
  };

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('channel', active);
      form.append('user', me.id);
      for (const f of files) form.append('attachments', f);
      await pb.collection('messages').create(form);
    } catch (ex) {
      setError(ex.message || String(ex));
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 14 }}>
      <div className="card" style={{ padding: 6, maxHeight: '70vh', overflow: 'auto' }}>
        {channels.map((c) => (
          <button
            key={c.id}
            className={`btn small ${active === c.id ? '' : 'ghost'}`}
            style={{ width: '100%', margin: 2, textAlign: 'left' }}
            onClick={() => setActive(c.id)}
          >
            # {c.icon || ''} {c.name}
          </button>
        ))}
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '70vh' }}>
        <div style={{ flex: 1, overflow: 'auto', paddingBottom: 10 }}>
          {!active ? (
            <div className="muted" style={{ textAlign: 'center', marginTop: 40 }}>
              Pick a channel to start chatting
            </div>
          ) : (
            messages.map((m, i) => <Message key={m.id || i} m={m} active={active} />)
          )}
          <div ref={endRef} />
        </div>
        {error && <div className="error">{error}</div>}
        <form className="row" onSubmit={send} style={{ marginTop: 8 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={active ? `Message…` : 'Select a channel'}
            disabled={!active || busy}
            style={{ flex: 1 }}
          />
          <button className="btn" disabled={!active || busy}>
            Send
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={!active || busy}
            onClick={() => document.getElementById('chat-upload').click()}
          >
            +
          </button>
          <input id="chat-upload" type="file" multiple hidden onChange={onFiles} />
        </form>
      </div>
    </div>
  );
}

function Message({ m, active }) {
  const me = pb.authStore.model;
  const mine = m.expand?.user?.id === me?.id;
  const files = m.attachments || [];
  const time = m.created ? new Date(m.created).toLocaleTimeString() : '';
  return (
    <div style={{ marginBottom: 10, textAlign: mine ? 'right' : 'left' }}>
      <div
        style={{
          display: 'inline-block',
          background: mine ? 'var(--accent)' : 'var(--panel2)',
          borderRadius: 12,
          borderBottomRightRadius: mine ? 2 : 12,
          borderBottomLeftRadius: mine ? 12 : 2,
          padding: '7px 12px',
          maxWidth: '70%',
          color: mine ? '#fff' : undefined,
          textAlign: 'left',
        }}
      >
        {!mine && (
          <div className="muted" style={{ fontSize: 12, color: mine ? undefined : 'var(--muted)' }}>
            {m.expand?.user?.name || m.expand?.user?.email || '—'} · {time}
          </div>
        )}
        {m.content && (
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</div>
        )}
        {files.length > 0 &&
          files.map((f) => (
            <div key={f}>
              <a href={fileUrl('messages', m.id, f)} target="_blank" rel="noreferrer">
                📎 {f}
              </a>
            </div>
          ))}
        {mine && (
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{time}</div>
        )}
      </div>
    </div>
  );
}
export { fmtBytes, API_URL };