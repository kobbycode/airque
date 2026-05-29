'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { collection, onSnapshot, query, where, addDoc, serverTimestamp, orderBy, limit, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { normalizeTimestamp, type ChatMessage, type Podcast, type ScheduleBlock, type Station, type AppNotification } from '@/lib/types';
import YouTubeLiveMonitor from '@/components/YouTubeLiveMonitor';
import Link from 'next/link';
import { useAuthState } from '@/lib/auth';
import { formatListenerLabel, getDisplayListenerCount } from '@/lib/listener-presence';
import { useListenerPresence } from '@/hooks/useListenerPresence';
import { useStationListenerCounts } from '@/hooks/useStationListenerCounts';
import StationListenerBadge from '@/components/StationListenerBadge';
import { signOut } from 'firebase/auth';
import type Hls from 'hls.js';
import { useAlert } from '@/components/CustomAlert';

type TimestampInput =
  | Date
  | number
  | string
  | { seconds: number }
  | { toDate: () => Date }
  | null
  | undefined;

// Helper to format time relative to Firestore Timestamp / Date / milliseconds
function getRelativeTime(createdAt: TimestampInput): string {
  if (!createdAt) return 'just now';
  let seconds = 0;
  if (typeof createdAt === 'object' && 'seconds' in createdAt && typeof createdAt.seconds === 'number') {
    seconds = createdAt.seconds;
  } else if (typeof createdAt === 'object' && 'toDate' in createdAt && typeof createdAt.toDate === 'function') {
    seconds = Math.floor(createdAt.toDate().getTime() / 1000);
  } else if (createdAt instanceof Date) {
    seconds = Math.floor(createdAt.getTime() / 1000);
  } else if (typeof createdAt === 'number') {
    seconds = Math.floor(createdAt / 1000);
  } else if (typeof createdAt === 'string') {
    const parsed = new Date(createdAt);
    if (!isNaN(parsed.getTime())) {
      seconds = Math.floor(parsed.getTime() / 1000);
    } else {
      return 'just now';
    }
  } else {
    return 'just now';
  }

  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 0) return 'just now';
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

type EqPreset = 'Normal' | 'Bass Boost' | 'Vocal' | 'Treble';

const EQ_PRESETS: Record<EqPreset, { low: number; mid: number; high: number; label: string; icon: string }> = {
  Normal: { low: 0, mid: 0, high: 0, label: 'Normal', icon: 'equalizer' },
  'Bass Boost': { low: 8, mid: 0, high: -2, label: 'Bass Boost', icon: 'speaker' },
  Vocal: { low: -2, mid: 6, high: 2, label: 'Vocal', icon: 'mic' },
  Treble: { low: -2, mid: 0, high: 8, label: 'Treble Boost', icon: 'graphic_eq' },
};

const GHANA_REGIONS = [
  'All', 'Greater Accra', 'Ashanti', 'Western', 'Eastern', 'Central', 'Northern', 'Volta'
];

