"use client";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth');
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-50">
      {/* Sidebar - Reddit Style */}
      <aside className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col justify-between p-4 hidden md:flex">
        <div>
          <div className="flex items-center gap-3 mb-8 px-2">
            <div className="w-10 h-10 border-2 border-cyan-400 rounded-lg flex items-center justify-center">
              <span className="text-cyan-400 text-xl font-bold">H</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight">House</h1>
          </div>
          
          <nav className="flex flex-col gap-2">
            <Link href="/dashboard" className="p-3 rounded-lg hover:bg-zinc-800 transition">
              Home Feed
            </Link>
            <Link href="/dashboard/games" className="p-3 rounded-lg hover:bg-zinc-800 transition">
              Game Board
            </Link>
            <Link href="/dashboard/help" className="p-3 rounded-lg hover:bg-zinc-800 transition">
              Help Needed
            </Link>
          </nav>
        </div>

        <button 
          onClick={handleLogout}
          className="p-3 text-left rounded-lg text-red-400 hover:bg-zinc-800 transition"
        >
          Log Out
        </button>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
