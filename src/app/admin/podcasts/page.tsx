'use client';

import { useEffect, useState } from 'react';
import {
  collection, onSnapshot, query, orderBy, deleteDoc, doc, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEMO_MODE } from '@/lib/demo';
import { useAuthState } from '@/lib/auth';
import type { Podcast } from '@/lib/types';
import AddPodcastModal from '@/components/AddPodcastModal';
import { useAlert } from '@/components/CustomAlert';

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
  const { appUser } = useAuthState();
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const { showConfirm } = useAlert();

  useEffect(() => {
    const q = query(collection(db, 'podcasts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, async snap => {
      if (snap.empty && DEMO_MODE && appUser?.uid) {
        try {
          await Promise.all(SEED_PODCASTS.map(item =>
            addDoc(collection(db, 'podcasts'), {
              ...item,
              ownerId: appUser.uid,
              createdAt: serverTimestamp(),
            })
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
  }, [appUser?.uid]);

  const remove = async (id: string) => {
    showConfirm({
      title: 'Delete Podcast Episode',
      message: 'Are you sure you want to delete this podcast episode? Listeners will no longer be able to stream it on-demand.',
      type: 'error',
      confirmText: 'Yes, Delete Episode',
      cancelText: 'Cancel',
      isDangerous: true,
      onConfirm: async () => {
        await deleteDoc(doc(db, 'podcasts', id));
      }
    });
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
          className="bg-primary text-black px-6 py-3 rounded-xl font-label-md font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20 flex items-center gap-2 cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm font-bold">add</span>
          Add Episode
        </button>
      </div>

      {loading ? (
        <p className="text-on-surface-variant">Loading podcasts…</p>
      ) : podcasts.length === 0 ? (
        <div className="modern-glass border border-white/5 rounded-2xl p-12 text-center">
          <p className="text-white/40">No podcasts yet. Add your first episode.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {podcasts.map(p => (
            <article key={p.id} className="premium-card p-6 flex flex-col gap-3 bento-hover-effect">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <h2 className="font-headline-md text-white font-bold">{p.title}</h2>
                  <p className="text-sm text-white/50">{p.podcastName}</p>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase border ${
                  p.status === 'PUBLISHED' 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  {p.status || 'PUBLISHED'}
                </span>
              </div>
              <p className="text-sm text-white/70 line-clamp-2">{p.description || '—'}</p>
              <p className="text-xs font-mono text-cyan-400/80 truncate">{p.streamUrl}</p>
              <button
                onClick={() => p.id && remove(p.id)}
                className="text-red-400 hover:text-red-300 text-sm font-label-md self-start transition-colors cursor-pointer"
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
