'use client';

import { useState, useLayoutEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { YouTubeChannel } from '@/lib/types';

interface Video {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    thumbnails: {
      medium: { url: string };
      high: { url: string };
    };
    publishedAt: string;
    channelTitle: string;
  };
}

interface YouTubeResponse {
  liveVideos: Video[];
  archiveVideos: Video[];
  channelStatus: { id: string; name: string; isLive: boolean }[];
}

const YOUTUBE_API_KEY = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY || '';

async function fetchYouTubeData(channelId: string): Promise<{ live: Video[]; archive: Video[] }> {
  // Skip if channelId looks like a URL (should have been normalized, but guard anyway)
  const cleanId = channelId.includes('/channel/') 
    ? channelId.match(/\/channel\/([A-Za-z0-9_-]{24})/)?.[1] 
    : channelId;
  const finalId = cleanId || channelId;
  
  const liveUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${finalId}&type=video&eventType=live&key=${YOUTUBE_API_KEY}`;
  const archiveUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${finalId}&type=video&eventType=completed&maxResults=12&key=${YOUTUBE_API_KEY}`;

  const [liveRes, archiveRes] = await Promise.all([
    fetch(liveUrl).then(r => r.json()).catch(() => ({ items: [] })),
    fetch(archiveUrl).then(r => r.json()).catch(() => ({ items: [] }))
  ]);

  const normalizeVideo = (item: { id: { videoId: string }; snippet: Video['snippet'] }): Video => ({
    id: item.id,
    snippet: item.snippet
  });

  return {
    live: (liveRes.items || []).map(normalizeVideo),
    archive: (archiveRes.items || []).map(normalizeVideo)
  };
}

