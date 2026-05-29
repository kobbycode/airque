'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import { getHomeRoute, hasRole, useAuthState } from '@/lib/auth';

export default function StationDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { appUser, loading } = useAuthState();

  useEffect(() => {
    if (!loading && !hasRole(appUser, ['creator', 'admin'])) {
      router.push('/login');
    }
  }, [loading, appUser, router]);

  if (loading) {
    return (
      <div className="min-h-screen cosmic-nebula-bg flex items-center justify-center text-primary">
        <div className="flex items-center gap-3 bg-black/60 px-6 py-4 rounded-2xl border border-primary/30 shadow-[0_0_20px_rgba(230,194,128,0.2)]">
          <span className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
          <span className="font-body-md text-white font-bold tracking-widest">Entering Studio...</span>
        </div>
      </div>
    );
  }

  if (!hasRole(appUser, ['creator', 'admin'])) {
    return null;
  }

  const displayName = appUser
    ? `${appUser.firstName || 'Station'} ${appUser.lastName || 'Manager'}`.trim()
    : 'Broadcaster';

  const linkClass = (path: string) => {
    const active = pathname === path;
    const base = 'flex items-center gap-4 p-4 rounded-xl transition-all duration-200 group';
    return active
      ? `${base} bg-primary/10 border-l-2 border-primary text-primary font-bold shadow-[inset_4px_0_10px_rgba(230,194,128,0.05)]`
      : `${base} text-white/50 hover:bg-white/5 hover:text-white`;
  };

  return (
    <div className="flex min-h-screen cosmic-nebula-bg text-white">
      <aside className="fixed left-0 top-0 h-full w-[280px] modern-glass-dark border-r border-white/5 flex flex-col p-4 gap-6 z-50 rounded-none shadow-[10px_0_30px_rgba(0,0,0,0.5)]">


        <div className="px-4">
          <div className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 rounded-xl shadow-inner backdrop-blur-md">
            <div className="w-10 h-10 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-sm">
              {displayName.substring(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-label-md text-white font-bold truncate tracking-wide">{displayName}</p>
              <p className="font-body-sm text-[10px] text-primary uppercase tracking-widest truncate">
                {appUser?.role === 'admin' ? 'Platform Admin' : 'Creator Studio'}
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 flex flex-col gap-1 px-4 overflow-y-auto custom-scrollbar">
          <p className="font-label-md text-[10px] uppercase tracking-widest text-white/40 px-4 mb-2">Studio</p>
          <Link className={linkClass('/station-dashboard')} href="/station-dashboard" prefetch={false}>
            <span className="material-symbols-outlined transition-transform group-hover:scale-110">radio</span>
            <span className="font-label-md">My Stations</span>
          </Link>
          <Link className={linkClass('/station-dashboard/requests')} href="/station-dashboard/requests" prefetch={false}>
            <span className="material-symbols-outlined transition-transform group-hover:scale-110">queue_music</span>
            <span className="font-label-md flex-1">Song Requests</span>
          </Link>
          <p className="font-label-md text-[10px] uppercase tracking-widest text-white/40 px-4 mt-4 mb-2">Listen</p>
          <Link className={linkClass('/listener-directory')} href="/listener-directory" prefetch={false}>
            <span className="material-symbols-outlined transition-transform group-hover:scale-110">headphones</span>
            <span className="font-label-md">Listener Directory</span>
          </Link>
          {appUser?.role === 'admin' && (
            <>
              <p className="font-label-md text-[10px] uppercase tracking-widest text-white/40 px-4 mt-4 mb-2">Platform</p>
              <Link className={linkClass('/admin')} href="/admin" prefetch={false}>
                <span className="material-symbols-outlined transition-transform group-hover:scale-110">dashboard</span>
                <span className="font-label-md">Admin Console</span>
              </Link>
            </>
          )}
        </nav>

        <div className="px-4 pb-6">
          <Link
            href={appUser ? getHomeRoute(appUser.role) : '/listener-directory'}
            prefetch={false}
            className="flex items-center gap-4 p-4 text-white/50 hover:bg-white/5 hover:text-white rounded-xl transition-all"
          >
            <span className="material-symbols-outlined">home</span>
            <span className="font-label-md">Back to App</span>
          </Link>
        </div>
      </aside>

      <main className="ml-[280px] h-screen flex flex-col flex-1">
        <Header variant="creator" />
        {children}
      </main>
    </div>
  );
}
