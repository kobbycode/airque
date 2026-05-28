'use client';

import React, { useState, useRef, useEffect } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuthState } from '@/lib/auth';
import type { Station, StationStatus } from '@/lib/types';

const REGIONS = [
  'Greater Accra', 'Ashanti', 'Western', 'Central', 'Eastern',
  'Northern', 'Upper East', 'Upper West', 'Volta', 'Brong-Ahafo',
  'Savannah', 'Bono East', 'Ahafo', 'North East', 'Oti', 'Western North',
];

const GENRES = [
  'Highlife', 'Afrobeats', 'Gospel', 'News & Talk', 'Sports',
  'Hip Hop / HipLife', 'Reggae', 'R&B', 'Jazz', 'Classical',
  'Electronic', 'Traditional', 'Akan', 'Multi-genre',
];

const BITRATES = ['64kbps', '96kbps', '128kbps', '192kbps', '256kbps', '320kbps'];

interface EditStationModalProps {
  station: Station | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function EditStationModal({ station, onClose, onSuccess }: EditStationModalProps) {
  const { appUser, loading: authLoading } = useAuthState();
  const [form, setForm] = useState<Omit<Station, 'id' | 'createdAt'>>({
    name: '',
    streamUrl: '',
    genre: '',
    location: '',
    region: '',
    bitrate: '128kbps',
    status: 'ONLINE',
    logoUrl: '',
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!station) return;
    setForm({
      name: station.name,
      streamUrl: station.streamUrl,
      genre: station.genre,
      location: station.location,
      region: station.region,
      bitrate: station.bitrate,
      status: station.status,
      logoUrl: station.logoUrl,
      ownerId: station.ownerId,
    });
    setLogoPreview(station.logoUrl || '');
    setLogoFile(null);
    setError('');
  }, [station]);

  if (!station?.id) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (authLoading) return setError('Checking account permissions. Please try again.');
    if (!appUser || !['admin', 'creator'].includes(appUser.role)) {
      return setError('Sign in as a creator or admin to edit stations.');
    }
    if (appUser.role === 'creator' && station.ownerId !== appUser.uid) {
      return setError('You can only edit your own stations.');
    }
    if (!form.name.trim()) return setError('Station name is required.');
    if (!form.streamUrl.trim()) return setError('Stream URL is required.');
    if (!form.genre) return setError('Please select a genre.');
    if (!form.region) return setError('Please select a region.');

    try {
      setSaving(true);
      let finalLogoUrl = form.logoUrl;

      if (logoFile) {
        setUploading(true);
        const safeName = logoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storageRef = ref(storage, `station-logos/${appUser.uid}/${Date.now()}_${safeName}`);
        const uploadTask = uploadBytesResumable(storageRef, logoFile);

        finalLogoUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            snap => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
            reject,
            async () => resolve(getDownloadURL(uploadTask.snapshot.ref))
          );
        });
        setUploading(false);
      }

      await updateDoc(doc(db, 'stations', station.id!), {
        name: form.name.trim(),
        streamUrl: form.streamUrl.trim(),
        genre: form.genre,
        location: form.location.trim(),
        region: form.region,
        bitrate: form.bitrate,
        status: form.status,
        logoUrl: finalLogoUrl,
        updatedAt: serverTimestamp(),
      });

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error(err);
      setError('Failed to update station. Please try again.');
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-[#0b0c14]/95 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-white/10 backdrop-blur-xl">
        <div className="flex items-center justify-between px-8 py-6 border-b border-white/5 bg-white/2">
          <div>
            <h2 className="font-bold text-lg text-white tracking-wide">Edit Station</h2>
            <p className="font-body-sm text-[10px] text-cyan-400 uppercase tracking-widest mt-1 font-semibold">Update stream details and broadcast status</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 border border-transparent hover:border-white/10 transition-colors text-white/50 hover:text-white cursor-pointer">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
          <form id="edit-station-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="font-label-md text-[10px] text-white/50 uppercase tracking-wider">Station Logo</label>
              <div
                className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                  dragOver ? 'border-primary bg-primary/5' : 'border-white/10 hover:border-primary/50 text-white/50 hover:text-white'
                }`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
                onClick={() => fileInputRef.current?.click()}
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="w-20 h-20 rounded-full object-cover mx-auto border-2 border-primary" />
                ) : (
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="material-symbols-outlined text-4xl text-primary/60">cloud_upload</span>
                    <span className="text-xs">Drag image here or click to select</span>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />
              </div>
              {uploading && (
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/10">
                  <div className="h-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="font-label-md text-[10px] text-white/50 uppercase tracking-wider">Station Name *</label>
              <input type="text" name="name" value={form.name} onChange={handleChange} required className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
            </div>

            <div className="space-y-2">
              <label className="font-label-md text-[10px] text-white/50 uppercase tracking-wider">Stream URL *</label>
              <input type="url" name="streamUrl" value={form.streamUrl} onChange={handleChange} required className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-cyan-400 font-mono text-sm placeholder-white/30 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-label-md text-[10px] text-white/50 uppercase tracking-wider">Genre *</label>
                <select name="genre" value={form.genre} onChange={handleChange} required className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all cursor-pointer">
                  <option value="" className="bg-[#0f0f14] text-white">Select genre</option>
                  {GENRES.map(g => <option key={g} value={g} className="bg-[#0f0f14] text-white">{g}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="font-label-md text-[10px] text-white/50 uppercase tracking-wider">Region *</label>
                <select name="region" value={form.region} onChange={handleChange} required className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all cursor-pointer">
                  <option value="" className="bg-[#0f0f14] text-white">Select region</option>
                  {REGIONS.map(r => <option key={r} value={r} className="bg-[#0f0f14] text-white">{r}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-label-md text-[10px] text-white/50 uppercase tracking-wider">City / Frequency</label>
                <input type="text" name="location" value={form.location} onChange={handleChange} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:border-primary outline-none transition-all" />
              </div>
              <div className="space-y-2">
                <label className="font-label-md text-[10px] text-white/50 uppercase tracking-wider">Bitrate</label>
                <select name="bitrate" value={form.bitrate} onChange={handleChange} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all cursor-pointer">
                  {BITRATES.map(b => <option key={b} value={b} className="bg-[#0f0f14] text-white">{b}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="font-label-md text-[10px] text-white/50 uppercase tracking-wider">Status</label>
              <div className="flex gap-3">
                {(['ONLINE', 'SILENT', 'OFFLINE'] as StationStatus[]).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, status: s }))}
                    className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-wider border transition-all cursor-pointer ${
                      form.status === s
                        ? s === 'ONLINE' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                          : s === 'SILENT' ? 'bg-cyan-500/10 border-cyan-400/30 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                          : 'bg-red-500/10 border-red-500/30 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.15)]'
                        : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-sm font-bold">error</span>
                <p className="font-body-sm font-semibold">{error}</p>
              </div>
            )}
          </form>
        </div>

        <div className="px-8 py-5 border-t border-white/5 bg-white/2 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={saving} className="px-6 py-3 rounded-xl border border-white/10 font-bold text-xs uppercase tracking-wider text-white/70 hover:bg-white/5 hover:text-white transition-all disabled:opacity-50 cursor-pointer">
            Cancel
          </button>
          <button type="submit" form="edit-station-form" disabled={saving || uploading} className="px-8 py-3 rounded-xl bg-primary text-black font-bold text-xs uppercase tracking-wider hover:scale-[1.02] active:scale-95 shadow-[0_5px_15px_rgba(230,194,128,0.2)] transition-all disabled:opacity-60 flex items-center gap-2 cursor-pointer">
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm font-bold">save</span>
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
