import React, { useEffect, useRef, useState, useCallback } from 'react';
import { pb, fileUrl, fmtBytes, API_URL, api } from '../lib/pb.js';
import { compressFiles } from '../lib/compress.js';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🔥', '💀', '🥊', '🎮', '🤔'];

export default function Chat() {
  const [channels, setChannels] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [threadMessage, setThreadMessage] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const endRef = useRef(null);
  const emojiPickerRef = useRef(null);
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
          filter: `channel = "${active}" && parent = null`,
          sort: 'created',
          expand: 'user',
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
          if (e.record.parent) {
            // Thread reply - handled in thread view
            return;
          }
          if (e.action === 'create') setMessages((m) => [...m, e.record].slice(-300));
          if (e.action === 'update') setMessages((m) => m.map((x) => (x.id === e.record.id ? e.record : x)));
          if (e.action === 'delete') setMessages((m) => m.filter((x) => x.id !== e.record.id));
        },
        { expand: 'user', filter: 'parent = null' }
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

  const send = useCallback(async (e, files = []) => {
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
  }, [text, active, me.id]);

  const onFiles = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    setUploadProgress({ loaded: 0, total: files.length });
    setError('');
    try {
      const { files: compressedFiles, savedPct } = await compressFiles(files);
      setUploadProgress({ loaded: files.length, total: files.length, savedPct });
      const form = new FormData();
      form.append('channel', active);
      form.append('user', me.id);
      for (const f of compressedFiles) form.append('attachments', f);
      await pb.collection('messages').create(form);
    } catch (ex) {
      setError(ex.message || String(ex));
    } finally {
      setBusy(false);
      setTimeout(() => setUploadProgress(null), 1500);
      e.target.value = '';
    }
  }, [active, me.id]);

  const toggleReaction = async (messageId, emoji) => {
    try {
      const m = messages.find(x => x.id === messageId) ||
        (threadMessage && threadMessage.id === messageId ? threadMessage : null);
      if (!m) return;

      const reactions = m.reactions || {};
      const users = reactions[emoji] || [];
      const hasReacted = users.includes(me.id);
      const nextUsers = hasReacted ? users.filter(u => u !== me.id) : [...users, me.id];

      await pb.collection('messages').update(messageId, {
        reactions: { ...reactions, [emoji]: nextUsers },
      });

      if (!hasReacted) {
        setMessages(ms => ms.map(x => x.id === messageId ? { ...x, reactions: { ...reactions, [emoji]: nextUsers } } : x));
        if (threadMessage && threadMessage.id === messageId) {
          setThreadMessage(t => ({ ...t, reactions: { ...reactions, [emoji]: nextUsers } }));
        }
      } else {
        setMessages(ms => ms.map(x => x.id === messageId ? { ...x, reactions: { ...reactions, [emoji]: nextUsers } } : x));
        if (threadMessage && threadMessage.id === messageId) {
          setThreadMessage(t => ({ ...t, reactions: { ...reactions, [emoji]: nextUsers } }));
        }
      }
    } catch (e) {
      console.error('Reaction failed:', e);
    }
  };

  const openThread = async (message) => {
    setThreadMessage(message);
    try {
      const res = await pb.collection('messages')
        .getList(1, 100, { filter: `parent = "${message.id}"`, sort: 'created', expand: 'user' });
      setThreadMessages(res.items || []);
    } catch (e) {
      setThreadMessages([]);
    }

    let sub;
    pb.collection('messages')
      .subscribe((e) => {
        if (e.record.parent !== message.id) return;
        if (e.action === 'create') setThreadMessages(ms => [...ms, e.record]);
        if (e.action === 'delete') setThreadMessages(ms => ms.filter(x => x.id !== e.record.id));
      }, { expand: 'user' })
      .then(t => sub = t)
      .catch(() => {});
    return () => { if (sub) pb.collection('messages').unsubscribe(sub); };
  };

  const sendThreadReply = async (e) => {
    e.preventDefault();
    if (!threadMessage || !text.trim()) return;
    setBusy(true);
    try {
      await pb.collection('messages').create({
        channel: active,
        user: me.id,
        content: text.trim(),
        parent: threadMessage.id,
      });
      setText('');
    } catch (ex) {
      setError(ex.message || String(ex));
    } finally {
      setBusy(false);
    }
  };

  const closeThread = () => {
    setThreadMessage(null);
    setThreadMessages([]);
  };

  const renderContent = (content) => {
    if (!content) return null;
    const html = DOMPurify.sanitize(marked.parse(content));
    return <div dangerouslySetInnerHTML={{ __html: html }} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} />;
  };

  const isImage = (filename) => /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(filename);
  const isVideo = (filename) => /\.(mp4|webm|mov|avi)$/i.test(filename);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 14, height: 'calc(100vh - 80px)' }}>
      <div className="card" style={{ padding: 6, maxHeight: '100%', overflow: 'auto' }}>
        {channels.map((c) => (
          <button
            key={c.id}
            className={`btn small ${active === c.id ? '' : 'ghost'}`}
            style={{ width: '100%', margin: 2, textAlign: 'left' }}
            onClick={() => { setActive(c.id); closeThread(); }}
          >
            # {c.icon || ''} {c.name}
          </button>
        ))}
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {threadMessage ? (
          <ThreadView
            threadMessage={threadMessage}
            threadMessages={threadMessages}
            onClose={closeThread}
            onSend={sendThreadReply}
            text={text}
            setText={setText}
            busy={busy}
            me={me}
            active={active}
            renderContent={renderContent}
            fileUrl={fileUrl}
            fmtBytes={fmtBytes}
            API_URL={API_URL}
            toggleReaction={toggleReaction}
          />
        ) : (
          <>
            <div style={{ flex: 1, overflow: 'auto', paddingBottom: 10 }}>
              {!active ? (
                <div className="muted" style={{ textAlign: 'center', marginTop: 40 }}>
                  Pick a channel to start chatting
                </div>
              ) : (
                messages.map((m, i) => (
                  <Message
                    key={m.id || i}
                    m={m}
                    me={me}
                    renderContent={renderContent}
                    fileUrl={fileUrl}
                    fmtBytes={fmtBytes}
                    API_URL={API_URL}
                    onThreadClick={openThread}
                    onReaction={toggleReaction}
                    isImage={isImage}
                    isVideo={isVideo}
                  />
                ))
              )}
              <div ref={endRef} />
            </div>
            {uploadProgress && (
              <div className="row" style={{ marginBottom: 8, fontSize: 12, color: 'var(--accent)' }}>
                Uploading {uploadProgress.loaded}/{uploadProgress.total}
                {uploadProgress.savedPct && <span> · {uploadProgress.savedPct}% saved</span>}
              </div>
            )}
            {error && <div className="error">{error}</div>}
            <form className="row" onSubmit={send} style={{ marginTop: 8, gap: 8 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={active ? `Message #${channels.find(c => c.id === active)?.name || ''}…` : 'Select a channel'}
                  disabled={!active || busy}
                  style={{ flex: 1, paddingRight: 40 }}
                />
                <button
                  type="button"
                  className="btn ghost"
                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', padding: '4px 8px' }}
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                >
                  😀
                </button>
                {showEmojiPicker && (
                  <div
                    ref={emojiPickerRef}
                    style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: 0,
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: 8,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 4,
                      zIndex: 50,
                      maxWidth: 280,
                    }}
                  >
                    {REACTION_EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => { setText(text + ' ' + emoji + ' '); setShowEmojiPicker(false); }}
                        style={{ fontSize: 20, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="btn" disabled={!active || busy} style={{ whiteSpace: 'nowrap' }}>
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
          </>
        )}
      </div>
    </div>
  );
}

function Message({ m, me, renderContent, fileUrl, fmtBytes, API_URL, onThreadClick, onReaction, isImage, isVideo }) {
  const mine = m.expand?.user?.id === me?.id;
  const files = m.attachments || [];
  const time = m.created ? new Date(m.created).toLocaleTimeString() : '';
  const reactions = m.reactions || {};
  const hasReactions = Object.keys(reactions).length > 0;
  const replyCount = m.reply_count || 0;

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
          maxWidth: '75%',
          color: mine ? '#fff' : undefined,
          textAlign: 'left',
          position: 'relative',
        }}
      >
        {!mine && (
          <div className="muted" style={{ fontSize: 12, color: mine ? undefined : 'var(--muted)', marginBottom: 2 }}>
            {m.expand?.user?.name || m.expand?.user?.email || '—'} · {time}
          </div>
        )}
        {m.content && <div>{renderContent(m.content)}</div>}
        {files.length > 0 &&
          files.map((f) => (
            <div key={f} style={{ marginTop: 6 }}>
              {isImage(f) ? (
                <a href={fileUrl('messages', m.id, f)} target="_blank" rel="noreferrer">
                  <img
                    src={fileUrl('messages', m.id, f)}
                    alt={f}
                    style={{ maxWidth: 280, maxHeight: 200, borderRadius: 8, display: 'block' }}
                    loading="lazy"
                  />
                </a>
              ) : isVideo(f) ? (
                <video src={fileUrl('messages', m.id, f)} controls style={{ maxWidth: 280, maxHeight: 200, borderRadius: 8 }} />
              ) : (
                <a href={fileUrl('messages', m.id, f)} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, textDecoration: 'none', color: 'inherit' }}>
                  <span>📎</span>
                  <span>{f}</span>
                  <span className="muted" style={{ fontSize: 11 }}>({fmtBytes(m.attachment_sizes?.[f] || 0)})</span>
                </a>
              )}
            </div>
          ))}
        {(hasReactions || replyCount > 0) && (
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            {Object.entries(reactions).map(([emoji, users]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onReaction(m.id, emoji)}
                style={{
                  fontSize: 14,
                  background: users.includes(me?.id) ? 'rgba(255,255,255,0.2)' : 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '2px 8px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {emoji} <span style={{ fontSize: 11 }}>{users.length}</span>
              </button>
            ))}
            {replyCount > 0 && (
              <button
                type="button"
                onClick={() => onThreadClick(m)}
                className="btn small ghost"
                style={{ padding: '2px 8px', fontSize: 11 }}
              >
                💬 {replyCount}
              </button>
            )}
          </div>
        )}
        {mine && (
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{time}</div>
        )}
      </div>
    </div>
  );
}

