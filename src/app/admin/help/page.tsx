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
          onlineStations > 0 ? 'bg-green-100 text-green-700 border-green-200' : 'bg-amber-100 text-amber-700 border-amber-200'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${onlineStations > 0 ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
          {onlineStations > 0 ? `${onlineStations} Stations Live` : 'No Live Stations'}
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href="/admin/settings" className="bg-white border border-outline-variant p-6 rounded-xl hover:border-primary/50 transition-colors">
          <span className="material-symbols-outlined text-primary">settings</span>
          <h3 className="font-bold mt-2">Platform Settings</h3>
          <p className="text-sm text-on-surface-variant">Encoder, failover, and API keys</p>
        </Link>
        <Link href="/admin/analytics" className="bg-white border border-outline-variant p-6 rounded-xl hover:border-primary/50 transition-colors">
          <span className="material-symbols-outlined text-secondary">bar_chart</span>
          <h3 className="font-bold mt-2">Analytics Hub</h3>
          <p className="text-sm text-on-surface-variant">Live listener and request metrics</p>
        </Link>
        <a href="https://firebase.google.com/docs" target="_blank" rel="noopener noreferrer" className="bg-white border border-outline-variant p-6 rounded-xl hover:border-primary/50 transition-colors">
          <span className="material-symbols-outlined text-tertiary">integration_instructions</span>
          <h3 className="font-bold mt-2">Firebase Docs</h3>
          <p className="text-sm text-on-surface-variant">Backend reference for admins</p>
        </a>
      </section>

      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-12 lg:col-span-8 bg-white border border-outline-variant rounded-xl p-6">
          <h3 className="font-headline-md border-b border-outline-variant/30 pb-3 mb-4">Open Support Ticket</h3>
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <select className="border border-outline-variant rounded-lg p-3 text-sm" value={priority} onChange={e => setPriority(e.target.value as SupportTicket['priority'])}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <select className="border border-outline-variant rounded-lg p-3 text-sm" value={category} onChange={e => setCategory(e.target.value)}>
                <option value="stream">Encoder / Stream</option>
                <option value="metadata">Metadata</option>
                <option value="billing">Billing</option>
                <option value="other">Other</option>
              </select>
            </div>
            <input className="w-full border border-outline-variant rounded-lg p-3 text-sm" placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} required />
            <textarea className="w-full border border-outline-variant rounded-lg p-3 text-sm h-32 resize-none" placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} required />
            {message && <p className="text-sm text-primary">{message}</p>}
            <button type="submit" disabled={submitting} className="bg-primary text-on-primary px-6 py-3 rounded-lg font-label-md disabled:opacity-50">
              {submitting ? 'Submitting…' : 'Submit Ticket'}
            </button>
          </form>
        </section>

        <section className="col-span-12 lg:col-span-4 bg-white border border-outline-variant rounded-xl p-6">
          <h3 className="font-headline-md mb-4">Recent Tickets</h3>
          {tickets.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No tickets yet.</p>
          ) : (
            <ul className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
              {tickets.map(t => (
                <li key={t.id} className="border border-outline-variant rounded-lg p-3 text-sm">
                  <p className="font-semibold text-on-surface">{t.subject}</p>
                  <p className="text-xs text-on-surface-variant mt-1">{t.priority} · {t.status}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