export default function YouTubeLiveMonitor() {
  const [data, setData] = useState<YouTubeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);

  // Fetch channels from Firestore and refresh YouTube data when channels change
  useLayoutEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'youtubeChannels'), orderBy('createdAt', 'asc')), snap => {
      setChannels(snap.docs.map(d => ({ id: d.id, ...d.data() } as YouTubeChannel)));
    });
    return () => unsub();
  }, []);

  useLayoutEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      if (!YOUTUBE_API_KEY || channels.length === 0) {
        if (mounted) setLoading(false);
        return;
      }
      if (mounted) setLoading(true);
      try {
        const results = await Promise.all(
          channels.map(async (channel) => {
            const data = await fetchYouTubeData(channel.channelId);
            return {
              channelId: channel.channelId,
              channelName: channel.name,
              live: data.live,
              archive: data.archive
            };
          })
        );

        if (mounted) {
          const responseData: YouTubeResponse = {
            liveVideos: results.flatMap(r => r.live),
            archiveVideos: results.flatMap(r => r.archive),
            channelStatus: results.map(r => ({
              id: r.channelId,
              name: r.channelName,
              isLive: r.live.length > 0
            }))
          };
          setData(responseData);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to fetch YouTube data:', err);
        if (mounted) setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => {
      clearInterval(interval);
      mounted = false;
    };
  }, [channels]);

  const handleVideoClick = (video: Video) => {
    setSelectedVideo(video);
    setLightboxOpen(true);
  };

  const activeLiveVideo = data?.liveVideos?.[0];
  const archiveVideos = data?.archiveVideos || [];

  return (
    <div className="space-y-8 px-4 md:px-0">
      {/* LIVE NOW Hero Section */}
      <div className="modern-glass-dark rounded-2xl p-4 md:p-6 border border-white/5">
        <h2 className="font-headline-md text-white mb-3 md:mb-4 flex items-center gap-2 text-sm md:text-base">
          <span className="material-symbols-outlined text-emerald-400 text-base md:text-lg">radio</span>
          LIVE NOW
        </h2>
        
        {loading ? (
          <div className="aspect-video bg-white/5 rounded-xl animate-pulse flex items-center justify-center">
            <span className="text-white/40 text-xs">Checking stream status...</span>
          </div>
        ) : !YOUTUBE_API_KEY ? (
          <div className="aspect-video bg-white/5 rounded-xl flex flex-col items-center justify-center text-center p-4 md:p-6 border border-white/10">
            <span className="material-symbols-outlined text-3xl md:text-4xl text-white/20 mb-2">settings</span>
            <p className="text-white/60 font-body-md text-xs md:text-sm">YouTube API key not configured</p>
          </div>
        ) : activeLiveVideo ? (
          <div className="space-y-3 md:space-y-4">
            {/* Live indicator */}
            <div className="flex items-center gap-1.5 md:gap-2 text-emerald-400 text-xs">
              <span className="relative flex h-2.5 w-2.5 md:h-3 md:w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 md:h-3 md:w-3 bg-emerald-500"></span>
              </span>
              <span className="font-label-md uppercase tracking-widest text-xs">{activeLiveVideo.snippet.channelTitle} is ON AIR</span>
            </div>
            
            <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-2xl">
              <iframe
                src={`https://www.youtube.com/embed/${activeLiveVideo.id.videoId}?autoplay=1`}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <h3 className="font-headline-sm text-white text-sm md:text-base">{activeLiveVideo.snippet.title}</h3>
          </div>
        ) : (
          <div className="aspect-video bg-white/5 rounded-xl flex flex-col items-center justify-center text-center p-4 md:p-6 border border-white/10">
            <span className="material-symbols-outlined text-5xl md:text-6xl text-white/20 mb-3 md:mb-4">stream</span>
            <p className="text-white/60 font-body-md mb-1 md:mb-2 text-xs md:text-sm">No channels currently live</p>
            <p className="text-white/40 text-xs md:text-sm">Check out our archives below</p>
          </div>
        )}
      </div>

      {/* Channel Status Indicators */}
      <div className="flex flex-wrap gap-2 md:gap-3">
        {data?.channelStatus?.map((channel) => (
          <div key={channel.id} className="flex items-center gap-1.5 md:gap-2 px-2.5 py-1 md:px-3 md:py-1.5 rounded-lg bg-white/5 border border-white/10">
            <span className="w-2 h-2 md:w-2 md:h-2 rounded-full bg-white/20" />
            <span className="font-label-sm text-white/80 text-xs">{channel.name}</span>
            {channel.isLive && <span className="font-label-xs text-emerald-400 uppercase text-[10px]">LIVE</span>}
          </div>
        ))}
      </div>

      {/* ARCHIVE GALLERY */}
      <div>
        <h2 className="font-headline-md text-white mb-3 md:mb-4 flex items-center gap-2 text-sm md:text-base">
          <span className="material-symbols-outlined text-purple-400 text-base md:text-lg">video_library</span>
          ARCHIVE GALLERY
        </h2>
        
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-video bg-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : archiveVideos.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
            {archiveVideos.map((video) => (
              <div
                key={video.id.videoId}
                onClick={() => handleVideoClick(video)}
                className="group cursor-pointer aspect-video rounded-xl overflow-hidden bg-white/5 border border-white/10 hover:border-purple-400/30 transition-all duration-300 relative"
              >
                <img
                  src={video.snippet.thumbnails.high?.url || video.snippet.thumbnails.medium?.url}
                  alt={video.snippet.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2 md:p-3">
                  <p className="text-white font-label-sm line-clamp-2 text-xs md:text-sm">{video.snippet.title}</p>
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-purple-500/80 backdrop-blur flex items-center justify-center">
                    <span className="material-symbols-outlined text-white text-lg md:text-2xl">play_arrow</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 md:py-12 text-white/40">
            <span className="material-symbols-outlined text-3xl md:text-4xl mb-2">videocam_off</span>
            <p className="text-xs md:text-sm">No archived streams found</p>
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {lightboxOpen && selectedVideo && (
        <div 
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-[200] flex items-center justify-center p-3 md:p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <div className="bg-white/10 rounded-xl md:rounded-2xl overflow-hidden w-full max-w-3xl md:max-w-4xl border border-white/20" onClick={e => e.stopPropagation()}>
            <div className="aspect-video bg-black">
              <iframe
                src={`https://www.youtube.com/embed/${selectedVideo.id.videoId}?autoplay=1`}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div className="p-3 md:p-4">
              <h3 className="font-headline-sm text-white text-sm md:text-base">{selectedVideo.snippet.title}</h3>
              <p className="text-white/60 text-xs md:text-sm mt-1">{selectedVideo.snippet.description}</p>
            </div>
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-3 md:top-4 right-3 md:right-4 w-7 h-7 md:w-8 md:h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-white text-sm md:text-base">close</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}