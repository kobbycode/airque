'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  collection, onSnapshot, query, where, doc, updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthState } from '@/lib/auth';
import type { Station, StationStatus } from '@/lib/types';
import EditStationModal from '@/components/EditStationModal';

function StatusBadge({ status }: { status: StationStatus }) {
  const map: Record<StationStatus, { bg: string; text: string; label: string }> = {
    ONLINE: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'ONLINE' },
    SILENT: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', label: 'SILENT' },
    OFFLINE: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'OFFLINE' },
  };
  const s = map[status] ?? map.OFFLINE;
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full ${s.bg} ${s.text} text-[10px] font-bold tracking-widest border ${
      status === 'ONLINE' ? 'border-emerald-500/30 glow-emerald-live' : status === 'SILENT' ? 'border-cyan-400/30 glow-cyan-active' : 'border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
    }`}>{s.label}</span>
  );
}

export default function StationDashboardPage() {
  const { appUser } = useAuthState();
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Station | null>(null);

  useEffect(() => {
    if (!appUser?.uid) return;

    const q = query(
      collection(db, 'stations'),
      where('ownerId', '==', appUser.uid)
    );

    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Station));
      data.sort((a, b) => a.name.localeCompare(b.name));
      setStations(data);
      setLoading(false);
    }, () => setLoading(false));

    return () => unsub();
  }, [appUser?.uid]);

  const cycleStatus = async (station: Station) => {
    const next: Record<StationStatus, StationStatus> = {
      ONLINE: 'SILENT',
      SILENT: 'OFFLINE',
      OFFLINE: 'ONLINE',
    };
    if (!station.id) return;
    await updateDoc(doc(db, 'stations', station.id), {
      status: next[station.status] ?? 'ONLINE',
    });
  };

  const onlineCount = stations.filter(s => s.status === 'ONLINE').length;

  return (
    <div className="flex-1 overflow-y-auto p-[32px] custom-scrollbar space-y-8">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="font-display-lg text-[32px] text-white tracking-tight font-bold">My Broadcast Studio</h1>
          <p className="font-body-sm text-cyan-400 uppercase tracking-widest mt-1 text-[11px] font-semibold">
            Manage your station stream, status, and listener engagement
          </p>
        </div>
        {stations.length > 0 && (
          <Link
            href="/station-dashboard/requests"
            prefetch={false}
            className="bg-primary text-black px-6 py-3 rounded-xl font-label-md flex items-center gap-2 hover:scale-[1.02] active:scale-95 transition-all shadow-[0_5px_15px_rgba(230,194,128,0.2)] font-bold text-sm"
          >
            <span className="material-symbols-outlined text-sm font-bold">queue_music</span>
            View Song Requests
          </Link>
        )}
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="modern-glass p-6 rounded-2xl flex flex-col gap-2 hover:-translate-y-1 transition-transform border border-white/5">
          <div className="flex justify-between items-center">
            <span className="font-label-md text-white/50 uppercase tracking-widest text-[10px]">Your Stations</span>
            <span className="material-symbols-outlined text-white/50">radio</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display-lg text-[40px] text-white leading-none font-bold">{stations.length}</span>
            <span className="text-white/40 font-label-md uppercase text-[10px] tracking-wider">registered</span>
          </div>
          <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden border border-white/10 mt-2">
            <div className="bg-gradient-to-r from-primary to-primary-fixed h-full shadow-[0_0_10px_rgba(230,194,128,0.5)]" style={{ width: '100%' }} />
          </div>
        </div>

        <div className="modern-glass p-6 rounded-2xl flex flex-col gap-2 hover:-translate-y-1 transition-transform border border-white/5">
          <div className="flex justify-between items-center">
            <span className="font-label-md text-white/50 uppercase tracking-widest text-[10px]">Live Now</span>
            <span className="material-symbols-outlined text-emerald-400 animate-pulse">sensors</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display-lg text-[40px] text-emerald-400 leading-none font-bold">{onlineCount}</span>
            <span className="text-white/40 font-label-md uppercase text-[10px] tracking-wider">active</span>
          </div>
          <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden border border-white/10 mt-2">
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full transition-all shadow-[0_0_10px_rgba(16,185,129,0.5)]" style={{ width: stations.length > 0 ? `${(onlineCount / stations.length) * 100}%` : '0%' }} />
          </div>
        </div>

        <div className="modern-glass p-6 rounded-2xl flex flex-col gap-2 hover:-translate-y-1 transition-transform border border-white/5">
          <div className="flex justify-between items-center">
            <span className="font-label-md text-white/50 uppercase tracking-widest text-[10px]">Broadcast Status</span>
            <span className="material-symbols-outlined text-white/50">broadcast_on_personal</span>
          </div>
          <p className="font-headline-md text-white mt-2 flex items-center gap-2">
            {onlineCount > 0 ? (
              <>
                <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                <span className="font-bold uppercase tracking-wider text-emerald-400 text-sm">On Air</span>
              </>
            ) : (
              <span className="font-bold uppercase tracking-wider text-white/50 text-sm">Standby</span>
            )}
          </p>
          <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden border border-white/10 mt-2">
            <div className={`h-full transition-all ${onlineCount > 0 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] w-full' : 'bg-white/10 w-0'}`} />
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex items-center justify-center py-24 gap-3 text-cyan-400">
          <span className="w-5 h-5 border-2 border-cyan-400/20 border-t-cyan-400 rounded-full animate-spin" />
          <span className="font-body-md tracking-widest uppercase text-[10px]">Loading telemetry…</span>
        </div>
      ) : stations.length === 0 ? (
        <div className="modern-glass border border-white/10 rounded-2xl p-12 text-center flex flex-col items-center gap-4">
          <span className="material-symbols-outlined text-6xl text-white/20">radio</span>
          <div>
            <p className="font-headline-md text-white font-bold">No station registered yet</p>
            <p className="font-body-sm text-white/50 mt-2 max-w-sm mx-auto">
              Complete creator signup to provision your first station, or contact support if you already signed up.
            </p>
          </div>
          <Link
            href="/creator-signup"
            prefetch={false}
            className="bg-primary text-black px-8 py-3 rounded-full font-label-md hover:scale-105 transition-transform font-bold shadow-[0_5px_15px_rgba(230,194,128,0.2)]"
          >
            Launch Your Station
          </Link>
        </div>
      ) : (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {stations.map(station => (
            <article
              key={station.id}
              className="premium-card rounded-2xl p-6 flex flex-col gap-4 bento-hover-effect"
            >
              <div className="flex items-start gap-4">
                {station.logoUrl ? (
                  <img src={station.logoUrl} alt={station.name} className="w-16 h-16 rounded-xl object-cover border border-white/10" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary text-3xl">radio</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-lg text-white truncate tracking-wide">{station.name}</h2>
                  <p className="font-body-sm text-white/50 text-xs mt-0.5">{station.genre} · {station.region}</p>
                  <div className="mt-2.5">
                    <StatusBadge status={station.status} />
                  </div>
                </div>
              </div>

              <div className="space-y-1 font-code text-xs bg-white/5 border border-white/5 rounded-xl p-3 text-cyan-400 font-mono tracking-wide truncate">
                <p className="truncate text-white/70">{station.streamUrl || 'No stream URL set'}</p>
                <p className="text-cyan-400">{station.bitrate} · {station.location || '—'}</p>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  onClick={() => setEditing(station)}
                  className="flex-1 min-w-[120px] py-2.5 px-4 rounded-xl border border-white/10 font-bold text-xs uppercase tracking-wider text-white/80 hover:bg-white/5 hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                  Edit
                </button>
                <button
                  onClick={() => cycleStatus(station)}
                  className="flex-1 min-w-[120px] py-2.5 px-4 rounded-xl border border-white/10 font-bold text-xs uppercase tracking-wider text-white/80 hover:bg-white/5 hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">sync</span>
                  Toggle
                </button>
                {station.id && (
                  <Link
                    href={`/listener-directory?play=${station.id}`}
                    prefetch={false}
                    className="flex-1 min-w-[120px] py-2.5 px-4 rounded-xl bg-cyan-500/10 border border-cyan-400/30 text-cyan-400 font-bold text-xs uppercase tracking-wider hover:bg-cyan-500/20 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">play_arrow</span>
                    Preview
                  </Link>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      <EditStationModal
        station={editing}
        onClose={() => setEditing(null)}
        onSuccess={() => setEditing(null)}
      />
    </div>
  );
}
