'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AppUser, UserPreferences } from '@/lib/types';

const DEFAULT_PREFS: UserPreferences = {
  emailNotifications: true,
  songRequestAlerts: true,
  chatMentions: false,
  marketingEmails: false,
};

export function EditProfileModal({
  appUser,
  onClose,
}: {
  appUser: AppUser;
  onClose: () => void;
}) {
  const [firstName, setFirstName] = useState(appUser.firstName || '');
  const [lastName, setLastName] = useState(appUser.lastName || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await setDoc(doc(db, 'users', appUser.uid), {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: appUser.email,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setMessage('Profile updated.');
      setTimeout(onClose, 800);
    } catch {
      setMessage('Could not save profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Edit Profile" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <input className="w-full border border-outline-variant rounded-xl px-4 py-3 text-sm" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" />
        <input className="w-full border border-outline-variant rounded-xl px-4 py-3 text-sm" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" />
        <input className="w-full border border-outline-variant rounded-xl px-4 py-3 text-sm bg-surface-container-low" value={appUser.email} readOnly />
        {message && <p className="text-sm text-primary">{message}</p>}
        <button type="submit" disabled={saving} className="w-full bg-primary text-on-primary py-3 rounded-xl font-label-md disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </form>
    </ModalShell>
  );
}

export function NotificationPrefsModal({
  appUser,
  onClose,
}: {
  appUser: AppUser;
  onClose: () => void;
}) {
  const storageKey = `aircue_prefs_${appUser.uid}`;
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
      } catch { /* ignore */ }
    });
  }, [storageKey]);

  const toggle = (key: keyof UserPreferences) =>
    setPrefs(p => ({ ...p, [key]: !p[key] }));

  const save = async () => {
    setSaving(true);
    try {
      localStorage.setItem(storageKey, JSON.stringify(prefs));
      await setDoc(doc(db, 'users', appUser.uid), { preferences: prefs }, { merge: true });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const rows: { key: keyof UserPreferences; label: string }[] = [
    { key: 'emailNotifications', label: 'Email notifications' },
    { key: 'songRequestAlerts', label: 'Song request alerts' },
    { key: 'chatMentions', label: 'Live chat mentions' },
    { key: 'marketingEmails', label: 'Product updates' },
  ];

  return (
    <ModalShell title="Notification Preferences" onClose={onClose}>
      <div className="space-y-3">
        {rows.map(({ key, label }) => (
          <label key={key} className="flex items-center justify-between p-3 rounded-xl border border-outline-variant cursor-pointer">
            <span className="text-sm text-on-surface">{label}</span>
            <input type="checkbox" checked={prefs[key]} onChange={() => toggle(key)} className="w-4 h-4 accent-primary" />
          </label>
        ))}
        <button type="button" onClick={save} disabled={saving} className="w-full mt-2 bg-primary text-on-primary py-3 rounded-xl font-label-md">
          {saving ? 'Saving…' : 'Save Preferences'}
        </button>
      </div>
    </ModalShell>
  );
}

export function FavoritesModal({ onClose }: { onClose: () => void }) {
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const favs = JSON.parse(localStorage.getItem('aircue_favorites') || '[]');
        setFavorites(Array.isArray(favs) ? favs : []);
      } catch { setFavorites([]); }
    });
  }, []);

  return (
    <ModalShell title="Favourite Stations" onClose={onClose}>
      {favorites.length === 0 ? (
        <p className="text-sm text-on-surface-variant text-center py-6">No favourites yet. Star stations in the directory.</p>
      ) : (
        <p className="text-sm text-on-surface-variant mb-4">{favorites.length} saved station{favorites.length !== 1 ? 's' : ''}</p>
      )}
      <Link
        href="/listener-directory"
        onClick={onClose}
        className="block w-full text-center bg-primary text-on-primary py-3 rounded-xl font-label-md"
      >
        Open Directory
      </Link>
    </ModalShell>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-on-surface/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md border border-outline-variant p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-headline-md text-on-surface">{title}</h3>
          <button type="button" onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
