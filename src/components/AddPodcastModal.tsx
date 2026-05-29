'use client';

import { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthState } from '@/lib/auth';
import type { Podcast } from '@/lib/types';

const GENRES = [
  'Highlife', 'Afrobeats', 'Gospel', 'News & Talk', 'Sports',
  'Hip Hop / HipLife', 'Technology', 'History', 'Music History', 'Multi-genre',
];

interface AddPodcastModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AddPodcastModal({ isOpen, onClose }: AddPodcastModalProps) {
  const { appUser } = useAuthState();
  const [form, setForm] = useState<Omit<Podcast, 'id'>>({
    title: '',
    podcastName: '',
    streamUrl: '',
    duration: 0,
    logoUrl: '',
    genre: '',
    description: '',
    status: 'PUBLISHED',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!appUser || !['admin', 'creator'].includes(appUser.role)) {
      return setError('Sign in as admin or creator.');
    }
    if (!form.title.trim() || !form.podcastName.trim() || !form.streamUrl.trim()) {
      return setError('Title, show name, and stream URL are required.');
    }

    try {
      setSaving(true);
      await addDoc(collection(db, 'podcasts'), {
        ...form,
        title: form.title.trim(),
        podcastName: form.podcastName.trim(),
        streamUrl: form.streamUrl.trim(),
        duration: Number(form.duration) || 0,
        ownerId: appUser.uid,
        createdAt: serverTimestamp(),
      });
      setForm({
        title: '', podcastName: '', streamUrl: '', duration: 0,
        logoUrl: '', genre: '', description: '', status: 'PUBLISHED',
      });
      onClose();
    } catch (err) {
      console.error(err);
      setError('Failed to save podcast.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-on-surface/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-lg border border-outline-variant p-8 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="font-headline-md text-on-surface">Add Podcast Episode</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input className="w-full border border-outline-variant rounded-xl px-4 py-3 text-sm" placeholder="Episode title *" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required />
          <input className="w-full border border-outline-variant rounded-xl px-4 py-3 text-sm" placeholder="Podcast / show name *" value={form.podcastName} onChange={e => setForm(p => ({ ...p, podcastName: e.target.value }))} required />
          <input className="w-full border border-outline-variant rounded-xl px-4 py-3 text-sm font-mono" placeholder="Audio URL (mp3/m3u8) *" value={form.streamUrl} onChange={e => setForm(p => ({ ...p, streamUrl: e.target.value }))} required />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" min={0} className="border border-outline-variant rounded-xl px-4 py-3 text-sm" placeholder="Duration (sec)" value={form.duration || ''} onChange={e => setForm(p => ({ ...p, duration: Number(e.target.value) }))} />
            <>
              <input 
                className="w-full border border-outline-variant rounded-xl px-4 py-3 text-sm" 
                placeholder="Genre" 
                value={form.genre} 
                list="podcast-genres"
                onChange={e => setForm(p => ({ ...p, genre: e.target.value }))} 
              />
              <datalist id="podcast-genres">
                {GENRES.map(g => <option key={g} value={g} />)}
              </datalist>
            </>
          </div>
          <input className="w-full border border-outline-variant rounded-xl px-4 py-3 text-sm" placeholder="Logo URL" value={form.logoUrl} onChange={e => setForm(p => ({ ...p, logoUrl: e.target.value }))} />
          <textarea className="w-full border border-outline-variant rounded-xl px-4 py-3 text-sm h-24 resize-none" placeholder="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          {error && <p className="text-error text-sm">{error}</p>}
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl border border-outline-variant">Cancel</button>
            <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-xl bg-primary text-on-primary font-label-md disabled:opacity-50">
              {saving ? 'Saving…' : 'Publish'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
