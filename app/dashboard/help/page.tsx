"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function HelpBoard() {
  const [help, setHelp] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
      fetchData();
    };
    init();
  }, []);

  const fetchData = async () => {
    const { data: h } = await supabase.from('help_requests').select('*, profiles(username)');
    const { data: c } = await supabase.from('comments').select('*, profiles(username)').eq('resource_type', 'help');
    if (h) setHelp(h);
    if (c) setComments(c);
  };

  const completeTask = async (id: string) => {
    await supabase.from('help_requests').update({ is_resolved: true }).eq('id', id);
    fetchData();
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Help Needed</h1>
      {help.filter(h => !h.is_resolved).map(h => (
        <div key={h.id} className="bg-zinc-900 p-6 rounded-xl mb-4 border border-zinc-800">
          <h2 className="font-bold text-xl">{h.title}</h2>
          <p className="text-zinc-400 mb-4">{h.description}</p>
          <button onClick={() => completeTask(h.id)} className="bg-green-600 px-4 py-2 rounded">Complete Task</button>
          
          <div className="mt-4 border-t border-zinc-800 pt-4">
            {comments.filter(c => c.resource_id === h.id).map(c => (
              <p key={c.id} className="text-sm"><span className="font-bold text-cyan-400">{c.profiles?.username || 'User'}: </span>{c.content}</p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
