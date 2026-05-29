'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { YouTubeChannel } from '@/lib/types';
import Link from 'next/link';

const YOUTUBE_API_KEY = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY || '';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

interface ChannelStatus {
  channel: YouTubeChannel;
  isLive: boolean;
  liveVideoId: string | null;
  liveThumbnail: string | null;
  liveTitle: string | null;
  viewerCount: string | null;
}

async function checkChannelLive(channel: YouTubeChannel): Promise<ChannelStatus> {
  const cleanId = channel.channelId.includes('/channel/')
    ? channel.channelId.match(/\/channel\/([A-Za-z0-9_-]{24})/)?.[1]
    : channel.channelId;
  const finalId = cleanId || channel.channelId;

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${finalId}&type=video&eventType=live&key=${YOUTUBE_API_KEY}`
    ).then(r => r.json()).catch(() => ({ items: [] }));

    const liveItem = res.items?.[0];
    return {
      channel,
      isLive: !!liveItem,
      liveVideoId: liveItem?.id?.videoId || null,
      liveThumbnail: liveItem?.snippet?.thumbnails?.high?.url || liveItem?.snippet?.thumbnails?.medium?.url || null,
      liveTitle: liveItem?.snippet?.title || null,
      viewerCount: null,
    };
  } catch {
    return { channel, isLive: false, liveVideoId: null, liveThumbnail: null, liveTitle: null, viewerCount: null };
  }
}

export default function ChannelGrid() {
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [statuses, setStatuses] = useState<ChannelStatus[]>([]);
  const [loading, setLoading] = useState(true);

  // Listen to Firestore channels
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'youtubeChannels'), orderBy('createdAt', 'asc')),
      snap => {
        setChannels(snap.docs.map(d => ({ id: d.id, ...d.data() } as YouTubeChannel)));
      }
    );
    return () => unsub();
  }, []);

  // Check live status for all channels
  useEffect(() => {
    let mounted = true;
    const fetchAll = async () => {
      if (!YOUTUBE_API_KEY || channels.length === 0) {
        if (mounted) setLoading(false);
        return;
      }
      if (mounted) setLoading(true);
      const results = await Promise.all(channels.map(checkChannelLive));
      if (mounted) {
        // Sort: live channels first
        setStatuses(results.sort((a, b) => (b.isLive ? 1 : 0) - (a.isLive ? 1 : 0)));
        setLoading(false);
      }
    };
    fetchAll();
    const interval = setInterval(fetchAll, 5 * 60 * 1000);
    return () => { clearInterval(interval); mounted = false; };
  }, [channels]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden animate-pulse">
            <div className="aspect-video bg-white/5" />
            <div className="p-4 space-y-2">
              <div className="h-4 bg-white/10 rounded w-3/4" />
              <div className="h-3 bg-white/5 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!YOUTUBE_API_KEY) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="material-symbols-outlined text-5xl text-white/20 mb-3">settings</span>
        <p className="text-white/50 text-sm">YouTube API key not configured</p>
      </div>
    );
  }

  if (statuses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="material-symbols-outlined text-5xl text-white/20 mb-3">live_tv</span>
        <p className="text-white/60 text-sm font-medium">No TV channels added yet</p>
        <p className="text-white/30 text-xs mt-1">Add channels from the Admin → YouTube panel</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Live count badge */}
      <div className="flex items-center gap-3">
        {statuses.some(s => s.isLive) && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-emerald-400 text-xs font-bold uppercase tracking-widest">
              {statuses.filter(s => s.isLive).length} Live Now
            </span>
          </div>
        )}
        <span className="text-white/30 text-xs">{statuses.length} channel{statuses.length !== 1 ? 's' : ''} tracked</span>
      </div>

      {/* Channel cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {statuses.map(({ channel, isLive, liveThumbnail, liveTitle }) => {
          const slug = slugify(channel.name);
          const channelId = channel.channelId.includes('/channel/')
            ? channel.channelId.match(/\/channel\/([A-Za-z0-9_-]{24})/)?.[1] || channel.channelId
            : channel.channelId;

          return (
            <Link
              key={channel.id}
              href={`/live-tv?cid=${channelId}&name=${encodeURIComponent(channel.name)}`}
              className="group block rounded-2xl bg-white/5 border border-white/10 overflow-hidden hover:border-purple-400/40 hover:bg-white/8 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(168,85,247,0.15)]"
            >
              {/* Thumbnail / preview */}
              <div className="relative aspect-video bg-gradient-to-br from-white/5 to-white/2 overflow-hidden">
                {liveThumbnail ? (
                  <img
                    src={liveThumbnail}
                    alt={liveTitle || channel.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-4xl text-white/15">live_tv</span>
                    <span className="text-white/20 text-xs font-medium">{channel.name}</span>
                  </div>
                )}

                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                {/* Live / Offline badge */}
                <div className="absolute top-3 left-3">
                  {isLive ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-600 shadow-lg">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                      </span>
                      <span className="text-white text-[10px] font-black uppercase tracking-widest">LIVE</span>
                    </div>
                  ) : (
                    <div className="px-2.5 py-1 rounded-full bg-black/50 border border-white/10 backdrop-blur-sm">
                      <span className="text-white/50 text-[10px] font-bold uppercase tracking-widest">Offline</span>
                    </div>
                  )}
                </div>

                {/* Play arrow on hover */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="w-14 h-14 rounded-full bg-purple-600/80 backdrop-blur-sm flex items-center justify-center shadow-xl">
                    <span className="material-symbols-outlined text-white text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                      {isLive ? 'live_tv' : 'play_arrow'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card info */}
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white font-bold text-sm truncate group-hover:text-purple-300 transition-colors">
                    {channel.name}
                  </p>
                  {isLive && liveTitle ? (
                    <p className="text-white/40 text-[11px] truncate mt-0.5">{liveTitle}</p>
                  ) : (
                    <p className="text-white/30 text-[11px] mt-0.5">Tap to view channel & archives</p>
                  )}
                </div>
                <span className="material-symbols-outlined text-white/20 text-lg group-hover:text-purple-400 transition-colors flex-shrink-0">
                  chevron_right
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
