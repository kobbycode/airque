'use client';

import React, { useEffect, useState } from 'react';
import { DEFAULT_PLATFORM_SETTINGS, loadPlatformSettings, savePlatformSettings } from '@/lib/platform-settings';
import type { PlatformSettings } from '@/lib/types';

export default function SettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_PLATFORM_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadPlatformSettings()
      .then(setSettings)
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      await savePlatformSettings(settings);
      setMessage('Settings saved to Firestore.');
    } catch {
      setMessage('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 text-on-surface-variant">
        Loading platform settings…
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-[32px] custom-scrollbar space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-headline-lg text-on-surface">Platform Settings</h1>
          <p className="font-body-sm text-on-surface-variant">Stored in Firestore at settings/platform</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="bg-primary text-black px-6 py-2.5 rounded-xl font-label-md hover:scale-105 active:scale-95 transition-all font-bold disabled:opacity-50 cursor-pointer shadow-lg shadow-primary/20"
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

      {message && (
        <div className={`flex items-center gap-2 border rounded-xl px-4 py-3 ${
          message.includes('Failed') 
            ? 'bg-red-500/10 border-red-500/20 text-red-400' 
            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
        }`}>
          <span className="material-symbols-outlined text-sm">
            {message.includes('Failed') ? 'error' : 'check_circle'}
          </span>
          <p className="text-xs font-semibold">{message}</p>
        </div>
      )}

      <div className="grid grid-cols-12 gap-6 text-white">
        <section className="col-span-12 lg:col-span-8 modern-glass border border-white/5 rounded-2xl p-6 space-y-6">
          <h3 className="font-headline-md border-b border-white/5 pb-3 text-white font-bold">Encoder & Quality</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <label className="flex flex-col gap-2 text-xs uppercase tracking-wider text-white/40 font-bold">
              Default Bitrate
              <select
                className="bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-primary/45 transition-colors cursor-pointer"
                value={settings.defaultBitrate}
                onChange={e => setSettings(s => ({ ...s, defaultBitrate: e.target.value }))}
              >
                {['320', '256', '128', '64'].map(v => <option key={v} value={v} className="bg-[#0c0e1a] text-white">{v} kbps</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs uppercase tracking-wider text-white/40 font-bold">
              Audio Format
              <select
                className="bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm outline-none focus:border-primary/45 transition-colors cursor-pointer"
                value={settings.audioFormat}
                onChange={e => setSettings(s => ({ ...s, audioFormat: e.target.value }))}
              >
                <option value="aac" className="bg-[#0c0e1a] text-white">AAC</option>
                <option value="mp3" className="bg-[#0c0e1a] text-white">MP3</option>
                <option value="opus" className="bg-[#0c0e1a] text-white">Opus</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs uppercase tracking-wider text-white/40 font-bold">
              Icecast Mount
              <input className="bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm font-mono outline-none focus:border-primary/45 transition-colors" value={settings.icecastMount} onChange={e => setSettings(s => ({ ...s, icecastMount: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-2 text-xs uppercase tracking-wider text-white/40 font-bold">
              Failover URL
              <input className="bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm font-mono outline-none focus:border-primary/45 transition-colors" value={settings.failoverUrl} onChange={e => setSettings(s => ({ ...s, failoverUrl: e.target.value }))} />
            </label>
          </div>
          <label className="flex items-center gap-3 text-sm text-white/80 cursor-pointer">
            <input type="checkbox" checked={settings.dynamicMetadata} onChange={e => setSettings(s => ({ ...s, dynamicMetadata: e.target.checked }))} className="w-4 h-4 accent-primary" />
            Enable dynamic ICY metadata
          </label>
        </section>

        <section className="col-span-12 lg:col-span-4 modern-glass border border-white/5 rounded-2xl p-6 space-y-4">
          <h3 className="font-headline-md border-b border-white/5 pb-3 text-white font-bold">Integration Keys</h3>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-wider text-white/40 font-bold">
            Stream Security Token
            <input type="password" className="bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm font-mono outline-none focus:border-primary/45 transition-colors" value={settings.streamSecurityToken} onChange={e => setSettings(s => ({ ...s, streamSecurityToken: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-wider text-white/40 font-bold">
            API Key
            <input type="password" className="bg-white/5 border border-white/10 rounded-xl p-3 text-white text-sm font-mono outline-none focus:border-primary/45 transition-colors" value={settings.apiKey} onChange={e => setSettings(s => ({ ...s, apiKey: e.target.value }))} />
          </label>
        </section>
      </div>
    </div>
  );
}