export default function Page() {
  const { appUser } = useAuthState();
  const { showConfirm } = useAlert();
  const stationListenerCounts = useStationListenerCounts();
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStation, setActiveStation] = useState<Station | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const searchModalRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // Favorites & Recently Played
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentPlayed, setRecentPlayed] = useState<string[]>([]);

  // Equalizer
  const [activePreset, setActivePreset] = useState<EqPreset>('Normal');
  const [showEqMenu, setShowEqMenu] = useState(false);

  // Sleep timer
  const [sleepTimerEnd, setSleepTimerEnd] = useState<number | null>(null);
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState<number>(0);
  const [showSleepTimerMenu, setShowSleepTimerMenu] = useState(false);

  // Mobile volume popup
  const [showVolumePopup, setShowVolumePopup] = useState(false);

  // Premium Features Expanded States
  const [activeSegment, setActiveSegment] = useState<'live' | 'podcast' | 'youtube'>('live');
  const isLiveListening =
    activeSegment === 'live' &&
    isPlaying &&
    Boolean(activeStation?.id && activeStation?.streamUrl);

  const { isRegistered: isListenerRegistered, registeredStationId } = useListenerPresence({
    stationId: isLiveListening ? (activeStation?.id ?? null) : null,
    stationName: isLiveListening ? (activeStation?.name ?? null) : null,
    isListening: isLiveListening,
  });

  const listenerCountOpts = {
    isRegistered: isListenerRegistered,
    registeredStationId,
  };

  const displayCount = (stationId?: string) =>
    getDisplayListenerCount(stationListenerCounts, stationId, listenerCountOpts);

  const [activeRegion, setActiveRegion] = useState<string>('All');
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [podcastsLoading, setPodcastsLoading] = useState(true);
  const [activePodcast, setActivePodcast] = useState<Podcast | null>(null);
  const [podcastDuration, setPodcastDuration] = useState<number>(0);
  const [podcastProgress, setPodcastProgress] = useState<number>(0);

  // Drawer
  const [drawerStation, setDrawerStation] = useState<Station | null>(null);
  const [drawerTab, setDrawerTab] = useState<'about' | 'chat' | 'request'>('about');

  // Real-time Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [nickname, setNickname] = useState('');
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Song Request
  const [requestForm, setRequestForm] = useState({ requester: '', song: '', artist: '', shoutout: '' });
  const [requestSuccess, setRequestSuccess] = useState(false);

  // Schedules
  const [schedules, setSchedules] = useState<ScheduleBlock[]>([]);

  // Notifications
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);

  // Clock telemetry
  const [currentTimeStr, setCurrentTimeStr] = useState('08:00 AM');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Web Audio API nodes
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const lowFilterRef = useRef<BiquadFilterNode | null>(null);
  const midFilterRef = useRef<BiquadFilterNode | null>(null);
  const highFilterRef = useRef<BiquadFilterNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const visualizerAnimationId = useRef<number | null>(null);
  // When true the next audio load should auto-play; false = load-only (station switch)
  const shouldAutoPlayRef = useRef<boolean>(true);
  // Reconnect attempt counter for weak-network resilience
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clock runner
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTimeStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateClock();
    const interval = setInterval(updateClock, 30000);
    return () => clearInterval(interval);
  }, []);

  // Load client-only localStorage states to prevent Next.js SSR hydration mismatch
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const favs = JSON.parse(localStorage.getItem('aircue_favorites') || '[]');
        if (Array.isArray(favs)) setFavorites(favs);
      } catch { /* ignore */ }

      try {
        const recent = JSON.parse(localStorage.getItem('aircue_recent') || '[]');
        if (Array.isArray(recent)) setRecentPlayed(recent);
      } catch { /* ignore */ }

      const savedNickname = localStorage.getItem('aircue_nickname');
      setNickname(savedNickname || `Listener_${Math.floor(1000 + Math.random() * 9000)}`);
    });
  }, []);

  // Sleep timer countdown effect
  useEffect(() => {
    if (sleepTimerEnd === null) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((sleepTimerEnd - Date.now()) / 1000);
      if (remaining <= 0) {
        if (audioRef.current) {
          audioRef.current.pause();
          setIsPlaying(false);
        }
        setSleepTimerEnd(null);
        setSleepTimerRemaining(0);
      } else {
        setSleepTimerRemaining(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [sleepTimerEnd]);

  // Real-time notifications subscription
  useEffect(() => {
    const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(5));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as AppNotification));
      setNotifications(list);
      setUnreadNotifCount(list.filter(n => n.unread).length);
    }, (err) => {
      console.error('Notifications error:', err);
    });
    return () => unsub();
  }, []);

  // Click outside to close notification panel and search modal
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.notification-container')) {
        setShowNotifPanel(false);
      }
      if (!target.closest('.search-container')) {
        setShowSearchModal(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleMarkAllRead = async () => {
    try {
      const { writeBatch, doc } = await import('firebase/firestore');
      const batch = writeBatch(db);
      notifications.forEach(n => {
        if (n.unread) {
          batch.update(doc(db, 'notifications', n.id), { unread: false });
        }
      });
      await batch.commit();
      setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
      setUnreadNotifCount(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { unread: false });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, unread: false } : n));
      setUnreadNotifCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  // Firestore subscription for stations
  useEffect(() => {
    const q = query(collection(db, 'stations'), where('status', '==', 'ONLINE'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => {
        const item = d.data();
        return {
          id: d.id,
          ...item,
          createdAt: item.createdAt?.toDate ? item.createdAt.toDate() : item.createdAt,
        } as Station;
      });
      data.sort((a, b) => {
        const ta = normalizeTimestamp(a.createdAt)?.getTime() || 0;
        const tb = normalizeTimestamp(b.createdAt)?.getTime() || 0;
        return tb - ta;
      });

      // Select the first station as active by default if none selected
      setActiveStation(prev => prev || data[0]);
      setStations(data);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  // Real-time Broadcast Schedules subscription
  useEffect(() => {
    const q = collection(db, 'schedules');
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as ScheduleBlock));
      // Sort by dayIndex, then time
      data.sort((a, b) => {
        if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
        return a.time.localeCompare(b.time);
      });
      setSchedules(data);
    });

    return () => unsub();
  }, []);

  // Real-time Firestore Chat Room subscription
  useEffect(() => {
    if (!drawerStation?.id || drawerTab !== 'chat') return;

    const messagesQuery = query(
      collection(db, 'chats', drawerStation.id, 'messages'),
      orderBy('timestamp', 'asc'),
      limit(50)
    );

    const unsub = onSnapshot(messagesQuery, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ChatMessage[];
      setChatMessages(msgs);
      setTimeout(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 80);
    }, (err) => {
      console.error('Chat error:', err);
    });

    return () => unsub();
  }, [drawerStation?.id, drawerTab]);

  // Podcasts subscription
  useEffect(() => {
    const q = query(
      collection(db, 'podcasts'),
      where('status', '==', 'PUBLISHED'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      setPodcasts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Podcast)));
      setPodcastsLoading(false);
    }, () => setPodcastsLoading(false));
    return () => unsub();
  }, []);

  // Auto-play from URL param
  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(window.location.search);
    const playId = params.get('play');
    const segment = params.get('segment');
    const qParam = params.get('q');
    queueMicrotask(() => {
      if (segment === 'podcast') setActiveSegment('podcast');
      if (qParam) setSearchQuery(qParam);
    });
    if (playId) {
      const station = stations.find(s => s.id === playId);
      if (station) {
        window.setTimeout(() => setActiveStation(station), 0);
      }
    }
  }, [loading, stations]);

  // Visualizer Drawing Loop
  const startVisualizer = useCallback(() => {
    if (visualizerAnimationId.current) cancelAnimationFrame(visualizerAnimationId.current);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser ? analyser.frequencyBinCount : 32;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      visualizerAnimationId.current = requestAnimationFrame(draw);

      const width = canvas.width = canvas.clientWidth;
      const height = canvas.height = canvas.clientHeight;
      ctx.clearRect(0, 0, width, height);

      let valuesAreZero = true;
      if (analyser) {
        analyser.getByteFrequencyData(dataArray);
        for (let i = 0; i < bufferLength; i++) {
          if (dataArray[i] > 0) valuesAreZero = false;
        }
      }

      if (!isPlaying) {
        // Draw flat glowy line
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(230, 194, 128, 0.35)'; // More visible gold glow line
        ctx.lineWidth = 2.5;
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        return;
      }

      if (valuesAreZero) {
        // FALLBACK: Pure math mathematical sine wave simulation (CORS bypass fallback)
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.85)'; // Solid Cyan wave
        ctx.lineWidth = 2.5;
        const time = Date.now() * 0.004;
        for (let x = 0; x < width; x++) {
          const y = height / 2 + Math.sin(x * 0.03 + time) * 12 * Math.sin(x * 0.005 + time * 0.2);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.beginPath();
        ctx.strokeStyle = 'rgba(230, 194, 128, 0.7)'; // Solid Gold wave
        ctx.lineWidth = 1.5;
        for (let x = 0; x < width; x++) {
          const y = height / 2 + Math.sin(x * 0.05 - time * 0.7) * 8 * Math.cos(x * 0.007 + time * 0.1);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        // REAL SPECTRUM VISUALIZATION
        const barWidth = (width / bufferLength) * 1.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          barHeight = (dataArray[i] / 255) * height * 0.85;

          const grad = ctx.createLinearGradient(x, height, x, height - barHeight);
          grad.addColorStop(0, 'rgba(6, 182, 212, 0.3)');   // Translucent Cyan bottom
          grad.addColorStop(0.5, 'rgba(139, 92, 246, 0.85)'); // Purple center
          grad.addColorStop(1, 'rgba(230, 194, 128, 0.95)');  // Champagne Gold tip

          ctx.fillStyle = grad;
          // Draw round top rectangles
          ctx.beginPath();
          ctx.roundRect(x, height - barHeight, barWidth - 2, barHeight, [3, 3, 0, 0]);
          ctx.fill();

          x += barWidth;
        }
      }
    };

    draw();
  }, [isPlaying]);

  useEffect(() => {
    startVisualizer();
    return () => {
      if (visualizerAnimationId.current) cancelAnimationFrame(visualizerAnimationId.current);
    };
  }, [startVisualizer]);

  // Web Audio API equalizer init
  const initAudioGraph = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audioCtxRef.current) return;
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaElementSource(audio);
      sourceNodeRef.current = src;

      const low = ctx.createBiquadFilter();
      low.type = 'lowshelf';
      low.frequency.value = 80;

      const mid = ctx.createBiquadFilter();
      mid.type = 'peaking';
      mid.frequency.value = 2000;
      mid.Q.value = 1;

      const high = ctx.createBiquadFilter();
      high.type = 'highshelf';
      high.frequency.value = 8000;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64; // High speed responsive bars

      lowFilterRef.current = low;
      midFilterRef.current = mid;
      highFilterRef.current = high;
      analyserRef.current = analyser;

      src.connect(low);
      low.connect(mid);
      mid.connect(high);
      high.connect(analyser);
      analyser.connect(ctx.destination);
    } catch { /* CORS or browser restriction — audio still works natively */ }
  }, []);

  const applyEqPreset = useCallback((preset: EqPreset) => {
    setActivePreset(preset);
    setShowEqMenu(false);
    const { low, mid, high } = EQ_PRESETS[preset];
    if (lowFilterRef.current) lowFilterRef.current.gain.value = low;
    if (midFilterRef.current) midFilterRef.current.gain.value = mid;
    if (highFilterRef.current) highFilterRef.current.gain.value = high;
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
  }, []);

  // Audio playback listener & trackers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (activeSegment === 'podcast') {
        setPodcastProgress(audio.currentTime);
      }
    };

    const handleLoadedMetadata = () => {
      if (activeSegment === 'podcast') {
        setPodcastDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setPodcastProgress(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [activeSegment]);

  // HLS / native audio controller
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Clear any pending reconnect timers from a previous station
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptsRef.current = 0;

    let hlsInstance: Hls | null = null;
    let destroyed = false;

    const autoPlay = shouldAutoPlayRef.current;
    // Reset flag for next interaction
    shouldAutoPlayRef.current = true;

    const afterLoad = () => {
      if (destroyed) return;
      initAudioGraph();
      if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
      audio.volume = volume;
      if (autoPlay) {
        audio.play().catch(() => setIsPlaying(false));
        setIsPlaying(true);
      } else {
        // Load-only: don't play, just buffer
        setIsPlaying(false);
      }
    };

    // ── Network resilience helpers ───────────────────────────────────
    const MAX_RECONNECTS = 8;
    const reconnect = () => {
      if (destroyed) return;
      if (reconnectAttemptsRef.current >= MAX_RECONNECTS) return;
      reconnectAttemptsRef.current += 1;
      const delay = Math.min(2000 * reconnectAttemptsRef.current, 15000);
      reconnectTimerRef.current = setTimeout(() => {
        if (destroyed || !audioRef.current) return;
        const a = audioRef.current;
        const wasPlaying = isPlaying;
        if (hlsInstance) {
          // For HLS — trigger a recover or reload
          try { hlsInstance.startLoad(); } catch { /* ignore */ }
        } else {
          // Plain audio: reload src and resume
          const src = a.src;
          a.src = src;
          a.load();
          if (wasPlaying) {
            a.play().catch(() => {});
          }
        }
      }, delay);
    };

    const handleStall = () => { reconnect(); };
    const handleError = () => { reconnect(); };
    const handlePlaying = () => { reconnectAttemptsRef.current = 0; };

    audio.addEventListener('stalled', handleStall);
    audio.addEventListener('error', handleError);
    audio.addEventListener('playing', handlePlaying);
    // ────────────────────────────────────────────────────────────────

    if (activeSegment === 'live') {
      if (activeStation?.streamUrl) {
        const url = activeStation.streamUrl;
        const isHLS = url.includes('.m3u8');

        if (isHLS) {
          import('hls.js').then(({ default: Hls }) => {
            if (!audioRef.current || destroyed) return;
            if (Hls.isSupported()) {
              const hls = new Hls({
                enableWorker: false,
                // Resilience config
                manifestLoadingMaxRetry: 6,
                levelLoadingMaxRetry: 6,
                fragLoadingMaxRetry: 6,
              });
              hlsRef.current = hls;
              hlsInstance = hls;
              hls.loadSource(url);
              hls.attachMedia(audio);
              hls.on(Hls.Events.MANIFEST_PARSED, afterLoad);
              hls.on(Hls.Events.ERROR, (_: unknown, data: { fatal: boolean; type: string }) => {
                if (data.fatal) {
                  // Try to recover network errors; for media errors try recoverMediaError
                  if (data.type === 'networkError') {
                    hls.startLoad();
                  } else if (data.type === 'mediaError') {
                    hls.recoverMediaError();
                  } else {
                    setIsPlaying(false);
                  }
                  reconnect();
                }
              });
            } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
              audio.src = url;
              afterLoad();
            }
          });
        } else {
          audio.src = url;
          afterLoad();
        }
      }
    } else {
      // PODCASTS
      if (activePodcast?.streamUrl) {
        audio.src = activePodcast.streamUrl;
        afterLoad();
      }
    }

    return () => {
      destroyed = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      audio.removeEventListener('stalled', handleStall);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('playing', handlePlaying);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (hlsInstance) {
        hlsInstance.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStation, activePodcast, activeSegment, initAudioGraph]);

  // Actions

  // Stop playback entirely and clean up HLS
  const handleStop = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    setIsPlaying(false);
  };

  // Clicking the play button on a card:
  //  - Same station  → toggle play/pause
  //  - Different station → stop current, load new station but DON'T auto-play
  const handlePlay = async (station: Station) => {
    if (!station.streamUrl) return;
    setActiveSegment('live');
    setActivePodcast(null);
    if (activeStation?.id === station.id) {
      // Same station: toggle play/pause
      togglePlayPause();
    } else {
      // Different station: load without auto-playing
      shouldAutoPlayRef.current = false;
      setActiveStation(station);
      // Track recently played
      if (station.id) {
        const updated = [station.id, ...recentPlayed.filter(id => id !== station.id)].slice(0, 4);
        setRecentPlayed(updated);
        try { localStorage.setItem('aircue_recent', JSON.stringify(updated)); } catch { /* ignore */ }
      }
      try {
        await addDoc(collection(db, 'notifications'), {
          icon: 'sensors',
          iconColor: 'text-emerald-400',
          title: 'Station Loaded',
          body: `${station.name} is ready. Press play to start streaming.`,
          createdAt: serverTimestamp(),
          unread: true
        });
      } catch (err) {
        console.error('Failed to write tuning notification:', err);
      }
    }
  };

  const handlePlayPodcast = async (podcast: Podcast) => {
    setActiveSegment('podcast');
    setActiveStation(null);
    if (activePodcast?.id === podcast.id) {
      togglePlayPause();
    } else {
      setActivePodcast(podcast);
      try {
        await addDoc(collection(db, 'notifications'), {
          icon: 'podcasts',
          iconColor: 'text-indigo-400',
          title: 'Podcast Started',
          body: `Now playing: "${podcast.title}" from ${podcast.podcastName}.`,
          createdAt: serverTimestamp(),
          unread: true
        });
      } catch (err) {
        console.error('Failed to write podcast notification:', err);
      }
    }
  };

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      audio.play().catch(() => setIsPlaying(false));
      setIsPlaying(true);
    }
  };

  const handleVolume = (v: number) => {
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  };

  const handleSeek = (time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setPodcastProgress(time);
  };

  const toggleFavorite = (stationId: string) => {
    setFavorites(prev => {
      const next = prev.includes(stationId) ? prev.filter(id => id !== stationId) : [...prev, stationId];
      try { localStorage.setItem('aircue_favorites', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // Chat Submission
  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !drawerStation?.id) return;
    try {
      const text = chatInput;
      setChatInput('');
      await addDoc(collection(db, 'chats', drawerStation.id, 'messages'), {
        sender: nickname,
        text,
        timestamp: serverTimestamp()
      });
      await addDoc(collection(db, 'notifications'), {
        icon: 'chat_bubble',
        iconColor: 'text-[#E6C280]',
        title: 'New Chat Message',
        body: `Sent message in ${drawerStation.name}'s chat room: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}".`,
        createdAt: serverTimestamp(),
        unread: true
      });
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  const saveNickname = () => {
    setIsEditingNickname(false);
    localStorage.setItem('aircue_nickname', nickname);
  };

  // Song Request Submission
  const handleSendSongRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestForm.requester.trim() || !requestForm.song.trim() || !drawerStation?.id) return;
    try {
      await addDoc(collection(db, 'requests'), {
        stationId: drawerStation.id,
        stationName: drawerStation.name,
        requester: requestForm.requester,
        song: requestForm.song,
        artist: requestForm.artist || 'Unknown',
        shoutout: requestForm.shoutout || '',
        timestamp: serverTimestamp()
      });
      await addDoc(collection(db, 'notifications'), {
        icon: 'queue_music',
        iconColor: 'text-cyan-400',
        title: 'Song Request Placed',
        body: `Requested "${requestForm.song}" on ${drawerStation.name} for "${requestForm.requester}".`,
        createdAt: serverTimestamp(),
        unread: true
      });
      setRequestSuccess(true);
      setRequestForm({ requester: '', song: '', artist: '', shoutout: '' });
      setTimeout(() => setRequestSuccess(false), 4000);
    } catch (err) {
      console.error('Error requesting song:', err);
    }
  };

  // Derived data
  const allStations = stations;

  // Region & text filtering
  const displayedStations = allStations.filter(s => {
    const matchesQuery = !searchQuery ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.genre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.location?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRegion = activeRegion === 'All' || s.region === activeRegion;
    return matchesQuery && matchesRegion;
  });

  const favoriteStations = allStations.filter(s => s.id && favorites.includes(s.id));

  const recentStations = recentPlayed
    .map(id => allStations.find(s => s.id === id))
    .filter(Boolean) as Station[];

  // Filter schedules for the currently viewed station in the drawer
  const drawerOwnerId = drawerStation?.ownerId;
  const stationSchedules = useMemo(() => {
    if (!drawerOwnerId) return [];
    return schedules.filter(s => s.ownerId === drawerOwnerId);
  }, [schedules, drawerOwnerId]);

  const uniqueSchedules = useMemo(() => {
    return Array.from(
      new Map(stationSchedules.map(item => [`${item.title}-${item.time}`, item])).values()
    );
  }, [stationSchedules]);

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatSleepTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Custom Logo Renderers to match visual layout exactly
  const renderStationLogo = (logoType: string, name: string, roundedClass: string = "rounded-xl") => {
    // Real Firebase Storage / external URL logo
    if (logoType && (logoType.startsWith('http://') || logoType.startsWith('https://'))) {
      return (
        <img
          className={`w-full h-full ${roundedClass} object-contain bg-black/10`}
          src={logoType}
          alt={name}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      );
    }
    if (logoType === 'mock-joy' || name.toLowerCase().includes('joy')) {
      return (
        <div className={`w-full h-full ${roundedClass} flex flex-col items-center justify-center p-1 bg-gradient-to-br from-red-600 via-red-500 to-amber-500 relative overflow-hidden shadow-inner`}>
          <span className="text-[16px] font-black text-white tracking-tighter leading-none">JOY</span>
          <span className="text-[13px] font-extrabold text-yellow-300 tracking-wide leading-none">FM</span>
          <div className="absolute bottom-0 inset-x-0 h-1.5 bg-black/40 flex justify-center items-center">
            <span className="text-[5px] text-white/90 font-bold uppercase">Accra</span>
          </div>
        </div>
      );
    } else if (logoType === 'mock-agoo' || name.toLowerCase().includes('agoo')) {
      return (
        <div className={`w-full h-full ${roundedClass} flex flex-col items-center justify-center p-1 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-600 relative overflow-hidden shadow-inner`}>
          <div className="w-10 h-6 rounded-full border border-white/50 bg-black/20 flex items-center justify-center">
            <span className="text-[9px] font-bold text-white tracking-widest leading-none">AGOO</span>
          </div>
          <span className="text-[8px] text-white font-bold tracking-tighter mt-1">96.9 FM</span>
        </div>
      );
    } else if (logoType === 'mock-empire' || name.toLowerCase().includes('empire')) {
      return (
        <div className={`w-full h-full ${roundedClass} flex flex-col items-center justify-center p-1 bg-gradient-to-br from-purple-800 via-pink-700 to-rose-500 relative overflow-hidden shadow-inner`}>
          <span className="text-[10px] font-black text-white leading-none tracking-tighter">EMPIRE</span>
          <span className="text-[9px] font-semibold text-pink-200 leading-none mt-0.5">102.7</span>
          <span className="text-[6px] text-white/50 uppercase tracking-widest leading-none mt-1">Accra</span>
        </div>
      );
    }

    return (
      <div className={`w-full h-full ${roundedClass} bg-gradient-to-br from-[#8C6A3C] to-[#E6C280] flex items-center justify-center text-white font-bold shadow-md`}>
        <span className="material-symbols-outlined text-[#E6C280] text-[28px]">radio</span>
      </div>
    );
  };

  // Redesigned Station Bento Card
  const StationCard = ({ station, compact = false }: { station: Station; compact?: boolean }) => {
    const isActive = activeStation?.id === station.id && activeSegment === 'live';
    const isFav = station.id ? favorites.includes(station.id) : false;
    const listenerCount = displayCount(station.id);

    if (compact) {
      return (
        <div
          onClick={() => handlePlay(station)}
          className="flex items-center gap-3 bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 p-2 pr-4 rounded-2xl cursor-pointer transition-all select-none group shrink-0"
        >
          <div className={`w-11 h-11 rounded-xl overflow-hidden relative shrink-0 border border-white/5 transition-all ${isActive ? 'ring-2 ring-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.4)]' : ''
            }`}>
            {station.logoUrl
              ? <img className="w-full h-full object-contain rounded-xl" src={station.logoUrl} alt={station.name} />
              : renderStationLogo(station.logoUrl || '', station.name, "rounded-xl")}
            {isActive && isPlaying && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping" />
              </div>
            )}
          </div>
          <div className="flex flex-col justify-center min-w-0">
            <span className="text-[12px] font-bold text-white tracking-wide group-hover:text-cyan-400 transition-colors truncate">
              {station.name}
            </span>
            <span className="text-[10px] text-white/40 truncate">{station.location || station.region}</span>
            <StationListenerBadge
              count={listenerCount}
              variant="compact"
              isActive={isActive && isPlaying}
              className="mt-0.5 text-white/45"
            />
          </div>
        </div>
      );
    }

    return (
      <div
        className={`bento-hover-effect premium-card cursor-pointer relative overflow-hidden group border ${isActive
            ? 'gold-neon-border-active bg-white/[0.04]'
            : 'border-white/[0.06] hover:border-white/15'
          }`}
        onClick={() => handlePlay(station)}
      >
        <div className="w-full min-h-[170px] p-6 flex flex-col justify-between relative z-10">
          {/* Top Row: Logo, Title, status */}
          <div className="flex justify-between items-start gap-4">
            <div className="flex items-center gap-4 min-w-0">
              {/* Logo Frame */}
              <div className="w-15 h-15 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center p-0.5 shadow-lg flex-shrink-0 backdrop-blur-md transition-transform duration-500 group-hover:scale-105 group-hover:rotate-2">
                <div className="w-full h-full rounded-[14px] overflow-hidden bg-white/90">
                  {station.logoUrl
                    ? <img className="w-full h-full object-contain rounded-xl" src={station.logoUrl} alt={station.name} />
                    : renderStationLogo(station.logoUrl || '', station.name)}
                </div>
              </div>

              {/* Title Info */}
              <div className="flex flex-col justify-center min-w-0">
                <span className="font-display-lg text-[17px] font-black tracking-tight text-white group-hover:text-cyan-400 transition-colors truncate">
                  {station.name}
                </span>
                <span className="text-[12px] text-white/50 truncate flex items-center gap-1.5 mt-0.5 font-medium">
                  <span className="material-symbols-outlined text-[13px] text-white/30">radio</span>
                  {station.location || station.region}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1.5 z-20">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black tracking-widest uppercase bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE
              </span>
              <StationListenerBadge
                count={listenerCount}
                variant="card"
                isActive={isActive && isPlaying}
              />
            </div>
          </div>

          {/* Hover Play Glass Overlay */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center z-20">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePlay(station);
              }}
              className="w-14 h-14 rounded-full bg-white text-black shadow-lg flex items-center justify-center transform scale-75 group-hover:scale-100 transition-all duration-300 active:scale-90 hover:bg-cyan-300"
            >
              <span className="material-symbols-outlined text-[28px] ml-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>
                {isActive && isPlaying ? 'pause' : 'play_arrow'}
              </span>
            </button>
          </div>

          {/* Bottom tags & drawer toggles */}
          <div className="flex justify-between items-center mt-5">
            <div className="flex items-center gap-1.5">
              <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-white/5 border border-white/5 text-white/60">
                {station.genre}
              </span>
              <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-white/5 border border-white/5 text-white/60">
                {station.bitrate || '128kbps'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 z-30">
              {station.id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(station.id as string);
                  }}
                  className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/5 border border-white/5 hover:border-pink-500/20 hover:bg-pink-500/10 transition-all cursor-pointer"
                >
                  <span className={`material-symbols-outlined text-[15px] transition-all ${isFav ? 'text-pink-500 glow-rose-heart' : 'text-white/40'
                    }`}
                    style={{ fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    favorite
                  </span>
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDrawerStation(station);
                  setDrawerTab('about');
                }}
                className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/5 border border-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">info</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen w-screen text-[#FFFFFF] select-none flex relative overflow-hidden bg-[#07080f]">

      {/* Dynamic drifting background nebula canvas */}
      <div className="fixed inset-0 -z-20 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute inset-0 bg-[#07080f]" />

        {/* Soft atmospheric radial gradient auras */}
        <div className="absolute top-[-25%] left-[-15%] w-[70%] h-[70%] rounded-full bg-indigo-700/15 blur-[130px]" />
        <div className="absolute top-[15%] right-[-15%] w-[60%] h-[60%] rounded-full bg-purple-700/10 blur-[140px]" />
        <div className="absolute bottom-[-15%] left-[15%] w-[60%] h-[60%] rounded-full bg-cyan-700/12 blur-[120px]" />
        <div className="absolute bottom-[15%] right-[25%] w-[45%] h-[45%] rounded-full bg-amber-600/5 blur-[110px]" />
      </div>

      <audio ref={audioRef} preload="none" className="hidden" />

      {/* ────────────────────────────────────────────────────────
          MOBILE SIDEBAR DRAWER (Slide-out menu for mobile)
          ──────────────────────────────────────────────────────── */}
      {showMobileSidebar && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150] lg:hidden animate-[fadeIn_0.2s_ease-out]" onClick={() => setShowMobileSidebar(false)}>
          <div
            className="w-[290px] h-full bg-[#0a0b12]/98 border-r border-white/10 p-6 flex flex-col justify-between shadow-2xl relative animate-[slideInLeft_0.3s_cubic-bezier(0.16,1,0.3,1)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col gap-6 overflow-y-auto premium-sidebar-scroll pr-1">
              
              {/* Header inside drawer */}
              <div className="flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2.5 hover:opacity-85 transition-opacity" onClick={() => setShowMobileSidebar(false)}>
                  <img src="/logo.png" alt="AirCue Logo" className="h-16 w-auto" />
                </Link>
                <button
                  onClick={() => setShowMobileSidebar(false)}
                  className="w-8.5 h-8.5 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-white/50 hover:text-white transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* Navigation tabs inside drawer */}
              <nav className="flex flex-col gap-1.5 mt-4">
                <div className="text-[9px] text-white/35 font-bold uppercase tracking-widest px-2 mb-1">Navigation</div>
                <button
                  onClick={() => { setActiveSegment('live'); setShowMobileSidebar(false); }}
                  className={`flex items-center gap-3 h-10 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeSegment === 'live'
                      ? 'bg-white/10 text-white gold-neon-border'
                      : 'text-white/50 hover:text-white hover:bg-white/5'
                    }`}
                >
                  <span className="material-symbols-outlined text-[18px]">radio</span>
                  Live Broadcasts
                </button>
                <button
                  onClick={() => { setActiveSegment('podcast'); setShowMobileSidebar(false); }}
                  className={`flex items-center gap-3 h-10 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeSegment === 'podcast'
                      ? 'bg-white/10 text-white gold-neon-border'
                      : 'text-white/50 hover:text-white hover:bg-white/5'
                    }`}
                >
                  <span className="material-symbols-outlined text-[18px]">podcasts</span>
                  Podcasts & Archives
                </button>
                <button
                  onClick={() => { setActiveSegment('youtube'); setShowMobileSidebar(false); }}
                  className={`flex items-center gap-3 h-10 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeSegment === 'youtube'
                      ? 'bg-white/10 text-white gold-neon-border'
                      : 'text-white/50 hover:text-white hover:bg-white/5'
                    }`}
                >
                  <span className="material-symbols-outlined text-[18px]">smart_display</span>
                  Live TV
                </button>
              </nav>

              {/* Favorites inside drawer */}
              <div className="flex flex-col gap-2 mt-4">
                <div className="flex items-center justify-between text-[9px] text-white/35 font-bold uppercase tracking-widest px-2">
                  <span>My Favorites</span>
                  <span className="px-1.5 py-0.5 rounded bg-white/5 text-white/60 font-bold scale-90">{favorites.length}</span>
                </div>
                <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto premium-sidebar-scroll pr-1">
                  {favorites.length === 0 ? (
                    <div className="text-center py-6 text-white/30 border border-dashed border-white/5 rounded-2xl select-none">
                      <span className="material-symbols-outlined text-[16px] mb-1">favorite</span>
                      <p className="text-[10px] leading-relaxed">No favorites added yet.</p>
                    </div>
                  ) : (
                    stations
                      .filter(s => favorites.includes(s.id || ''))
                      .map(station => {
                        const isCurrentActive = activeStation?.id === station.id && activeSegment === 'live';
                        return (
                          <div
                            key={station.id}
                            onClick={() => { handlePlay(station); setShowMobileSidebar(false); }}
                            className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition-all border ${isCurrentActive
                                ? 'bg-white/5 border-white/10'
                                : 'bg-transparent border-transparent hover:bg-white/5'
                              }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-md overflow-hidden flex-shrink-0 relative">
                                {station.logoUrl
                                  ? <img className="w-full h-full object-contain rounded-md bg-white" src={station.logoUrl} alt={station.name} />
                                  : renderStationLogo(station.logoUrl || '', station.name, "rounded-md")}
                              </div>
                              <span className="text-[11px] font-bold text-white/80 truncate">{station.name}</span>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>

            </div>

            {/* User slot inside drawer */}
            <div className="border-t border-white/5 pt-4 shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {appUser ? (
                    <div className="w-8.5 h-8.5 rounded-lg bg-[#E6C280]/10 border border-[#E6C280]/20 flex items-center justify-center text-[#E6C280] font-black text-xs uppercase">
                      {((appUser.firstName?.substring(0, 1) || '') + (appUser.lastName?.substring(0, 1) || '') || appUser.email?.substring(0, 2) || 'U').toUpperCase()}
                    </div>
                  ) : (
                    <div className="w-8.5 h-8.5 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/80">
                      <span className="material-symbols-outlined text-[18px]">account_circle</span>
                    </div>
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="text-[11px] font-bold text-white truncate">
                      {appUser ? `${appUser.firstName || ''} ${appUser.lastName || ''}`.trim() || appUser.email.split('@')[0] : 'Guest User'}
                    </span>
                    <span className="text-[9px] text-white/40 truncate capitalize">
                      {appUser ? `${appUser.role} Account` : 'Free Directory'}
                    </span>
                  </div>
                </div>
                {appUser ? (
                  <button
                    onClick={() => {
                      showConfirm({
                        title: 'Sign Out',
                        message: 'Are you sure you want to sign out of your AirCue account?',
                        type: 'warning',
                        confirmText: 'Sign Out',
                        cancelText: 'Cancel',
                        isDangerous: true,
                        onConfirm: () => {
                          signOut(auth)
                            .then(() => setShowMobileSidebar(false))
                            .catch(err => console.error(err));
                        }
                      });
                    }}
                    className="h-7 px-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 font-semibold text-[10px] hover:bg-red-500/20 active:scale-95 transition-all cursor-pointer"
                  >
                    Sign Out
                  </button>
                ) : (
                  <Link href="/login" prefetch={false} onClick={() => setShowMobileSidebar(false)}>
                    <button className="h-7 px-2.5 rounded-lg bg-white text-black font-semibold text-[10px] hover:bg-white/90 active:scale-95 transition-all cursor-pointer">
                      Sign In
                    </button>
                  </Link>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────
          EQ POPUP MENU
          ──────────────────────────────────────────────────────── */}
      {showEqMenu && (
        <div className="fixed inset-0 z-[110]" onClick={() => setShowEqMenu(false)}>
          <div
            className="absolute bottom-28 left-1/2 -translate-x-1/2 bg-[#0d0e14]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-4 w-60 gold-neon-border"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-[10px] text-white/40 uppercase tracking-widest font-black mb-3 px-1">Studio Equalizer</p>
            <div className="flex flex-col gap-1.5">
              {(Object.keys(EQ_PRESETS) as EqPreset[]).map(preset => (
                <button
                  key={preset}
                  onClick={() => applyEqPreset(preset)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-all cursor-pointer ${activePreset === preset
                      ? 'bg-white text-black font-black'
                      : 'hover:bg-white/5 text-white/70 hover:text-white'
                    }`}
                >
                  <span className="material-symbols-outlined text-[18px]">{EQ_PRESETS[preset].icon}</span>
                  <span className="text-sm font-semibold">{EQ_PRESETS[preset].label}</span>
                  {activePreset === preset && <span className="material-symbols-outlined text-[16px] ml-auto">check</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────
          SLEEP TIMER POPUP MENU
          ──────────────────────────────────────────────────────── */}
      {showSleepTimerMenu && (
        <div className="fixed inset-0 z-[115]" onClick={() => setShowSleepTimerMenu(false)}>
          <div
            className="absolute bottom-44 left-1/2 -translate-x-1/2 bg-[#0d0e14]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-4 w-60"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className="material-symbols-outlined text-[16px] text-[#E6C280]">bedtime</span>
              <p className="text-[10px] text-white/40 uppercase tracking-widest font-black">Sleep Timer</p>
            </div>
            {sleepTimerEnd !== null ? (
              <div className="flex flex-col gap-3">
                <div className="text-center py-3 bg-white/[0.02] rounded-xl border border-white/5">
                  <p className="text-3xl font-black text-white tabular-nums tracking-tight">{formatSleepTimer(sleepTimerRemaining)}</p>
                  <p className="text-[10px] text-white/40 mt-1.5">Until auto-pause</p>
                </div>
                <button
                  onClick={() => { setSleepTimerEnd(null); setSleepTimerRemaining(0); setShowSleepTimerMenu(false); }}
                  className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all text-xs font-bold cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">timer_off</span>
                  Cancel Timer
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {[15, 30, 45, 60].map(mins => (
                  <button
                    key={mins}
                    onClick={() => {
                      setSleepTimerEnd(Date.now() + mins * 60 * 1000);
                      setSleepTimerRemaining(mins * 60);
                      setShowSleepTimerMenu(false);
                    }}
                    className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left hover:bg-white/5 text-white/70 hover:text-white transition-all cursor-pointer text-xs font-semibold"
                  >
                    <span>{mins} minutes</span>
                    <span className="text-[9px] text-white/30 font-mono">{mins}:00</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────
          MOBILE VOLUME POPUP
          ──────────────────────────────────────────────────────── */}
      {showVolumePopup && (
        <div className="fixed inset-0 z-[115] md:hidden" onClick={() => setShowVolumePopup(false)}>
          <div
            className="absolute bottom-44 left-1/2 -translate-x-1/2 bg-[#0d0e14]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-4 w-64"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-[10px] text-white/40 uppercase tracking-widest font-black mb-3 px-1">Volume</p>
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-white/40 text-[20px]">
                {volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
              </span>
              <input
                type="range" min={0} max={1} step={0.05} value={volume}
                onChange={e => handleVolume(Number(e.target.value))}
                className="flex-grow accent-cyan-400 bg-white/20 rounded-full h-1.5 cursor-pointer outline-none"
              />
              <span className="text-[11px] text-white/60 font-bold tabular-nums w-8 text-right">
                {Math.round(volume * 100)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────
          STUDIO DRAWER (Timeline, Chat room, Song Request Console)
          ──────────────────────────────────────────────────────── */}
      {drawerStation && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md z-[120] flex justify-end transition-opacity duration-300" onClick={() => setDrawerStation(null)}>
          <div
            className="w-full max-w-md bg-[#0a0b12]/95 backdrop-blur-3xl h-full flex flex-col border-l border-white/10 shadow-2xl relative"
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer Header details */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-white border border-white/10 p-1 flex items-center justify-center shadow-inner">
                  {drawerStation.logoUrl
                    ? <img className="w-full h-full object-contain rounded-lg" src={drawerStation.logoUrl} alt={drawerStation.name} />
                    : renderStationLogo(drawerStation.logoUrl || '', drawerStation.name, "rounded-lg")}
                </div>
                <div>
                  <h3 className="text-[17px] font-black text-white leading-tight">{drawerStation.name}</h3>
                  <p className="text-xs text-white/50 flex items-center gap-1.5 mt-0.5 font-medium">
                    <span className="material-symbols-outlined text-[13px] text-white/30">radio</span>
                    {drawerStation.location || drawerStation.region}
                  </p>
                </div>
              </div>
              <button
                className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer"
                onClick={() => setDrawerStation(null)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Tab indicators */}
            <div className="flex border-b border-white/5 text-center font-bold text-xs select-none">
              <button
                className={`flex-1 py-3.5 transition-all relative ${drawerTab === 'about' ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
                onClick={() => setDrawerTab('about')}
              >
                Timeline Guide
                {drawerTab === 'about' && <span className="absolute bottom-0 inset-x-0 h-[2px] bg-[#E6C280]" />}
              </button>
              <button
                className={`flex-1 py-3.5 transition-all flex items-center justify-center gap-1.5 relative ${drawerTab === 'chat' ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
                onClick={() => setDrawerTab('chat')}
              >
                Live Chat
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                {drawerTab === 'chat' && <span className="absolute bottom-0 inset-x-0 h-[2px] bg-[#E6C280]" />}
              </button>
              <button
                className={`flex-1 py-3.5 transition-all relative ${drawerTab === 'request' ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
                onClick={() => setDrawerTab('request')}
              >
                Studio Requests
                {drawerTab === 'request' && <span className="absolute bottom-0 inset-x-0 h-[2px] bg-[#E6C280]" />}
              </button>
            </div>

            {/* Drawer Body Scroll container */}
            <div className="flex-grow overflow-y-auto p-6 premium-sidebar-scroll">

              {/* Timeline segment */}
              {drawerTab === 'about' && (
                <div className="space-y-6">
                  {/* Station Telemetry */}
                  <div className="bg-white/[0.02] rounded-2xl p-4 border border-white/5 space-y-3.5">
                    <h4 className="text-[10px] text-white/35 font-bold uppercase tracking-widest leading-none">Console Details</h4>
                    <div className="grid grid-cols-2 gap-3 text-xs font-semibold">
                      <div className="bg-[#07080f] p-3 rounded-xl border border-white/[0.03] flex flex-col gap-0.5">
                        <span className="text-[9px] text-white/30 uppercase">GENRE</span>
                        <span className="text-white font-extrabold">{drawerStation.genre}</span>
                      </div>
                      <div className="bg-[#07080f] p-3 rounded-xl border border-white/[0.03] flex flex-col gap-0.5">
                        <span className="text-[9px] text-white/30 uppercase">STREAM BITRATE</span>
                        <span className="text-white font-extrabold">{drawerStation.bitrate || '128kbps'}</span>
                      </div>
                      <div className="bg-[#07080f] p-3 rounded-xl border border-white/[0.03] flex flex-col gap-0.5">
                        <span className="text-[9px] text-white/30 uppercase">TELEMETRY RELAY</span>
                        <span className="text-cyan-400 font-extrabold truncate">
                          {drawerStation.streamUrl.toLowerCase().includes('m3u8') ? 'HLS Direct' : 'Icecast Relay'}
                        </span>
                      </div>
                      <div className="bg-[#07080f] p-3 rounded-xl border border-white/[0.03] flex flex-col gap-0.5">
                        <span className="text-[9px] text-white/30 uppercase">REGION</span>
                        <span className="text-white font-extrabold">{drawerStation.region}</span>
                      </div>
                    </div>
                  </div>

                  {/* Show Timeline */}
                  <div className="space-y-4">
                    <h4 className="font-display-lg text-[16px] font-bold flex items-center gap-2 text-white">
                      <span className="material-symbols-outlined text-[18px] text-[#E6C280]">calendar_today</span>
                      Broadcast Schedule Guide
                    </h4>

                    <div className="relative border-l border-white/10 ml-3.5 space-y-6 py-2 select-none">
                      {uniqueSchedules.map((show, idx) => {
                        const colors = ['bg-indigo-500', 'bg-purple-500', 'bg-cyan-500'];
                        const textColors = ['text-indigo-400', 'text-purple-400', 'text-cyan-400'];
                        const colorClass = colors[idx % colors.length];
                        const textClass = textColors[idx % textColors.length];

                        return (
                          <div key={show.id || idx} className="relative pl-6">
                            {/* Bouncing Timeline Node */}
                            <div className={`absolute left-[-5px] top-1.5 w-2.5 h-2.5 rounded-full ${colorClass}`} />
                            <span className={`font-mono text-[10px] ${textClass} font-black uppercase tracking-wider`}>
                              {show.time} ({show.days ? show.days.toUpperCase() : 'DAILY'})
                            </span>
                            <h5 className="font-bold text-[13.5px] text-white mt-0.5">{show.title}</h5>
                            <p className="text-xs text-white/50 mt-1 leading-relaxed">
                              Hosted by <span className="font-semibold text-white/70">{show.host}</span>. Streaming from <span className="text-white/60">{show.source}</span> in {show.mode.toLowerCase()} mode.
                            </p>
                          </div>
                        );
                      })}
                      {uniqueSchedules.length === 0 && (
                        <p className="text-xs text-white/30 italic pl-6">No active schedules listed.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Chat segment */}
              {drawerTab === 'chat' && (
                <div className="h-full flex flex-col min-h-[380px]">
                  {/* Nickname Panel */}
                  <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3 flex items-center justify-between mb-4 text-xs font-semibold">
                    <div>
                      <span className="text-white/30 block uppercase tracking-wider text-[9px] font-black leading-none mb-1">Your Chat Alias</span>
                      {isEditingNickname ? (
                        <input
                          type="text"
                          value={nickname}
                          onChange={e => setNickname(e.target.value)}
                          onBlur={saveNickname}
                          onKeyDown={e => e.key === 'Enter' && saveNickname()}
                          className="bg-[#07080f] border border-[#E6C280] px-2.5 py-1 rounded-lg focus:outline-none text-white font-bold mt-1 text-[13px] w-full max-w-[200px]"
                          autoFocus
                        />
                      ) : (
                        <span className="font-black text-white text-[13.5px] mt-0.5">{nickname}</span>
                      )}
                    </div>
                    <button
                      className="text-[#E6C280] font-black hover:underline cursor-pointer"
                      onClick={() => setIsEditingNickname(prev => !prev)}
                    >
                      {isEditingNickname ? 'Save' : 'Edit'}
                    </button>
                  </div>

                  {/* Message board */}
                  <div className="flex-grow space-y-4 min-h-[220px] overflow-y-auto pr-1 mb-4 flex flex-col premium-sidebar-scroll max-h-[380px]">
                    {chatMessages.length === 0 ? (
                      <div className="flex-grow flex flex-col items-center justify-center text-center text-white/30 py-10 gap-1.5">
                        <span className="material-symbols-outlined text-[36px] text-white/20">chat_bubble</span>
                        <p className="text-xs font-semibold leading-relaxed">No messages in room yet.<br />Be the first to say hello!</p>
                      </div>
                    ) : (
                      chatMessages.map(msg => {
                        const isSelf = msg.sender === nickname;
                        return (
                          <div key={msg.id} className={`flex flex-col max-w-[85%] ${isSelf ? 'self-end items-end' : 'self-start items-start'}`}>
                            <span className="text-[10px] text-white/40 font-bold mb-0.5 px-1">{msg.sender}</span>
                            <div className={`px-4 py-2.5 rounded-2xl text-[12.5px] leading-relaxed shadow-sm ${isSelf
                                ? 'bg-gradient-to-br from-indigo-600 to-indigo-500 text-white rounded-tr-none'
                                : 'bg-white/5 border border-white/5 text-white/90 rounded-tl-none'
                              }`}>
                              {msg.text}
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={chatBottomRef} />
                  </div>

                  {/* Input form */}
                  <form onSubmit={handleSendChatMessage} className="flex gap-2 relative z-30 shrink-0">
                    <input
                      type="text"
                      placeholder="Type your message here..."
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      className="flex-grow bg-white/5 border border-white/5 rounded-2xl px-4 py-3 text-xs focus:ring-1 focus:ring-[#E6C280]/40 focus:border-[#E6C280]/40 focus:outline-none text-white placeholder-white/30"
                    />
                    <button type="submit" className="bg-[#E6C280] text-black w-11 h-11 rounded-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all flex-shrink-0 cursor-pointer shadow-md">
                      <span className="material-symbols-outlined text-sm font-black">send</span>
                    </button>
                  </form>
                </div>
              )}

              {/* Request form segment */}
              {drawerTab === 'request' && (
                <div className="space-y-4">
                  <div className="bg-white/5 border border-white/5 rounded-2xl p-4 text-xs leading-relaxed text-white/70 font-semibold">
                    🎙️ Submit show requests directly to the broadcaster. The DJ will see your song suggestions and shoutout inside their dashboard queue!
                  </div>

                  {requestSuccess ? (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl p-6 text-center space-y-2">
                      <span className="material-symbols-outlined text-3xl">check_circle</span>
                      <p className="font-bold text-sm">Request Placed successfully!</p>
                      <p className="text-xs text-white/50">Your suggestion was sent directly to the broadcaster&apos;s queue.</p>
                    </div>
                  ) : (
                    <form onSubmit={handleSendSongRequest} className="space-y-4 text-xs font-semibold text-white/50 select-none">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-white/40 uppercase tracking-widest">Your Name</label>
                        <input
                          type="text"
                          required
                          value={requestForm.requester}
                          onChange={e => setRequestForm(prev => ({ ...prev, requester: e.target.value }))}
                          className="bg-white/5 border border-white/5 focus:border-[#E6C280]/40 rounded-xl px-4 py-3 focus:outline-none text-white"
                          placeholder="e.g. Kofi Boateng"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-white/40 uppercase tracking-widest">Song Title</label>
                        <input
                          type="text"
                          required
                          value={requestForm.song}
                          onChange={e => setRequestForm(prev => ({ ...prev, song: e.target.value }))}
                          className="bg-white/5 border border-white/5 focus:border-[#E6C280]/40 rounded-xl px-4 py-3 focus:outline-none text-white"
                          placeholder="e.g. Aseda"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-white/40 uppercase tracking-widest">Artist / Band</label>
                        <input
                          type="text"
                          value={requestForm.artist}
                          onChange={e => setRequestForm(prev => ({ ...prev, artist: e.target.value }))}
                          className="bg-white/5 border border-white/5 focus:border-[#E6C280]/40 rounded-xl px-4 py-3 focus:outline-none text-white"
                          placeholder="e.g. Nacee"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-white/40 uppercase tracking-widest">Personal Shoutout Message</label>
                        <textarea
                          rows={3}
                          value={requestForm.shoutout}
                          onChange={e => setRequestForm(prev => ({ ...prev, shoutout: e.target.value }))}
                          className="bg-white/5 border border-white/5 focus:border-[#E6C280]/40 rounded-xl px-4 py-3 focus:outline-none text-white custom-thin-scrollbar"
                          placeholder="Shoutout to my colleagues listening live in Accra!"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full bg-[#E6C280] text-black py-3.5 rounded-xl font-extrabold hover:scale-[1.01] active:scale-95 transition-all text-sm shadow-lg shadow-[#E6C280]/15 cursor-pointer mt-2"
                      >
                        Submit Studio Request
                      </button>
                    </form>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────
          1. STICKY SIDEBAR NAVIGATION CONTROLS
          ──────────────────────────────────────────────────────── */}
      <aside className="w-[280px] hidden lg:flex flex-col border-r border-white/5 bg-black/40 backdrop-blur-3xl h-screen sticky top-0 z-40 p-6 select-none justify-between shrink-0">
        <div className="flex flex-col gap-8 h-full min-h-0">

          {/* AirCue Logo identity */}
          <Link href="/" className="flex items-center gap-3.5 group px-2 hover:opacity-90 transition-opacity">
            <img src="/logo.png" alt="AirCue Logo" className="h-20 w-auto group-hover:scale-105 transition-transform duration-300" />
          </Link>

          {/* Segment selection tabs */}
          <nav className="flex flex-col gap-1.5">
            <div className="text-[10px] text-white/35 font-bold uppercase tracking-widest px-3 mb-2">Main Menu</div>

            <button
              onClick={() => setActiveSegment('live')}
              className={`flex items-center gap-3.5 h-11 px-4 rounded-xl text-[14px] font-semibold tracking-wide transition-all cursor-pointer ${activeSegment === 'live'
                  ? 'bg-white/10 text-white gold-neon-border'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
                }`}
            >
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: activeSegment === 'live' ? "'FILL' 1" : "'FILL' 0" }}>radio</span>
              Live Broadcasts
            </button>

            <button
              onClick={() => setActiveSegment('podcast')}
              className={`flex items-center gap-3.5 h-11 px-4 rounded-xl text-[14px] font-semibold tracking-wide transition-all cursor-pointer ${activeSegment === 'podcast'
                  ? 'bg-white/10 text-white gold-neon-border'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
                }`}
            >
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: activeSegment === 'podcast' ? "'FILL' 1" : "'FILL' 0" }}>podcasts</span>
              Podcasts & Archives
            </button>

            <button
              onClick={() => setActiveSegment('youtube')}
              className={`flex items-center gap-3.5 h-11 px-4 rounded-xl text-[14px] font-semibold tracking-wide transition-all cursor-pointer ${activeSegment === 'youtube'
                  ? 'bg-white/10 text-white gold-neon-border'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
                }`}
            >
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: activeSegment === 'youtube' ? "'FILL' 1" : "'FILL' 0" }}>smart_display</span>
              Live TV
            </button>
          </nav>

          {/* Sidebar Favorites panel */}
          <div className="flex flex-col flex-grow min-h-0 gap-2 mt-4">
            <div className="flex items-center justify-between text-[10px] text-white/35 font-bold uppercase tracking-widest px-3">
              <span>My Favorites</span>
              <span className="px-2 py-0.5 rounded bg-white/5 text-white/60 font-bold">{favorites.length}</span>
            </div>

            <div className="flex-1 overflow-y-auto premium-sidebar-scroll pr-1 flex flex-col gap-1.5">
              {favorites.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-6 text-center text-white/30 border border-dashed border-white/5 rounded-2xl mt-2 select-none">
                  <span className="material-symbols-outlined text-[20px] mb-1">favorite</span>
                  <span className="text-[10px] font-medium leading-relaxed">No favorites added yet. Click the heart on any card.</span>
                </div>
              ) : (
                stations
                  .filter(station => favorites.includes(station.id || ''))
                  .map(station => {
                    const isCurrentActive = activeStation?.id === station.id && activeSegment === 'live';
                    return (
                      <div
                        key={station.id}
                        onClick={() => handlePlay(station)}
                        className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all border group ${isCurrentActive
                            ? 'bg-white/5 border-white/10'
                            : 'bg-transparent border-transparent hover:bg-white/5'
                          }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 relative">
                            {station.logoUrl
                              ? <img className="w-full h-full object-contain rounded-lg bg-white" src={station.logoUrl} alt={station.name} />
                              : renderStationLogo(station.logoUrl || '', station.name, "rounded-lg")}
                            {isCurrentActive && isPlaying && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping" />
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className={`text-[13px] font-bold truncate transition-colors ${isCurrentActive ? 'text-cyan-400' : 'text-white/80 group-hover:text-white'}`}>
                              {station.name}
                            </span>
                            <span className="text-[10px] text-white/40 truncate">{station.genre}</span>
                          </div>
                        </div>

                        {isCurrentActive && isPlaying && (
                          <div className="flex items-end gap-[2px] h-3 pr-2">
                            <span className="w-[1.5px] h-2 bg-cyan-400 rounded-full animate-[sleekWave_0.8s_infinite_ease-in-out_alternate]" />
                            <span className="w-[1.5px] h-3 bg-cyan-400 rounded-full animate-[sleekWave_0.6s_infinite_ease-in-out_alternate]" style={{ animationDelay: '0.15s' }} />
                            <span className="w-[1.5px] h-1 bg-cyan-400 rounded-full animate-[sleekWave_0.7s_infinite_ease-in-out_alternate]" style={{ animationDelay: '0.3s' }} />
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          </div>

        </div>

        {/* User slot */}
        <div className="flex flex-col gap-4 border-t border-white/5 pt-4 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {appUser ? (
                <div className="w-10 h-10 rounded-xl bg-[#E6C280]/10 border border-[#E6C280]/20 flex items-center justify-center text-[#E6C280] font-black text-sm shadow-inner select-none uppercase">
                  {((appUser.firstName?.substring(0, 1) || '') + (appUser.lastName?.substring(0, 1) || '') || appUser.email?.substring(0, 2) || 'U').toUpperCase()}
                </div>
              ) : (
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/80 transition-all cursor-pointer">
                  <span className="material-symbols-outlined text-[22px]">account_circle</span>
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-bold text-white truncate">
                  {appUser ? `${appUser.firstName || ''} ${appUser.lastName || ''}`.trim() || appUser.email.split('@')[0] : 'Guest User'}
                </span>
                <span className="text-[10px] text-white/40 truncate capitalize">
                  {appUser ? `${appUser.role} Account` : 'Free Directory'}
                </span>
              </div>
            </div>
            {appUser ? (
              <button
                onClick={() => {
                  showConfirm({
                    title: 'Sign Out',
                    message: 'Are you sure you want to sign out of your AirCue account?',
                    type: 'warning',
                    confirmText: 'Sign Out',
                    cancelText: 'Cancel',
                    isDangerous: true,
                    onConfirm: () => {
                      signOut(auth).catch(err => console.error('Sign out failed:', err));
                    }
                  });
                }}
                className="h-8 px-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 font-semibold text-[11px] hover:bg-red-500/20 hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                Sign Out
              </button>
            ) : (
              <Link href="/login" prefetch={false}>
                <button className="h-8 px-4 rounded-lg bg-white text-black font-semibold text-[11px] hover:bg-white/90 hover:scale-105 active:scale-95 transition-all cursor-pointer">
                  Sign In
                </button>
              </Link>
            )}
          </div>
        </div>
      </aside>

      {/* ────────────────────────────────────────────────────────
          2. MAIN AUDIO DASHBOARD GRID
          ──────────────────────────────────────────────────────── */}
      <main className="flex-grow container mx-auto px-6 lg:px-8 pt-6 pb-48 md:pb-32 z-10 flex flex-col gap-6 overflow-y-auto h-full scrollbar-hide">

        {/* minimal cockpit header */}
        <header className="w-full sticky top-0 -mt-6 pt-6 pb-3 bg-[#07080f]/90 backdrop-blur-md border-b border-white/5 z-30 flex flex-col lg:flex-row lg:h-20 items-stretch lg:items-center justify-between gap-4 shrink-0">

          {/* Logo brand and icons row on Mobile/Tablet */}
          <div className="flex items-center justify-between lg:hidden w-full shrink-0">
            <div className="flex items-center gap-3">
              {/* Logo Brand */}
              <Link href="/" className="flex items-center gap-2.5 hover:opacity-85 transition-opacity">
                <img src="/logo.png" alt="AirCue Logo" className="h-16 w-auto" />
              </Link>
            </div>

            {/* Notification trigger on Mobile right side */}
            <div className="relative notification-container">
              <button
                onClick={() => setShowNotifPanel(prev => !prev)}
                className="relative w-10 h-10 rounded-xl bg-white/5 border border-white/5 text-white/60 hover:text-white transition-all flex items-center justify-center cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">notifications</span>
                {unreadNotifCount > 0 && (
                  <span className="absolute top-3 right-3 w-1.5 h-1.5 bg-pink-500 rounded-full shadow-[0_0_6px_rgba(244,63,94,0.6)] animate-pulse" />
                )}
              </button>
              
              {showNotifPanel && (
                <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)] border border-white/10 bg-[#0d0e14]/95 backdrop-blur-2xl overflow-hidden z-[200] gold-neon-border text-xs">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">Notifications</span>
                      {unreadNotifCount > 0 && (
                        <span className="bg-[#E6C280] text-black text-[9px] font-black px-1.5 py-0.5 rounded-full">{unreadNotifCount}</span>
                      )}
                    </div>
                    {unreadNotifCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-[#E6C280] font-bold hover:underline bg-transparent border-none cursor-pointer"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  {/* List */}
                  <div className="max-h-[250px] overflow-y-auto divide-y divide-white/5 premium-sidebar-scroll">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-6 text-center text-white/40">
                        <span className="material-symbols-outlined text-2xl opacity-30 mb-1">notifications_off</span>
                        <p className="font-semibold">No notifications yet</p>
                      </div>
                    ) : (
                      notifications.map(n => {
                        const timeStr = getRelativeTime(n.createdAt);
                        return (
                          <div
                            key={n.id}
                            onClick={() => handleMarkAsRead(n.id)}
                            className={`flex gap-2.5 px-3 py-3 cursor-pointer hover:bg-white/[0.03] transition-colors ${n.unread ? 'bg-cyan-500/[0.03]' : ''}`}
                          >
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${n.unread ? 'bg-cyan-400/10 text-cyan-400' : 'bg-white/5 text-white/40'}`}>
                              <span className={`material-symbols-outlined text-[14px] ${n.iconColor || ''}`}>{n.icon || 'sensors'}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className={`text-[11px] truncate text-white ${n.unread ? 'font-black' : 'font-semibold text-white/80'}`}>{n.title}</p>
                                <span className="text-[8px] text-white/30 whitespace-nowrap">{timeStr}</span>
                              </div>
                              <p className="text-[10px] text-white/50 mt-0.5 leading-normal line-clamp-2">{n.body}</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* search pills */}
          <div className="w-full lg:max-w-sm relative search-container" ref={searchModalRef}>
            <div className="relative w-full group">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search stations, genres, frequencies..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchModal(e.target.value.length > 0);
                }}
                onFocus={() => { if (searchQuery.length > 0) setShowSearchModal(true); }}
                className="w-full h-11 bg-white/5 border border-white/5 hover:border-white/15 focus:border-[#E6C280]/40 rounded-2xl pl-11 pr-4 text-[13px] text-white outline-none transition-all placeholder-white/30 backdrop-blur-md"
              />
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 text-[18px] group-hover:text-white/60 transition-colors">
                search
              </span>
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); setShowSearchModal(false); }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>

            {/* ── Search Results Modal ───────────────────────────── */}
            {showSearchModal && searchQuery.trim().length > 0 && (() => {
              const q = searchQuery.toLowerCase();
              const matchedStations = stations.filter(s =>
                s.name.toLowerCase().includes(q) ||
                s.genre.toLowerCase().includes(q) ||
                (s.location || '').toLowerCase().includes(q) ||
                (s.region || '').toLowerCase().includes(q)
              ).slice(0, 6);
              const matchedPodcasts = podcasts.filter(p =>
                p.title.toLowerCase().includes(q) ||
                p.podcastName.toLowerCase().includes(q) ||
                (p.genre || '').toLowerCase().includes(q)
              ).slice(0, 4);
              const totalResults = matchedStations.length + matchedPodcasts.length;
              return (
                <div className="absolute top-[calc(100%+8px)] left-0 w-full min-w-[320px] max-w-[420px] bg-[#0a0b14]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.7)] z-[200] overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 pt-3.5 pb-2 border-b border-white/5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                      {totalResults === 0 ? 'No results' : `${totalResults} result${totalResults !== 1 ? 's' : ''} for "${searchQuery}"`}
                    </span>
                    <button onClick={() => { setShowSearchModal(false); setSearchQuery(''); }} className="text-white/30 hover:text-white transition-colors cursor-pointer">
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>

                  <div className="max-h-[420px] overflow-y-auto">
                    {totalResults === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-white/30">
                        <span className="material-symbols-outlined text-[40px] mb-2">search_off</span>
                        <p className="text-[13px] font-semibold">Nothing matched &quot;{searchQuery}&quot;</p>
                        <p className="text-[11px] mt-1">Try a station name, genre, or region</p>
                      </div>
                    ) : (
                      <>
                        {/* Station Results */}
                        {matchedStations.length > 0 && (
                          <div className="pt-2 pb-1">
                            <p className="px-4 py-1.5 text-[9px] font-black uppercase tracking-[0.15em] text-white/30">Radio Stations</p>
                            {matchedStations.map(station => {
                              const isActive = activeStation?.id === station.id;
                              const searchListenerCount = displayCount(station.id);
                              return (
                                <button
                                  key={station.id}
                                  onClick={() => {
                                    queueMicrotask(() => {
                                      // eslint-disable-next-line react-hooks/refs -- invoked asynchronously from a click handler; audio refs are not read during render.
                                      void handlePlay(station);
                                    });
                                    setShowSearchModal(false);
                                    setSearchQuery('');
                                  }}
                                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors group text-left cursor-pointer ${
                                    isActive ? 'bg-white/[0.04]' : ''
                                  }`}
                                >
                                  {/* Mini logo */}
                                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/10 flex-shrink-0 flex items-center justify-center">
                                    {station.logoUrl
                                      ? <img src={station.logoUrl} alt={station.name} className="w-full h-full object-contain" />
                                      : <span className="material-symbols-outlined text-[18px] text-white/40" style={{ fontVariationSettings: "'FILL' 1" }}>radio</span>
                                    }
                                  </div>
                                  {/* Info */}
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-[13px] font-black truncate leading-tight transition-colors ${ isActive ? 'text-cyan-400' : 'text-white group-hover:text-cyan-300' }`}>
                                      {station.name}
                                    </p>
                                    <p className="text-[11px] text-white/40 truncate font-medium mt-0.5">
                                      {station.location || station.region} &bull; {station.genre}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <StationListenerBadge
                                      count={searchListenerCount}
                                      variant="pill"
                                      isActive={isActive && isPlaying}
                                    />
                                    <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
                                      <span className="material-symbols-outlined text-[14px] text-white/50 group-hover:text-cyan-400" style={{ fontVariationSettings: "'FILL' 1" }}>
                                        {isActive && isPlaying ? 'pause' : 'play_arrow'}
                                      </span>
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Podcast Results */}
                        {matchedPodcasts.length > 0 && (
                          <div className={`pb-2 ${matchedStations.length > 0 ? 'border-t border-white/5 pt-2' : 'pt-2'}`}>
                            <p className="px-4 py-1.5 text-[9px] font-black uppercase tracking-[0.15em] text-white/30">Podcasts</p>
                            {matchedPodcasts.map(podcast => {
                              const isActive = activePodcast?.id === podcast.id;
                              return (
                                <button
                                  key={podcast.id}
                                  onClick={() => {
                                    handlePlayPodcast(podcast);
                                    setShowSearchModal(false);
                                    setSearchQuery('');
                                  }}
                                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors group text-left cursor-pointer ${
                                    isActive ? 'bg-white/[0.04]' : ''
                                  }`}
                                >
                                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-indigo-950/60 flex-shrink-0 flex items-center justify-center border border-white/5">
                                    {podcast.logoUrl
                                      ? <img src={podcast.logoUrl} alt={podcast.title} className="w-full h-full object-cover" />
                                      : <span className="material-symbols-outlined text-[18px] text-indigo-400">mic</span>
                                    }
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-[13px] font-black truncate leading-tight transition-colors ${ isActive ? 'text-indigo-400' : 'text-white group-hover:text-indigo-300' }`}>
                                      {podcast.title}
                                    </p>
                                    <p className="text-[11px] text-white/40 truncate font-medium mt-0.5">
                                      {podcast.podcastName}{podcast.genre ? ` • ${podcast.genre}` : ''}
                                    </p>
                                  </div>
                                  <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors">
                                    <span className="material-symbols-outlined text-[14px] text-white/50 group-hover:text-indigo-400" style={{ fontVariationSettings: "'FILL' 1" }}>
                                      {isActive && isPlaying ? 'pause' : 'play_arrow'}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Footer hint */}
                  {totalResults > 0 && (
                    <div className="border-t border-white/5 px-4 py-2.5 flex items-center gap-2 text-white/25">
                      <span className="material-symbols-outlined text-[13px]">keyboard_return</span>
                      <span className="text-[10px] font-semibold">Click a result to load it in the player</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* widgets (Desktop only) */}
          <div className="hidden lg:flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3.5 h-11 rounded-2xl bg-white/5 border border-white/5 text-[11px] font-semibold text-white/65 tracking-widest uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>{currentTimeStr}</span>
            </div>

            <div ref={notifRef} className="relative notification-container">
              <button
                onClick={() => setShowNotifPanel(prev => !prev)}
                className="relative w-11 h-11 rounded-2xl bg-white/5 border border-white/5 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/15 transition-all flex items-center justify-center cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">notifications</span>
                {unreadNotifCount > 0 && (
                  <span className="absolute top-3.5 right-3.5 w-2 h-2 bg-pink-500 rounded-full shadow-[0_0_8px_rgba(244,63,94,0.6)] animate-pulse" />
                )}
              </button>

              {showNotifPanel && (
                <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)] border border-white/10 bg-[#0d0e14]/95 backdrop-blur-2xl overflow-hidden z-[200] gold-neon-border text-xs">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">Notifications</span>
                      {unreadNotifCount > 0 && (
                        <span className="bg-[#E6C280] text-black text-[9px] font-black px-1.5 py-0.5 rounded-full">{unreadNotifCount}</span>
                      )}
                    </div>
                    {unreadNotifCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-[#E6C280] font-bold hover:underline bg-transparent border-none cursor-pointer"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  {/* List */}
                  <div className="max-h-[300px] overflow-y-auto divide-y divide-white/5 premium-sidebar-scroll">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-white/40">
                        <span className="material-symbols-outlined text-3xl opacity-30 mb-1">notifications_off</span>
                        <p className="font-semibold">No notifications yet</p>
                      </div>
                    ) : (
                      notifications.map(n => {
                        const timeStr = getRelativeTime(n.createdAt);
                        return (
                          <div
                            key={n.id}
                            onClick={() => handleMarkAsRead(n.id)}
                            className={`flex gap-3 px-4 py-3.5 cursor-pointer hover:bg-white/[0.03] transition-colors ${n.unread ? 'bg-cyan-500/[0.03]' : ''}`}
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${n.unread ? 'bg-cyan-400/10 text-cyan-400' : 'bg-white/5 text-white/40'
                              }`}>
                              <span className={`material-symbols-outlined text-[16px] ${n.iconColor || ''}`}>{n.icon || 'sensors'}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className={`text-xs truncate text-white ${n.unread ? 'font-black' : 'font-semibold text-white/80'}`}>{n.title}</p>
                                <span className="text-[9px] text-white/30 whitespace-nowrap">{timeStr}</span>
                              </div>
                              <p className="text-[11px] text-white/50 mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

        </header>

        {/* ────────────────────────────────────────────────────────
            CINEMATIC ACTIVE PLAYING BANNER (THE CYBER TURNTABLE)
            ──────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-indigo-950/20 via-purple-950/15 to-[#07080f]/90 border border-white/[0.07] p-5 md:p-8 shadow-2xl flex flex-col md:flex-row items-center gap-8 justify-between min-h-[320px] shrink-0 select-none">

          <div className="absolute inset-0 -z-10 pointer-events-none">
            <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[70%] bg-indigo-500/10 blur-[80px] rounded-full" />
            <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[60%] bg-purple-500/10 blur-[90px] rounded-full" />
          </div>

          {/* active text details */}
          <div className="flex flex-col items-start gap-5 max-w-lg z-10 w-full md:w-1/2">

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                {activeSegment === 'live' ? 'LIVE ON-AIR' : 'PODCAST MODE'}
              </span>
              <span className="px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase bg-white/5 border border-white/5 text-white/50">
                {activeSegment === 'live'
                  ? (activeStation?.bitrate || '128kbps')
                  : (activePodcast?.genre || 'Podcast')}
              </span>
            </div>

            <div className="flex flex-col gap-1.5 w-full">
              <span className="text-[12px] font-black text-cyan-400 uppercase tracking-widest">Now Broadcasting</span>
              <h1 className="font-display-lg text-2xl sm:text-3xl md:text-5xl font-black tracking-tight text-white leading-none truncate">
                {activeSegment === 'live'
                  ? (activeStation?.name || 'Select Station')
                  : (activePodcast?.title || 'Select Episode')}
              </h1>
              <p className="text-[14px] text-white/50 flex items-center gap-2 font-medium">
                <span className="material-symbols-outlined text-[16px] text-white/30">
                  {activeSegment === 'live' ? 'radio' : 'podcast'}
                </span>
                {activeSegment === 'live'
                  ? (activeStation?.location || 'Unknown frequency')
                  : (activePodcast?.podcastName || 'Ghana Archive')}
                <span className="w-1 h-1 rounded-full bg-white/20" />
                {activeSegment === 'live' ? (activeStation?.region || 'Ghana') : 'Ghana'}
              </p>
            </div>

            {/* active telemetry metadata */}
            <div className="flex flex-wrap items-start gap-6 mt-1 border-t border-b border-white/5 py-3.5 w-full select-none">
              {activeSegment === 'live' && activeStation?.id && (
                <div className="flex flex-col">
                  <span className="text-[11px] text-white/40 uppercase tracking-wider font-bold">Listening now</span>
                  <span className="text-xl font-bold text-white tracking-wide flex items-center gap-2 mt-0.5">
                    <span className="material-symbols-outlined text-[18px] text-cyan-400" style={{ fontVariationSettings: "'FILL' 1" }}>group</span>
                    {displayCount(activeStation.id) > 0 ? (
                      formatListenerLabel(displayCount(activeStation.id))
                    ) : (
                      <span className="text-white/35 text-base font-semibold">Be the first</span>
                    )}
                  </span>
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-[11px] text-white/40 uppercase tracking-wider font-bold">Equalizer Preset</span>
                <span className="text-xl font-bold tracking-wide flex items-center gap-2 mt-0.5 text-[#E6C280]">
                  <span className="material-symbols-outlined text-[18px]">{EQ_PRESETS[activePreset].icon}</span>
                  {EQ_PRESETS[activePreset].label}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 mt-2 select-none">
              <button
                onClick={togglePlayPause}
                disabled={
                  (activeSegment === 'live' && (!activeStation || !activeStation.streamUrl)) ||
                  (activeSegment === 'podcast' && (!activePodcast || !activePodcast.streamUrl))
                }
                className="w-14 h-14 rounded-2xl bg-white text-black flex items-center justify-center hover:bg-cyan-300 hover:scale-105 active:scale-95 transition-all disabled:opacity-40 cursor-pointer shadow-[0_8px_24px_rgba(255,255,255,0.15)] shrink-0"
              >
                <span className="material-symbols-outlined text-[28px] text-black" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {isPlaying ? 'pause' : 'play_arrow'}
                </span>
              </button>

              {activeSegment === 'live' && activeStation && (
                <button
                  onClick={() => toggleFavorite(activeStation.id || '')}
                  className="w-14 h-14 rounded-2xl border border-white/10 hover:border-pink-500/40 hover:bg-pink-500/10 flex items-center justify-center transition-all cursor-pointer group"
                >
                  <span className={`material-symbols-outlined text-[20px] transition-all ${favorites.includes(activeStation.id || '') ? 'text-pink-500 glow-rose-heart' : 'text-white/40 group-hover:text-white'
                    }`}
                    style={{ fontVariationSettings: favorites.includes(activeStation.id || '') ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    favorite
                  </span>
                </button>
              )}
            </div>

          </div>

          {/* rotating vinyl disc and physical tonearm deck */}
          <div className="flex w-full md:w-1/2 items-center justify-center relative p-4 h-64 md:h-auto select-none">

            {/* pulse radial halo */}
            <div className={`absolute w-60 h-60 rounded-full bg-indigo-500/10 blur-[30px] border border-indigo-500/25 transition-all duration-[2000ms] ${isPlaying ? 'scale-110 opacity-80 animate-pulse' : 'scale-90 opacity-40'
              }`} />

            {/* vinyl disc container */}
            <div className={`w-[210px] h-[210px] rounded-full bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900 border-4 border-neutral-800 shadow-[0_15px_40px_rgba(0,0,0,0.8)] flex items-center justify-center relative select-none vinyl-rotation ${isPlaying ? 'animation-running' : 'animation-paused'
              }`}>
              <div className="absolute inset-2 rounded-full border border-neutral-700/10" />
              <div className="absolute inset-5 rounded-full border border-neutral-700/10" />
              <div className="absolute inset-8 rounded-full border border-neutral-700/15" />
              <div className="absolute inset-11 rounded-full border border-neutral-700/15" />
              <div className="absolute inset-14 rounded-full border border-neutral-700/20" />

              {/* vinyl sticker logo */}
              <div className="w-16 h-16 rounded-full bg-neutral-900 border-2 border-neutral-800 flex items-center justify-center overflow-hidden shadow-md relative z-10 pointer-events-none">
                {activeSegment === 'live' && activeStation ? (
                  renderStationLogo(activeStation.logoUrl || '', activeStation.name, "rounded-full")
                ) : activeSegment === 'podcast' && activePodcast ? (
                  <div className="w-full h-full rounded-full bg-indigo-950 flex items-center justify-center overflow-hidden shadow-inner">
                    {activePodcast.logoUrl
                      ? <img src={activePodcast.logoUrl} alt="" className="w-full h-full object-cover" />
                      : <span className="material-symbols-outlined text-primary text-xl">mic</span>}
                  </div>
                ) : (
                  <div className="w-full h-full bg-cyan-950 flex items-center justify-center rounded-full">
                    <span className="material-symbols-outlined text-cyan-400 text-lg">radio</span>
                  </div>
                )}
                {/* Spindle hole */}
                <div className="absolute w-3 h-3 rounded-full bg-[#07080f] border border-neutral-800/80 z-20" />
              </div>
            </div>

            {/* Tonearm */}
            <div
              className="absolute -top-4 right-1/4 w-14 h-32 pointer-events-none transition-transform duration-[1200ms] origin-top-left z-20"
              style={{
                transform: isPlaying ? 'rotate(17deg)' : 'rotate(0deg)',
              }}
            >
              <div className="w-[5px] h-20 bg-gradient-to-r from-neutral-300 via-neutral-400 to-neutral-300 shadow-md ml-[24px]" />
              <div className="w-4 h-4 rounded-full bg-neutral-800 border border-neutral-600 absolute top-0 left-5" />
              <div className="w-[12px] h-6 bg-neutral-800 border-r-2 border-yellow-500 absolute bottom-6 left-[21px] transform rotate-[10deg]" />
            </div>

          </div>

        </section>

        {/* ────────────────────────────────────────────────────────
            QUICK ROW: RECENTLY PLAYED
            ──────────────────────────────────────────────────────── */}
        {recentStations.length > 0 && activeSegment === 'live' && (
          <section className="flex flex-col gap-3 shrink-0 select-none">
            <div className="flex items-center gap-2 text-white/40 text-[10px] uppercase font-bold tracking-widest px-1">
              <span className="material-symbols-outlined text-[16px] text-white/30" style={{ fontVariationSettings: "'FILL' 1" }}>history</span>
              Recently Played Channels
            </div>

            <div className="flex gap-5 items-center overflow-x-auto scrollbar-hide py-1">
              {recentStations.map((station) => (
                <StationCard key={station.id} station={station} compact />
              ))}
            </div>
          </section>
        )}

        {/* ────────────────────────────────────────────────────────
            TABS & FILTERS Row
            ──────────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-4 mt-2 shrink-0 select-none">

          <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/5 pb-3.5 gap-4">

            <div>
              <h2 className="font-display-lg text-[26px] font-black tracking-tight text-white leading-none">
                {activeSegment === 'live'
                  ? 'Ghanaian Broadcast Directory'
                  : activeSegment === 'podcast'
                    ? 'On-Demand Podcast Catchups'
                    : 'Live TV & Video Streams'}
              </h2>
              <p className="text-[13px] text-white/40 mt-1 font-medium">
                {activeSegment === 'live'
                  ? (loading ? 'Connecting live...' : `Broadcasting live in ${activeRegion === 'All' ? 'all regions' : activeRegion}`)
                  : activeSegment === 'podcast'
                    ? `${podcasts.length} catchups and show archives published`
                    : 'Watch live TV channels, webcams, and video broadcasts'}
              </p>
            </div>

            {/* Live / Podcast Switcher */}
            <div className="flex bg-white/5 border border-white/5 rounded-2xl p-1 relative">
              <button
                onClick={() => setActiveSegment('live')}
                className={`px-5 py-2 rounded-xl text-[12px] font-bold tracking-wide transition-all cursor-pointer ${activeSegment === 'live'
                    ? 'bg-white text-black font-extrabold shadow-md'
                    : 'text-white/55 hover:text-white'
                  }`}
              >
                Live Radio
              </button>
              <button
                onClick={() => setActiveSegment('podcast')}
                className={`px-5 py-2 rounded-xl text-[12px] font-bold tracking-wide transition-all cursor-pointer ${activeSegment === 'podcast'
                    ? 'bg-white text-black font-extrabold shadow-md'
                    : 'text-white/55 hover:text-white'
                  }`}
              >
                Podcasts & Archive
              </button>
              <button
                onClick={() => setActiveSegment('youtube')}
                className={`px-5 py-2 rounded-xl text-[12px] font-bold tracking-wide transition-all cursor-pointer ${activeSegment === 'youtube'
                    ? 'bg-white text-black font-extrabold shadow-md'
                    : 'text-white/55 hover:text-white'
                  }`}
              >
                Live TV
              </button>
            </div>

          </div>

          {/* Region Chips */}
          {activeSegment === 'live' && (
            <div className="flex gap-2 items-center overflow-x-auto scrollbar-hide py-1.5 px-1 -mx-1">
              {GHANA_REGIONS.map((reg) => {
                const isActive = activeRegion === reg;
                return (
                  <button
                    key={reg}
                    onClick={() => setActiveRegion(reg)}
                    className={`h-9 px-4 rounded-full text-[12px] font-semibold tracking-wide transition-all duration-300 cursor-pointer flex items-center border hover:scale-[1.02] active:scale-[0.98] select-none shrink-0 ${isActive
                        ? 'bg-cyan-400 text-black border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.35)] font-bold'
                        : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20'
                      }`}
                  >
                    <span>{reg}</span>
                  </button>
                );
              })}
            </div>
          )}

        </section>

        {/* ────────────────────────────────────────────────────────
            THE GRID DIRECTORY CONTENT
            ──────────────────────────────────────────────────────── */}
        <section className="flex-grow select-none">
          {activeSegment === 'live' ? (
            /* Live grid */
            loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-white/5 border border-white/5 rounded-3xl animate-pulse h-48" />
                ))}
              </div>
            ) : displayedStations.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-center text-white/40 border border-dashed border-white/5 rounded-3xl bg-white/5">
                <span className="material-symbols-outlined text-[42px] text-white/20 mb-2">search_off</span>
                <h3 className="text-[16px] font-bold text-white">No active stations found</h3>
                <p className="text-[13px] text-white/40 mt-1 max-w-sm">No channels match search &quot;{searchQuery}&quot; or region &quot;{activeRegion}&quot;.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-12">
                {displayedStations.map(station => (
                  <StationCard key={station.id} station={station} />
                ))}
              </div>
            )
          ) : activeSegment === 'podcast' ? (
            /* Podcast grid */
            podcastsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-44 bg-white/5 border border-white/5 rounded-3xl animate-pulse" />
                ))}
              </div>
            ) : podcasts.length === 0 ? (
              <div className="text-center py-16 text-white/40 border border-dashed border-white/5 rounded-3xl bg-white/5">
                <span className="material-symbols-outlined text-4xl opacity-30">mic</span>
                <p className="text-xs font-semibold mt-3">No podcast episodes published yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-12">
{podcasts.map(podcast => {
                   const isActive = activePodcast?.id === podcast.id && activeSegment === 'podcast';
                   return (
                     <div
                       key={podcast.id}
                       onClick={() => handlePlayPodcast(podcast)}
                       className={`bento-hover-effect premium-card cursor-pointer p-6 flex flex-col justify-between border min-h-[170px] ${isActive ? 'gold-neon-border-active bg-white/[0.04]' : 'border-white/[0.06] hover:border-white/15'
                         }`}
                     >
                       <div className="flex gap-4 items-start relative z-10">
                         <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-inner p-1">
                           {podcast.logoUrl
                             ? <img src={podcast.logoUrl} alt="" className="w-full h-full object-cover rounded-xl" />
                             : <div className="w-full h-full rounded-xl bg-indigo-950 flex items-center justify-center text-primary text-lg font-bold"><span className="material-symbols-outlined">mic</span></div>}
                         </div>
                         <div className="min-w-0">
                           <h3 className="text-[15.5px] font-black text-white group-hover:text-cyan-400 transition-colors truncate leading-tight">{podcast.title}</h3>
                           <p className="text-xs text-white/50 truncate mt-1 font-semibold">{podcast.podcastName}</p>
                         </div>
                       </div>
                       <p className="text-xs text-white/40 line-clamp-2 mt-3 leading-relaxed font-semibold">{podcast.description || 'Ghana Archive Episode'}</p>

                       <div className="flex gap-2 mt-4 relative z-10 select-none">
                         <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-white/5 border border-white/5 text-white/60">{podcast.genre || 'Podcast'}</span>
                         {podcast.duration > 0 && (
                           <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-white/5 border border-white/5 text-white/40">{formatTime(podcast.duration)}</span>
                         )}
                       </div>
                     </div>
                   );
                 })}
               </div>
            ) ) : (
            /* YouTube Live TV grid */
            <YouTubeLiveMonitor />
          )}
         </section>

      </main>

      {/* ────────────────────────────────────────────────────────
          3.Persistent Control Player Cockpit Bar (Floating)
          ──────────────────────────────────────────────────────── */}
      <footer className="fixed bottom-[76px] md:bottom-6 left-1/2 -translate-x-1/2 w-[92%] max-w-5xl h-20 md:h-24 bg-surface-container-highest/90 backdrop-blur-2xl border border-outline-variant/60 rounded-2xl md:rounded-[28px] z-40 flex items-center justify-between px-4 md:px-8 shadow-[0_20px_50px_rgba(0,0,0,0.6)] select-none">

        {/* Canvas Visualizer Background */}
        <div className="absolute inset-0 rounded-2xl md:rounded-[28px] overflow-hidden -z-10 opacity-75 pointer-events-none">
          <canvas ref={canvasRef} className="w-full h-full visualizer-glow" />
        </div>

        {/* Info */}
        <div className="flex items-center gap-3 md:gap-4 w-1/2 md:w-1/3 min-w-0 z-10">
          <div className={`w-10 h-10 md:w-13 md:h-13 rounded-full overflow-hidden bg-white border border-outline-variant/50 p-1 flex-shrink-0 flex items-center justify-center shadow-inner ${isPlaying ? 'vinyl-rotation animation-running' : ''
            }`}>
            {activeSegment === 'live' ? (
              activeStation?.logoUrl
                ? <img className="w-full h-full object-contain rounded-full" src={activeStation.logoUrl} alt={activeStation.name} />
                : renderStationLogo(activeStation?.logoUrl || '', activeStation?.name || 'AirCue', "rounded-full")
            ) : (
              activePodcast?.logoUrl
                ? <img className="w-full h-full object-cover rounded-full" src={activePodcast.logoUrl} alt={activePodcast.title} />
                : <div className="w-full h-full flex items-center justify-center rounded-full bg-indigo-950 text-primary text-lg"><span className="material-symbols-outlined text-sm">mic</span></div>
            )}
          </div>

          <div className="min-w-0 flex flex-col gap-0.5">
            <p className="text-[12.5px] md:text-[14.5px] font-black text-white truncate leading-none">
              {activeSegment === 'live' ? (activeStation?.name ?? 'Select Station') : (activePodcast?.title ?? 'Select Episode')}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5 min-w-0 flex-wrap">
              <p className="text-[10px] md:text-[11px] text-white/40 truncate font-semibold">
                {activeSegment === 'live'
                  ? (activeStation ? activeStation.location || activeStation.region : 'Broadcast list')
                  : (activePodcast ? activePodcast.podcastName : 'Browse catchups')}
              </p>
              {activeSegment === 'live' && activeStation?.id && (
                <StationListenerBadge
                  count={displayCount(activeStation.id)}
                  variant="pill"
                  isActive={isPlaying}
                />
              )}
            </div>
          </div>
        </div>

        {/* Controls & Seeker */}
        <div className="flex flex-col items-center gap-1 w-1/2 md:w-1/3 z-10 select-none">
          <div className="flex items-center gap-2.5">
            {/* Stop button — only visible when something is loaded */}
            {(activeStation || activePodcast) && (
              <button
                onClick={handleStop}
                title="Stop"
                className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-white/10 border border-white/10 hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-400 text-white/50 flex items-center justify-center transition-all active:scale-90 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px] md:text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>stop</span>
              </button>
            )}
            {/* Play / Pause button */}
            <button
              onClick={togglePlayPause}
              disabled={
                (activeSegment === 'live' && (!activeStation || !activeStation.streamUrl)) ||
                (activeSegment === 'podcast' && (!activePodcast || !activePodcast.streamUrl))
              }
              className="bg-white text-black w-10 h-10 md:w-12 md:h-12 rounded-full hover:scale-105 active:scale-95 transition-all disabled:opacity-40 shadow-lg flex items-center justify-center hover:bg-cyan-300 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px] md:text-[26px] text-black" style={{ fontVariationSettings: "'FILL' 1" }}>
                {isPlaying ? 'pause' : 'play_arrow'}
              </span>
            </button>

            {/* Mobile-only: Volume + Sleep Timer quick-access buttons */}
            <div className="md:hidden flex items-center gap-1.5">
              <button
                onClick={() => setShowVolumePopup(prev => !prev)}
                title="Volume"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90 cursor-pointer border ${
                  showVolumePopup
                    ? 'bg-white/15 border-white/20 text-white'
                    : 'bg-white/10 border-white/10 text-white/50 hover:text-white hover:bg-white/15'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">
                  {volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
                </span>
              </button>
              <button
                onClick={() => setShowSleepTimerMenu(prev => !prev)}
                title="Sleep Timer"
                className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90 cursor-pointer border ${
                  sleepTimerEnd !== null
                    ? 'bg-[#E6C280]/10 border-[#E6C280]/30 text-[#E6C280]'
                    : showSleepTimerMenu
                      ? 'bg-white/15 border-white/20 text-white'
                      : 'bg-white/10 border-white/10 text-white/50 hover:text-white hover:bg-white/15'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">bedtime</span>
                {sleepTimerEnd !== null && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#E6C280] shadow-[0_0_6px_rgba(230,194,128,0.7)]" />
                )}
              </button>
            </div>
          </div>

          {/* Podcasts duration progress seeker bar */}
          {activeSegment === 'podcast' && activePodcast ? (
            <div className="flex items-center gap-2 w-full max-w-[130px] sm:max-w-[200px] md:max-w-[250px]">
              <span className="font-mono text-[8px] md:text-[9px] text-white/40 font-bold">{formatTime(podcastProgress)}</span>
              <input
                type="range"
                min={0}
                max={podcastDuration || 100}
                value={podcastProgress}
                onChange={e => handleSeek(Number(e.target.value))}
                className="flex-grow h-1 bg-white/20 rounded accent-cyan-400 appearance-none cursor-pointer"
              />
              <span className="font-mono text-[8px] md:text-[9px] text-white/40 font-bold">{formatTime(podcastDuration || activePodcast.duration)}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 justify-center">
              {isPlaying ? (
                <span className="flex h-1.5 w-1.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-450" />
                </span>
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
              )}
              <span className="font-mono text-[8px] md:text-[9px] tracking-[0.12em] font-extrabold uppercase mt-0.5 transition-colors" style={{ color: sleepTimerEnd !== null ? 'rgba(230,194,128,0.7)' : 'rgba(255,255,255,0.4)' }}>
                {sleepTimerEnd !== null ? `SLEEP ${formatSleepTimer(sleepTimerRemaining)}` : isPlaying ? 'LIVE STREAMING' : 'CONSOLED READY'}
              </span>
            </div>
          )}
        </div>

        {/* Volume & EQ & Admin (Desktop only) */}
        <div className="hidden md:flex items-center justify-end gap-3.5 w-1/3 z-10">

          {/* Equalizer toggle preset button */}
          <button
            onClick={() => setShowEqMenu(prev => !prev)}
            className={`relative w-11 h-11 rounded-2xl flex items-center justify-center transition-all border cursor-pointer ${showEqMenu || activePreset !== 'Normal'
                ? 'bg-white/10 text-white border-white/15'
                : 'text-white/40 hover:text-white bg-white/5 border-white/5 hover:border-white/10'
              }`}
            title={`EQ: ${EQ_PRESETS[activePreset].label}`}
          >
            <span className="material-symbols-outlined text-[20px]">graphic_eq</span>
            {activePreset !== 'Normal' && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-[#E6C280] rounded-full shadow-[0_0_8px_rgba(230,194,128,0.6)]" />
            )}
          </button>

          {/* Sleep Timer button */}
          <button
            onClick={() => setShowSleepTimerMenu(prev => !prev)}
            className={`relative w-11 h-11 rounded-2xl flex items-center justify-center transition-all border cursor-pointer ${
              sleepTimerEnd !== null
                ? 'bg-[#E6C280]/10 text-[#E6C280] border-[#E6C280]/30'
                : showSleepTimerMenu
                  ? 'bg-white/10 text-white border-white/15'
                  : 'text-white/40 hover:text-white bg-white/5 border-white/5 hover:border-white/10'
            }`}
            title={sleepTimerEnd !== null ? `Sleep: ${formatSleepTimer(sleepTimerRemaining)}` : 'Sleep Timer'}
          >
            <span className="material-symbols-outlined text-[20px]">bedtime</span>
            {sleepTimerEnd !== null && (
              <span className="absolute -top-1.5 -right-1.5 bg-[#E6C280] text-black text-[7px] font-black px-1 py-[2px] rounded-full leading-none whitespace-nowrap shadow-[0_0_8px_rgba(230,194,128,0.5)]">
                {formatSleepTimer(sleepTimerRemaining)}
              </span>
            )}
          </button>

          <div className="h-6 w-px bg-white/10" />

          {/* Volume slider control */}
          <div className="flex items-center gap-2.5 group">
            <span className="material-symbols-outlined text-white/40 text-[20px] group-hover:text-cyan-400 transition-colors">
              {volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
            </span>
            <input
              type="range" min={0} max={1} step={0.05} value={volume}
              onChange={e => handleVolume(Number(e.target.value))}
              className="w-20 accent-cyan-400 bg-white/20 rounded-full h-1 cursor-pointer outline-none transition-colors group-hover:bg-white/30"
            />
          </div>

          <div className="h-6 w-px bg-white/10" />

          <Link href="/admin" prefetch={false}
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white/40 hover:text-white bg-white/5 border border-white/5 hover:border-white/10 transition-all"
            title="Admin Dashboard">
            <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
          </Link>
        </div>

      </footer>

      {/* ────────────────────────────────────────────────────────
          Mobile Tab Bar navigation (Solid fixed bottom bar)
          ──────────────────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#090a10]/95 backdrop-blur-2xl border-t border-white/10 flex justify-around items-center px-4 z-50 shadow-[0_-8px_30px_rgba(0,0,0,0.6)] select-none">
        
        <button
          onClick={() => setActiveSegment('live')}
          className={`flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${activeSegment === 'live'
              ? 'text-cyan-400 font-extrabold'
              : 'text-white/40 hover:text-white/70'
            }`}
        >
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: activeSegment === 'live' ? "'FILL' 1" : "'FILL' 0" }}>radio</span>
          <span className="text-[9px] uppercase tracking-wider scale-90">Live Radio</span>
        </button>

        <button
          onClick={() => setActiveSegment('podcast')}
          className={`flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${activeSegment === 'podcast'
              ? 'text-indigo-400 font-extrabold'
              : 'text-white/40 hover:text-white/70'
            }`}
        >
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: activeSegment === 'podcast' ? "'FILL' 1" : "'FILL' 0" }}>podcasts</span>
          <span className="text-[9px] uppercase tracking-wider scale-90">Podcasts</span>
        </button>

        <button
          onClick={() => setActiveSegment('youtube')}
          className={`flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${activeSegment === 'youtube'
              ? 'text-emerald-400 font-extrabold'
              : 'text-white/40 hover:text-white/70'
            }`}
        >
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: activeSegment === 'youtube' ? "'FILL' 1" : "'FILL' 0" }}>smart_display</span>
          <span className="text-[9px] uppercase tracking-wider scale-90">Live TV</span>
        </button>

        <button
          onClick={() => setShowEqMenu(prev => !prev)}
          className={`flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${showEqMenu || activePreset !== 'Normal'
              ? 'text-[#E6C280] font-extrabold'
              : 'text-white/40 hover:text-white/70'
            }`}
        >
          <span className="material-symbols-outlined text-[20px]">graphic_eq</span>
          <span className="text-[9px] uppercase tracking-wider scale-90">EQ Preset</span>
        </button>

        <button
          onClick={() => setShowMobileSidebar(true)}
          className={`flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${showMobileSidebar
              ? 'text-white font-extrabold'
              : 'text-white/40 hover:text-white/70'
            }`}
        >
          <span className="material-symbols-outlined text-[20px]">menu</span>
          <span className="text-[9px] uppercase tracking-wider scale-90">Library</span>
        </button>

      </nav>

    </div>
  );
}
