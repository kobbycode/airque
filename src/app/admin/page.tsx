'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Station } from '@/lib/types';

type StationStatus = 'ONLINE' | 'SILENT' | 'OFFLINE';

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

function EmptyState() {
  return (
    <tr>
      <td colSpan={6} className="py-20 text-center">
        <div className="flex flex-col items-center gap-4">
          <span className="material-symbols-outlined text-6xl text-white/10">radio</span>
          <div>
            <p className="font-headline-sm text-white/50">No stations yet</p>
            <p className="font-body-sm text-[12px] text-white/30 mt-1">Click &quot;Add New Station&quot; in the sidebar to get started.</p>
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function Page() {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'stations'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Station));
      setStations(data);
      setLoading(false);
    }, (err) => {
      console.error('Firestore error:', err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const totalOnline = stations.filter(s => s.status === 'ONLINE').length;
  const totalOffline = stations.filter(s => s.status === 'OFFLINE').length;

  const cycleStatus = async (station: Station) => {
    const next: Record<StationStatus, StationStatus> = { ONLINE: 'SILENT', SILENT: 'OFFLINE', OFFLINE: 'ONLINE' };
    if (!station.id) return;
    await updateDoc(doc(db, 'stations', station.id), { status: next[station.status as StationStatus] ?? 'ONLINE' });
    setOpenMenu(null);
  };

  const deleteStation = async (id: string) => {
    if (!confirm('Delete this station? This cannot be undone.')) return;
    setDeleting(id);
    await deleteDoc(doc(db, 'stations', id));
    setDeleting(null);
    setOpenMenu(null);
  };

  const accentColors = ['bg-primary', 'bg-secondary', 'bg-tertiary', 'bg-error'];

  return (
    <div className="flex-1 overflow-y-auto p-[32px] custom-scrollbar space-y-8">

      {/* Page Header */}
      <div className="flex justify-between items-center modern-glass p-6 rounded-2xl">
        <div>
          <h1 className="font-display-lg text-[32px] text-white tracking-tight font-bold">Station Control Center</h1>
          <p className="font-body-sm text-cyan-400 uppercase tracking-widest mt-1 text-[11px] font-semibold">Live overview of broadcasting nodes, network health, and telemetry</p>
        </div>
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 px-5 py-2.5 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.15)]">
          <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          <span className="font-label-md text-emerald-400 text-sm tracking-widest font-bold">ALL SYSTEMS NOMINAL</span>
        </div>
      </div>

      {/* Metrics */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="modern-glass p-6 rounded-2xl flex flex-col gap-2 hover:-translate-y-1 transition-transform">
          <div className="flex justify-between items-center">
            <span className="font-label-md text-white/50 uppercase tracking-widest text-[10px]">Total Stations</span>
            <span className="material-symbols-outlined text-white/50">radio</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display-lg text-[40px] text-white leading-none font-bold">{stations.length}</span>
            <span className="text-white/40 font-label-md uppercase text-[10px] tracking-wider">registered</span>
          </div>
          <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden border border-white/10 mt-2">
            <div className="bg-gradient-to-r from-cyan-600 to-cyan-400 h-full shadow-[0_0_10px_rgba(6,182,212,0.8)]" style={{ width: '100%' }} />
          </div>
        </div>
        <div className="modern-glass p-6 rounded-2xl flex flex-col gap-2 hover:-translate-y-1 transition-transform">
          <div className="flex justify-between items-center">
            <span className="font-label-md text-white/50 uppercase tracking-widest text-[10px]">Active Stations Live</span>
            <span className="material-symbols-outlined text-cyan-400 animate-pulse">sensors</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display-lg text-[40px] text-white leading-none font-bold">{totalOnline}</span>
            <span className="text-white/40 font-label-md uppercase text-[10px] tracking-wider">of {stations.length}</span>
          </div>
          <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden border border-white/10 mt-2">
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full transition-all shadow-[0_0_10px_rgba(16,185,129,0.8)]" style={{ width: stations.length > 0 ? `${(totalOnline / stations.length) * 100}%` : '0%' }} />
          </div>
        </div>
        <div className="modern-glass p-6 rounded-2xl flex flex-col gap-2 hover:-translate-y-1 transition-transform">
          <div className="flex justify-between items-center">
            <span className="font-label-md text-white/50 uppercase tracking-widest text-[10px]">Network Outages</span>
            <span className="material-symbols-outlined text-red-400/80">warning</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display-lg text-[40px] text-white leading-none font-bold">{totalOffline}</span>
            <span className={`font-label-md uppercase text-[10px] tracking-wider ${totalOffline === 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}>{totalOffline === 0 ? 'Stable' : 'Offline'}</span>
          </div>
          <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden border border-white/10 mt-2">
            <div className="bg-gradient-to-r from-red-600 to-red-400 h-full transition-all shadow-[0_0_10px_rgba(239,68,68,0.8)]" style={{ width: stations.length > 0 ? `${(totalOffline / stations.length) * 100}%` : '0%' }} />
          </div>
        </div>
      </section>

      {/* Station Table */}
      <section className="modern-glass rounded-2xl overflow-hidden shadow-[0_15px_35px_rgba(0,0,0,0.3)]">
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
          <h3 className="font-display-lg text-[22px] tracking-tight font-bold text-white">Monitoring Matrix</h3>
          <div className="flex gap-2 text-cyan-400 font-label-md text-[10px] uppercase tracking-widest border border-cyan-400/30 px-3 py-1 rounded-full bg-cyan-400/10">
            <span>{stations.length} station{stations.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/5 border-b border-white/10">
                <th className="p-6 font-label-md text-white/50 uppercase tracking-widest text-[10px]">Station</th>
                <th className="p-6 font-label-md text-white/50 uppercase tracking-widest text-[10px]">Status</th>
                <th className="p-6 font-label-md text-white/50 uppercase tracking-widest text-[10px]">Genre</th>
                <th className="p-6 font-label-md text-white/50 uppercase tracking-widest text-[10px]">Bitrate</th>
                <th className="p-6 font-label-md text-white/50 uppercase tracking-widest text-[10px]">Region</th>
                <th className="p-6 font-label-md text-white/50 uppercase tracking-widest text-[10px]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex items-center justify-center gap-3 text-cyan-400">
                      <span className="w-5 h-5 border-2 border-cyan-400/20 border-t-cyan-400 rounded-full animate-spin" />
                      <span className="font-body-md tracking-widest uppercase text-[10px]">Loading telemetry…</span>
                    </div>
                  </td>
                </tr>
              ) : stations.length === 0 ? (
                <EmptyState />
              ) : (
                stations.map((station, idx) => (
                  <tr key={station.id} className="hover:bg-white/5 transition-colors relative group">
                    <td className="p-6">
                      <div className="flex items-center gap-4">
                        {station.logoUrl ? (
                          <img src={station.logoUrl} alt={station.name} className="w-10 h-10 rounded-xl object-cover border border-white/20 shadow-sm" />
                        ) : (
                          <div className={`w-1 h-10 ${accentColors[idx % accentColors.length]} rounded-full opacity-60`} />
                        )}
                        <div>
                          <p className="font-bold text-white tracking-wide">{station.name}</p>
                          <p className="text-[11px] text-white/50">{station.location || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-6">
                      <StatusBadge status={station.status as StationStatus} />
                    </td>
                    <td className="p-6 text-[12px] text-white/70">{station.genre}</td>
                    <td className="p-6 font-mono text-[11px] text-cyan-400 bg-cyan-400/10 rounded px-2">{station.bitrate}</td>
                    <td className="p-6 text-[12px] text-white/70">{station.region}</td>
                    <td className="p-6 text-right relative">
                      <button
                        onClick={() => setOpenMenu(openMenu === station.id ? null : station.id!)}
                        className="text-white/40 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10 border border-transparent hover:border-white/20"
                      >
                        <span className="material-symbols-outlined text-[18px]">more_vert</span>
                      </button>
                      {openMenu === station.id && (
                        <div className="absolute right-8 top-12 z-20 modern-glass rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] py-1 w-48">
                          <button
                            onClick={() => cycleStatus(station)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-bold text-white uppercase tracking-wider hover:bg-white/10 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[16px] text-cyan-400">sync</span>
                            Toggle Status
                          </button>
                          <a
                            href={station.streamUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-bold text-white uppercase tracking-wider hover:bg-white/10 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[16px] text-cyan-400">open_in_new</span>
                            Open Stream
                          </a>
                          <div className="h-px bg-white/10 my-1 mx-2" />
                          <button
                            onClick={() => deleteStation(station.id!)}
                            disabled={deleting === station.id}
                            className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-bold text-red-400 uppercase tracking-wider hover:bg-red-500/10 transition-colors disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                            {deleting === station.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Engineering Log */}
      <section className="modern-glass rounded-2xl p-6 flex flex-col gap-4 shadow-[0_15px_35px_rgba(0,0,0,0.3)]">
        <div className="flex justify-between items-center bg-white/5 -mx-6 -mt-6 px-6 py-4 border-b border-white/10">
          <h4 className="font-label-md uppercase tracking-widest text-white/50 text-[11px] font-bold">Engineering Log</h4>
          <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> Live Telemetry Feed
          </span>
        </div>
        <div className="space-y-3 pt-2">
          {stations.filter(s => s.status === 'ONLINE').slice(0, 3).map(s => (
            <div key={s.id} className="flex items-center gap-4 text-[12px] border-b border-white/5 pb-2">
              <span className="text-white/40 font-mono text-[10px] bg-white/5 px-1.5 py-0.5 rounded border border-white/10">{new Date().toLocaleTimeString()}</span>
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[9px] font-bold tracking-widest uppercase shadow-[0_0_8px_rgba(16,185,129,0.1)]">ONLINE</span>
              <p className="text-white/70"><strong className="text-white">{s.name}</strong>: Stream active on <span className="text-cyan-400">{s.region}</span> node.</p>
            </div>
          ))}
          {stations.filter(s => s.status === 'OFFLINE').slice(0, 2).map(s => (
            <div key={s.id} className="flex items-center gap-4 text-[12px] border-b border-white/5 pb-2">
              <span className="text-white/40 font-mono text-[10px] bg-white/5 px-1.5 py-0.5 rounded border border-white/10">{new Date().toLocaleTimeString()}</span>
              <span className="bg-red-500/10 text-red-400 border border-red-500/30 px-2 py-0.5 rounded text-[9px] font-bold tracking-widest uppercase shadow-[0_0_8px_rgba(239,68,68,0.1)]">OFFLINE</span>
              <p className="text-white/70"><strong className="text-white">{s.name}</strong>: Stream connection lost.</p>
            </div>
          ))}
          {stations.length === 0 && (
            <p className="text-[11px] text-white/30 py-4 text-center tracking-widest uppercase">No telemetry available.</p>
          )}
        </div>
      </section>

    </div>
  );
}
