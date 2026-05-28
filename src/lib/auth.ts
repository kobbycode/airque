'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import type { AppRole, AppUser } from '@/lib/types';

interface AuthState {
  user: User | null;
  appUser: AppUser | null;
  loading: boolean;
}

function isRole(value: unknown): value is AppRole {
  return value === 'admin' || value === 'creator' || value === 'listener';
}

async function loadAppUser(user: User): Promise<AppUser> {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data();
    return {
      uid: user.uid,
      email: user.email ?? String(data.email ?? ''),
      role: isRole(data.role) ? data.role : 'listener',
      firstName: typeof data.firstName === 'string' ? data.firstName : undefined,
      lastName: typeof data.lastName === 'string' ? data.lastName : undefined,
      createdAt: data.createdAt ?? null,
    };
  }

  const fallback: AppUser = {
    uid: user.uid,
    email: user.email ?? '',
    role: 'listener',
  };
  await setDoc(ref, {
    email: fallback.email,
    role: fallback.role,
    createdAt: serverTimestamp(),
  }, { merge: true });
  return fallback;
}

export function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: auth.currentUser,
    appUser: null,
    loading: true,
  });

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      if (active && !auth.currentUser) {
        setState({ user: null, appUser: null, loading: false });
      }
    }, 3000);

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      window.clearTimeout(timeout);
      if (!firebaseUser) {
        if (active) setState({ user: null, appUser: null, loading: false });
        return;
      }

      try {
        const appUser = await loadAppUser(firebaseUser);
        if (active) setState({ user: firebaseUser, appUser, loading: false });
      } catch (err) {
        console.error('Failed to load app user:', err);
        if (active) setState({ user: firebaseUser, appUser: null, loading: false });
      }
    });

    return () => {
      active = false;
      window.clearTimeout(timeout);
      unsub();
    };
  }, []);

  return state;
}

export function hasRole(appUser: AppUser | null, roles: AppRole[]): boolean {
  return !!appUser && roles.includes(appUser.role);
}

export function getHomeRoute(role: AppRole): string {
  if (role === 'admin') return '/admin';
  if (role === 'creator') return '/station-dashboard';
  return '/listener-directory';
}
