import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc, deleteDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, getMessagingInstance } from './firebase';

export const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';

/**
 * Request notification permission and get FCM token.
 * Returns the token string or null if permission denied / unsupported.
 */
export async function requestNotificationPermission(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  const messaging = await getMessagingInstance();
  if (!messaging) return null;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    return token || null;
  } catch (err) {
    console.error('FCM token error:', err);
    return null;
  }
}

/**
 * Subscribe an FCM token to a YouTube channel's live notifications.
 * Stores in Firestore: channelSubscriptions/{channelId}/tokens/{token}
 */
export async function subscribeToChannel(channelId: string, channelName: string, token: string): Promise<void> {
  await setDoc(
    doc(db, 'channelSubscriptions', channelId, 'tokens', token),
    {
      token,
      channelId,
      channelName,
      subscribedAt: serverTimestamp(),
    }
  );
}

/**
 * Unsubscribe an FCM token from a channel.
 */
export async function unsubscribeFromChannel(channelId: string, token: string): Promise<void> {
  await deleteDoc(doc(db, 'channelSubscriptions', channelId, 'tokens', token));
}

/**
 * Check if a token is already subscribed to a channel.
 */
export async function isSubscribed(channelId: string, token: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'channelSubscriptions', channelId, 'tokens', token));
  return snap.exists();
}

/**
 * Register foreground message handler — plays sound + shows in-app toast when site is open.
 */
export async function registerForegroundHandler(
  onNotification: (title: string, body: string, channelId?: string) => void
) {
  const messaging = await getMessagingInstance();
  if (!messaging) return;

  onMessage(messaging, (payload) => {
    const title = payload.notification?.title || 'Channel is LIVE';
    const body = payload.notification?.body || '';
    const channelId = payload.data?.channelId;
    onNotification(title, body, channelId);
  });
}
