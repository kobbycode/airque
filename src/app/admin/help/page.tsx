'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthState } from '@/lib/auth';
import type { SupportTicket } from '@/lib/types';

export default function HelpPage() {
  const { appUser } = useAuthState();
  const [priority, setPriority] = useState<SupportTicket['priority']>('medium');
  const [category, setCategory] = useState('stream');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [onlineStations, setOnlineStations] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'supportTickets'), orderBy('createdAt', 'desc'), limit(10)),
      snap => setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() } as SupportTicket)))
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'stations'), snap => {
      setOnlineStations(snap.docs.filter(d => d.data().status === 'ONLINE').length);
    });
    return () => unsub();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      setMessage('Subject and description are required.');
      return;
    }
    setSubmitting(true);
    setMessage('');
    try {
      await addDoc(collection(db, 'supportTickets'), {
        priority,
        category,
        subject: subject.trim(),
        description: description.trim(),
        email: appUser?.email || 'anonymous@aircue.com',
        userId: appUser?.uid || null,
        status: 'OPEN',
        createdAt: serverTimestamp(),
      });
      setSubject('');
      setDescription('');
      setMessage('Ticket submitted successfully.');
    } catch (err) {
      console.error(err);
      setMessage('Failed to submit ticket. Sign in and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-[32px] custom-scrollbar space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-headline-lg text-on-surface">Support & Documentation</h1>
          <p className="font-body-sm text-on-surface-variant">Submit tickets stored in Firestore supportTickets</p>
        </div>
        <div className={`flex items-center gap-2 text-xs font-label-md px-3 py-1.5 rounded-full border ${
          onlineStations > 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${onlineStations > 0 ? 'bg-green-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-amber-500'}`} />
          {onlineStations > 0 ? `${onlineStations} Stations Live` : 'No Live Stations'}
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 text-white">
        <Link href="/admin/settings" className="modern-glass border border-white/5 p-6 rounded-2xl hover:border-primary/50 transition-colors flex flex-col gap-1.5">
          <span className="material-symbols-outlined text-primary">settings</span>
          <h3 className="font-bold text-white mt-1">Platform Settings</h3>
          <p className="text-xs text-white/40">Encoder, failover, and API keys</p>
        </Link>
        <Link href="/admin/analytics" className="modern-glass border border-white/5 p-6 rounded-2xl hover:border-primary/50 transition-colors flex flex-col gap-1.5">
          <span className="material-symbols-outlined text-secondary">bar_chart</span>
          <h3 className="font-bold text-white mt-1">Analytics Hub</h3>
          <p className="text-xs text-white/40">Live listener and request metrics</p>
        </Link>
        <a href="https://firebase.google.com/docs" target="_blank" rel="noopener noreferrer" className="modern-glass border border-white/5 p-6 rounded-2xl hover:border-primary/50 transition-colors flex flex-col gap-1.5">
          <span className="material-symbols-outlined text-tertiary">integration_instructions</span>
          <h3 className="font-bold text-white mt-1">Firebase Docs</h3>
          <p className="text-xs text-white/40">Backend reference for admins</p>
        </a>
      </section>

      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-12 lg:col-span-8 modern-glass border border-white/5 rounded-2xl p-6">
          <h3 className="font-headline-md border-b border-white/5 pb-3 mb-4 text-white font-bold">Open Support Ticket</h3>
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <select className="bg-white/5 border border-white/10 text-white rounded-xl p-3 text-sm outline-none focus:border-primary/45 transition-colors cursor-pointer" value={priority} onChange={e => setPriority(e.target.value as SupportTicket['priority'])}>
                <option value="low" className="bg-[#0c0e1a]">Low</option>
                <option value="medium" className="bg-[#0c0e1a]">Medium</option>
                <option value="high" className="bg-[#0c0e1a]">High</option>
              </select>
              <select className="bg-white/5 border border-white/10 text-white rounded-xl p-3 text-sm outline-none focus:border-primary/45 transition-colors cursor-pointer" value={category} onChange={e => setCategory(e.target.value)}>
                <option value="stream" className="bg-[#0c0e1a]">Encoder / Stream</option>
                <option value="metadata" className="bg-[#0c0e1a]">Metadata</option>
                <option value="billing" className="bg-[#0c0e1a]">Billing</option>
                <option value="other" className="bg-[#0c0e1a]">Other</option>
              </select>
            </div>
            <input className="w-full bg-white/5 border border-white/10 text-white rounded-xl p-3 text-sm outline-none focus:border-primary/45 transition-colors" placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} required />
            <textarea className="w-full bg-white/5 border border-white/10 text-white rounded-xl p-3 text-sm h-32 resize-none outline-none focus:border-primary/45 transition-colors" placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} required />
            {message && (
              <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                <p className="text-xs font-semibold">{message}</p>
              </div>
            )}
            <button type="submit" disabled={submitting} className="bg-primary text-black px-6 py-3 rounded-xl font-label-md font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 cursor-pointer">
              {submitting ? 'Submitting…' : 'Submit Ticket'}
            </button>
          </form>
        </section>

        <section className="col-span-12 lg:col-span-4 modern-glass border border-white/5 rounded-2xl p-6">
          <h3 className="font-headline-md mb-4 text-white font-bold">Recent Tickets</h3>
          {tickets.length === 0 ? (
            <p className="text-sm text-white/40">No tickets yet.</p>
          ) : (
            <ul className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
              {tickets.map(t => (
                <li key={t.id} className="border border-white/5 rounded-xl p-3 text-sm bg-white/[0.02] text-white">
                  <p className="font-semibold text-white/90">{t.subject}</p>
                  <p className="text-xs text-white/40 mt-1 font-medium">{t.priority} · {t.status}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
