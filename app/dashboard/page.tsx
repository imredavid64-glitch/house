"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Post { id: string; user_id: string; image_url: string | null; caption: string; }
interface Comment { id: string; post_id: string; content: string; user_id: string; }

export default function DashboardHome() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
      fetchPosts();
      fetchComments();
    };
    init();
  }, []);

  const fetchPosts = async () => {
    const { data } = await supabase.from('posts').select('*').order('created_at', { ascending: false });
    if (data) setPosts(data);
  };

  const fetchComments = async () => {
    const { data } = await supabase.from('comments').select('*');
    if (data) setComments(data);
  };

  const handleAddComment = async (postId: string) => {
    if (!newComment.trim()) return;
    await supabase.from('comments').insert([{ post_id: postId, content: newComment, user_id: currentUser.id }]);
    setNewComment('');
    fetchComments();
  };

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 flex flex-col gap-8">
      {posts.map((post) => (
        <div key={post.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-6">
          {post.image_url && <img src={post.image_url} className="w-full h-auto" />}
          <div className="p-4">
            <p className="text-sm font-bold mb-4">{post.caption}</p>
            
            {/* Comment List */}
            <div className="space-y-2 mb-4">
              {comments.filter(c => c.post_id === post.id).map(c => (
                <p key={c.id} className="text-xs text-zinc-400 bg-zinc-800 p-2 rounded">{c.content}</p>
              ))}
            </div>

            {/* Comment Input */}
            <div className="flex gap-2">
              <input 
                className="flex-1 bg-zinc-800 p-2 rounded text-sm"
                placeholder="Write a response..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
              />
              <button onClick={() => handleAddComment(post.id)} className="text-cyan-400 text-sm">Post</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
