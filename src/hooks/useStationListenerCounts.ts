'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { StationListenerSnapshot } from '@/lib/listener-presence';

const ACTIVE_WINDOW_MS = 60_000;

function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const seconds = (value as { seconds: number }).seconds;
    return typeof seconds === 'number' ? seconds * 1000 : null;
  }
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const toDate = (value as { toDate: () => Date }).toDate;
    if (typeof toDate === 'function') return toDate().getTime();
  }
  return null;
}

function mergeCounts(
  aggregate: Record<string, StationListenerSnapshot>,
  live: Record<string, number>
): Record<string, StationListenerSnapshot> {
  const merged = { ...aggregate };
  for (const [stationId, count] of Object.entries(live)) {
    const prev = merged[stationId]?.count ?? 0;
    merged[stationId] = {
      count: Math.max(prev, count),
      updatedAt: merged[stationId]?.updatedAt ?? null,
    };
  }
  return merged;
}

/**
 * Live listener counts per station from `stationListeners` (Cloud Function aggregate)
 * and a client-side roll-up of active `listenerSessions` as fallback.
 */
export function useStationListenerCounts(): Record<string, StationListenerSnapshot> {
  const [aggregateCounts, setAggregateCounts] = useState<
    Record<string, StationListenerSnapshot>
  >({});
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'stationListeners'),
      snap => {
        const next: Record<string, StationListenerSnapshot> = {};
        snap.docs.forEach(d => {
          const data = d.data();
          next[d.id] = {
            count: Math.max(0, typeof data.count === 'number' ? data.count : 0),
            updatedAt: data.updatedAt?.toDate?.() ?? null,
          };
        });
        setAggregateCounts(next);
      },
      err => console.error('stationListeners subscription failed:', err)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    // Single-field query avoids composite index while indexes are building.
    // Stale sessions are filtered out client-side by lastSeen.
    const q = query(collection(db, 'listenerSessions'), where('state', '==', 'active'));

    const unsub = onSnapshot(
      q,
      snap => {
        const now = Date.now();
        const cutoffMs = now - ACTIVE_WINDOW_MS;
        const byStation: Record<string, number> = {};
        snap.docs.forEach(d => {
          const data = d.data();
          const stationId = data.stationId;
          if (typeof stationId !== 'string' || !stationId) return;
          const lastSeenMs = toMillis(data.lastSeen);
          if (lastSeenMs === null || lastSeenMs < cutoffMs) return;
          byStation[stationId] = (byStation[stationId] ?? 0) + 1;
        });
        setSessionCounts(byStation);
      },
      err => {
        const code = (err as { code?: string }).code;
        if (code === 'failed-precondition') {
          console.warn('listenerSessions index still building; using stationListeners only.');
          setSessionCounts({});
          return;
        }
        console.error('listenerSessions subscription failed:', err);
      }
    );
    return () => unsub();
  }, []);

  return mergeCounts(aggregateCounts, sessionCounts);
}
