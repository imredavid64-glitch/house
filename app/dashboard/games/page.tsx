"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function GameBoard() {
  const [games, setGames] = useState<any[]>([]);
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
    // Join with profiles to get usernames
    const { data: g } = await supabase.from('game_lends').select('*, profiles(username)');
    const { data: c } = await supabase.from('comments').select('*, profiles(username)').eq('resource_type', 'game');
    if (g) setGames(g);
    if (c) setComments(c);
  };

  const toggleGameStatus = async (game: any) => {
    const newStatus = game.status === 'available' ? 'borrowed' : 'available';
    const borrower = newStatus === 'borrowed' ? currentUser.id : null;
    await supabase.from('game_lends').update({ status: newStatus, borrower_id: borrower }).eq('id', game.id);
    fetchData();
  };

  const addComment = async (gameId: string, text: string) => {
    await supabase.from('comments').insert({ resource_id: gameId, resource_type: 'game', content: text, user_id: currentUser.id });
    fetchData();
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Game Board</h1>
      {games.map(game => (
        <div key={game.id} className="bg-zinc-900 p-6 rounded-xl mb-4 border border-zinc-800">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-xl">{game.game_title}</h2>
            <button 
              onClick={() => toggleGameStatus(game)}
              className={`px-4 py-2 rounded font-bold ${game.status === 'available' ? 'bg-green-600' : 'bg-red-600'}`}
            >
              {game.status === 'available' ? 'Borrow' : 'Return'}
            </button>
          </div>
          
          <div className="space-y-2 mt-4 border-t border-zinc-800 pt-4">
            {comments.filter(c => c.resource_id === game.id).map(c => (
              <p key={c.id} className="text-sm"><span className="font-bold text-cyan-400">{c.profiles?.username || 'User'}: </span>{c.content}</p>
            ))}
            <input className="bg-zinc-800 p-2 rounded w-full mt-2" placeholder="Comment..." onKeyDown={(e) => { if (e.key === 'Enter') addComment(game.id, e.currentTarget.value); }} />
          </div>
        </div>
      ))}
    </div>
  );
}
