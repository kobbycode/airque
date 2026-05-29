'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEMO_MODE } from '@/lib/demo';
import { useAuthState } from '@/lib/auth';
import type { YouTubeChannel } from '@/lib/types';
import { useAlert } from '@/components/CustomAlert';

function normalizeChannelId(input: string): string {
  // Extract raw channel ID from various formats
  const trimmed = input.trim();
  // YouTube channel URL formats:
  // - https://www.youtube.com/channel/UCxxxxxxx
  // - https://youtube.com/@handle
  // - UCxxxxxxx (raw ID)
  const channelMatch = trimmed.match(/\/channel\/([A-Za-z0-9_-]{24})/);
  if (channelMatch) return channelMatch[1];
  // Handle @ format - we can't resolve these client-side, so show error hint
  if (trimmed.includes('/@') || trimmed.match(/^@[A-Za-z0-9_-]+$/)) {
    return trimmed; // Can't resolve, return as-is (API may fail)
  }
  return trimmed;
}

const SEED_CHANNELS: Omit<YouTubeChannel, 'id'>[] = [
  { channelId: 'UCE_M8A5yxnLfW0KghEeajjw', name: 'AirCue Radio' },
  { channelId: 'UC_x5XG1OV2P6uD0B1l4Tj9A', name: 'Ghana Music TV' },
  { channelId: 'UCkAizvmvTl8rQc9vDURiIeg', name: 'Accra Live' }
];

export default function AdminYouTubePage() {
  const { appUser } = useAuthState();
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editChannel, setEditChannel] = useState<YouTubeChannel | null>(null);
  const { showConfirm } = useAlert();

  useEffect(() => {
    const q = query(collection(db, 'youtubeChannels'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, async snap => {
      if (snap.empty && DEMO_MODE && appUser?.uid) {
        try {
          await Promise.all(SEED_CHANNELS.map(item =>
            addDoc(collection(db, 'youtubeChannels'), {
              ...item,
              createdAt: serverTimestamp(),
            })
          ));
        } catch (err) {
          console.error('Failed to seed channels:', err);
        }
      } else {
        setChannels(snap.docs.map(d => ({ id: d.id, ...d.data() } as YouTubeChannel)));
      }
      setLoading(false);
    });
    return () => unsub();
  }, [appUser?.uid]);

  const remove = async (id: string) => {
    showConfirm({
      title: 'Remove Channel',
      message: 'Remove this YouTube channel from the live monitor?',
      type: 'warning',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      onConfirm: async () => {
        await deleteDoc(doc(db, 'youtubeChannels', id));
      }
    });
  };

  const addOrUpdateChannel = async (channel: { channelId: string; name: string }) => {
    const cleanChannelId = normalizeChannelId(channel.channelId);
    if (editChannel?.id) {
      await updateDoc(doc(db, 'youtubeChannels', editChannel.id), { channelId: cleanChannelId, name: channel.name });
    } else {
      await addDoc(collection(db, 'youtubeChannels'), {
        channelId: cleanChannelId,
        name: channel.name,
        createdAt: serverTimestamp(),
      });
    }
    setEditChannel(null);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="font-headline-lg text-on-surface">YouTube Channels</h1>
          <p className="font-body-sm text-on-surface-variant mt-1">Manage YouTube channels for the Live TV monitor</p>
        </div>
        <button
          onClick={() => setEditChannel({ channelId: '', name: '' } as YouTubeChannel)}
          className="bg-primary text-black px-5 py-2.5 rounded-xl font-label-md font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20 flex items-center gap-2 cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm font-bold">add</span>
          Add Channel
        </button>
      </div>

      {loading ? (
        <p className="text-on-surface-variant">Loading channels…</p>
      ) : channels.length === 0 ? (
        <div className="modern-glass border border-white/5 rounded-2xl p-12 text-center">
          <span className="material-symbols-outlined text-5xl text-white/20 mb-4">smart_display</span>
          <p className="text-white/40 font-body-md">No YouTube channels configured. Add your first channel.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {channels.map(ch => (
            <article key={ch.id} className="premium-card p-5 md:p-6 flex flex-col gap-3 bento-hover-effect">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <h2 className="font-headline-md text-white font-bold text-base md:text-lg truncate">{ch.name}</h2>
                  <p className="text-xs md:text-sm text-white/50 font-mono truncate">{ch.channelId}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">ACTIVE</span>
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setEditChannel(ch)}
                  className="flex-1 bg-white/5 border border-white/10 text-white/80 hover:text-white rounded-lg py-2 text-xs font-label-md transition-colors cursor-pointer"
                >
                  Edit
                </button>
                <button
                  onClick={() => ch.id && remove(ch.id)}
                  className="flex-1 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-lg py-2 text-xs font-label-md transition-colors cursor-pointer"
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editChannel && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setEditChannel(null)}>
          <div className="bg-white/10 rounded-2xl p-6 md:p-8 border border-white/20 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="font-headline-md text-white mb-4">{editChannel.id ? 'Edit Channel' : 'Add Channel'}</h3>
<form onSubmit={e => {
               e.preventDefault();
               const form = e.target as HTMLFormElement;
               const channelIdInput = form.elements.namedItem('channelId') as HTMLInputElement;
               const nameInput = form.elements.namedItem('name') as HTMLInputElement;
               const channelId = channelIdInput?.value.trim() || '';
               const name = nameInput?.value.trim() || '';
               if (channelId && name) addOrUpdateChannel({ channelId, name });
             }} className="space-y-4">
              <div>
                <label className="text-[10px] text-white/50 uppercase font-bold mb-1 block">Channel ID</label>
                <input
                  name="channelId"
                  defaultValue={editChannel.channelId}
                  placeholder="e.g. UCE_M8A5yxnLfW0KghEeajjw"
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/30 focus:border-primary/40 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/50 uppercase font-bold mb-1 block">Display Name</label>
                <input
                  name="name"
                  defaultValue={editChannel.name}
                  placeholder="e.g. AirCue Radio"
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/30 focus:border-primary/40 outline-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-primary text-black rounded-lg py-2.5 font-bold text-sm cursor-pointer">
                  {editChannel.id ? 'Update' : 'Add'} Channel
                </button>
                <button type="button" onClick={() => setEditChannel(null)} className="flex-1 bg-white/5 border border-white/10 text-white/80 rounded-lg py-2.5 font-label-md cursor-pointer">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}