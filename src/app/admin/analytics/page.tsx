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
    if (!stations.length && loading) return;
    let active = true;
    setLoading(true);
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
          className="bg-white border border-outline-variant text-on-surface px-4 py-2 rounded-lg font-label-md flex items-center gap-1"
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
            <section className="col-span-12 lg:col-span-8 bg-white border border-outline-variant rounded-xl p-6">
              <h3 className="font-headline-md mb-4">Weekly Listener Trend (estimated)</h3>
              <div className="h-64 flex items-end gap-2 border-b border-l border-outline-variant/30 pl-4 pb-2">
                {summary.weeklyListeners.map((val, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center h-full justify-end">
                    <div className="w-full bg-primary rounded-t transition-all" style={{ height: `${(val / maxWeek) * 100}%`, minHeight: '4px' }} />
                    <span className="text-[10px] text-on-surface-variant mt-2">
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="col-span-12 lg:col-span-4 bg-white border border-outline-variant rounded-xl p-6">
              <h3 className="font-headline-md mb-4">Listeners by Region</h3>
              <div className="space-y-4">
                {summary.regionBreakdown.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">No live stations to analyze.</p>
                ) : summary.regionBreakdown.map(r => (
                  <div key={r.region}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{r.region}</span>
                      <span className="font-bold">{r.pct}%</span>
                    </div>
                    <div className="h-2 bg-surface-container-low rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${r.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="bg-white border border-outline-variant rounded-xl overflow-hidden">
            <div className="p-6 border-b border-outline-variant">
              <h3 className="font-headline-md">Top Stations by Listeners</h3>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  <th className="p-4 text-xs uppercase text-on-surface-variant">Rank</th>
                  <th className="p-4 text-xs uppercase text-on-surface-variant">Station</th>
                  <th className="p-4 text-xs uppercase text-on-surface-variant">Region</th>
                  <th className="p-4 text-xs uppercase text-on-surface-variant">Listeners</th>
                  <th className="p-4 text-xs uppercase text-on-surface-variant">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {summary.stationRankings.map((row, i) => (
                  <tr key={row.station.id} className="hover:bg-surface-container-low/50">
                    <td className="p-4 font-bold text-primary">#{i + 1}</td>
                    <td className="p-4 font-semibold">{row.station.name}</td>
                    <td className="p-4 text-sm">{row.station.region}</td>
                    <td className="p-4">{row.listeners.toLocaleString()}</td>
                    <td className="p-4">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        row.source === 'live' ? 'bg-green-100 text-green-700' : 'bg-surface-container text-on-surface-variant'
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
    <div className="bg-white border border-outline-variant p-6 rounded-xl">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs uppercase tracking-wider text-on-surface-variant">{label}</span>
        <span className="material-symbols-outlined text-primary">{icon}</span>
      </div>
      <p className="font-display-lg text-on-surface">{value}</p>
      <p className="text-xs text-on-surface-variant mt-1">{sub}</p>
    </div>
  );
}
