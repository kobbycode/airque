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
          className="bg-primary text-on-primary px-6 py-2.5 rounded-lg font-label-md hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

      {message && (
        <p className={`text-sm px-4 py-2 rounded-lg ${message.includes('Failed') ? 'bg-error-container text-error' : 'bg-green-100 text-green-700'}`}>
          {message}
        </p>
      )}

      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-12 lg:col-span-8 bg-white border border-outline-variant rounded-xl p-6 space-y-6">
          <h3 className="font-headline-md border-b border-outline-variant/30 pb-3">Encoder & Quality</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <label className="flex flex-col gap-2 text-sm">
              Default Bitrate (kbps)
              <select
                className="border border-outline-variant rounded-lg p-3"
                value={settings.defaultBitrate}
                onChange={e => setSettings(s => ({ ...s, defaultBitrate: e.target.value }))}
              >
                {['320', '256', '128', '64'].map(v => <option key={v} value={v}>{v} kbps</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm">
              Audio Format
              <select
                className="border border-outline-variant rounded-lg p-3"
                value={settings.audioFormat}
                onChange={e => setSettings(s => ({ ...s, audioFormat: e.target.value }))}
              >
                <option value="aac">AAC</option>
                <option value="mp3">MP3</option>
                <option value="opus">Opus</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm">
              Icecast Mount
              <input className="border border-outline-variant rounded-lg p-3 font-mono" value={settings.icecastMount} onChange={e => setSettings(s => ({ ...s, icecastMount: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              Failover URL
              <input className="border border-outline-variant rounded-lg p-3 font-mono" value={settings.failoverUrl} onChange={e => setSettings(s => ({ ...s, failoverUrl: e.target.value }))} />
            </label>
          </div>
          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <input type="checkbox" checked={settings.dynamicMetadata} onChange={e => setSettings(s => ({ ...s, dynamicMetadata: e.target.checked }))} className="w-4 h-4 accent-primary" />
            Enable dynamic ICY metadata
          </label>
        </section>

        <section className="col-span-12 lg:col-span-4 bg-white border border-outline-variant rounded-xl p-6 space-y-4">
          <h3 className="font-headline-md border-b border-outline-variant/30 pb-3">Integration Keys</h3>
          <label className="flex flex-col gap-2 text-sm">
            Stream Security Token
            <input type="password" className="border border-outline-variant rounded-lg p-3 font-mono text-sm" value={settings.streamSecurityToken} onChange={e => setSettings(s => ({ ...s, streamSecurityToken: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            API Key
            <input type="password" className="border border-outline-variant rounded-lg p-3 font-mono text-sm" value={settings.apiKey} onChange={e => setSettings(s => ({ ...s, apiKey: e.target.value }))} />
          </label>
        </section>
      </div>
    </div>
  );
}
