'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const YOUTUBE_API_KEY = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY || '';

interface Video {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    thumbnails: { medium: { url: string }; high: { url: string } };
    publishedAt: string;
    channelTitle: string;
  };
}

function ChannelPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const channelId = params.get('cid') || '';
  const channelName = params.get('name') || 'Channel';

  const [liveVideo, setLiveVideo] = useState<Video | null>(null);
  const [archives, setArchives] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!channelId || !YOUTUBE_API_KEY) { setLoading(false); return; }
    setLoading(true);
    try {
      const [liveRes, archiveRes] = await Promise.all([
        fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&eventType=live&key=${YOUTUBE_API_KEY}`)
          .then(r => r.json()).catch(() => ({ items: [] })),
        fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&eventType=completed&maxResults=24&key=${YOUTUBE_API_KEY}`)
          .then(r => r.json()).catch(() => ({ items: [] })),
      ]);
      setLiveVideo(liveRes.items?.[0] || null);
      setArchives(archiveRes.items || []);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const formatDate = (dateStr: string) => {
    try { return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return ''; }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Top nav bar */}
      <header className="sticky top-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5 px-4 md:px-8 h-14 flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm font-medium group"
        >
          <span className="material-symbols-outlined text-base group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
          <span className="hidden sm:inline">Live TV</span>
        </button>
        <div className="h-4 w-px bg-white/10" />
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-purple-400 text-base">live_tv</span>
          <span className="font-bold text-sm truncate">{channelName}</span>
          {liveVideo && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black uppercase tracking-widest ml-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
              </span>
              LIVE
            </span>
          )}
        </div>
        <div className="ml-auto">
          <Link href="/listener-directory" className="text-white/30 hover:text-white/70 transition-colors">
            <span className="material-symbols-outlined text-xl">home</span>
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10 space-y-10">

        {/* ── LIVE NOW SECTION ── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            {liveVideo ? (
              <span className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-widest">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                {channelName} is ON AIR
              </span>
            ) : (
              <span className="flex items-center gap-2 text-white/40 text-xs font-bold uppercase tracking-widest">
                <span className="material-symbols-outlined text-sm">live_tv</span>
                Live Stream
              </span>
            )}
          </div>

          {loading ? (
            <div className="aspect-video bg-white/5 rounded-2xl animate-pulse flex items-center justify-center">
              <span className="text-white/30 text-sm">Loading stream...</span>
            </div>
          ) : liveVideo ? (
            <div className="space-y-4">
              <div className="aspect-video rounded-2xl overflow-hidden bg-black shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
                <iframe
                  src={`https://www.youtube.com/embed/${liveVideo.id.videoId}?autoplay=1`}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <div className="space-y-1">
                <h1 className="text-white font-bold text-lg md:text-xl leading-tight">{liveVideo.snippet.title}</h1>
                <p className="text-white/40 text-sm">{liveVideo.snippet.channelTitle}</p>
              </div>
            </div>
          ) : (
            <div className="aspect-video bg-white/5 rounded-2xl border border-white/10 flex flex-col items-center justify-center gap-3 text-center p-6">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                <span className="material-symbols-outlined text-3xl text-white/20">wifi_off</span>
              </div>
              <div>
                <p className="text-white/60 font-semibold">{channelName} is currently offline</p>
                <p className="text-white/30 text-sm mt-1">Check back later or browse past streams below</p>
              </div>
              {channelId && (
                <a
                  href={`https://www.youtube.com/channel/${channelId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors"
                >
                  <span className="material-symbols-outlined text-base">open_in_new</span>
                  Open on YouTube
                </a>
              )}
            </div>
          )}
        </section>

        {/* ── ARCHIVE GALLERY ── */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="flex items-center gap-2 font-bold text-base md:text-lg">
              <span className="material-symbols-outlined text-purple-400">video_library</span>
              Past Streams
              {archives.length > 0 && (
                <span className="text-white/30 font-normal text-sm">({archives.length})</span>
              )}
            </h2>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-xl bg-white/5 overflow-hidden animate-pulse">
                  <div className="aspect-video bg-white/5" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 bg-white/10 rounded w-full" />
                    <div className="h-3 bg-white/5 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : archives.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {archives.map(video => (
                <div
                  key={video.id.videoId}
                  onClick={() => { setSelectedVideo(video); setLightboxOpen(true); }}
                  className="group cursor-pointer rounded-xl bg-white/5 border border-white/10 hover:border-purple-400/40 transition-all duration-300 overflow-hidden flex flex-col hover:-translate-y-0.5"
                >
                  <div className="relative aspect-video overflow-hidden">
                    <img
                      src={video.snippet.thumbnails.high?.url || video.snippet.thumbnails.medium?.url}
                      alt={video.snippet.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-purple-600/90 backdrop-blur flex items-center justify-center shadow-lg">
                        <span className="material-symbols-outlined text-white text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-2.5 flex flex-col gap-1 flex-1">
                    <p className="text-white text-[11px] md:text-[12px] font-semibold line-clamp-2 leading-snug group-hover:text-purple-300 transition-colors">
                      {video.snippet.title}
                    </p>
                    <p className="text-white/30 text-[10px]">{formatDate(video.snippet.publishedAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-white/30">
              <span className="material-symbols-outlined text-4xl mb-2 block">videocam_off</span>
              <p className="text-sm">No past streams found for this channel</p>
            </div>
          )}
        </section>
      </main>

      {/* Lightbox */}
      {lightboxOpen && selectedVideo && (
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-[200] flex items-center justify-center p-3 md:p-6"
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className="bg-[#111] rounded-2xl overflow-hidden w-full max-w-4xl border border-white/10 shadow-2xl relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="aspect-video bg-black">
              <iframe
                src={`https://www.youtube.com/embed/${selectedVideo.id.videoId}?autoplay=1`}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div className="p-4">
              <h3 className="text-white font-bold text-sm md:text-base">{selectedVideo.snippet.title}</h3>
              <p className="text-white/40 text-xs md:text-sm mt-1 line-clamp-2">{selectedVideo.snippet.description}</p>
            </div>
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <span className="material-symbols-outlined text-white text-base">close</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChannelPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-white/30 text-sm animate-pulse">Loading channel...</div>
      </div>
    }>
      <ChannelPageInner />
    </Suspense>
  );
}
