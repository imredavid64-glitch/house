import React, { useEffect, useMemo, useRef, useState } from 'react';
import { pb, fileUrl, API_URL } from '../lib/pb.js';
import { compressImage } from '../lib/compress.js';
import { openProfile } from '../lib/nav.js';

const TYPES = ['text', 'link', 'media', 'poll'];

export default function Forum() {
  const me = pb.authStore.model;
  const [spaces, setSpaces] = useState([]);
  const [space, setSpace] = useState(null);
  const [posts, setPosts] = useState([]);
  const [sel, setSel] = useState(null);
  const [title, setTitle] = useState('');
  const [bodyTxt, setBodyTxt] = useState('');
  const [url, setUrl] = useState('');
  const [postType, setPostType] = useState('text');
  const [flair, setFlair] = useState('');
  const [pollOpts, setPollOpts] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    pb.collection('spaces').getFullList({ sort: 'name' }).then(setSpaces).catch(() => {});
    const m = /^#\/forum\/post\/(.+)/.exec(window.location.hash);
    if (m) {
      pb.collection('posts')
        .getOne(m[1], { expand: 'space,user' })
        .then((p) => { setSel(p); setSpace(p.space); })
        .catch(() => {});
      history.replaceState(null, '', '#/forum');
    }
  }, []);

  useEffect(() => {
    if (!space) { setPosts([]); return; }
    pb.collection('posts')
      .getList(1, 100, { filter: `space = "${space}"`, sort: '-created', expand: 'space,user' })
      .then((r) => setPosts(r.items || []))
      .catch((e) => setError(e.message));
  }, [space]);

  const spObj = useMemo(() => spaces.find((s) => s.id === space), [spaces, space]);
  const flairs = useMemo(() => {
    if (!spObj || !spObj.flairs) return [];
    const f = spObj.flairs;
    return Array.isArray(f) ? f : (typeof f === 'string' ? JSON.parse(f || '[]') : []);
  }, [spObj]);

  const createPost = async (e) => {
    e.preventDefault();
    if (!space || !title.trim()) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('space', space);
      form.append('user', me.id);
      form.append('title', title.trim());
      form.append('type', postType);
      if (bodyTxt.trim()) form.append('content', bodyTxt.trim());
      if (postType === 'link' && url.trim()) form.append('url', url.trim());
      if (flair) form.append('flair', flair);
      const files = fileRef.current?.files ? Array.from(fileRef.current.files) : [];
      for (const f of files) { const c = await compressImage(f); form.append('media', c); }
      if (postType === 'poll' && pollOpts.trim()) {
        const opts = pollOpts.split('\n').map((l) => l.trim()).filter(Boolean);
        if (opts.length >= 2) {
          const pRes = await fetch(`${API_URL}/api/house/posts/_pending`, { method: 'POST' });
          form.append('_type', 'poll');
        }
      }
      const p = await pb.collection('posts').create(form);
      if (postType === 'poll' && pollOpts.trim()) {
        const opts = pollOpts.split('\n').map((l) => l.trim()).filter(Boolean);
        await fetch(`${API_URL}/api/house/posts/${p.id}/poll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token },
          body: JSON.stringify({ options: opts }),
        });
      }
      setTitle(''); setBodyTxt(''); setUrl(''); setFlair(''); setPollOpts('');
      if (fileRef.current) fileRef.current.value = '';
      setPostType('text');
      setPosts((ps) => [{ ...p, expand: { space: spObj, user: me } }, ...ps]);
    } catch (ex) {
      setError(ex.message || String(ex));
    } finally { setBusy(false); }
  };

  const refreshPosts = () => {
    if (!space) return;
    pb.collection('posts').getList(1, 100, { filter: `space = "${space}"`, sort: '-created', expand: 'space,user' })
      .then((r) => setPosts(r.items || []));
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 14 }}>
      <div className="card" style={{ padding: 6, maxHeight: '76vh', overflow: 'auto' }}>
        {spaces.map((s) => (
          <button key={s.id} className={`btn small ${space === s.id ? '' : 'ghost'}`}
            style={{ width: '100%', margin: 2, textAlign: 'left' }}
            onClick={() => { setSpace(s.id); setSel(null); }}>
            {s.icon || ''} {s.name}
          </button>
        ))}
      </div>
      <div className="card" style={{ overflow: 'auto', maxHeight: '76vh' }}>
        {error && <div className="error">{error}</div>}
        {!sel ? (
          <>
            <h3 style={{ marginBottom: 12 }}>{space ? 'Posts' : 'Pick a space'}</h3>
            {space && (
              <form onSubmit={createPost} className="card" style={{ marginBottom: 14, background: 'var(--panel2)' }}>
                <input placeholder="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
                <div className="row" style={{ margin: '6px 0', gap: 6 }}>
                  {TYPES.map((t) => (
                    <button key={t} type="button" className={`btn small ${postType === t ? '' : 'ghost'}`}
                      onClick={() => setPostType(t)}>
                      {t}
                    </button>
                  ))}
                </div>
                {postType === 'link' && (
                  <input placeholder="URL" value={url} onChange={(e) => setUrl(e.target.value)} />
                )}
                {postType === 'poll' && (
                  <textarea rows={3} placeholder="Poll options (one per line)" value={pollOpts}
                    onChange={(e) => setPollOpts(e.target.value)} style={{ marginBottom: 8 }} />
                )}
                <textarea rows={3} placeholder="Content…" value={bodyTxt} onChange={(e) => setBodyTxt(e.target.value)}
                  style={{ marginBottom: 8 }} />
                {flairs.length > 0 && (
                  <div className="row" style={{ marginBottom: 8, gap: 4, flexWrap: 'wrap' }}>
                    {flairs.map((f) => (
                      <button key={f} type="button" className={`btn tiny ${flair === f ? '' : 'ghost'}`}
                        onClick={() => setFlair(flair === f ? '' : f)}>
                        {f}
                      </button>
                    ))}
                  </div>
                )}
                <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                  <button className="btn small" disabled={busy}>Post</button>
                  <button type="button" className="btn small ghost" onClick={() => fileRef.current?.click()}>📎</button>
                  <input ref={fileRef} type="file" multiple accept="image/*" hidden onChange={(e) => {}} />
                </div>
              </form>
            )}
            {posts.map((p) => (
              <PostCard key={p.id} p={p} me={me} onClick={() => setSel(p)} />
            ))}
          </>
        ) : (
          <PostDetail post={sel} me={me} onBack={() => setSel(null)} onVote={refreshPosts} />
        )}
      </div>
    </div>
  );
}

function PostCard({ p, me, onClick }) {
  const score = (p.upvotes || 0) - (p.downvotes || 0);
  const isLink = p.type === 'link';
  const isMedia = p.type === 'media';
  const mediaFiles = p.media || [];
  return (
    <div className="card" style={{ marginBottom: 10, background: 'var(--panel2)', cursor: 'pointer' }}
      onClick={onClick}>
      <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
        <div style={{ textAlign: 'center', minWidth: 36 }}>
          <span style={{ fontSize: 18 }}>▲</span>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{score}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 15 }}>{p.title || '(untitled)'}</strong>
            {p.flair && <span className="badge tiny">{p.flair}</span>}
            {isLink && <span className="badge tiny">🔗</span>}
            {isMedia && <span className="badge tiny">🖼</span>}
            {p.type === 'poll' && <span className="badge tiny">📊</span>}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {p.expand?.space?.name || ''} · {p.expand?.user?.username || p.expand?.user?.email || '—'} ·{' '}
            {new Date(p.created || Date.now()).toLocaleDateString()}
          </div>
          {p.content && (
            <div className="muted" style={{ marginTop: 4, whiteSpace: 'pre-wrap', fontSize: 13 }}>
              {p.content.slice(0, 180)}
            </div>
          )}
          {isLink && p.url && (
            <a href={p.url} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 12 }}
              onClick={(e) => e.stopPropagation()}>
              🔗 {p.url.length > 60 ? p.url.slice(0, 60) + '…' : p.url}
            </a>
          )}
          {isMedia && mediaFiles.length > 0 && (
            <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {mediaFiles.slice(0, 3).map((f) => (
                <img key={f} src={fileUrl('posts', p.id, f)} alt={f}
                  style={{ width: 80, height: 60, borderRadius: 6, objectFit: 'cover' }} />
              ))}
            </div>
          )}
          <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
            {p.comment_count || 0} comments
          </div>
        </div>
      </div>
    </div>
  );
}

function PostDetail({ post, me, onBack, onVote }) {
  const [post2, setPost2] = useState(post);
  const [comments, setComments] = useState([]);
  const [txt, setTxt] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [error, setError] = useState('');
  const [poll, setPoll] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pb.collection('comments')
      .getList(1, 300, { filter: `post = "${post.id}"`, sort: 'created', expand: 'user,parent' })
      .then((r) => setComments(r.items || []))
      .catch(() => {});
    if (post.type === 'poll') {
      fetch(`${API_URL}/api/house/posts/${post.id}/poll`, {
        headers: { Authorization: pb.authStore.token },
      }).then((r) => r.json()).then((j) => setPoll(j.poll)).catch(() => {});
    }
  }, [post.id]);

  const vote = async (val) => {
    try {
      const r = await fetch(`${API_URL}/api/house/posts/${post2.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token },
        body: JSON.stringify({ value: val }),
      });
      if (r.ok) {
        const j = await r.json();
        setPost2((p) => ({ ...p, upvotes: j.upvotes, downvotes: j.downvotes }));
      }
    } catch {}
  };

  const votePoll = async (optIdx) => {
    try {
      const r = await fetch(`${API_URL}/api/house/posts/${post2.id}/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token },
        body: JSON.stringify({ option_index: optIdx }),
      });
      if (r.ok) {
        const j = await r.json();
        setPoll(j.poll);
      }
    } catch {}
  };

  const addComment = async (e) => {
    e.preventDefault();
    if (!txt.trim()) return;
    setBusy(true);
    setError('');
    try {
      const body2 = { post: post2.id, user: me.id, content: txt.trim() };
      if (replyTo) body2.parent = replyTo.id;
      const c = await pb.collection('comments').create(body2, { expand: 'user' });
      setComments((cs) => [...cs, c]);
      setTxt('');
      setReplyTo(null);
    } catch (ex) { setError(ex.message || String(ex)); }
    finally { setBusy(false); }
  };

  const myScore = (post2.upvotes || 0) - (post2.downvotes || 0);
  const mediaFiles = post2.media || [];

  const childMap = useMemo(() => {
    const m = {};
    for (const c of comments) {
      const pid = c.parent || null;
      if (pid) (m[pid] = m[pid] || []).push(c);
      else (m._root = m._root || []).push(c);
    }
    return m;
  }, [comments]);

  return (
    <div>
      <button className="btn small ghost" onClick={onBack}>← Back</button>
      <div className="row" style={{ gap: 8, alignItems: 'center', margin: '10px 0 6px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>{post2.title || '(untitled)'}</h3>
        {post2.flair && <span className="badge">{post2.flair}</span>}
        {post2.type === 'link' && <span className="badge tiny">🔗 link</span>}
        {post2.type === 'media' && <span className="badge tiny">🖼 media</span>}
        {post2.type === 'poll' && <span className="badge tiny">📊 poll</span>}
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        {post2.expand?.user?.username || post2.expand?.user?.email || '—'} ·{' '}
        {new Date(post2.created || Date.now()).toLocaleString()}
      </div>
      {post2.content && (
        <div style={{ whiteSpace: 'pre-wrap', margin: '10px 0' }}>{post2.content}</div>
      )}
      {post2.type === 'link' && post2.url && (
        <div><a href={post2.url} target="_blank" rel="noreferrer">🔗 {post2.url}</a></div>
      )}
      {post2.type === 'media' && mediaFiles.length > 0 && (
        <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {mediaFiles.map((f) => (
            <a key={f} href={fileUrl('posts', post2.id, f)} target="_blank" rel="noreferrer">
              <img src={fileUrl('posts', post2.id, f)} alt={f}
                style={{ maxWidth: 300, maxHeight: 220, borderRadius: 8 }} />
            </a>
          ))}
        </div>
      )}
      {poll && (
        <div className="card" style={{ marginTop: 10, background: 'var(--panel2)' }}>
          <h4 style={{ marginBottom: 8 }}>📊 Poll {poll.total > 0 && <span className="muted">({poll.total} votes)</span>}</h4>
          {poll.options.map((opt, i) => {
            const pct = poll.total > 0 ? Math.round((poll.counts[i] / poll.total) * 100) : 0;
            const chosen = poll.chosen === i;
            return (
              <div key={i} style={{ marginBottom: 6 }}>
                <button className={`btn small ${chosen ? '' : 'ghost'}`}
                  style={{ width: '100%', textAlign: 'left', position: 'relative' }}
                  onClick={() => votePoll(i)}>
                  <span style={{ position: 'relative', zIndex: 1 }}>
                    {opt} — {poll.counts[i]} ({pct}%)
                  </span>
                </button>
                <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', marginTop: 2 }}>
                  <div style={{ height: '100%', width: pct + '%', borderRadius: 2,
                    background: chosen ? 'var(--accent)' : 'var(--text)', opacity: 0.3 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="row" style={{ gap: 8, margin: '12px 0', alignItems: 'center' }}>
        <button className="btn small ghost" onClick={() => vote(1)}>▲</button>
        <strong>{myScore}</strong>
        <button className="btn small ghost" onClick={() => vote(-1)}>▼</button>
      </div>
      {error && <div className="error">{error}</div>}
      {replyTo && (
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
          Replying to {replyTo.expand?.user?.username || 'comment'}
          <button className="btn tiny ghost" style={{ marginLeft: 6 }} onClick={() => setReplyTo(null)}>✕</button>
        </div>
      )}
      <form onSubmit={addComment} className="row" style={{ marginBottom: 12 }}>
        <input value={txt} onChange={(e) => setTxt(e.target.value)}
          placeholder={replyTo ? 'Reply…' : 'Comment…'} style={{ flex: 1 }} />
        <button className="btn small" disabled={busy}>Post</button>
      </form>
      <h4 style={{ marginBottom: 8 }}>Comments ({comments.length})</h4>
      {(childMap._root || []).map((c) => (
        <CommentThread key={c.id} c={c} me={me} childMap={childMap} depth={0}
          onReply={setReplyTo} postId={post2.id} />
      ))}
    </div>
  );
}

function CommentThread({ c, me, childMap, depth, onReply, postId }) {
  const kids = childMap[c.id] || [];
  const [voteScore, setVoteScore] = useState((c.upvotes || 0) - (c.downvotes || 0));
  const [myVal, setMyVal] = useState(0);
  const [expanded, setExpanded] = useState(depth < 2);
  const vote = async (val) => {
    try {
      const r = await fetch(`${API_URL}/api/house/comments/${c.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: pb.authStore.token },
        body: JSON.stringify({ value: val }),
      });
      if (r.ok) {
        const j = await r.json();
        setVoteScore(j.upvotes - j.downvotes);
        setMyVal(j.my);
      }
    } catch {}
  };
  const del = async () => {
    if (!confirm('Delete this comment?')) return;
    await pb.collection('comments').delete(c.id).catch(() => {});
  };
  return (
    <div style={{ marginLeft: depth > 0 ? 20 : 0, marginBottom: 8, borderLeft: depth > 0 ? '2px solid var(--border)' : undefined, paddingLeft: depth > 0 ? 10 : 0 }}>
      <div className="card" style={{ background: 'var(--panel2)', padding: 8 }}>
        <div className="muted" style={{ fontSize: 12 }}>
          {c.expand?.user?.username || c.expand?.user?.email || '—'} ·{' '}
          {new Date(c.created || Date.now()).toLocaleString()}
        </div>
        <div style={{ whiteSpace: 'pre-wrap', margin: '4px 0' }}>{c.content}</div>
        <div className="row" style={{ gap: 4, fontSize: 12 }}>
          <button className="btn tiny ghost" onClick={() => vote(1)}
            style={{ color: myVal > 0 ? 'var(--accent)' : undefined }}>▲</button>
          <span>{voteScore}</span>
          <button className="btn tiny ghost" onClick={() => vote(-1)}
            style={{ color: myVal < 0 ? '#f44' : undefined }}>▼</button>
          <button className="btn tiny ghost" onClick={() => onReply(c)}>↩ Reply</button>
          {c.user === me.id && <button className="btn tiny ghost" onClick={del}>🗑</button>}
        </div>
      </div>
      {kids.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {!expanded ? (
            <button className="btn tiny ghost" onClick={() => setExpanded(true)}>
              {kids.length} repl{kids.length > 1 ? 'ies' : 'y'}
            </button>
          ) : (
            kids.map((k) => (
              <CommentThread key={k.id} c={k} me={me} childMap={childMap} depth={depth + 1}
                onReply={onReply} postId={postId} />
            ))
          )}
        </div>
      )}
    </div>
  );
}