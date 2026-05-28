'use client';

import React, { useState, useRef, useEffect } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuthState } from '@/lib/auth';
import type { Station } from '@/lib/types';

interface AddStationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (station: Station) => void;
}

const REGIONS = [
  'Greater Accra', 'Ashanti', 'Western', 'Central', 'Eastern',
  'Northern', 'Upper East', 'Upper West', 'Volta', 'Brong-Ahafo',
  'Savannah', 'Bono East', 'Ahafo', 'North East', 'Oti', 'Western North'
];

const GENRES = [
  'Highlife', 'Afrobeats', 'Gospel', 'News & Talk', 'Sports',
  'Hip Hop / HipLife', 'Reggae', 'R&B', 'Jazz', 'Classical',
  'Electronic', 'Traditional', 'Akan', 'Multi-genre'
];

const BITRATES = ['64kbps', '96kbps', '128kbps', '192kbps', '256kbps', '320kbps'];

export default function AddStationModal({ isOpen, onClose, onSuccess }: AddStationModalProps) {
  const { appUser, loading: authLoading } = useAuthState();

  // Only admins can add stations through this modal
  useEffect(() => {
    if (!authLoading && appUser && appUser.role !== 'admin') {
      setError('Only administrators can add stations through this modal.');
      onClose();
    }
  }, [appUser, authLoading, onClose]);
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
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

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
    setForm(prev => ({ ...prev, logoUrl: '' }));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (authLoading) return setError('Checking account permissions. Please try again in a moment.');
    if (!appUser || !['admin', 'creator'].includes(appUser.role)) return setError('Sign in as a creator or admin to add stations.');
    if (!form.name.trim()) return setError('Station name is required.');
    if (!form.streamUrl.trim()) return setError('Stream URL is required.');
    if (!form.genre) return setError('Please select a genre.');
    if (!form.region) return setError('Please select a region.');
    if (!logoFile && !form.logoUrl.trim()) return setError('Please provide a station logo (upload or URL).');

    try {
      setSaving(true);
      let finalLogoUrl = form.logoUrl;

      // Upload logo to Firebase Storage if a file was selected
      if (logoFile) {
        setUploading(true);
        const safeName = logoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storageRef = ref(storage, `station-logos/${appUser.uid}/${Date.now()}_${safeName}`);
        const uploadTask = uploadBytesResumable(storageRef, logoFile);

        finalLogoUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            (snap) => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
            reject,
            async () => {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(url);
            }
          );
        });
        setUploading(false);
      }

      const stationData: Omit<Station, 'id'> = {
        ...form,
        ownerId: appUser.uid,
        logoUrl: finalLogoUrl,
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'stations'), stationData);
      onSuccess?.({ ...stationData, id: docRef.id });

      // Reset form
      setForm({ name: '', streamUrl: '', genre: '', location: '', region: '', bitrate: '128kbps', status: 'ONLINE', logoUrl: '' });
      setLogoFile(null);
      setLogoPreview('');
      setUploadProgress(0);
      onClose();
    } catch (err) {
      console.error(err);
      setError('Failed to save station. Please try again.');
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-on-surface/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-outline-variant">
        
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-outline-variant bg-surface-container">
          <div>
            <h2 className="font-headline-md text-headline-md text-on-surface">Add New Station</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Connect your Icecast / HLS stream to the platform</p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-6">
          <form id="add-station-form" onSubmit={handleSubmit} className="space-y-6">

            {/* Logo Upload */}
            <div className="space-y-2">
              <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-[10px]">Station Logo</label>
              <div
                className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
                  dragOver ? 'border-primary bg-primary/5' : 'border-outline-variant hover:border-primary/50 hover:bg-surface-container-low'
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                {logoPreview ? (
                  <div className="flex flex-col items-center gap-3">
                    <img src={logoPreview} alt="Preview" className="w-20 h-20 rounded-full object-cover border-2 border-primary-container" />
                    <p className="font-label-md text-on-surface-variant text-sm">{logoFile?.name}</p>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setLogoFile(null); setLogoPreview(''); }}
                      className="text-error font-label-md text-sm hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-on-surface-variant">
                    <span className="material-symbols-outlined text-4xl text-primary/60">cloud_upload</span>
                    <p className="font-body-md text-body-md">Drag & drop or <span className="text-primary font-bold">browse</span></p>
                    <p className="font-body-sm text-body-sm opacity-70">PNG, JPG, WEBP — max 5MB</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                />
              </div>

              {/* Upload progress */}
              {uploading && (
                <div className="space-y-1">
                  <div className="flex justify-between font-label-md text-[11px] text-on-surface-variant">
                    <span>Uploading…</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-surface-container-low rounded-full overflow-hidden">
                    <div className="h-full bg-primary transition-all rounded-full" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              {/* Or URL */}
              {!logoFile && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-outline-variant" /></div>
                  <div className="relative flex justify-center"><span className="bg-surface px-3 font-label-md text-[11px] text-on-surface-variant">or paste URL</span></div>
                </div>
              )}
              {!logoFile && (
                <input
                  type="url"
                  name="logoUrl"
                  value={form.logoUrl}
                  onChange={handleChange}
                  placeholder="https://example.com/logo.png"
                  className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
              )}
            </div>

            {/* Station Name */}
            <div className="space-y-2">
              <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-[10px]">Station Name *</label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="e.g. Empire FM"
                required
                className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
              />
            </div>

            {/* Stream URL */}
            <div className="space-y-2">
              <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-[10px]">Stream / Icecast URL *</label>
              <input
                type="url"
                name="streamUrl"
                value={form.streamUrl}
                onChange={handleChange}
                placeholder="https://yourserver.com/stream/playlist.m3u8"
                required
                className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all font-mono text-sm"
              />
              <p className="font-body-sm text-[11px] text-on-surface-variant">Supports HLS (.m3u8), Icecast, and direct audio streams.</p>
            </div>

            {/* Genre + Region */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-[10px]">Genre *</label>
                <select
                  name="genre"
                  value={form.genre}
                  onChange={handleChange}
                  required
                  className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                >
                  <option value="">Select genre</option>
                  {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-[10px]">Region *</label>
                <select
                  name="region"
                  value={form.region}
                  onChange={handleChange}
                  required
                  className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                >
                  <option value="">Select region</option>
                  {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            {/* Location + Bitrate */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-[10px]">City / Frequency</label>
                <input
                  type="text"
                  name="location"
                  value={form.location}
                  onChange={handleChange}
                  placeholder="e.g. Accra, 102.7 MHz"
                  className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-[10px]">Bitrate</label>
                <select
                  name="bitrate"
                  value={form.bitrate}
                  onChange={handleChange}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                >
                  {BITRATES.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            </div>

            {/* Status */}
            <div className="space-y-2">
              <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-[10px]">Initial Status</label>
              <div className="flex gap-3">
                {(['ONLINE', 'SILENT', 'OFFLINE'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, status: s }))}
                    className={`flex-1 py-3 rounded-xl font-label-md text-label-md border transition-all ${
                      form.status === s
                        ? s === 'ONLINE' ? 'bg-green-100 border-green-400 text-green-700' 
                          : s === 'SILENT' ? 'bg-amber-100 border-amber-400 text-amber-700'
                          : 'bg-red-100 border-red-400 text-red-700'
                        : 'bg-surface-container-low border-outline-variant text-on-surface-variant hover:bg-surface-container'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 bg-error-container text-on-error-container rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-sm">error</span>
                <p className="font-body-sm text-body-sm">{error}</p>
              </div>
            )}

          </form>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-outline-variant bg-surface-container flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-6 py-3 rounded-xl border border-outline-variant font-label-md text-label-md text-on-surface hover:bg-surface-container-high transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-station-form"
            disabled={saving || uploading}
            className="px-8 py-3 rounded-xl bg-primary text-on-primary font-label-md text-label-md hover:opacity-90 transition-all active:scale-95 disabled:opacity-60 flex items-center gap-2 shadow-sm"
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
                {uploading ? `Uploading ${uploadProgress}%…` : 'Saving…'}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">add</span>
                Add Station
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
