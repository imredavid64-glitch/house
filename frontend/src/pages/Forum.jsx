import React, { useEffect, useState, useCallback } from 'react';
import { pb, fileUrl, API_URL, api } from '../lib/pb.js';
import { compressFiles } from '../lib/compress.js';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const POST_TYPES = [
  { value: 'text', label: '📝 Text' },
  { value: 'media', label: '🖼️ Media' },
  { value: 'poll', label: '📊 Poll' },
  { value: 'link', label: '🔗 Link' },
];

export default function Forum() {
  const me = pb.authStore.model;
  const [spaces, setSpaces] = useState([]);
  const [space, setSpace] = useState(null);
  const [posts, setPosts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [sort, setSort] = useState('hot');
  const [title, setTitle] = useState('');
  const [bodyTxt, setBodyTxt] = useState('');
  const [postType, setPostType] = useState('text');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollDuration, setPollDuration] = useState('24h');
  const [linkUrl, setLinkUrl] = useState('');
  const [mediaFiles, setMediaFiles] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);

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
    let sortField = '-created';
    if (sort === 'hot') sortField = '-score';
    else if (sort === 'top') sortField = '-upvotes';
    else if (sort === 'new') sortField = '-created';
    else if (sort === 'controversial') sortField = '-comment_count';

    pb.collection('posts')
      .getList(1, 100, {
        filter: `space = "${space}" && is_deleted = false`,
        sort: sortField,
        expand: 'space,user',
      })
      .then((r) => setPosts(r.items || []))
      .catch((e) => setError(e.message));
  }, [space, sort]);

  const createPost = useCallback(async (e) => {
    e.preventDefault();
    if (!space) return;
    setBusy(true);
    setError('');
    try {
      const data = {
        space,
        user: me.id,
        title: title.trim(),
        type: postType,
      };

      if (postType === 'text') {
        data.content = bodyTxt.trim();
      } else if (postType === 'link') {
        data.url = linkUrl.trim();
        data.content = bodyTxt.trim();
      } else if (postType === 'poll') {
        data.content = bodyTxt.trim();
        const validOptions = pollOptions.filter(o => o.trim()).map(o => ({ text: o.trim(), vote_count: 0 }));
        if (validOptions.length < 2) throw new Error('Polls need at least 2 options');
        data.poll_options = JSON.stringify(validOptions);
        data.poll_ends_at = getPollEndDate(pollDuration);
      } else if (postType === 'media') {
        data.content = bodyTxt.trim();
      }

      let createdPost;
      if (postType === 'media' && mediaFiles.length > 0) {
        const { files: compressedFiles } = await compressFiles(mediaFiles);
        const form = new FormData();
        form.append('space', space);
        form.append('user', me.id);
        form.append('title', title.trim());
        form.append('type', 'media');
        form.append('content', bodyTxt.trim());
        for (const f of compressedFiles) form.append('media', f);
        createdPost = await pb.collection('posts').create(form);
      } else {
        createdPost = await pb.collection('posts').create(data);
      }

      setTitle('');
      setBodyTxt('');
      setPollOptions(['', '']);
      setLinkUrl('');
      setMediaFiles([]);
      setPosts((ps) => [createdPost, ...ps]);
    } catch (ex) {
      setError(ex.message || String(ex));
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  }, [space, me.id, title, bodyTxt, postType, pollOptions, pollDuration, linkUrl, mediaFiles]);

  const getPollEndDate = (duration) => {
    const now = new Date();
    switch (duration) {
      case '1h': return new Date(now.getTime() + 3600000).toISOString();
      case '24h': return new Date(now.getTime() + 86400000).toISOString();
      case '3d': return new Date(now.getTime() + 3 * 86400000).toISOString();
      case '1w': return new Date(now.getTime() + 7 * 86400000).toISOString();
      default: return null;
    }
  };

  const renderContent = useCallback((content) => {
    if (!content) return null;
    const html = DOMPurify.sanitize(marked.parse(content));
    return <div dangerouslySetInnerHTML={{ __html: html }} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} />;
  }, []);

  const isImage = (filename) => /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(filename);
  const isVideo = (filename) => /\.(mp4|webm|mov|avi)$/i.test(filename);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 14, height: 'calc(100vh - 80px)' }}>
      <div className="card" style={{ padding: 6, maxHeight: '100%', overflow: 'auto' }}>
        {spaces.map((s) => (
          <button
            key={s.id}
            className={`btn small ${space === s.id ? '' : 'ghost'}`}
            style={{ width: '100%', margin: 2, textAlign: 'left' }}
            onClick={() => { setSpace(s.id); setSelected(null); }}
          >
            {s.icon || ''} {s.name}
          </button>
        ))}
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {!selected ? (
          <>
            <div className="row between" style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>{space ? 'Posts' : 'Pick a space to browse or post'}</h3>
              {space && (
                <select value={sort} onChange={e => setSort(e.target.value)} className="btn small ghost" style={{ padding: '6px 10px' }}>
                  <option value="hot">Hot</option>
                  <option value="new">New</option>
                  <option value="top">Top</option>
                  <option value="controversial">Controversial</option>
                </select>
              )}
            </div>
            {space && (
              <form onSubmit={createPost} style={{ marginBottom: 14 }}>
                <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  {POST_TYPES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      className={`btn small ${postType === t.value ? '' : 'ghost'}`}
                      onClick={() => setPostType(t.value)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <input
                  placeholder="Title"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                {postType === 'link' && (
                  <input
                    placeholder="URL (https://...)"
                    type="url"
                    required
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    style={{ marginBottom: 8 }}
                  />
                )}
                <textarea
                  rows={3}
                  placeholder={postType === 'poll' ? 'Poll question / description…' : 'Body…'}
                  value={bodyTxt}
                  onChange={(e) => setBodyTxt(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                {postType === 'poll' && (
                  <div style={{ marginBottom: 8 }}>
                    <div className="muted" style={{ marginBottom: 6 }}>Options (min 2, max 6)</div>
                    {pollOptions.map((opt, i) => (
                      <div key={i} className="row" style={{ gap: 8, marginBottom: 4 }}>
                        <input
                          value={opt}
                          onChange={(e) => {
                            const arr = [...pollOptions];
                            arr[i] = e.target.value;
                            setPollOptions(arr);
                          }}
                          placeholder={`Option ${i + 1}`}
                          style={{ flex: 1 }}
                        />
                        {pollOptions.length > 2 && (
                          <button type="button" className="btn small danger" onClick={() => setPollOptions(pollOptions.filter((_, idx) => idx !== i))}>✕</button>
                        )}
                      </div>
                    ))}
                    {pollOptions.length < 6 && (
                      <button type="button" className="btn small ghost" onClick={() => setPollOptions([...pollOptions, ''])}>+ Add Option</button>
                    )}
                    <select value={pollDuration} onChange={e => setPollDuration(e.target.value)} style={{ marginTop: 8, width: '100%' }}>
                      <option value="1h">Ends in 1 hour</option>
                      <option value="24h">Ends in 24 hours</option>
                      <option value="3d">Ends in 3 days</option>
                      <option value="1w">Ends in 1 week</option>
                    </select>
                  </div>
                )}
                {postType === 'media' && (
                  <div style={{ marginBottom: 8 }}>
                    <label className="btn small ghost" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      📎 Attach images/videos
                      <input type="file" multiple hidden accept="image/*,video/*" onChange={e => {
                        const files = Array.from(e.target.files || []);
                        if (files.length) {
                          setUploadProgress({ loaded: 0, total: files.length });
                          setMediaFiles(files);
                        }
                      }} />
                    </label>
                    {mediaFiles.length > 0 && (
                      <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                        {mediaFiles.length} file(s) selected
                      </div>
                    )}
                  </div>
                )}
                {uploadProgress && (
                  <div className="row" style={{ marginBottom: 8, fontSize: 12, color: 'var(--accent)' }}>
                    Preparing {uploadProgress.loaded}/{uploadProgress.total} files…
                  </div>
                )}
                {error && <div className="error">{error}</div>}
                <button className="btn small" type="submit" disabled={busy} style={{ width: '100%' }}>
                  {busy ? 'Posting…' : 'Post'}
                </button>
              </form>
            )}
            {posts.map((p) => (
              <PostCard key={p.id} p={p} onClick={() => setSelected(p)} renderContent={renderContent} fileUrl={fileUrl} isImage={isImage} isVideo={isVideo} />
            ))}
          </>
        ) : (
          <PostDetail
            post={selected}
            onBack={() => setSelected(null)}
            me={me}
            renderContent={renderContent}
            fileUrl={fileUrl}
            fmtBytes={(n) => {
              if (!n) return '0 B';
              const u = ['B', 'KB', 'MB', 'GB'];
              let i = 0;
              while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
              return n.toFixed(1) + ' ' + u[i];
            }}
            API_URL={API_URL}
            isImage={isImage}
            isVideo={isVideo}
          />
        )}
      </div>
    </div>
  );
}

function PostCard({ p, onClick, renderContent, fileUrl, isImage, isVideo }) {
  const score = (p.upvotes || 0) - (p.downvotes || 0);
  const media = p.media || [];
  const hasMedia = media.length > 0;
  const firstImage = media.find(isImage);
  const firstVideo = media.find(isVideo);

  return (
    <div
      className="card"
      style={{ marginBottom: 10, background: 'var(--panel2)', cursor: 'pointer', position: 'relative' }}
      onClick={onClick}
    >
      <div className="row between">
        <strong style={{ maxWidth: '70%' }}>{p.title || '(no title)'}</strong>
        <span className="muted">▲ {score}</span>
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        {p.expand?.space?.name || '—'} · {p.expand?.user?.name || p.expand?.user?.email || '—'} ·{' '}
        {new Date(p.created || Date.now()).toLocaleDateString()}
      </div>
      {p.flair && (
        <span style={{ display: 'inline-block', marginTop: 4, padding: '2px 6px', background: p.expand?.space?.color || 'var(--accent)', borderRadius: 4, fontSize: 11 }}>
          {p.flair}
        </span>
      )}
      {p.type === 'poll' && p.poll_options && (
        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          📊 Poll · {JSON.parse(p.poll_options).length} options · {p.poll_ends_at ? `Ends ${new Date(p.poll_ends_at).toLocaleDateString()}` : 'No deadline'}
        </div>
      )}
      {p.type === 'link' && p.url && (
        <a href={p.url} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 12, wordBreak: 'break-all' }}>
          🔗 {new URL(p.url).hostname}
        </a>
      )}
      {hasMedia && (
        <div style={{ marginTop: 8 }}>
          {firstImage && (
            <img src={fileUrl('posts', p.id, firstImage)} alt="" style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 8, objectFit: 'cover' }} loading="lazy" />
          )}
          {firstVideo && !firstImage && (
            <video src={fileUrl('posts', p.id, firstVideo)} muted style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 8 }} />
          )}
          {media.length > 1 && (
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>+{media.length - 1} more</div>
          )}
        </div>
      )}
      {p.content && !hasMedia && (
        <div className="muted" style={{ marginTop: 6, whiteSpace: 'pre-wrap', fontSize: 13 }}>
          {p.content.slice(0, 160)}
        </div>
      )}
      <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
        {p.comment_count || 0} comments
      </div>
    </div>
  );
}

