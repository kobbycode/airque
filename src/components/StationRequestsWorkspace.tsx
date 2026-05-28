'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  collection, onSnapshot, query, orderBy, deleteDoc, doc,
  addDoc, serverTimestamp, limit, where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ChatMessage, SongRequest, Station } from '@/lib/types';

function timeAgo(ts: { seconds: number } | null): string {
  if (!ts) return 'just now';
  const diff = Math.floor(Date.now() / 1000) - ts.seconds;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function formatTime(ts: { seconds: number } | null): string {
  if (!ts) return '';
  return new Date(ts.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function EmptyRequests() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-24 gap-4 text-center">
      <div className="w-20 h-20 bg-white/5 border border-white/10 rounded-full flex items-center justify-center shadow-inner">
        <span className="material-symbols-outlined text-4xl text-white/30">queue_music</span>
      </div>
      <p className="font-headline-sm text-white/50 font-bold">No requests yet</p>
      <p className="font-body-sm text-white/30 text-sm max-w-xs">
        When listeners submit song requests through the station drawer, they&apos;ll appear here in real-time.
      </p>
    </div>
  );
}

function RequestCard({
  req, onPlay, isNew,
}: {
  req: SongRequest;
  onPlay: (id: string) => void;
  isNew: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState(false);
  const shoutoutText = `🎵 ${req.requester} requests "${req.song}" by ${req.artist}${req.shoutout ? ` — "${req.shoutout}"` : ''}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shoutoutText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePlay = async () => {
    setRemoving(true);
    setTimeout(() => onPlay(req.id), 400);
  };

  return (
    <div className={`group rounded-2xl p-5 flex flex-col gap-3 transition-all duration-400 border ${
      removing ? 'opacity-0 scale-95 translate-x-4' : 'opacity-100'
    } ${isNew ? 'bg-primary/[0.03] border-primary/40 shadow-[0_0_20px_rgba(230,194,128,0.1)]' : 'bg-white/2 border-white/5 hover:border-white/10'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm ${
            isNew ? 'bg-primary text-black' : 'bg-white/10 text-white/70'
          }`}>
            {req.requester.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-white truncate">{req.requester}</p>
            <p className="text-[10px] text-white/40">{req.stationName} · {timeAgo(req.timestamp)}</p>
          </div>
        </div>
        {isNew && (
          <span className="text-[9px] font-bold bg-primary text-black px-2 py-0.5 rounded-full flex-shrink-0 animate-pulse">NEW</span>
        )}
      </div>
      <div className="bg-white/5 border border-white/5 rounded-xl px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-xl">music_note</span>
          <div className="min-w-0">
            <p className="font-bold text-sm text-white truncate">&quot;{req.song}&quot;</p>
            <p className="text-xs text-cyan-400 truncate">by {req.artist}</p>
          </div>
        </div>
      </div>
      {req.shoutout && (
        <div className="border-l-2 border-primary/50 pl-3">
          <p className="text-xs text-white/70 italic leading-relaxed">&quot;{req.shoutout}&quot;</p>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button onClick={handlePlay} disabled={removing} className="flex-1 flex items-center justify-center gap-2 bg-primary text-black py-2.5 rounded-xl text-xs font-bold hover:scale-[1.02] active:scale-95 disabled:opacity-50 cursor-pointer transition-transform">
          <span className="material-symbols-outlined text-sm font-bold">check_circle</span>
          Mark as Played
        </button>
        <button onClick={handleCopy} className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
          copied ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'border-white/10 text-white/70 hover:bg-white/5 hover:text-white'
        }`}>
          <span className="material-symbols-outlined text-sm">{copied ? 'check' : 'content_copy'}</span>
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button onClick={async () => { setRemoving(true); setTimeout(() => onPlay(req.id), 400); }} className="flex items-center justify-center p-2.5 rounded-xl text-red-400 border border-white/10 hover:bg-red-500/10 transition-colors cursor-pointer" title="Delete request">
          <span className="material-symbols-outlined text-sm">delete</span>
        </button>
      </div>
    </div>
  );
}

function ChatMonitor({ stationId, stationName }: { stationId: string; stationName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!stationId) return;
    const q = query(collection(db, 'chats', stationId, 'messages'), orderBy('timestamp', 'asc'), limit(50));
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)));
      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 50);
    });
    return () => unsub();
  }, [stationId]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !stationId) return;
    setSending(true);
    const text = input;
    setInput('');
    try {
      await addDoc(collection(db, 'chats', stationId, 'messages'), {
        sender: '📻 Broadcaster',
        text,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-transparent">
      <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3 bg-white/2">
        <div className="w-8 h-8 bg-primary/10 border border-primary/20 rounded-full flex items-center justify-center">
          <span className="material-symbols-outlined text-primary text-lg">chat_bubble</span>
        </div>
        <div>
          <p className="font-semibold text-sm text-white">Live Chat</p>
          <p className="text-[10px] text-cyan-400 uppercase tracking-wider font-semibold">{stationName}</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
          <span className="text-[9px] text-emerald-400 font-bold tracking-widest">LIVE</span>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-black/10">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center">
            <span className="material-symbols-outlined text-3xl text-white/10">chat</span>
            <p className="text-sm text-white/40 mt-2">No messages yet</p>
          </div>
        ) : (
          messages.map(msg => {
            const isBC = msg.sender === '📻 Broadcaster';
            return (
              <div key={msg.id} className={`flex gap-2 ${isBC ? 'flex-row-reverse' : ''}`}>
                <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold ${
                  isBC ? 'bg-primary text-black border border-primary/30' : 'bg-white/10 text-white/70 border border-white/10'
                }`}>
                  {isBC ? '📻' : msg.sender.charAt(0).toUpperCase()}
                </div>
                <div className={`max-w-[75%] flex flex-col gap-0.5 ${isBC ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-[10px] font-semibold ${isBC ? 'text-primary' : 'text-white/60'}`}>
                      {isBC ? 'You (Broadcaster)' : msg.sender}
                    </span>
                    <span className="text-[9px] text-white/40">{formatTime(msg.timestamp)}</span>
                  </div>
                  <div className={`px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                    isBC ? 'bg-primary text-black font-semibold rounded-tr-sm shadow-[0_4px_12px_rgba(230,194,128,0.15)]' : 'bg-white/5 border border-white/5 text-white rounded-tl-sm'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <form onSubmit={sendMessage} className="p-4 border-t border-white/5 bg-white/2">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Reply as Broadcaster…"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:border-primary outline-none transition-colors"
          />
          <button type="submit" disabled={!input.trim() || sending} className="w-10 h-10 bg-primary text-black rounded-xl flex items-center justify-center hover:scale-105 active:scale-95 disabled:opacity-40 disabled:scale-100 transition-all cursor-pointer font-bold">
            <span className="material-symbols-outlined text-sm font-bold">{sending ? 'hourglass_empty' : 'send'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

interface StationRequestsWorkspaceProps {
  ownerId?: string;
  title?: string;
  subtitle?: string;
}

export default function StationRequestsWorkspace({
  ownerId,
  title = 'Song Requests',
  subtitle = 'Real-time listener requests — reply in chat, copy shoutouts, and manage the on-air queue',
}: StationRequestsWorkspaceProps) {
  const [requests, setRequests] = useState<SongRequest[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [loading, setLoading] = useState(true);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const prevIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const q = ownerId
      ? query(collection(db, 'stations'), where('ownerId', '==', ownerId), orderBy('name'))
      : query(collection(db, 'stations'), orderBy('name'));

    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Station));
      setStations(data);
      setSelectedStation(prev => {
        if (prev && data.some(s => s.id === prev.id)) return prev;
        return data[0] ?? null;
      });
    });
    return () => unsub();
  }, [ownerId]);

  useEffect(() => {
    let q;
    if (selectedStation?.id) {
      q = query(
        collection(db, 'requests'),
        where('stationId', '==', selectedStation.id),
        orderBy('timestamp', 'desc'),
        limit(30)
      );
    } else {
      q = query(collection(db, 'requests'), orderBy('timestamp', 'desc'), limit(30));
    }

    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as SongRequest));
      const currentIds = new Set(data.map(r => r.id));
      const fresh = new Set<string>();
      currentIds.forEach(id => { if (!prevIdsRef.current.has(id)) fresh.add(id); });
      prevIdsRef.current = currentIds;
      setNewIds(fresh);
      setRequests(data);
      setLoading(false);
      if (fresh.size > 0) setTimeout(() => setNewIds(new Set()), 8000);
    });
    return () => unsub();
  }, [selectedStation?.id]);

  const handleRemove = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'requests', id));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col h-full">
      <div className="flex-shrink-0 px-8 py-5 border-b border-white/5 bg-white/2 flex flex-wrap items-center justify-between gap-4 backdrop-blur-md">
        <div>
          <h1 className="font-display-lg text-[24px] text-white flex items-center gap-3 font-bold">
            {title}
            {requests.length > 0 && (
              <span className="bg-primary text-black text-xs font-bold px-2.5 py-0.5 rounded-full shadow-[0_0_12px_rgba(230,194,128,0.3)]">{requests.length}</span>
            )}
          </h1>
          <p className="font-body-sm text-cyan-400 uppercase tracking-widest text-[10px] font-semibold mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold text-white/50 uppercase tracking-wider">Station:</label>
          <select
            value={selectedStation?.id ?? ''}
            onChange={e => setSelectedStation(stations.find(s => s.id === e.target.value) ?? null)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:border-primary outline-none shadow-md backdrop-blur-md cursor-pointer transition-colors"
          >
            {stations.map(s => (
              <option key={s.id} value={s.id} className="bg-[#0f0f14] text-white">{s.name}</option>
            ))}
            {stations.length === 0 && <option value="" className="bg-[#0f0f14] text-white">No stations yet</option>}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 min-w-0 flex flex-col border-r border-white/5 overflow-hidden">
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4 bg-transparent">
            {loading ? (
              <p className="text-center text-white/40 py-12">Loading requests…</p>
            ) : stations.length === 0 ? (
              <div className="text-center py-12 text-white/40">
                <p className="font-headline-sm">No stations to monitor</p>
                <p className="font-body-sm mt-2">Add a station from your studio dashboard first.</p>
              </div>
            ) : requests.length === 0 ? (
              <EmptyRequests />
            ) : (
              requests.map(req => (
                <RequestCard key={req.id} req={req} onPlay={handleRemove} isNew={newIds.has(req.id)} />
              ))
            )}
          </div>
        </div>
        <div className="w-[380px] flex-shrink-0 flex flex-col bg-white/2 border-l border-white/0 overflow-hidden">
          {selectedStation?.id ? (
            <ChatMonitor stationId={selectedStation.id} stationName={selectedStation.name} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <span className="material-symbols-outlined text-4xl text-white/20 animate-pulse">sensors</span>
              <p className="text-sm text-white/40 mt-3 font-medium">Select a station to monitor its live chat</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
