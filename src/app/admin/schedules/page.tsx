'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  collection, onSnapshot, addDoc,
  deleteDoc, doc, serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEMO_MODE } from '@/lib/demo';
import { useAlert } from '@/components/CustomAlert';

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
  const { showConfirm } = useAlert();

  const [currentView, setCurrentView] = useState<'Week' | 'Day' | 'Agenda'>('Week');
  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(() => {
    const today = new Date().getDay(); // 0 is Sun, 1 is Mon...
    return today === 0 ? 6 : today - 1; // Mon=0, Tue=1... Sun=6
  });

  // Dynamically compute the current week's dates (Monday to Sunday)
  const currentWeekDates = useMemo(() => {
    const today = new Date();
    const currentDay = today.getDay(); // 0 is Sunday, 1 is Monday...
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    
    const dates = [];
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      const dateNum = day.getDate();
      dates.push(`${weekdays[i]} ${dateNum}`);
    }
    return dates;
  }, []);

  const weekRangeLabel = useMemo(() => {
    const today = new Date();
    const currentDay = today.getDay();
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: '2-digit', year: 'numeric' };
    return `${monday.toLocaleDateString('en-US', options)} - ${sunday.toLocaleDateString('en-US', options)}`;
  }, []);

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
    showConfirm({
      title: 'Delete Schedule Block',
      message: 'Are you sure you want to delete this broadcast schedule block? It will be removed from the air queue immediately.',
      type: 'error',
      confirmText: 'Yes, Delete Block',
      cancelText: 'Cancel',
      isDangerous: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'schedules', id));
        } catch (err) {
          console.error('Failed to delete schedule block:', err);
        }
      }
    });
  };

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
          className="bg-primary text-black px-6 py-3 rounded-xl font-label-md font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20 flex items-center gap-2 cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm font-bold">add</span>
          New Schedule Block
        </button>
      </div>

      {/* Week Selector */}
      <section className="modern-glass border border-white/5 rounded-2xl p-4 flex justify-between items-center text-white">
        <div className="flex items-center gap-4">
          <button className="p-2 hover:bg-white/5 rounded-full text-white/50 hover:text-white transition-colors cursor-pointer">
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <span className="font-headline-sm text-white font-bold">{weekRangeLabel}</span>
          <button className="p-2 hover:bg-white/5 rounded-full text-white/50 hover:text-white transition-colors cursor-pointer">
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
        <div className="flex gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
          <button 
            onClick={() => setCurrentView('Week')}
            className={`px-3 py-1 rounded-lg font-label-md text-xs font-semibold transition-all cursor-pointer ${
              currentView === 'Week' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            Week
          </button>
          <button 
            onClick={() => setCurrentView('Day')}
            className={`px-3 py-1 rounded-lg font-label-md text-xs font-semibold transition-all cursor-pointer ${
              currentView === 'Day' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            Day
          </button>
          <button 
            onClick={() => setCurrentView('Agenda')}
            className={`px-3 py-1 rounded-lg font-label-md text-xs font-semibold transition-all cursor-pointer ${
              currentView === 'Agenda' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            Agenda
          </button>
        </div>
      </section>

      {/* Week Grid View */}
      {currentView === 'Week' && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
          {currentWeekDates.map((day, idx) => {
            // Filter schedules for this specific day index
            const dayBlocks = schedules.filter(block => block.dayIndex === idx);

            return (
              <div key={idx} className="modern-glass border border-white/5 rounded-2xl p-4 flex flex-col gap-3 min-h-[300px]">
                <div className={`text-center pb-2 border-b border-white/5 font-bold ${idx === 0 ? 'text-primary' : 'text-white/50'}`}>
                  <p className="font-label-md text-xs uppercase">{day.split(' ')[0]}</p>
                  <p className="font-headline-sm mt-0.5">{day.split(' ')[1]}</p>
                </div>
                
                {/* Show Slots list */}
                <div className="flex-1 space-y-2.5 overflow-y-auto max-h-56 custom-scrollbar pr-0.5">
                  {dayBlocks.map(block => {
                    const borderClass = block.mode === 'LIVE STREAM'
                      ? 'border-primary bg-primary/5 text-primary'
                      : block.mode === 'AUTOMATION'
                      ? 'border-tertiary bg-tertiary/5 text-tertiary'
                      : 'border-white/10 bg-white/5 text-white/70';

                    return (
                      <div key={block.id} className={`border-l-4 p-2 rounded flex flex-col gap-1 shadow-sm ${borderClass}`}>
                        <p className="font-bold text-[11px] truncate" title={block.title}>{block.title}</p>
                        <p className="text-[9px] font-code opacity-80">{block.time}</p>
                        <p className="text-[8px] italic opacity-70 truncate">Host: {block.host}</p>
                      </div>
                    );
                  })}

                  {dayBlocks.length === 0 && (
                    <p className="text-[10px] text-white/30 text-center py-8">No programming scheduled</p>
                  )}
                </div>
                
                <button
                  onClick={() => handleOpenAddModal(idx)}
                  className="flex items-center justify-center border-2 border-dashed border-white/10 hover:border-primary/50 hover:bg-white/5 rounded-xl py-2.5 cursor-pointer transition-colors mt-auto text-white/30 hover:text-primary"
                >
                  <span className="material-symbols-outlined text-base">add</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Day Detail View */}
      {currentView === 'Day' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Weekday Selector */}
          <div className="col-span-12 lg:col-span-3 modern-glass border border-white/5 rounded-2xl p-4 flex lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible custom-scrollbar">
            <p className="text-[10px] text-white/40 uppercase tracking-widest font-black hidden lg:block mb-2 px-2">Select Day</p>
            {currentWeekDates.map((day, idx) => {
              const isActive = selectedDayIdx === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDayIdx(idx)}
                  className={`flex-1 lg:w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all cursor-pointer border text-xs font-bold shrink-0 ${
                    isActive 
                      ? 'bg-primary/10 border-primary text-primary shadow-[inset_4px_0_10px_rgba(230,194,128,0.08)]' 
                      : 'border-white/5 text-white/60 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span>{day.split(' ')[0]}</span>
                  <span className="font-mono bg-white/5 px-2 py-0.5 rounded text-[10px] text-white/40">{day.split(' ')[1]}</span>
                </button>
              );
            })}
          </div>

          {/* Detailed Day Column */}
          <div className="col-span-12 lg:col-span-9 modern-glass border border-white/5 rounded-2xl p-6 flex flex-col gap-6">
            <div className="flex justify-between items-center border-b border-white/5 pb-4 flex-wrap gap-2">
              <div>
                <h2 className="font-headline-md text-white font-bold">{currentWeekDates[selectedDayIdx].split(' ')[0]} Day Programming</h2>
                <p className="text-xs text-white/45 mt-1">Detailed block slots and broadcast pipeline</p>
              </div>
              <button
                onClick={() => handleOpenAddModal(selectedDayIdx)}
                className="flex items-center gap-1.5 px-4 py-2 border border-primary/40 hover:bg-primary/5 text-primary rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm font-bold">add</span>
                Add to {currentWeekDates[selectedDayIdx].split(' ')[0]}
              </button>
            </div>

            {/* Single Day Slots list */}
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
              {schedules.filter(block => block.dayIndex === selectedDayIdx).length === 0 ? (
                <div className="py-20 text-center text-white/30 flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-4xl">calendar_today</span>
                  <p className="text-xs">No broadcast programming scheduled for this day.</p>
                </div>
              ) : (
                schedules
                  .filter(block => block.dayIndex === selectedDayIdx)
                  .map(block => {
                    const isLive = block.mode === 'LIVE STREAM';
                    const isAuto = block.mode === 'AUTOMATION';
                    return (
                       <div key={block.id} className="relative bg-white/[0.02] border border-white/5 hover:border-white/10 p-5 rounded-2xl flex flex-wrap justify-between items-center gap-4 transition-all">
                         <div className="flex items-start gap-4">
                           <div className={`w-10 h-10 rounded-xl flex items-center justify-center border font-bold ${
                             isLive ? 'bg-primary/10 border-primary/30 text-primary' :
                             isAuto ? 'bg-tertiary/10 border-tertiary/30 text-tertiary' :
                             'bg-white/5 border-white/10 text-white/70'
                           }`}>
                             <span className="material-symbols-outlined text-lg">
                               {isLive ? 'sensors' : isAuto ? 'play_circle' : 'pause_circle'}
                             </span>
                           </div>
                           <div>
                             <h4 className="font-bold text-white text-sm">{block.title}</h4>
                             <p className="text-xs text-white/50 mt-1">Host: <span className="font-semibold text-white/70">{block.host}</span> · Source: <span className="text-white/60">{block.source}</span></p>
                           </div>
                         </div>
                         <div className="flex items-center gap-3">
                           <div className="flex flex-col items-end text-right">
                             <span className="font-mono text-xs text-cyan-400 font-bold">{block.time}</span>
                             <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border mt-1.5 ${
                               block.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/5 text-white/40 border-white/5'
                             }`}>{block.status}</span>
                           </div>
                           <button
                             onClick={() => handleDeleteSchedule(block.id)}
                             className="text-red-400 hover:bg-red-500/10 p-2 rounded-xl transition-colors cursor-pointer"
                           >
                             <span className="material-symbols-outlined text-[18px]">delete</span>
                           </button>
                         </div>
                       </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Agenda List View */}
      {currentView === 'Agenda' && (
        <div className="modern-glass border border-white/5 rounded-2xl p-6 flex flex-col gap-6">
          <div className="border-b border-white/5 pb-4">
            <h2 className="font-headline-md text-white font-bold">Weekly Agenda Stream</h2>
            <p className="text-xs text-white/45 mt-1">Chronological list of all broadcast blocks scheduled for the week</p>
          </div>
          
          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
            {schedules.length === 0 ? (
              <div className="py-20 text-center text-white/30">
                <p className="text-xs">No programs scheduled this week.</p>
              </div>
            ) : (
              schedules
                .slice()
                .sort((a, b) => a.dayIndex - b.dayIndex)
                .map(block => {
                  const isLive = block.mode === 'LIVE STREAM';
                  const isAuto = block.mode === 'AUTOMATION';
                  return (
                    <div key={block.id} className="group relative bg-white/[0.02] border border-white/5 hover:border-white/10 p-5 rounded-2xl flex flex-wrap justify-between items-center gap-4 transition-all">
                      <div className="flex items-center gap-4">
                        {/* Weekday badge */}
                        <div className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-center shrink-0 min-w-16">
                          <span className="text-[10px] text-primary uppercase font-black block leading-none">{currentWeekDates[block.dayIndex].split(' ')[0]}</span>
                          <span className="text-xs text-white font-extrabold block mt-0.5 leading-none">{currentWeekDates[block.dayIndex].split(' ')[1]}</span>
                        </div>
                        
                        <div>
                          <h4 className="font-bold text-white text-sm">{block.title}</h4>
                          <p className="text-xs text-white/50 mt-1">Host: <span className="font-semibold text-white/70">{block.host}</span> · Source: <span className="text-white/60">{block.source}</span></p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="font-mono text-xs text-cyan-400 font-bold">{block.time}</span>
                          <span className={`text-[9px] font-black uppercase px-2.5 py-0.5 rounded border block mt-1.5 ${
                            isLive ? 'bg-primary/10 text-primary border-primary/20' : 'bg-tertiary/10 text-tertiary border-tertiary/20'
                          }`}>{block.mode}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteSchedule(block.id)}
                          className="text-red-400 hover:bg-red-500/10 p-2 rounded-xl transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      )}

      {/* Schedules Table */}
      <section className="modern-glass border border-white/5 rounded-2xl overflow-hidden shadow-lg">
        <div className="p-6 border-b border-white/5 flex justify-between items-center">
          <h3 className="font-headline-md text-white font-bold">Broadcast Queue</h3>
          <span className="text-xs text-white/50 bg-white/5 border border-white/10 px-3 py-1 rounded-full font-semibold">
            {schedules.length} Scheduled Block{schedules.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5">
                <th className="p-6 text-xs uppercase text-white/40 tracking-wider font-bold">Program Title</th>
                <th className="p-6 text-xs uppercase text-white/40 tracking-wider font-bold">Broadcaster/Host</th>
                <th className="p-6 text-xs uppercase text-white/40 tracking-wider font-bold">Broadcast Days / Time</th>
                <th className="p-6 text-xs uppercase text-white/40 tracking-wider font-bold">Uplink Source</th>
                <th className="p-6 text-xs uppercase text-white/40 tracking-wider font-bold">Mode</th>
                <th className="p-6 text-xs uppercase text-white/40 tracking-wider font-bold">Status</th>
                <th className="p-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-code text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-white/40">
                    <div className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/20 border-t-primary rounded-full animate-spin" />
                      <span className="font-sans text-xs">Loading schedules database...</span>
                    </div>
                  </td>
                </tr>
              ) : schedules.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-white/40 font-sans text-xs">
                    No scheduled broadcast blocks found.
                  </td>
                </tr>
              ) : (
                schedules.map(block => (
                  <tr key={block.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-6 font-bold text-white/95 font-sans">{block.title}</td>
                    <td className="p-6 text-white/70 font-sans">{block.host}</td>
                    <td className="p-6 font-mono text-white/80">
                      {block.days} ({block.time})
                    </td>
                    <td className="p-6 text-white/70 font-sans">{block.source}</td>
                    <td className="p-6 text-white">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase border ${
                        block.mode === 'LIVE STREAM'
                          ? 'bg-primary/10 text-primary border-primary/20'
                          : block.mode === 'AUTOMATION'
                          ? 'bg-tertiary/10 text-tertiary border-tertiary/20'
                          : 'bg-white/5 text-white/40 border-white/5'
                      }`}>
                        {block.mode}
                      </span>
                    </td>
                    <td className="p-6 text-white">
                      <span className={`font-sans text-xs font-bold ${
                        block.status === 'ACTIVE'
                          ? 'text-emerald-400'
                          : block.status === 'SCHEDULED'
                          ? 'text-primary'
                          : 'text-white/40'
                      }`}>
                        {block.status}
                      </span>
                    </td>
                    <td className="p-6 text-right">
                      <button
                        onClick={() => handleDeleteSchedule(block.id)}
                        className="text-red-400 hover:bg-red-500/10 p-2 rounded-xl transition-colors cursor-pointer"
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
          <div className="bg-[#0a0b12]/95 backdrop-blur-3xl border border-white/10 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in-50 zoom-in-95 duration-200 text-white">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-white/[0.02] border-b border-white/5 flex items-center justify-between">
              <h2 className="font-headline-sm text-white font-bold">New Broadcast Block</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-white/50 hover:text-white p-1 rounded-full hover:bg-white/5 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddSchedule} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-white/40 ml-1 uppercase tracking-wider">Program Title *</label>
                <input
                  required
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="e.g. Akwantufuo Drive"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-primary/45 outline-none transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-white/40 ml-1 uppercase tracking-wider">Broadcaster / Host *</label>
                <input
                  required
                  value={formHost}
                  onChange={e => setFormHost(e.target.value)}
                  placeholder="e.g. DJ K-Flex"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-primary/45 outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-white/40 ml-1 uppercase tracking-wider">Day of Week</label>
                  <select
                    value={formDayIndex}
                    onChange={e => setFormDayIndex(parseInt(e.target.value, 10))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-primary/45 outline-none transition-colors cursor-pointer"
                  >
                    {currentWeekDates.map((day, i) => (
                      <option key={i} value={i} className="bg-[#0c0e1a] text-white">{day.split(' ')[0]}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-white/40 ml-1 uppercase tracking-wider">Day Labels</label>
                  <input
                    value={formDays}
                    onChange={e => setFormDays(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-primary/45 outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-white/40 ml-1 uppercase tracking-wider">Broadcast Time</label>
                  <input
                    value={formTime}
                    onChange={e => setFormTime(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-primary/45 outline-none transition-colors font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-white/40 ml-1 uppercase tracking-wider">Uplink Source</label>
                  <input
                    value={formSource}
                    onChange={e => setFormSource(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-primary/45 outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-white/40 ml-1 uppercase tracking-wider">Broadcast Mode</label>
                  <select
                    value={formMode}
                    onChange={e => setFormMode(e.target.value as ScheduleBlock['mode'])}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-primary/45 outline-none transition-colors cursor-pointer"
                  >
                    <option value="LIVE STREAM" className="bg-[#0c0e1a]">LIVE STREAM</option>
                    <option value="AUTOMATION" className="bg-[#0c0e1a]">AUTOMATION</option>
                    <option value="STANDBY" className="bg-[#0c0e1a]">STANDBY</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-white/40 ml-1 uppercase tracking-wider">Program Status</label>
                  <select
                    value={formStatus}
                    onChange={e => setFormStatus(e.target.value as ScheduleBlock['status'])}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-primary/45 outline-none transition-colors cursor-pointer"
                  >
                    <option value="ACTIVE" className="bg-[#0c0e1a]">ACTIVE</option>
                    <option value="SCHEDULED" className="bg-[#0c0e1a]">SCHEDULED</option>
                    <option value="STANDBY" className="bg-[#0c0e1a]">STANDBY</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 font-label-md text-white/80 hover:bg-white/5 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-primary text-black py-2.5 rounded-xl font-label-md font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? (
                    <>
                      <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm font-bold">save</span>
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
