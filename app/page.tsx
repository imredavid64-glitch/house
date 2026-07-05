"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function Gate() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'ITS_SHIBES*64!') {
      // Grant access and route to the auth/login page
      localStorage.setItem('house_access', 'granted');
      router.push('/auth');
    } else {
      setError('Incorrect password. Access denied.');
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-zinc-950">
      <form 
        onSubmit={handleEntry} 
        className="flex flex-col gap-6 p-10 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-sm items-center text-center"
      >
        {/* Placeholder for your cool neon house logo */}
        <div className="w-16 h-16 border-2 border-cyan-400 rounded-lg flex items-center justify-center mb-2">
          <span className="text-cyan-400 text-2xl font-bold">H</span>
        </div>
        
        <h1 className="text-zinc-50 text-2xl font-semibold tracking-tight">
          Enter House
        </h1>
        
        <div className="w-full">
          <input 
            type="password" 
            placeholder="Universal Password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-3 rounded-lg bg-zinc-800 text-zinc-50 border border-zinc-700 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all"
          />
        </div>

        <button 
          type="submit" 
          className="w-full bg-zinc-50 text-zinc-950 font-semibold p-3 rounded-lg hover:bg-zinc-200 transition-colors"
        >
          Unlock
        </button>

        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      </form>
    </div>
  );
}
