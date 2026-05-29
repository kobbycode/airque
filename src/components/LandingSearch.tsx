'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, onSnapshot, orderBy, query, limit, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Podcast, Station } from '@/lib/types';

type FilterTab = 'All' | 'Radio' | 'Podcasts';

export default function LandingSearch() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('All');
  const [stations, setStations] = useState<Station[]>([]);
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const unsubStations = onSnapshot(
      query(collection(db, 'stations'), where('status', '==', 'ONLINE'), orderBy('name'), limit(40)),
      snap => setStations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Station)))
    );
    const unsubPodcasts = onSnapshot(
      query(
        collection(db, 'podcasts'),
        where('status', '==', 'PUBLISHED'),
        orderBy('createdAt', 'desc'),
        limit(20)
      ),
      snap => setPodcasts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Podcast)))
    );
    return () => { unsubStations(); unsubPodcasts(); };
  }, []);

  const q = searchQuery.trim().toLowerCase();
  const stationHits = (activeTab === 'Podcasts' ? [] : stations).filter(s =>
    !q ||
    s.name.toLowerCase().includes(q) ||
    s.genre?.toLowerCase().includes(q) ||
    s.region?.toLowerCase().includes(q)
  ).slice(0, 5);

  const podcastHits = (activeTab === 'Radio' ? [] : podcasts).filter(p =>
    !q ||
    p.title.toLowerCase().includes(q) ||
    p.podcastName.toLowerCase().includes(q) ||
    p.genre?.toLowerCase().includes(q)
  ).slice(0, 5);

  const goStation = (id?: string) => {
    setOpen(false);
    router.push(id ? `/listener-directory?play=${id}` : '/listener-directory');
  };

  const goPodcasts = () => {
    setOpen(false);
    router.push('/listener-directory?segment=podcast');
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (stationHits[0]?.id) goStation(stationHits[0].id);
    else if (podcastHits.length) goPodcasts();
    else router.push(`/listener-directory${q ? `?q=${encodeURIComponent(searchQuery)}` : ''}`);
  };

  return (
    <div className="relative mb-6">
      <form onSubmit={onSubmit}>
        <input
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-12 py-4 focus:ring-2 focus:ring-primary/20 focus:outline-none text-on-surface transition-all"
          placeholder="Genres, stations, podcasts..."
          type="search"
        />
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">search</span>
      </form>

      <div className="flex gap-2 mb-4 mt-4 overflow-x-auto pb-2 scrollbar-hide">
        {(['All', 'Radio', 'Podcasts'] as FilterTab[]).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              activeTab === tab
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {open && (searchQuery.trim() || stationHits.length || podcastHits.length) && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-outline-variant rounded-xl shadow-xl overflow-hidden max-h-72 overflow-y-auto">
          {stationHits.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => goStation(s.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low text-left"
            >
              <span className="material-symbols-outlined text-primary">radio</span>
              <div>
                <p className="font-semibold text-sm text-on-surface">{s.name}</p>
                <p className="text-xs text-on-surface-variant">{s.genre} · {s.region}</p>
              </div>
            </button>
          ))}
          {podcastHits.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={goPodcasts}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low text-left"
            >
              <span className="material-symbols-outlined text-secondary">mic</span>
              <div>
                <p className="font-semibold text-sm text-on-surface">{p.title}</p>
                <p className="text-xs text-on-surface-variant">{p.podcastName}</p>
              </div>
            </button>
          ))}
          {!stationHits.length && !podcastHits.length && q && (
            <p className="px-4 py-6 text-sm text-on-surface-variant text-center">No results — press Enter to browse directory</p>
          )}
        </div>
      )}
    </div>
  );
}
