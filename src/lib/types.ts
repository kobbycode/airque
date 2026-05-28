import type { Timestamp, FieldValue } from 'firebase/firestore';

export type StationStatus = 'ONLINE' | 'SILENT' | 'OFFLINE';
export type AppRole = 'listener' | 'creator' | 'admin';

export interface Station {
  id?: string;
  ownerId?: string;
  name: string;
  streamUrl: string;
  genre: string;
  location: string;
  region: string;
  bitrate: string;
  status: StationStatus;
  logoUrl: string;
  createdAt?: Date | Timestamp | FieldValue | null;
  updatedAt?: Date | Timestamp | FieldValue | null;
}

export interface Creator {
  id?: string;
  uid?: string;
  firstName: string;
  lastName: string;
  email: string;
  role?: AppRole;
  createdAt?: Timestamp | null;
}

export interface AppUser {
  uid: string;
  email: string;
  role: AppRole;
  firstName?: string;
  lastName?: string;
  createdAt?: Timestamp | null;
}

export interface AppNotification {
  id: string;
  icon: string;
  iconColor: string;
  title: string;
  body: string;
  createdAt: Timestamp | null;
  unread: boolean;
  userId?: string;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: Timestamp | { seconds: number } | null;
  uid?: string;
}

export interface ScheduleBlock {
  id: string;
  title: string;
  host: string;
  time: string;
  days: string;
  dayIndex: number;
  source: string;
  mode: 'LIVE STREAM' | 'AUTOMATION' | 'STANDBY';
  status: 'ACTIVE' | 'SCHEDULED' | 'STANDBY';
  ownerId?: string;
}

export interface SongRequest {
  id: string;
  stationId: string;
  stationName: string;
  requester: string;
  song: string;
  artist: string;
  shoutout: string;
  timestamp: Timestamp | { seconds: number } | null;
}

export interface Transaction {
  id: string;
  txnId: string;
  date: string;
  method: string;
  amount: number;
  status: 'PAID' | 'PENDING' | 'FAILED';
  ownerId?: string;
  createdAt?: Timestamp | { seconds: number } | null;
}

export interface Podcast {
  id?: string;
  title: string;
  podcastName: string;
  streamUrl: string;
  duration: number;
  logoUrl: string;
  genre: string;
  description: string;
  status?: 'PUBLISHED' | 'DRAFT';
  ownerId?: string;
  createdAt?: Date | Timestamp | FieldValue | null;
}

export interface PlatformSettings {
  defaultBitrate: string;
  audioFormat: string;
  icecastMount: string;
  failoverUrl: string;
  dynamicMetadata: boolean;
  streamSecurityToken: string;
  apiKey: string;
  updatedAt?: Timestamp | null;
}

export interface SupportTicket {
  id?: string;
  priority: 'low' | 'medium' | 'high';
  category: string;
  subject: string;
  description: string;
  email: string;
  userId?: string;
  status: 'OPEN' | 'RESOLVED';
  createdAt?: Timestamp | null;
}

export interface UserPreferences {
  emailNotifications: boolean;
  songRequestAlerts: boolean;
  chatMentions: boolean;
  marketingEmails: boolean;
}

export interface StationListenerSnapshot {
  stationId: string;
  stationName: string;
  region: string;
  listeners: number;
  source: 'live' | 'simulated' | 'unavailable';
}

export function normalizeTimestamp(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate();
  }
  if (typeof value === 'object' && 'seconds' in value && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  return null;
}
