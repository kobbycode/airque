/** How long playback must run before this browser tab counts as a listener. */
export const LISTENER_QUALIFY_MS = 10_000;

/** Heartbeat interval — must stay below the server active window (60s in Cloud Functions). */
export const LISTENER_HEARTBEAT_MS = 25_000;

export const LISTENER_SESSION_KEY = 'aircue_listener_session_id';

export type StationListenerSnapshot = {
  count: number;
  updatedAt?: Date | null;
};

export function getOrCreateListenerSessionId(): string {
  if (typeof window === 'undefined') {
    return `ssr-${Date.now()}`;
  }
  try {
    const existing = sessionStorage.getItem(LISTENER_SESSION_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    sessionStorage.setItem(LISTENER_SESSION_KEY, id);
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}

/** Human label for station cards, e.g. "1 listening" / "2.4k listening". */
export function formatListenerLabel(count: number): string | null {
  if (!Number.isFinite(count) || count < 1) return null;
  if (count >= 1_000_000) {
    const m = count / 1_000_000;
    return `${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, '')}m listening`;
  }
  if (count >= 1_000) {
    const k = count / 1_000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k listening`;
  }
  return count === 1 ? '1 listening' : `${count.toLocaleString()} listening`;
}

export function getStationListenerCount(
  counts: Record<string, StationListenerSnapshot>,
  stationId?: string
): number {
  if (!stationId) return 0;
  return Math.max(0, counts[stationId]?.count ?? 0);
}

/** Merge Firestore aggregate with this tab’s active session (optimistic until CF updates). */
export function getDisplayListenerCount(
  counts: Record<string, StationListenerSnapshot>,
  stationId: string | undefined,
  opts?: { registeredStationId?: string | null; isRegistered?: boolean }
): number {
  const base = getStationListenerCount(counts, stationId);
  if (
    stationId &&
    opts?.isRegistered &&
    opts.registeredStationId === stationId
  ) {
    return Math.max(base, 1);
  }
  return base;
}
