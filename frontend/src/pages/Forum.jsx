import React, { useEffect, useState } from 'react';
import { pb, fileUrl, API_URL } from '../lib/pb.js';

export default function Forum() {
  const me = pb.authStore.model;
  const [spaces, setSpaces] = useState([]);
  const [space, setSpace] = useState(null);
  const [posts, setPosts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [title, setTitle] = useState('');
  const [bodyTxt, setBodyTxt] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    pb.collection('spaces')
      .getFullList({ sort: 'name' })
      .then(setSpaces)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!space) {
      setPosts([]);
      return;
    }
    pb.collection('posts')
      .getList(1, 100, {
        filter: `space = "${space}"`,
        sort: '-created',
        expand: 'space,user',
      })
      .then((r) => setPosts(r.items || []))
      .catch((e) => setError(e.message));
  }, [space]);

  const createPost = async (e) => {
    e.preventDefault();
    if (!space) return;
    setError('');
    try {
      const p = await pb.collection('posts').create({
        space,
        user: me.id,
        title,
        content: bodyTxt,
      });
      setTitle('');
      setBodyTxt('');
      setPosts((ps) => [p, ...ps]);
    } catch (ex) {
      setError(ex.message || String(ex));
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 14 }}>
      <div className="card" style={{ padding: 6, maxHeight: '70vh', overflow: 'auto' }}>
        {spaces.map((s) => (
          <button
            key={s.id}
            className={`btn small ${space === s.id ? '' : 'ghost'}`}
            style={{ width: '100%', margin: 2, textAlign: 'left' }}
            onClick={() => setSpace(s.id)}
          >
            {s.icon || ''} {s.name}
          </button>
        ))}
      </div>
      <div className="card">
        {!selected ? (
          <>
            <h3 style={{ marginBottom: 12 }}>
              {space ? 'Posts' : 'Pick a space to browse or post'}
            </h3>
            {space && (
              <form onSubmit={createPost} style={{ marginBottom: 14 }}>
                <input
                  placeholder="Title"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                <textarea
                  rows={2}
                  placeholder="Body…"
                  value={bodyTxt}
                  onChange={(e) => setBodyTxt(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                <button className="btn small">Post</button>
              </form>
            )}
            {error && <div className="error">{error}</div>}
            {posts.map((p) => (
              <PostCard key={p.id} p={p} onClick={() => setSelected(p)} />
            ))}
          </>
        ) : (
          <PostDetail post={selected} onBack={() => setSelected(null)} me={me} />
        )}
      </div>
    </div>
  );
}

function PostCard({ p, onClick }) {
  const score = (p.upvotes || 0) - (p.downvotes || 0);
  return (
    <div
      className="card"
      style={{ marginBottom: 10, background: 'var(--panel2)', cursor: 'pointer' }}
      onClick={onClick}
    >
      <div className="row between">
        <strong>{p.title || '(no title)'}</strong>
        <span className="muted">▲ {score}</span>
      </div>
      <div className="muted">
        {p.expand?.space?.name || '—'} · {p.expand?.user?.name || p.expand?.user?.email || '—'} ·{' '}
        {new Date(p.created || Date.now()).toLocaleDateString()}
      </div>
      {p.content && (
        <div className="muted" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>
          {p.content.slice(0, 160)}
        </div>
      )}
      <div className="muted" style={{ marginTop: 4 }}>
        {p.comment_count || 0} comments
      </div>
    </div>
  );
}

function PostDetail({ post, onBack, me }) {
  const [comments, setComments] = useState([]);
  const [txt, setTxt] = useState('');
  const [score, setScore] = useState((post.upvotes || 0) - (post.downvotes || 0));
  const [error, setError] = useState('');
  const [voteState, setVoteState] = useState(null);

  useEffect(() => {
    pb.collection('comments')
      .getList(1, 200, {
        filter: `post = "${post.id}"`,
        sort: 'created',
        expand: 'user,parent',
      })
      .then((r) => setComments(r.items || []))
      .catch(() => {});
  }, [post.id]);

  const vote = async () => {
    const next = voteState === 'up' ? 'reset' : 'up';
    const delta = next === 'up' ? 1 : voteState === 'up' ? -1 : 0;
    setVoteState(next);
    setScore((s) => s + delta);
    setError('');
    try {
      const existing = await pb
        .collection('posts')
        .getFullList({ filter: `id = "${post.id}"` });
      const p = existing[0];
      await pb.collection('posts').update(p.id, {
        upvotes: Math.max(0, (p.upvotes || 0) + (delta ? 1 : 0)),
        downvotes: p.downvotes || 0,
      });
    } catch (ex) {
      setError(ex.message || String(ex));
    }
  };

  const addComment = async (e) => {
    e.preventDefault();
    if (!txt.trim()) return;
    setError('');
    try {
      const c = await pb.collection('comments').create({
        post: post.id,
        user: me.id,
        content: txt,
      });
      setComments((cs) => [...cs, c]);
      setTxt('');
      await pb.collection('posts').update(post.id, {
        comment_count: (post.comment_count || 0) + 1,
      });
    } catch (ex) {
      setError(ex.message || String(ex));
    }
  };

  return (
    <>
      <button className="btn small ghost" onClick={onBack}>
        ← Back
      </button>
      <h3 style={{ margin: '10px 0 6px' }}>{post.title || '(no title)'}</h3>
      <div className="muted">
        {post.expand?.user?.name || post.expand?.user?.email || '—'} ·{' '}
        {new Date(post.created || Date.now()).toLocaleString()}
      </div>
      <div style={{ whiteSpace: 'pre-wrap', margin: '12px 0' }}>{post.content}</div>
      <div className="row">
        <button className="btn small" onClick={vote}>
          ▲
        </button>
        <strong>{score}</strong>
      </div>
      {error && <div className="error">{error}</div>}
      <hr style={{ borderColor: 'var(--border)', margin: '14px 0' }} />
      <h4 style={{ marginBottom: 8 }}>Comments ({comments.length})</h4>
      <form onSubmit={addComment} className="row" style={{ marginBottom: 10 }}>
        <input
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          placeholder="Add a comment…"
          style={{ flex: 1 }}
        />
        <button className="btn small">Post</button>
      </form>
      {comments.map((c) => (
        <Comment key={c.id} c={c} me={me} post={post} />
      ))}
    </>
  );
}

function Comment({ c, me }) {
  return (
    <div className="card" style={{ marginBottom: 8, background: 'var(--panel2)' }}>
      <div className="muted">
        {c.expand?.user?.name || c.expand?.user?.email || '—'} ·{' '}
        {new Date(c.created || Date.now()).toLocaleString()}
      </div>
      <div style={{ whiteSpace: 'pre-wrap' }}>{c.content}</div>
    </div>
  );
}

export { API_URL };