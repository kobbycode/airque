import type { Station, StationListenerSnapshot } from '@/lib/types';
import { fetchStationListenerCount } from '@/lib/listeners';

export interface AnalyticsSummary {
  totalStations: number;
  onlineStations: number;
  totalListeners: number;
  peakListeners: number;
  totalRequests: number;
  totalPodcasts: number;
  totalSchedules: number;
  regionBreakdown: { region: string; listeners: number; pct: number }[];
  stationRankings: {
    station: Station;
    listeners: number;
    source: 'live' | 'simulated' | 'unavailable';
  }[];
  weeklyListeners: number[];
}

export async function buildAnalyticsSummary(
  stations: Station[],
  requestCount: number,
  podcastCount: number,
  scheduleCount: number
): Promise<AnalyticsSummary> {
  const online = stations.filter(s => s.status === 'ONLINE' && s.streamUrl);
  const tick = Math.floor(Date.now() / 5000);

  const snapshots: StationListenerSnapshot[] = await Promise.all(
    online.map(async station => {
      const { listeners, source } = await fetchStationListenerCount(
        station.streamUrl,
        station.id || station.name,
        tick
      );
      return {
        stationId: station.id || '',
        stationName: station.name,
        region: station.region || 'Greater Accra',
        listeners,
        source,
      };
    })
  );

  const totalListeners = snapshots.reduce((sum, s) => sum + s.listeners, 0);
  const peakListeners = snapshots.length
    ? Math.max(...snapshots.map(s => s.listeners))
    : 0;

  const regionMap = new Map<string, number>();
  snapshots.forEach(s => {
    regionMap.set(s.region, (regionMap.get(s.region) || 0) + s.listeners);
  });
  const regionBreakdown = Array.from(regionMap.entries())
    .map(([region, listeners]) => ({
      region,
      listeners,
      pct: totalListeners > 0 ? Math.round((listeners / totalListeners) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.listeners - a.listeners)
    .slice(0, 6);

  const stationRankings = online
    .map(station => {
      const snap = snapshots.find(s => s.stationId === station.id);
      return {
        station,
        listeners: snap?.listeners ?? 0,
        source: snap?.source ?? 'unavailable' as const,
      };
    })
    .sort((a, b) => b.listeners - a.listeners)
    .slice(0, 10);

  const dayBase = Math.max(totalListeners, 100);
  const weeklyListeners = [0.62, 0.68, 0.71, 0.78, 0.88, 0.92, 0.85].map(
    factor => Math.round(dayBase * factor)
  );

  return {
    totalStations: stations.length,
    onlineStations: online.length,
    totalListeners,
    peakListeners,
    totalRequests: requestCount,
    totalPodcasts: podcastCount,
    totalSchedules: scheduleCount,
    regionBreakdown,
    stationRankings,
    weeklyListeners,
  };
}

export function formatLargeNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}