function PostDetail({ post, onBack, me, renderContent, fileUrl, fmtBytes, API_URL, isImage, isVideo }) {
  const [comments, setComments] = useState([]);
  const [txt, setTxt] = useState('');
  const [score, setScore] = useState((post.upvotes || 0) - (post.downvotes || 0));
  const [error, setError] = useState('');
  const [userVotes, setUserVotes] = useState({ posts: {}, comments: {} });
  const [pollVote, setPollVote] = useState(null);
  const [showReplies, setShowReplies] = useState({});

  useEffect(() => {
    api('/api/house/user/votes')
      .then((v) => setUserVotes({ posts: v.posts || {}, comments: v.comments || {} }))
      .catch(() => {});
  }, [me.id]);

  useEffect(() => {
    const loadComments = async () => {
      const res = await pb.collection('comments')
        .getList(1, 200, { filter: `post = "${post.id}"`, sort: 'created', expand: 'user,parent' })
        .catch(() => ({ items: [] }));
      setComments(res.items || []);
    };
    loadComments();

    let sub;
    pb.collection('comments')
      .subscribe((e) => {
        if (e.record.post !== post.id) return;
        if (e.action === 'create') setComments(cs => [...cs, e.record]);
        if (e.action === 'update') setComments(cs => cs.map(x => x.id === e.record.id ? e.record : x));
        if (e.action === 'delete') setComments(cs => cs.filter(x => x.id !== e.record.id));
      }, { expand: 'user,parent' })
      .then(t => sub = t)
      .catch(() => {});
    return () => { if (sub) pb.collection('comments').unsubscribe(sub); };
  }, [post.id]);

  const vote = useCallback(async () => {
    const currentVote = userVotes.posts[post.id] || 0;
    const next = currentVote === 1 ? 0 : 1;
    setScore((s) => s + (next === 1 ? 1 : -1));
    setError('');
    try {
      const result = await api(`/api/house/posts/${post.id}/vote`, {
        method: 'POST',
        body: JSON.stringify({ value: next }),
      });
      setScore(result.score);
      setUserVotes((uv) => ({ ...uv, posts: { ...uv.posts, [post.id]: result.userVote } }));
    } catch (ex) {
      setError(ex.message || String(ex));
      setScore((s) => s + (currentVote === 1 ? -1 : 1));
    }
  }, [post.id, userVotes.posts[post.id]]);

  const voteComment = useCallback(async (commentId, value) => {
    const currentVote = userVotes.comments[commentId] || 0;
    const next = currentVote === value ? 0 : value;
    setError('');
    try {
      const result = await api(`/api/house/comments/${commentId}/vote`, {
        method: 'POST',
        body: JSON.stringify({ value: next }),
      });
      setUserVotes((uv) => ({ ...uv, comments: { ...uv.comments, [commentId]: result.userVote } }));
    } catch (ex) {
      setError(ex.message || String(ex));
    }
  }, []);

  const votePoll = useCallback(async (optionIndex) => {
    if (pollVote !== null) return;
    setError('');
    try {
      await pb.collection('posts').update(post.id, { poll_voted: true });
      setPollVote(optionIndex);
      // Note: backend would need poll voting endpoint, for now just local
    } catch (ex) {
      setError(ex.message || String(ex));
    }
  }, [post.id, pollVote]);

  const addComment = useCallback(async (e, parentId = null) => {
    e.preventDefault();
    if (!txt.trim()) return;
    const content = txt;
    setTxt('');
    setError('');
    try {
      await pb.collection('comments').create({
        post: post.id,
        user: me.id,
        content,
        parent: parentId,
        depth: parentId ? 1 : 0,
      });
    } catch (ex) {
      setError(ex.message || String(ex));
      setTxt(content);
    }
  }, [post.id, me.id, txt]);

  const media = post.media || [];
  const images = media.filter(isImage);
  const videos = media.filter(isVideo);

  return (
    <>
      <button className="btn small ghost" onClick={onBack} style={{ marginBottom: 12 }}>← Back</button>
      <h3 style={{ margin: '10px 0 6px' }}>{post.title || '(no title)'}</h3>
      <div className="muted" style={{ marginBottom: 8 }}>
        {post.expand?.space?.name && (
          <span style={{ background: post.expand.space.color || 'var(--accent)', padding: '2px 8px', borderRadius: 4, fontSize: 11, marginRight: 8 }}>
            {post.expand.space.icon || ''} {post.expand.space.name}
          </span>
        )}
        {post.flair && (
          <span style={{ background: post.expand?.space?.color || 'var(--accent)', padding: '2px 8px', borderRadius: 4, fontSize: 11, marginRight: 8 }}>
            {post.flair}
          </span>
        )}
        {post.expand?.user?.name || post.expand?.user?.email || '—'} ·{' '}
        {new Date(post.created || Date.now()).toLocaleString()}
      </div>

      {post.type === 'link' && post.url && (
        <a href={post.url} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: 12, padding: 12, background: 'var(--panel2)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{post.url}</div>
          <div className="muted" style={{ fontSize: 13 }}>🔗 {new URL(post.url).hostname}</div>
        </a>
      )}

      {images.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginBottom: 12 }}>
          {images.map((img) => (
            <a key={img} href={fileUrl('posts', post.id, img)} target="_blank" rel="noreferrer">
              <img src={fileUrl('posts', post.id, img)} alt="" style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 8 }} loading="lazy" />
            </a>
          ))}
        </div>
      )}

      {videos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8, marginBottom: 12 }}>
          {videos.map((vid) => (
            <video key={vid} src={fileUrl('posts', post.id, vid)} controls style={{ width: '100%', borderRadius: 8 }} />
          ))}
        </div>
      )}

      <div style={{ whiteSpace: 'pre-wrap', margin: '12px 0', lineHeight: 1.6 }}>{renderContent(post.content)}</div>

      {post.type === 'poll' && post.poll_options && (
        <div className="card" style={{ marginBottom: 16, padding: 12, background: 'var(--panel2)' }}>
          <div className="muted" style={{ marginBottom: 8, fontSize: 12 }}>
            {post.poll_ends_at ? `Ends ${new Date(post.poll_ends_at).toLocaleString()}` : 'No deadline'} · {pollVote !== null ? 'You voted' : 'Click to vote'}
          </div>
          {JSON.parse(post.poll_options).map((opt, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <button
                className="btn small"
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: pollVote === i ? 'var(--accent)' : 'var(--panel)',
                  color: pollVote === i ? '#fff' : 'inherit',
                }}
                onClick={() => votePoll(i)}
                disabled={pollVote !== null}
              >
                <div className="row between">
                  <span>{opt.text}</span>
                  <span>{opt.vote_count || 0} votes</span>
                </div>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="row" style={{ marginBottom: 12, alignItems: 'center', gap: 12 }}>
        <button
          className={`btn small ${userVotes.posts[post.id] === 1 ? '' : 'ghost'}`}
          onClick={vote}
          style={{ color: userVotes.posts[post.id] === 1 ? 'var(--accent)' : undefined }}
        >
          ▲
        </button>
        <strong style={{ minWidth: 40, textAlign: 'center' }}>{score}</strong>
        <button className="btn small ghost" style={{ marginLeft: 'auto' }}>Share</button>
        <button className="btn small ghost">Save</button>
        <button className="btn small ghost">🏆 Award</button>
      </div>

      {error && <div className="error">{error}</div>}
      <hr style={{ borderColor: 'var(--border)', margin: '14px 0' }} />

      <div style={{ marginBottom: 10 }}>
        <h4 style={{ marginBottom: 8 }}>Comments ({comments.filter(c => !c.parent).length})</h4>
        <form onSubmit={addComment} className="row" style={{ marginBottom: 16 }}>
          <input
            value={txt}
            onChange={(e) => setTxt(e.target.value)}
            placeholder="Add a comment…"
            style={{ flex: 1 }}
          />
          <button className="btn small">Post</button>
        </form>
        {comments.filter(c => !c.parent).map((c) => (
          <CommentThread key={c.id} comment={c} allComments={comments} me={me} userVotes={userVotes.comments} onVote={voteComment} onReply={addComment} showReplies={showReplies} setShowReplies={setShowReplies} renderContent={renderContent} depth={0} />
        ))}
      </div>
    </>
  );
}

function CommentThread({ comment, allComments, me, userVotes, onVote, onReply, showReplies, setShowReplies, renderContent, depth }) {
  const myVote = userVotes[comment.id] || 0;
  const score = (comment.upvotes || 0) - (comment.downvotes || 0);
  const replies = allComments.filter(c => c.parent === comment.id);
  const isExpanded = showReplies[comment.id];

  const toggleReplies = () => {
    setShowReplies(prev => ({ ...prev, [comment.id]: !prev[comment.id] }));
  };

  if (depth > 2) return null; // Limit nesting display to 3 levels

  return (
    <div style={{ marginLeft: depth * 24, marginBottom: 8 }}>
      <div className="card" style={{ background: depth === 0 ? 'var(--panel2)' : 'var(--panel)', borderLeft: depth > 0 ? '2px solid var(--border)' : 'none', padding: 12 }}>
        <div className="row" style={{ gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <button
            className={`btn small ${myVote === 1 ? '' : 'ghost'}`}
            onClick={() => onVote(comment.id, 1)}
            style={{ padding: '4px 8px', color: myVote === 1 ? 'var(--accent)' : undefined }}
          >
            ▲
          </button>
          <strong style={{ marginRight: 8 }}>{score}</strong>
          <div className="muted" style={{ fontSize: 12 }}>
            {comment.expand?.user?.name || comment.expand?.user?.email || '—'} ·{' '}
            {new Date(comment.created || Date.now()).toLocaleString()}
          </div>
        </div>
        <div style={{ whiteSpace: 'pre-wrap', marginLeft: 28 }}>{renderContent(comment.content)}</div>
        <div className="row" style={{ marginTop: 8, gap: 8 }}>
          {replies.length > 0 && (
            <button className="btn small ghost" onClick={toggleReplies} style={{ fontSize: 11 }}>
              {isExpanded ? '▼' : '▶'} {replies.length} repl{replies.length === 1 ? 'y' : 'ies'}
            </button>
          )}
          <button className="btn small ghost" onClick={() => { setTxt => {}; }} style={{ fontSize: 11 }}>Reply</button>
        </div>
        {isExpanded && replies.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {replies.map(r => (
              <CommentThread key={r.id} comment={r} allComments={allComments} me={me} userVotes={userVotes} onVote={onVote} onReply={onReply} showReplies={showReplies} setShowReplies={setShowReplies} renderContent={renderContent} depth={depth + 1} />
            ))}
            <form onSubmit={e => onReply(e, comment.id)} className="row" style={{ marginTop: 8, gap: 8 }}>
              <input placeholder="Write a reply…" style={{ flex: 1 }} />
              <button className="btn small" type="submit">Reply</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function Comment({ c, me, userVotes, onVote }) {
  const myVote = userVotes[c.id] || 0;
  const score = (c.upvotes || 0) - (c.downvotes || 0);
  return (
    <div className="card" style={{ marginBottom: 8, background: 'var(--panel2)' }}>
      <div className="row" style={{ gap: 8, marginBottom: 4 }}>
        <button
          className={`btn small ${myVote === 1 ? '' : 'ghost'}`}
          onClick={() => onVote(c.id, 1)}
          style={{ padding: '4px 8px', color: myVote === 1 ? 'var(--accent)' : undefined }}
        >
          ▲
        </button>
        <strong style={{ marginRight: 8 }}>{score}</strong>
        <div className="muted">
          {c.expand?.user?.name || c.expand?.user?.email || '—'} ·{' '}
          {new Date(c.created || Date.now()).toLocaleString()}
        </div>
      </div>
      <div style={{ whiteSpace: 'pre-wrap' }}>{c.content}</div>
    </div>
  );
}

export { API_URL };