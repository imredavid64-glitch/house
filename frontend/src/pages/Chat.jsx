import React, { useEffect, useMemo, useRef, useState } from 'react';
import { pb, fileUrl, API_URL } from '../lib/pb.js';
import { compressImage } from '../lib/compress.js';
import { openProfile } from '../lib/nav.js';

const EMOJIS = ['👍', '❤️', '😂', '🔥', '🎉', '😢'];

export default function Chat() {
  const [channels, setChannels] = useState([]);
  const [active, setActive] = useState(null);
  const [all, setAll] = useState([]);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState([]);
  const [expanded, setExpanded] = useState({});
  const endRef = useRef(null);
  const fileRef = useRef(null);
  const me = pb.authStore.model;

  useEffect(() => {
    pb.collection('channels').getFullList({ sort: 'name' }).then((cs) => {
      setChannels(cs);
      const m = /^#\/chat\/(.+)/.exec(window.location.hash);
      if (m && cs.some((c) => c.id === m[1])) {
        setActive(m[1]);
        history.replaceState(null, '', '#/chat');
      }
    }).catch(() => {});
    pb.collection('users').getFullList().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    if (!active) {
      setAll([]);
      return;
    }
    let alive = true;
    const load = async () => {
      const res = await pb
        .collection('messages')
        .getList(1, 200, { filter: `channel = "${active}"`, sort: 'created', expand: 'user,parent' })
        .catch(() => ({ items: [] }));
      if (alive) setAll((res.items || []).slice(-300));
    };
    load();

    let sub;
    pb.collection('messages')
      .subscribe(
        (e) => {
          if (e.record.channel !== active) return;
          if (e.action === 'create') setAll((m) => [...m, e.record].slice(-300));
          if (e.action === 'update')
            setAll((m) => m.map((x) => (x.id === e.record.id ? { ...x, ...e.record } : x)));
          if (e.action === 'delete')
            setAll((m) => m.filter((x) => x.id !== e.record.id && x.parent !== e.record.id));
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
  }, [all, active]);

  const { roots, childrenOf } = useMemo(() => {
    const childrenOf = {};
    for (const m of all) {
      if (!m.parent) continue;
      (childrenOf[m.parent] = childrenOf[m.parent] || []).push(m);
    }
    const roots = all.filter((m) => !m.parent);
    return { roots, childrenOf };
  }, [all]);

  const send = async (e, files = []) => {
    if (e) e.preventDefault();
    const content = text.trim();
    if ((!content && !files.length) || !active || busy) return;
    setBusy(true);
    setError('');
    try {
      const mentioned = [];
      if (content) {
        const re = /@([\w.-]+)/g;
        let mt;
        while ((mt = re.exec(content))) {
          const hit = users.find((u) => u.username === mt[1] || (u.name && u.username === mt[1]));
          if (hit && hit.id !== me.id && !mentioned.includes(hit.id)) mentioned.push(hit.id);
        }
      }
      const form = new FormData();
      form.append('channel', active);
      form.append('user', me.id);
      if (content) form.append('content', content);
      if (replyTo) form.append('parent', replyTo);
      if (mentioned.length) for (const id of mentioned) form.append('mentions', id);
      for (const f of files) {
        const c = await compressImage(f);
        form.append('attachments', c);
      }
      await pb.collection('messages').create(form);
      setText('');
      setReplyTo(null);
    } catch (ex) {
      setError(ex.message || String(ex));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onFiles = async (el) => {
    const files = Array.from(el.files || []);
    if (!files.length) return;
    await send(null, files);
  };

  const addReaction = async (msgId, emoji) => {
    try {
      const r = await fetch(`${API_URL}/api/house/messages/${msgId}/reaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token },
        body: JSON.stringify({ emoji }),
      });
      if (r.ok) {
        const j = await r.json();
        setAll((m) => m.map((x) => (x.id === msgId ? { ...x, reactions: j.reactions } : x)));
      }
    } catch {}
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 14 }}>
      <div className="card" style={{ padding: 6, maxHeight: '76vh', overflow: 'auto' }}>
        {channels.map((c) => (
          <button
            key={c.id}
            className={`btn small ${active === c.id ? '' : 'ghost'}`}
            style={{ width: '100%', margin: 2, textAlign: 'left' }}
            onClick={() => setActive(c.id)}
          >
            {c.icon || '#'} {c.name}
          </button>
        ))}
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '76vh' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px' }}>
          {!active ? (
            <div className="muted" style={{ textAlign: 'center', marginTop: 40 }}>
              Pick a channel to start chatting
            </div>
          ) : (
            <>
              {roots.map((m) => (
                <Message
                  key={m.id}
                  m={m}
                  me={me}
                  childrenOf={childrenOf}
                  expanded={expanded}
                  setExpanded={setExpanded}
                  onReply={setReplyTo}
                  onReact={addReaction}
                  onEdited={setAll}
                />
              ))}
            </>
          )}
          <div ref={endRef} />
        </div>
        {error && <div className="error">{error}</div>}
        {replyTo && (
          <div className="muted" style={{ fontSize: 12, padding: '4px 8px', background: 'var(--panel2)', borderRadius: 6 }}>
            Replying to #{channels.find((c) => c.id === active)?.name}
            <button className="btn small ghost" style={{ marginLeft: 8 }} onClick={() => setReplyTo(null)}>
              ✕
            </button>
          </div>
        )}
        <form className="row" onSubmit={(e) => send(e)} style={{ marginTop: 8 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={active ? 'Message…' : 'Select a channel'}
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
            onClick={() => fileRef.current?.click()}
          >
            +
          </button>
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => onFiles(e.target)} />
        </form>
      </div>
    </div>
  );
}

function Message({ m, me, childrenOf, expanded, setExpanded, onReply, onReact, onEdited }) {
  const mine = m.expand?.user?.id === me?.id;
  const time = m.created ? new Date(m.created).toLocaleTimeString() : '';
  const kids = (childrenOf[m.id] || []).sort((a, b) => (a.created < b.created ? -1 : 1));
  const isOpen = !!expanded[m.id];
  const attachmentFiles = m.attachments || [];

  const toggleOpen = () => setExpanded((x) => ({ ...x, [m.id]: !x[m.id] }));

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
        <div
          style={{
            maxWidth: '72%',
            background: mine ? 'var(--accent)' : 'var(--panel2)',
            borderRadius: 12,
            borderBottomRightRadius: mine ? 2 : 12,
            borderBottomLeftRadius: mine ? 12 : 2,
            padding: '7px 12px',
            color: mine ? '#fff' : undefined,
          }}
        >
          {!mine && (
            <div
              className="muted"
              style={{ fontSize: 12, cursor: 'pointer' }}
              onClick={() => openProfile(m.expand?.user?.id)}
            >
              {m.expand?.user?.username || m.expand?.user?.name || m.expand?.user?.email || '—'} · {time}
            </div>
          )}
          {m.parent && (
            <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>
              ↪ reply
            </div>
          )}
          {m.content && (
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderInline(m.content)}</div>
          )}
          {attachmentFiles.map((f) =>
            isImage(f) ? (
              <a key={f} href={fileUrl('messages', m.id, f)} target="_blank" rel="noreferrer">
                <img
                  src={fileUrl('messages', m.id, f)}
                  alt={f}
                  style={{ maxWidth: 240, maxHeight: 180, borderRadius: 8, marginTop: 4, display: 'block' }}
                />
              </a>
            ) : (
              <div key={f}>
                <a href={fileUrl('messages', m.id, f)} target="_blank" rel="noreferrer">
                  📎 {f}
                </a>
              </div>
            )
          )}
          {Object.keys(m.reactions || {}).length > 0 && (
            <div className="row" style={{ marginTop: 5, flexWrap: 'wrap' }}>
              {Object.keys(m.reactions).map((em) => {
                const who = m.reactions[em];
                const on = who && who.includes(me?.id);
                return (
                  <button
                    key={em}
                    className={`btn small react ${on ? 'on' : ''}`}
                    onClick={() => onReact(m.id, em)}
                  >
                    {em} {who.length}
                  </button>
                );
              })}
            </div>
          )}
          <div className="row" style={{ marginTop: 4, gap: 2, flexWrap: 'wrap' }}>
            <button className="btn micro ghost" onClick={() => onReply(m.id)}>
              ↪ Reply
            </button>
            <button className="btn micro ghost" onClick={() => onReact(m.id, '👍')}>
              👍
            </button>
            {mine && !m.is_edited && new Date() - new Date(m.created) < 15 * 60000 && (
              <EditableText m={m} onEdited={onEdited} />
            )}
            {mine && (
              <button
                className="btn micro ghost"
                onClick={async () => {
                  if (confirm('Delete this message?')) {
                    await pb.collection('messages').delete(m.id).catch(() => {});
                    onEdited((x) => x.filter((r) => r.id !== m.id && r.parent !== m.id));
                  }
                }}
              >
                🗑
              </button>
            )}
          </div>
          {mine ? (
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{time}{m.is_edited ? ' · edited' : ''}</div>
          ) : (
            m.is_edited && <div className="muted" style={{ fontSize: 10 }}>edited</div>
          )}
        </div>
      </div>
      {kids.length > 0 && (
        <div style={{ margin: '4px 0 0 24px', borderLeft: '2px solid var(--border)', paddingLeft: 10 }}>
          {isOpen ? (
            kids.map((k) => (
              <Message
                key={k.id}
                m={k}
                me={me}
                childrenOf={childrenOf}
                expanded={expanded}
                setExpanded={setExpanded}
                onReply={onReply}
                onReact={onReact}
                onEdited={onEdited}
              />
            ))
          ) : (
            <button className="btn micro ghost" onClick={toggleOpen}>
              {kids.length} repl{kids.length > 1 ? 'ies' : 'y'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EditableText({ m, onEdited }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(m.content || '');
  if (!edit) {
    return (
      <button
        className="btn micro ghost"
        onClick={() => {
          setVal(m.content || '');
          setEdit(true);
        }}
      >
        ✎
      </button>
    );
  }
  return (
    <span className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
      <input value={val} onChange={(e) => setVal(e.target.value)} style={{ width: 180, fontSize: 12 }} />
      <button
        className="btn micro"
        onClick={async () => {
          await pb
            .collection('messages')
            .update(m.id, { content: val, is_edited: true })
            .then((u) => onEdited((x) => x.map((r) => (r.id === m.id ? { ...r, ...u } : r))));
          setEdit(false);
        }}
      >
        ✓
      </button>
      <button className="btn micro ghost" onClick={() => setEdit(false)}>
        ✕
      </button>
    </span>
  );
}

function isImage(name) {
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name);
}

function renderInline(s) {
  if (!s) return '';
  const out = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(([^)]+)\)|https?:\/\/[^\s]+)/g;
  let last = 0;
  let m;
  let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const tok = m[0];
    if (tok[0] === '`') out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('**')) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('*')) out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    else if (tok[0] === '[') {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok);
      if (mm && /^https?:\/\//i.test(mm[2]))
        out.push(
          <a key={k} href={mm[2]} target="_blank" rel="noreferrer">
            {mm[1]}
          </a>
        );
      else out.push(tok);
    } else
      out.push(
        <a key={k} href={tok} target="_blank" rel="noreferrer">
          {tok}
        </a>
      );
    k++;
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out.map((chunk, i) => (
    <React.Fragment key={i}>
      {chunk}
      {'\n'.repeat(0)}
    </React.Fragment>
  ));
}