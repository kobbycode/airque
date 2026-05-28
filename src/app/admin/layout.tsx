'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from "@/components/Header";
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import AddStationModal from '@/components/AddStationModal';
import { hasRole, useAuthState } from '@/lib/auth';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [modalOpen, setModalOpen] = useState(false);
  const { appUser, loading } = useAuthState();

  useEffect(() => {
    if (loading || !appUser) return;
    if (appUser.role === 'creator') {
      router.push('/station-dashboard');
      return;
    }
    if (!hasRole(appUser, ['admin'])) {
      router.push('/login');
    }
  }, [loading, appUser, router]);

  if (loading) {
    return (
      <div className="min-h-screen cosmic-nebula-bg flex items-center justify-center text-cyan-400">
        <div className="flex items-center gap-3 bg-black/60 px-6 py-4 rounded-2xl border border-cyan-400/30 shadow-[0_0_20px_rgba(6,182,212,0.2)]">
          <span className="w-5 h-5 border-2 border-cyan-400/20 border-t-cyan-400 rounded-full animate-spin" />
          <span className="font-body-md text-white font-bold tracking-widest">Verifying Clearance...</span>
        </div>
      </div>
    );
  }

  if (!hasRole(appUser, ['admin'])) {
    return null;
  }

  const getLinkClass = (path: string) => {
    const isActive = path === '/admin' ? pathname === '/admin' : pathname.startsWith(path);
    const baseClass = "flex items-center gap-4 p-4 rounded-xl transition-all duration-200 group";
    return isActive
      ? `${baseClass} bg-cyan-400/10 border-l-2 border-cyan-400 text-cyan-400 font-bold shadow-[inset_4px_0_10px_rgba(6,182,212,0.1)]`
      : `${baseClass} text-white/50 hover:bg-white/5 hover:text-white`;
  };

  return (
    <div className="flex min-h-screen cosmic-nebula-bg text-white">
      <aside className="fixed left-0 top-0 h-full w-[280px] modern-glass-dark border-r border-white/5 flex flex-col p-4 gap-6 z-50 rounded-none shadow-[10px_0_30px_rgba(0,0,0,0.5)]">
        <div className="px-4 py-6">
          <Link href="/" prefetch={false} className="hover:scale-105 transition-transform flex justify-center">
            {/* AirCue Logo */}
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-xl bg-white flex items-center justify-center p-1.5 shadow-lg">
                <img src="/logo.png" alt="AirCue Logo" className="w-full h-full object-contain" />
              </div>
              <span className="font-display-lg text-[23px] font-black text-white tracking-tight leading-none">
                Air<span className="text-cyan-400">Cue</span>
              </span>
            </div>
          </Link>
        </div>
        <div className="flex flex-col gap-2 px-4">
          <div className="flex items-center gap-4 p-4 bg-white/5 border border-white/10 rounded-xl shadow-inner backdrop-blur-md">
            <div className="w-10 h-10 rounded-lg overflow-hidden border border-white/20">
              <img alt="Profile" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAqYZErBJcMswxPVIpUAbP3_MLi0y7-fSQtOsw5GD4Y1SA4wQ6jaDUuCG3QuuhdMYIpzxwsZbDtUg3bKyIgmyQ1oY6lqCgPCHbWqxq-KYO95RTZTCiuCInJaJ46TNbAqQ7uCqpv4CWPQRWULcC7hDXaeis7-CeXSC30Zsg9jtecwIqLZhGi6lFSt23E-UWbQOFZBQWZ-houUWVSEQWSngy2JptHa6s-BmP426YhCtj0nGn_U7qnGW_MXdzQJV15Vm_S3K0G3L7CNBE" className="w-full h-full object-cover"/>
            </div>
            <div>
              <p className="font-label-md text-label-md text-white font-bold tracking-wide">Station Manager</p>
              <p className="font-body-sm text-[10px] text-cyan-400 uppercase tracking-widest">Broadcast Pro</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 flex flex-col gap-1 mt-2 px-4 overflow-y-auto custom-scrollbar">
          <p className="font-label-md text-[10px] uppercase tracking-widest text-white/40 px-4 mb-2">Main</p>
          <Link className={getLinkClass('/admin')} href="/admin" prefetch={false}>
            <span className="material-symbols-outlined transition-transform group-hover:scale-110">radio</span>
            <span className="font-label-md text-label-md">Stations</span>
          </Link>
          <Link className={getLinkClass('/admin/listeners')} href="/admin/listeners" prefetch={false}>
            <span className="material-symbols-outlined transition-transform group-hover:scale-110">group</span>
            <span className="font-label-md text-label-md">Listeners</span>
          </Link>
          <Link className={getLinkClass('/admin/requests')} href="/admin/requests" prefetch={false}>
            <span className="material-symbols-outlined transition-transform group-hover:scale-110">queue_music</span>
            <span className="font-label-md text-label-md flex-1">Song Requests</span>
            <span className="text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 px-1.5 py-0.5 rounded-full animate-pulse">LIVE</span>
          </Link>
          <Link className={getLinkClass('/admin/revenue')} href="/admin/revenue" prefetch={false}>
            <span className="material-symbols-outlined transition-transform group-hover:scale-110">payments</span>
            <span className="font-label-md text-label-md">Revenue</span>
          </Link>
          <Link className={getLinkClass('/admin/podcasts')} href="/admin/podcasts" prefetch={false}>
            <span className="material-symbols-outlined transition-transform group-hover:scale-110">mic</span>
            <span className="font-label-md text-label-md">Podcasts</span>
          </Link>
          <p className="font-label-md text-[10px] uppercase tracking-widest text-white/40 px-4 mt-4 mb-2">Insights</p>
          <Link className={getLinkClass('/admin/analytics')} href="/admin/analytics" prefetch={false}>
            <span className="material-symbols-outlined transition-transform group-hover:scale-110">bar_chart</span>
            <span className="font-label-md text-label-md">Analytics</span>
          </Link>
          <Link className={getLinkClass('/admin/schedules')} href="/admin/schedules" prefetch={false}>
            <span className="material-symbols-outlined transition-transform group-hover:scale-110">calendar_month</span>
            <span className="font-label-md text-label-md">Schedules</span>
          </Link>
        </nav>
        <div className="px-4 pb-6">
          {/* Add New Station — opens modal */}
          <button
            id="add-station-btn"
            onClick={() => setModalOpen(true)}
            className="w-full py-4 px-6 bg-white text-black rounded-xl font-label-md flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all shadow-[0_5px_15px_rgba(255,255,255,0.2)] font-bold"
          >
            <span className="material-symbols-outlined font-bold">add</span>
            Add New Station
          </button>
          <div className="mt-6 flex flex-col gap-1">
            <p className="font-label-md text-[10px] uppercase tracking-widest text-white/40 px-4 mb-2">System</p>
            <Link className={getLinkClass('/admin/settings')} href="/admin/settings" prefetch={false}>
              <span className="material-symbols-outlined">settings</span>
              <span className="font-label-md text-label-md">Settings</span>
            </Link>
            <Link className={getLinkClass('/admin/help')} href="/admin/help" prefetch={false}>
              <span className="material-symbols-outlined">help</span>
              <span className="font-label-md text-label-md">Help</span>
            </Link>
            <Link className="flex items-center gap-4 p-4 text-white/50 hover:bg-white/5 hover:text-white rounded-xl transition-all" href="/" prefetch={false}>
              <span className="material-symbols-outlined">logout</span>
              <span className="font-label-md text-label-md">Back to Site</span>
            </Link>
          </div>
        </div>
      </aside>

      <main className="ml-[280px] h-screen flex flex-col flex-1">
        <Header variant="admin" />
        {children}
      </main>

      {/* Add Station Modal — rendered at layout level so it's available across all admin pages */}
      <AddStationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
