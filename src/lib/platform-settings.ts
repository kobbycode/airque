import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { PlatformSettings } from '@/lib/types';

const SETTINGS_DOC = doc(db, 'settings', 'platform');

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  defaultBitrate: '128',
  audioFormat: 'aac',
  icecastMount: '/live-stream',
  failoverUrl: 'https://backup.aircue.com/live',
  dynamicMetadata: true,
  streamSecurityToken: 'sc_sec_live_placeholder',
  apiKey: 'api_key_placeholder',
};

export async function loadPlatformSettings(): Promise<PlatformSettings> {
  const snap = await getDoc(SETTINGS_DOC);
  if (!snap.exists()) return DEFAULT_PLATFORM_SETTINGS;
  return { ...DEFAULT_PLATFORM_SETTINGS, ...snap.data() } as PlatformSettings;
}

export async function savePlatformSettings(settings: PlatformSettings): Promise<void> {
  await setDoc(SETTINGS_DOC, {
    ...settings,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
