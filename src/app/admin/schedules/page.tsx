'use client';

import React, { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc,
  deleteDoc, doc, serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEMO_MODE } from '@/lib/demo';

interface ScheduleBlock {
  id: string;
  title: string;
  host: string;
  time: string; // e.g. "06:00 - 09:00"
  days: string; // e.g. "Mon-Fri", "Fri", "Daily"
  dayIndex: number; // 0 for Mon, 1 for Tue, 2 for Wed, 3 for Thu, 4 for Fri, 5 for Sat, 6 for Sun
  source: string;
  mode: 'LIVE STREAM' | 'AUTOMATION' | 'STANDBY';
  status: 'ACTIVE' | 'SCHEDULED' | 'STANDBY';
}

const SEED_SCHEDULES: Omit<ScheduleBlock, 'id'>[] = [
  {
    title: 'Akwantufuo Drive',
    host: 'Kojo Mensah',
    time: '06:00 - 09:00',
    days: 'Mon-Fri',
    dayIndex: 0, // Mon
    source: 'Studio A (Fiber Link)',
    mode: 'LIVE STREAM',
    status: 'ACTIVE'
  },
  {
    title: 'Akwantufuo Drive',
    host: 'Kojo Mensah',
    time: '06:00 - 09:00',
    days: 'Mon-Fri',
    dayIndex: 1, // Tue
    source: 'Studio A (Fiber Link)',
    mode: 'LIVE STREAM',
    status: 'ACTIVE'
  },
  {
    title: 'Midday Chill',
    host: 'Aba Kwansah',
    time: '12:00 - 15:00',
    days: 'Mon-Wed',
    dayIndex: 0, // Mon
    source: 'Studio B (SIP Trunk)',
    mode: 'LIVE STREAM',
    status: 'ACTIVE'
  },
  {
    title: 'Weekend Jam Live',
    host: 'DJ K-Flex',
    time: '20:00 - 23:00',
    days: 'Fri',
    dayIndex: 4, // Fri
    source: 'Studio B (SIP Trunk)',
    mode: 'LIVE STREAM',
    status: 'SCHEDULED'
  },
  {
    title: 'Highlife Classics',
    host: 'System Playlist',
    time: '00:00 - 04:00',
    days: 'Daily',
    dayIndex: 6, // Sun
    source: 'Cloud Storage Bucket',
    mode: 'AUTOMATION',
    status: 'STANDBY'
  }
];

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form states
  const [formTitle, setFormTitle] = useState('');
  const [formHost, setFormHost] = useState('');
  const [formTime, setFormTime] = useState('06:00 - 09:00');
  const [formDays, setFormDays] = useState('Mon-Fri');
  const [formDayIndex, setFormDayIndex] = useState(0);
  const [formSource, setFormSource] = useState('Studio A (Fiber Link)');
  const [formMode, setFormMode] = useState<'LIVE STREAM' | 'AUTOMATION' | 'STANDBY'>('LIVE STREAM');
  const [formStatus, setFormStatus] = useState<'ACTIVE' | 'SCHEDULED' | 'STANDBY'>('SCHEDULED');

  // Real-time listener to Firestore schedules
  useEffect(() => {
    const q = collection(db, 'schedules');
    const unsub = onSnapshot(q, async snap => {
      if (snap.empty && DEMO_MODE) {
        // Automatically seed default schedule blocks if empty
        console.log('Seeding initial broadcast schedules...');
        try {
          const promises = SEED_SCHEDULES.map(block =>
            addDoc(collection(db, 'schedules'), {
              ...block,
              createdAt: serverTimestamp()
            })
          );
          await Promise.all(promises);
        } catch (err) {
          console.error('Failed to seed schedules:', err);
        }
      } else {
        const data = snap.docs.map(d => ({
          id: d.id,
          ...d.data()
        } as ScheduleBlock));
        setSchedules(data);
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const handleOpenAddModal = (defaultDayIndex: number = 0) => {
    setFormDayIndex(defaultDayIndex);
    setFormTitle('');
    setFormHost('');
    setShowAddModal(true);
  };

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formHost.trim()) return;

    setSaving(true);
    try {
      await addDoc(collection(db, 'schedules'), {
        title: formTitle,
        host: formHost,
        time: formTime,
        days: formDays,
        dayIndex: formDayIndex,
        source: formSource,
        mode: formMode,
        status: formStatus,
        createdAt: serverTimestamp()
      });
      setShowAddModal(false);
    } catch (err) {
      console.error('Failed to save schedule block:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!confirm('Delete this broadcast schedule block?')) return;
    try {
      await deleteDoc(doc(db, 'schedules', id));
    } catch (err) {
      console.error('Failed to delete schedule block:', err);
    }
  };

  const daysLabel = ['Mon 22', 'Tue 23', 'Wed 24', 'Thu 25', 'Fri 26', 'Sat 27', 'Sun 28'];

  return (
    <div className="flex-1 overflow-y-auto p-[32px] custom-scrollbar space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Broadcast Schedules</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Schedule streams, automation blocks, and live programming slots in real-time</p>
        </div>
        <button
          onClick={() => handleOpenAddModal(0)}
          className="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-md hover:opacity-90 transition-opacity flex items-center gap-1 shadow-sm"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          New Schedule Block
        </button>
      </div>

      {/* Week Selector */}
      <section className="bg-white border border-outline-variant rounded-xl p-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4">
          <button className="p-2 hover:bg-surface-container rounded-full text-on-surface-variant transition-colors">
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <span className="font-headline-sm text-headline-sm text-on-surface font-bold">May 22 - May 28, 2026</span>
          <button className="p-2 hover:bg-surface-container rounded-full text-on-surface-variant transition-colors">
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
        <div className="flex gap-1 bg-surface-container-low p-1 rounded-lg border border-outline-variant/30">
          <button className="px-3 py-1 bg-white text-on-surface rounded font-label-md text-xs shadow-sm">Week</button>
          <button className="px-3 py-1 text-on-surface-variant hover:text-on-surface rounded font-label-md text-xs transition-colors">Day</button>
          <button className="px-3 py-1 text-on-surface-variant hover:text-on-surface rounded font-label-md text-xs transition-colors">Agenda</button>
        </div>
      </section>

      {/* Grid of Broadcast Slots */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
        {daysLabel.map((day, idx) => {
          // Filter schedules for this specific day index
          const dayBlocks = schedules.filter(block => block.dayIndex === idx);

          return (
            <div key={idx} className="bg-white border border-outline-variant rounded-xl p-4 flex flex-col gap-3 min-h-[300px] shadow-sm">
              <div className={`text-center pb-2 border-b border-outline-variant/30 font-bold ${idx === 0 ? 'text-primary' : 'text-on-surface-variant'}`}>
                <p className="font-label-md text-xs uppercase">{day.split(' ')[0]}</p>
                <p className="font-headline-sm text-headline-sm mt-0.5">{day.split(' ')[1]}</p>
              </div>
              
              {/* Show Slots list */}
              <div className="flex-1 space-y-2.5 overflow-y-auto max-h-56 custom-scrollbar pr-0.5">
                {dayBlocks.map(block => {
                  const borderClass = block.mode === 'LIVE STREAM'
                    ? 'border-primary bg-primary-container/10 text-primary'
                    : block.mode === 'AUTOMATION'
                    ? 'border-tertiary bg-tertiary-container/10 text-tertiary'
                    : 'border-outline bg-surface-container-low text-on-surface-variant';

                  return (
                    <div key={block.id} className={`border-l-4 p-2 rounded flex flex-col gap-1 shadow-sm ${borderClass}`}>
                      <p className="font-bold text-[11px] truncate" title={block.title}>{block.title}</p>
                      <p className="text-[9px] font-code opacity-80">{block.time}</p>
                      <p className="text-[8px] italic opacity-70 truncate">Host: {block.host}</p>
                    </div>
                  );
                })}

                {dayBlocks.length === 0 && (
                  <p className="text-[10px] text-on-surface-variant/40 text-center py-8">No programming scheduled</p>
                )}
              </div>
              
              <button
                onClick={() => handleOpenAddModal(idx)}
                className="flex items-center justify-center border-2 border-dashed border-outline-variant/30 hover:border-primary/50 hover:bg-primary-container/5 rounded-lg py-2.5 cursor-pointer transition-colors mt-auto text-on-surface-variant/60 hover:text-primary"
              >
                <span className="material-symbols-outlined text-base">add</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Schedules Table */}
      <section className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-outline-variant flex justify-between items-center">
          <h3 className="font-headline-md text-headline-md font-bold">Broadcast Queue</h3>
          <span className="text-xs text-on-surface-variant bg-surface-container-low border border-outline-variant/40 px-3 py-1 rounded-full font-semibold">
            {schedules.length} Scheduled Block{schedules.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                <th className="p-6 font-label-md text-on-surface-variant uppercase tracking-wider text-xs">Program Title</th>
                <th className="p-6 font-label-md text-on-surface-variant uppercase tracking-wider text-xs">Broadcaster/Host</th>
                <th className="p-6 font-label-md text-on-surface-variant uppercase tracking-wider text-xs">Broadcast Days / Time</th>
                <th className="p-6 font-label-md text-on-surface-variant uppercase tracking-wider text-xs">Uplink Source</th>
                <th className="p-6 font-label-md text-on-surface-variant uppercase tracking-wider text-xs">Mode</th>
                <th className="p-6 font-label-md text-on-surface-variant uppercase tracking-wider text-xs">Status</th>
                <th className="p-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-on-surface-variant">
                    <div className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-outline-variant border-t-primary rounded-full animate-spin" />
                      <span>Loading schedules database...</span>
                    </div>
                  </td>
                </tr>
              ) : schedules.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-on-surface-variant">
                    No scheduled broadcast blocks found.
                  </td>
                </tr>
              ) : (
                schedules.map(block => (
                  <tr key={block.id} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="p-6 font-bold text-on-surface">{block.title}</td>
                    <td className="p-6 text-body-sm text-on-surface">{block.host}</td>
                    <td className="p-6 font-code text-body-sm text-on-surface">
                      {block.days} ({block.time})
                    </td>
                    <td className="p-6 text-body-sm text-on-surface">{block.source}</td>
                    <td className="p-6">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        block.mode === 'LIVE STREAM'
                          ? 'bg-primary/10 text-primary'
                          : block.mode === 'AUTOMATION'
                          ? 'bg-tertiary/10 text-tertiary'
                          : 'bg-surface-container text-on-surface-variant'
                      }`}>
                        {block.mode}
                      </span>
                    </td>
                    <td className="p-6">
                      <span className={`font-label-md text-xs font-bold ${
                        block.status === 'ACTIVE'
                          ? 'text-green-600'
                          : block.status === 'SCHEDULED'
                          ? 'text-primary'
                          : 'text-on-surface-variant/70'
                      }`}>
                        {block.status}
                      </span>
                    </td>
                    <td className="p-6 text-right">
                      <button
                        onClick={() => handleDeleteSchedule(block.id)}
                        className="text-error hover:bg-error-container/20 p-2 rounded-xl transition-all"
                        title="Delete schedule block"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add New Schedule Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
          <div className="bg-white border border-outline-variant/30 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in-50 zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-surface-container border-b border-outline-variant flex items-center justify-between">
              <h2 className="font-headline-sm text-on-surface font-bold">New Broadcast Block</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container-high transition-all"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddSchedule} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-on-surface-variant ml-1">Program Title *</label>
                <input
                  required
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="e.g. Akwantufuo Drive"
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-2.5 text-sm text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-on-surface-variant ml-1">Broadcaster / Host *</label>
                <input
                  required
                  value={formHost}
                  onChange={e => setFormHost(e.target.value)}
                  placeholder="e.g. DJ K-Flex"
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-2.5 text-sm text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-on-surface-variant ml-1">Day of Week</label>
                  <select
                    value={formDayIndex}
                    onChange={e => setFormDayIndex(parseInt(e.target.value, 10))}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-2.5 text-sm text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  >
                    {daysLabel.map((day, i) => (
                      <option key={i} value={i}>{day.split(' ')[0]}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-on-surface-variant ml-1">Day Labels (e.g. &quot;Mon-Fri&quot;)</label>
                  <input
                    value={formDays}
                    onChange={e => setFormDays(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-2.5 text-sm text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-on-surface-variant ml-1">Broadcast Time</label>
                  <input
                    value={formTime}
                    onChange={e => setFormTime(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-2.5 text-sm text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-on-surface-variant ml-1">Uplink Source</label>
                  <input
                    value={formSource}
                    onChange={e => setFormSource(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-2.5 text-sm text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-on-surface-variant ml-1">Broadcast Mode</label>
                  <select
                    value={formMode}
                    onChange={e => setFormMode(e.target.value as ScheduleBlock['mode'])}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-2.5 text-sm text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  >
                    <option value="LIVE STREAM">LIVE STREAM</option>
                    <option value="AUTOMATION">AUTOMATION</option>
                    <option value="STANDBY">STANDBY</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-on-surface-variant ml-1">Program Status</label>
                  <select
                    value={formStatus}
                    onChange={e => setFormStatus(e.target.value as ScheduleBlock['status'])}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-2.5 text-sm text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="SCHEDULED">SCHEDULED</option>
                    <option value="STANDBY">STANDBY</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-outline-variant font-label-md text-on-surface hover:bg-surface-container transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-primary text-on-primary py-2.5 rounded-xl font-headline-md hover:brightness-110 active:scale-95 transition-all shadow-md shadow-primary/25 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <span className="w-4 h-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">save</span>
                      Save Program
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
