'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { YouTubeChannel } from '@/lib/types';
import Link from 'next/link';
import {
  requestNotificationPermission,
  subscribeToChannel,
  unsubscribeFromChannel,
  isSubscribed,
  registerForegroundHandler,
} from '@/lib/notifications';

const YOUTUBE_API_KEY = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY || '';

interface ChannelStatus {
  channel: YouTubeChannel;
  isLive: boolean;
  liveVideoId: string | null;
  liveThumbnail: string | null;
  liveTitle: string | null;
  channelThumbnail: string | null; // official channel avatar
}

async function fetchChannelThumbnail(channelId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${YOUTUBE_API_KEY}`
    ).then(r => r.json());
    return res.items?.[0]?.snippet?.thumbnails?.high?.url ||
           res.items?.[0]?.snippet?.thumbnails?.medium?.url ||
           res.items?.[0]?.snippet?.thumbnails?.default?.url || null;
  } catch { return null; }
}

async function checkChannelLive(channel: YouTubeChannel): Promise<ChannelStatus> {
  const cleanId = channel.channelId.includes('/channel/')
    ? channel.channelId.match(/\/channel\/([A-Za-z0-9_-]{24})/)?.[1]
    : channel.channelId;
  const finalId = cleanId || channel.channelId;

  try {
    const [liveRes, thumbUrl] = await Promise.all([
      fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${finalId}&type=video&eventType=live&key=${YOUTUBE_API_KEY}`
      ).then(r => r.json()).catch(() => ({ items: [] })),
      fetchChannelThumbnail(finalId),
    ]);

    const liveItem = liveRes.items?.[0];
    return {
      channel,
      isLive: !!liveItem,
      liveVideoId: liveItem?.id?.videoId || null,
      liveThumbnail: liveItem?.snippet?.thumbnails?.high?.url || liveItem?.snippet?.thumbnails?.medium?.url || null,
      liveTitle: liveItem?.snippet?.title || null,
      channelThumbnail: thumbUrl,
    };
  } catch {
    return { channel, isLive: false, liveVideoId: null, liveThumbnail: null, liveTitle: null, channelThumbnail: null };
  }
}

