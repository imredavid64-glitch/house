"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState(''); // Added for username support
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();

  // Security gate check
  useEffect(() => {
    const access = localStorage.getItem('house_access');
    if (access !== 'granted') {
      router.push('/');
    }
  }, [router]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    if (isLogin) {
      // LOG IN
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message);
      } else {
        router.push('/dashboard');
      }
    } else {
      // SIGN UP
      const { data, error } = await supabase.auth.signUp({ email, password });
      
      if (error) {
        setMessage(error.message);
      } else if (data.user) {
        // Create the profile record so we have a username to display
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([{ id: data.user.id, username: username }]);

        if (profileError) {
          setMessage('Account created, but profile setup failed: ' + profileError.message);
        } else {
          setMessage('Account created! You can now log in.');
          setIsLogin(true); // Switch to login view
        }
      }
    }
    setLoading(false);
  };

  return (
    <div className="flex h-screen items-center justify-center bg-zinc-950">
      <form 
        onSubmit={handleAuth} 
        className="flex flex-col gap-4 p-8 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-sm"
      >
        <h1 className="text-zinc-50 text-2xl font-bold text-center mb-4">
          {isLogin ? 'Welcome Back' : 'Join House'}
        </h1>
        
        <input 
          type="email" 
          placeholder="Email" 
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full p-3 rounded-lg bg-zinc-800 text-zinc-50 border border-zinc-700"
        />

        {!isLogin && (
          <input 
            type="text" 
            placeholder="Choose a username" 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full p-3 rounded-lg bg-zinc-800 text-zinc-50 border border-zinc-700"
          />
        )}
        
        <input 
          type="password" 
          placeholder="Password" 
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full p-3 rounded-lg bg-zinc-800 text-zinc-50 border border-zinc-700"
        />

        <button 
          type="submit" 
          disabled={loading}
          className="w-full bg-cyan-500 text-zinc-950 font-bold p-3 rounded-lg hover:bg-cyan-400 transition-colors"
        >
          {loading ? 'Processing...' : (isLogin ? 'Log In' : 'Sign Up')}
        </button>

        {message && <p className="text-sm text-center text-red-400">{message}</p>}

        <button 
          type="button" 
          onClick={() => setIsLogin(!isLogin)} 
          className="text-cyan-400 text-sm hover:underline mt-2"
        >
          {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
        </button>
      </form>
    </div>
  );
}