function ThreadView({ threadMessage, threadMessages, onClose, onSend, text, setText, busy, me, active, renderContent, fileUrl, fmtBytes, API_URL, toggleReaction }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="row between" style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
        <button className="btn small ghost" onClick={onClose}>← Back to channel</button>
        <strong>Thread ({threadMessages.length})</strong>
        <div style={{ width: 80 }} />
      </div>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 10 }}>
        <div style={{ marginBottom: 12, padding: 10, background: 'var(--panel)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            {threadMessage.expand?.user?.name || threadMessage.expand?.user?.email || '—'} · {new Date(threadMessage.created).toLocaleTimeString()}
          </div>
          <div>{renderContent(threadMessage.content)}</div>
        </div>
        {threadMessages.map((m, i) => (
          <Message
            key={m.id || i}
            m={m}
            me={me}
            renderContent={renderContent}
            fileUrl={fileUrl}
            fmtBytes={fmtBytes}
            API_URL={API_URL}
            onThreadClick={() => {}}
            onReaction={toggleReaction}
            isImage={(f) => /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(f)}
            isVideo={(f) => /\.(mp4|webm|mov|avi)$/i.test(f)}
          />
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={onSend} className="row" style={{ marginTop: 8, gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Reply in thread…"
          disabled={busy}
          style={{ flex: 1 }}
        />
        <button className="btn" disabled={busy} type="submit">Reply</button>
      </form>
    </div>
  );
}

export { fmtBytes, API_URL };