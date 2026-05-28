import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function fetchStationListenerCount(
  streamUrl: string,
  stationId: string,
  timeCounter = Math.floor(Date.now() / 5000)
): Promise<{ listeners: number; source: 'live' | 'simulated' | 'unavailable' }> {
  try {
    const docRef = doc(db, 'stationListeners', stationId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const count = Math.max(0, data.count || 0);
      return { listeners: count, source: 'live' };
    }
    return { listeners: 0, source: 'live' };
  } catch (err) {
    console.error('Error fetching listener count:', err);
    return { listeners: 0, source: 'unavailable' };
  }
}
