'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, getCountFromServer } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Station } from '@/lib/types';
import { buildAnalyticsSummary, formatLargeNumber, type AnalyticsSummary } from '@/lib/analytics';

export default function AnalyticsPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ requests: 0, podcasts: 0, schedules: 0 });

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'stations')), snap => {
      setStations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Station)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    Promise.all([
      getCountFromServer(collection(db, 'requests')),
      getCountFromServer(collection(db, 'podcasts')),
      getCountFromServer(collection(db, 'schedules')),
    ]).then(([req, pod, sch]) => {
      setCounts({
        requests: req.data().count,
        podcasts: pod.data().count,
        schedules: sch.data().count,
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    buildAnalyticsSummary(stations, counts.requests, counts.podcasts, counts.schedules)
      .then(data => { if (active) { setSummary(data); setLoading(false); } })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [stations, counts]);

  const maxWeek = summary ? Math.max(...summary.weeklyListeners, 1) : 1;

  return (
    <div className="flex-1 overflow-y-auto p-[32px] custom-scrollbar space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="font-headline-lg text-on-surface">Analytics Hub</h1>
          <p className="font-body-sm text-on-surface-variant">Live metrics from stations, requests, and listener APIs</p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="bg-white/5 hover:bg-white/10 border border-white/10 active:scale-95 transition-all text-white px-4 py-2 rounded-xl font-label-md flex items-center gap-1.5 cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm">refresh</span>
          Refresh
        </button>
      </div>

      {loading || !summary ? (
        <div className="flex items-center gap-3 text-on-surface-variant py-20 justify-center">
          <span className="w-5 h-5 border-2 border-outline-variant border-t-primary rounded-full animate-spin" />
          Aggregating platform metrics…
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <StatCard label="Concurrent Listeners" value={formatLargeNumber(summary.totalListeners)} sub={`${summary.onlineStations} stations live`} icon="groups" />
            <StatCard label="Peak (this refresh)" value={formatLargeNumber(summary.peakListeners)} sub="Highest single station" icon="trending_up" />
            <StatCard label="Song Requests" value={String(summary.totalRequests)} sub="All-time in Firestore" icon="queue_music" />
            <StatCard label="Podcast Episodes" value={String(summary.totalPodcasts)} sub={`${summary.totalSchedules} schedule blocks`} icon="mic" />
          </section>

          <div className="grid grid-cols-12 gap-6">
            <section className="col-span-12 lg:col-span-8 modern-glass border border-white/5 rounded-2xl p-6">
              <h3 className="font-headline-md mb-4 text-white font-bold">Weekly Listener Trend (estimated)</h3>
              <div className="h-64 flex items-end gap-2 border-b border-l border-white/10 pl-4 pb-2">
                {summary.weeklyListeners.map((val, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center h-full justify-end">
                    <div className="w-full bg-gradient-to-t from-primary/30 to-primary rounded-t transition-all shadow-[0_0_15px_rgba(230,194,128,0.15)]" style={{ height: `${(val / maxWeek) * 100}%`, minHeight: '4px' }} />
                    <span className="text-[10px] text-white/40 mt-2 font-medium">
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="col-span-12 lg:col-span-4 modern-glass border border-white/5 rounded-2xl p-6">
              <h3 className="font-headline-md mb-4 text-white font-bold">Listeners by Region</h3>
              <div className="space-y-4">
                {summary.regionBreakdown.length === 0 ? (
                  <p className="text-sm text-white/40">No live stations to analyze.</p>
                ) : summary.regionBreakdown.map(r => (
                  <div key={r.region}>
                    <div className="flex justify-between text-sm mb-1 text-white/80">
                      <span className="font-medium">{r.region}</span>
                      <span className="font-bold text-primary">{r.pct}%</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                      <div className="h-full bg-gradient-to-r from-primary/75 to-primary" style={{ width: `${r.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="modern-glass border border-white/5 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-white/5">
              <h3 className="font-headline-md text-white font-bold">Top Stations by Listeners</h3>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white/[0.02] border-b border-white/5">
                  <th className="p-4 text-xs uppercase text-white/40 tracking-wider font-bold">Rank</th>
                  <th className="p-4 text-xs uppercase text-white/40 tracking-wider font-bold">Station</th>
                  <th className="p-4 text-xs uppercase text-white/40 tracking-wider font-bold">Region</th>
                  <th className="p-4 text-xs uppercase text-white/40 tracking-wider font-bold">Listeners</th>
                  <th className="p-4 text-xs uppercase text-white/40 tracking-wider font-bold">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {summary.stationRankings.map((row, i) => (
                  <tr key={row.station.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-4 font-bold text-primary">#{i + 1}</td>
                    <td className="p-4 font-semibold text-white/90">{row.station.name}</td>
                    <td className="p-4 text-sm text-white/70">{row.station.region}</td>
                    <td className="p-4 text-white/80 font-mono">{row.listeners.toLocaleString()}</td>
                    <td className="p-4">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase border ${
                        row.source === 'live' 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                          : 'bg-white/5 text-white/40 border-white/5'
                      }`}>
                        {row.source}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: string }) {
  return (
    <div className="modern-glass border border-white/5 p-6 rounded-2xl flex flex-col gap-2 hover:-translate-y-1 transition-transform">
      <div className="flex justify-between items-center mb-1">
        <span className="font-label-md text-white/50 uppercase tracking-widest text-[10px]">{label}</span>
        <span className="material-symbols-outlined text-primary">{icon}</span>
      </div>
      <p className="font-display-lg text-[28px] font-black text-white leading-none mt-1">{value}</p>
      <p className="text-[11px] text-white/40 font-medium mt-1">{sub}</p>
    </div>
  );
}