export default function ChannelGrid() {
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [statuses, setStatuses] = useState<ChannelStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set());
  const [subLoading, setSubLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ title: string; body: string; channelId?: string } | null>(null);

  // ── Firestore channel listener ────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'youtubeChannels'), orderBy('createdAt', 'asc')),
      snap => setChannels(snap.docs.map(d => ({ id: d.id, ...d.data() } as YouTubeChannel)))
    );
    return () => unsub();
  }, []);

  // ── Poll YouTube live status ──────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!YOUTUBE_API_KEY || channels.length === 0) { setLoading(false); return; }
    setLoading(prev => { if (!prev) return prev; return true; });
    const results = await Promise.all(channels.map(checkChannelLive));
    setStatuses(results.sort((a, b) => (b.isLive ? 1 : 0) - (a.isLive ? 1 : 0)));
    setLoading(false);
  }, [channels]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // ── FCM foreground handler ────────────────────────────────────────────────
  useEffect(() => {
    registerForegroundHandler((title, body, channelId) => {
      // Play notification chime via Web Audio API (no file needed)
      try {
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const playTone = (freq: number, startTime: number, duration: number, gain: number) => {
          const osc = ctx.createOscillator();
          const gainNode = ctx.createGain();
          osc.connect(gainNode);
          gainNode.connect(ctx.destination);
          osc.frequency.value = freq;
          osc.type = 'sine';
          gainNode.gain.setValueAtTime(0, startTime);
          gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.01);
          gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
          osc.start(startTime);
          osc.stop(startTime + duration);
        };
        const now = ctx.currentTime;
        playTone(880, now, 0.4, 0.4);       // A5 — first ding
        playTone(1108, now + 0.15, 0.5, 0.3); // C#6 — second ding
      } catch { /* ignore if AudioContext unavailable */ }

      setToast({ title, body, channelId });
      setTimeout(() => setToast(null), 6000);
    });
  }, []);

  // ── Check existing subscriptions once token is known ──────────────────────
  useEffect(() => {
    if (!fcmToken) return;
    Promise.all(
      statuses.map(async ({ channel }) => {
        const cleanId = channel.channelId.includes('/channel/')
          ? channel.channelId.match(/\/channel\/([A-Za-z0-9_-]{24})/)?.[1] || channel.channelId
          : channel.channelId;
        const subbed = await isSubscribed(cleanId, fcmToken);
        return { id: cleanId, subbed };
      })
    ).then(results => {
      setSubscribedIds(new Set(results.filter(r => r.subbed).map(r => r.id)));
    });
  }, [fcmToken, statuses]);

  // ── Subscribe / Unsubscribe ───────────────────────────────────────────────
  const handleBell = async (channel: YouTubeChannel) => {
    const cleanId = channel.channelId.includes('/channel/')
      ? channel.channelId.match(/\/channel\/([A-Za-z0-9_-]{24})/)?.[1] || channel.channelId
      : channel.channelId;

    setSubLoading(cleanId);
    try {
      let token = fcmToken;
      if (!token) {
        token = await requestNotificationPermission();
        if (!token) {
          alert('Please allow notifications in your browser settings to subscribe.');
          setSubLoading(null);
          return;
        }
        setFcmToken(token);
      }

      if (subscribedIds.has(cleanId)) {
        await unsubscribeFromChannel(cleanId, token);
        setSubscribedIds(prev => { const s = new Set(prev); s.delete(cleanId); return s; });
      } else {
        await subscribeToChannel(cleanId, channel.name, token);
        setSubscribedIds(prev => new Set(prev).add(cleanId));
        setToast({ title: `✅ Subscribed to ${channel.name}`, body: "You'll be notified when they go live!" });
        setTimeout(() => setToast(null), 4000);
      }
    } catch (err) {
      console.error('Subscription error:', err);
    }
    setSubLoading(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading && statuses.length === 0) {
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
      {/* In-app toast notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-[300] max-w-sm animate-in slide-in-from-top-2 duration-300">
          <div className="bg-[#1a1a2e] border border-purple-500/30 rounded-2xl p-4 shadow-2xl shadow-purple-900/30 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="material-symbols-outlined text-white text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>live_tv</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm">{toast.title}</p>
              <p className="text-white/60 text-xs mt-0.5">{toast.body}</p>
            </div>
            <button onClick={() => setToast(null)} className="text-white/30 hover:text-white/70 flex-shrink-0">
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center gap-3 flex-wrap">
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
        <span className="text-white/20 text-xs ml-auto hidden sm:block">🔔 Tap the bell on any card to get notified when it goes live</span>
      </div>

      {/* Channel cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {statuses.map(({ channel, isLive, liveThumbnail, liveTitle, channelThumbnail }) => {
          const cleanId = channel.channelId.includes('/channel/')
            ? channel.channelId.match(/\/channel\/([A-Za-z0-9_-]{24})/)?.[1] || channel.channelId
            : channel.channelId;

          const isSubbed = subscribedIds.has(cleanId);
          const isSubLoading = subLoading === cleanId;

          // Thumbnail: live thumbnail if live, else official channel avatar, else null
          const displayThumbnail = isLive ? liveThumbnail : channelThumbnail;

          return (
            <div key={channel.id} className="relative group">
              {/* Bell subscribe button */}
              <button
                onClick={(e) => { e.preventDefault(); handleBell(channel); }}
                disabled={isSubLoading}
                title={isSubbed ? 'Unsubscribe from live alerts' : 'Notify me when live'}
                className={`absolute top-3 right-3 z-20 w-8 h-8 rounded-full backdrop-blur-sm flex items-center justify-center transition-all duration-200 shadow-lg
                  ${isSubbed
                    ? 'bg-purple-600 border border-purple-400/50 text-white hover:bg-red-600 hover:border-red-400/50'
                    : 'bg-black/50 border border-white/20 text-white/60 hover:bg-purple-600 hover:border-purple-400/50 hover:text-white opacity-0 group-hover:opacity-100'
                  } ${isSubLoading ? 'animate-pulse' : ''}`}
              >
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: isSubbed ? "'FILL' 1" : "'FILL' 0" }}>
                  notifications
                </span>
              </button>

              <Link
                href={`/live-tv?cid=${cleanId}&name=${encodeURIComponent(channel.name)}`}
                className="block rounded-2xl bg-white/5 border border-white/10 overflow-hidden hover:border-purple-400/40 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(168,85,247,0.15)]"
              >
                {/* Thumbnail */}
                <div className="relative aspect-video bg-gradient-to-br from-white/5 to-black overflow-hidden">
                  {displayThumbnail ? (
                    <img
                      src={displayThumbnail}
                      alt={channel.name}
                      className={`w-full h-full transition-transform duration-500 group-hover:scale-105 ${isLive ? 'object-cover' : 'object-cover'}`}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-purple-900/30 to-black">
                      <span className="material-symbols-outlined text-5xl text-white/10">live_tv</span>
                      <span className="text-white/20 text-xs font-medium">{channel.name}</span>
                    </div>
                  )}

                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

                  {/* Live / Offline badge */}
                  <div className="absolute top-3 left-3">
                    {isLive ? (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-600 shadow-lg shadow-red-900/50">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                        </span>
                        <span className="text-white text-[10px] font-black uppercase tracking-widest">LIVE</span>
                      </div>
                    ) : (
                      <div className="px-2.5 py-1 rounded-full bg-black/60 border border-white/10 backdrop-blur-sm">
                        <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Offline</span>
                      </div>
                    )}
                  </div>

                  {/* Play overlay on hover */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="w-14 h-14 rounded-full bg-purple-600/80 backdrop-blur-sm flex items-center justify-center shadow-xl">
                      <span className="material-symbols-outlined text-white text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                        {isLive ? 'live_tv' : 'play_arrow'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card info */}
                <div className="p-4 flex items-center gap-3">
                  {/* Channel avatar circle */}
                  {channelThumbnail ? (
                    <img
                      src={channelThumbnail}
                      alt={channel.name}
                      className="w-9 h-9 rounded-full object-cover border border-white/10 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-purple-900/40 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-purple-400 text-base">live_tv</span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-bold text-sm truncate group-hover:text-purple-300 transition-colors">
                      {channel.name}
                    </p>
                    {isLive && liveTitle ? (
                      <p className="text-white/40 text-[11px] truncate mt-0.5">{liveTitle}</p>
                    ) : (
                      <p className="text-white/25 text-[11px] mt-0.5">Tap to view channel & archives</p>
                    )}
                  </div>
                  <span className="material-symbols-outlined text-white/20 text-lg group-hover:text-purple-400 transition-colors flex-shrink-0">
                    chevron_right
                  </span>
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
