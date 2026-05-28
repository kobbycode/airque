'use client';

import { useEffect, useState } from 'react';
import {
  collection, onSnapshot, query, orderBy, deleteDoc, doc, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEMO_MODE } from '@/lib/demo';
import type { Podcast } from '@/lib/types';
import AddPodcastModal from '@/components/AddPodcastModal';

const SEED_PODCASTS: Omit<Podcast, 'id'>[] = [
  {
    title: 'The Highlife Hour — Episode 42',
    podcastName: 'Ghana Music Archive',
    streamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    duration: 3600,
    logoUrl: '',
    genre: 'Highlife',
    description: 'Classic highlife recordings from the golden era.',
    status: 'PUBLISHED',
  },
  {
    title: 'Tech Accra Weekly',
    podcastName: 'Innovation Ghana',
    streamUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    duration: 2400,
    logoUrl: '',
    genre: 'Technology',
    description: 'Startup news and developer interviews from Accra.',
    status: 'PUBLISHED',
  },
];

export default function AdminPodcastsPage() {
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'podcasts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, async snap => {
      if (snap.empty && DEMO_MODE) {
        try {
          await Promise.all(SEED_PODCASTS.map(item =>
            addDoc(collection(db, 'podcasts'), { ...item, createdAt: serverTimestamp() })
          ));
        } catch (err) {
          console.error('Failed to seed podcasts:', err);
        }
      } else {
        setPodcasts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Podcast)));
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const remove = async (id: string) => {
    if (!confirm('Delete this podcast episode?')) return;
    await deleteDoc(doc(db, 'podcasts', id));
  };

  return (
    <div className="flex-1 overflow-y-auto p-[32px] custom-scrollbar space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-headline-lg text-on-surface">Podcasts</h1>
          <p className="font-body-sm text-on-surface-variant">Manage on-demand episodes for the listener directory</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="bg-primary text-on-primary px-6 py-3 rounded-xl font-label-md flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          Add Episode
        </button>
      </div>

      {loading ? (
        <p className="text-on-surface-variant">Loading podcasts…</p>
      ) : podcasts.length === 0 ? (
        <div className="bg-white border border-outline-variant rounded-xl p-12 text-center">
          <p className="text-on-surface-variant">No podcasts yet. Add your first episode.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {podcasts.map(p => (
            <article key={p.id} className="bg-white border border-outline-variant rounded-xl p-6 flex flex-col gap-3">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <h2 className="font-headline-md text-on-surface">{p.title}</h2>
                  <p className="text-sm text-on-surface-variant">{p.podcastName}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  p.status === 'PUBLISHED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {p.status || 'PUBLISHED'}
                </span>
              </div>
              <p className="text-sm text-on-surface-variant line-clamp-2">{p.description || '—'}</p>
              <p className="text-xs font-mono text-on-surface-variant truncate">{p.streamUrl}</p>
              <button
                onClick={() => p.id && remove(p.id)}
                className="text-error text-sm font-label-md self-start hover:underline"
              >
                Delete
              </button>
            </article>
          ))}
        </div>
      )}

      <AddPodcastModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
