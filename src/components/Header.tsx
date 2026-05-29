'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  collection, onSnapshot, query, where, orderBy, limit, doc,
  updateDoc, addDoc, writeBatch, Timestamp
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db } from '@/lib/firebase';
import { auth } from '@/lib/firebase';
import { DEMO_MODE } from '@/lib/demo';
import { getHomeRoute, useAuthState } from '@/lib/auth';
import type { AppNotification, AppUser, Station } from '@/lib/types';
import { EditProfileModal, FavoritesModal, NotificationPrefsModal } from '@/components/ProfileMenuModals';
import { useAlert } from '@/components/CustomAlert';

interface HeaderProps {
  variant: 'landing' | 'directory' | 'admin' | 'creator';
  activeTab?: 'directory' | 'dashboard' | 'analytics' | 'schedules';
}

// ─── Notification types ────────────────────────────────────────────────────────
const SEED_NOTIFS = [
  { icon: 'sensors', iconColor: 'text-green-500', title: 'Empire FM went LIVE', body: 'Empire FM just started streaming on the Greater Accra relay.', unread: true, agoMs: 2 * 60 * 1000 },
  { icon: 'queue_music', iconColor: 'text-primary', title: 'New Song Request', body: 'Kofi Ansa requested "Obiaa Kae" by Amakye Dede.', unread: true, agoMs: 12 * 60 * 1000 },
  { icon: 'chat_bubble', iconColor: 'text-secondary', title: 'Chat spike on Starr FM', body: '47 new messages in the Starr FM live chat room.', unread: true, agoMs: 35 * 60 * 1000 },
];

// Helper to format time relative to Firestore Timestamp / Date / milliseconds
function getRelativeTime(createdAt: Date | number | string | Timestamp | { seconds: number } | null | undefined): string {
  if (!createdAt) return 'just now';
  let seconds = 0;
  if (typeof createdAt === 'object' && 'seconds' in createdAt && typeof createdAt.seconds === 'number') {
    seconds = createdAt.seconds;
  } else if (createdAt instanceof Timestamp) {
    seconds = Math.floor(createdAt.toDate().getTime() / 1000);
  } else if (createdAt instanceof Date) {
    seconds = Math.floor(createdAt.getTime() / 1000);
  } else if (typeof createdAt === 'number') {
    seconds = Math.floor(createdAt / 1000);
  } else if (typeof createdAt === 'string') {
    const parsed = new Date(createdAt);
    if (!isNaN(parsed.getTime())) {
      seconds = Math.floor(parsed.getTime() / 1000);
    } else {
      return 'just now';
    }
  } else {
    return 'just now';
  }

  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 0) return 'just now';
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}



// ─── Search hook — queries Firestore stations in real-time ────────────────────
function useStationSearch(query_: string) {
  const [stations, setStations] = useState<Station[]>([]);
  useEffect(() => {
    const q = query(
      collection(db, 'stations'),
      where('status', '==', 'ONLINE'),
      orderBy('name'),
      limit(20)
    );
    const unsub = onSnapshot(q, snap => {
      setStations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Station)));
    });
    return () => unsub();
  }, []);

  if (!query_.trim()) return [];
  const lower = query_.toLowerCase();
  return stations.filter(s =>
    s.name.toLowerCase().includes(lower) ||
    s.genre?.toLowerCase().includes(lower) ||
    s.location?.toLowerCase().includes(lower) ||
    s.region?.toLowerCase().includes(lower)
  ).slice(0, 6);
}

// ─── Notification Panel ────────────────────────────────────────────────────────
function NotificationPanel({
  notifs,
  unreadCount,
  onClose,
  onMarkAllRead,
  onMarkAsRead
}: {
  notifs: AppNotification[];
  unreadCount: number;
  onClose: () => void;
  onMarkAllRead: (notifs: AppNotification[]) => Promise<void>;
  onMarkAsRead: (n: AppNotification) => Promise<void>;
}) {

  return (
    <div className="absolute right-0 top-full mt-2 w-96 rounded-2xl shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)] border border-[#E6C280]/20 obsidian-glass-card overflow-hidden z-[200]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#E6C280]/20 bg-black/40">
        <div className="flex items-center gap-2">
          <h3 className="font-headline-sm text-white font-bold">Notifications</h3>
          {unreadCount > 0 && (
            <span className="bg-[#E6C280] text-black text-[10px] font-bold px-2 py-0.5 rounded-full">{unreadCount}</span>
          )}
        </div>
        <button onClick={() => onMarkAllRead(notifs)} className="text-[#E6C280] font-label-md text-xs hover:underline">Mark all read</button>
      </div>

      {/* List */}
      <div className="max-h-[420px] overflow-y-auto divide-y divide-outline-variant/20">
        {notifs.length === 0 ? (
          <div className="px-5 py-12 text-center text-on-surface-variant text-sm">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-2">notifications_off</span>
            <p>No notifications yet</p>
          </div>
        ) : (
notifs.map(n => (
             <div
               key={n.id}
               className={`flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-surface-container-low transition-colors ${n.unread ? 'bg-primary/5' : ''}`}
               onClick={() => onMarkAsRead(n)}
             >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${n.unread ? 'bg-primary/10' : 'bg-surface-container'
                }`}>
                <span className={`material-symbols-outlined text-[18px] ${n.iconColor}`}>{n.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-sm font-semibold text-on-surface truncate ${n.unread ? '' : 'font-normal'}`}>{n.title}</p>
                  <span className="text-[10px] text-on-surface-variant whitespace-nowrap">{getRelativeTime(n.createdAt)}</span>
                </div>
                <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
              </div>
              {n.unread && <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-outline-variant/30 bg-surface-container-lowest text-center">
        <button className="text-primary font-label-md text-xs hover:underline" onClick={onClose}>Close panel</button>
      </div>
    </div>
  );
}

// ─── Search Panel ──────────────────────────────────────────────────────────────
function SearchDropdown({ searchValue, results, onSelect }: {
  searchValue: string;
  results: Station[];
  onSelect: (s: Station) => void;
}) {
  if (!searchValue.trim()) return null;

  return (
    <div className="absolute top-full left-0 mt-2 w-full min-w-[320px] rounded-2xl shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)] border border-[#E6C280]/20 obsidian-glass-card overflow-hidden z-[200]">
      {results.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <span className="material-symbols-outlined text-4xl text-white/30">search_off</span>
          <p className="text-sm text-white/60 mt-2">No stations found for &quot;<strong>{searchValue}</strong>&quot;</p>
        </div>
      ) : (
        <div className="py-2 max-h-80 overflow-y-auto">
          <p className="px-4 py-2 text-[10px] uppercase tracking-widest text-on-surface-variant/60 font-bold">
            {results.length} station{results.length !== 1 ? 's' : ''} found
          </p>
          {results.map(s => (
            <button
              key={s.id}
              onClick={() => onSelect(s)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors text-left"
            >
              {s.logoUrl ? (
                <img src={s.logoUrl} alt={s.name} className="w-10 h-10 rounded-full object-cover border border-outline-variant flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-primary text-lg">radio</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-on-surface truncate">{s.name}</p>
                <p className="text-xs text-on-surface-variant truncate">{s.genre} · {s.location || s.region}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {s.status === 'ONLINE' && (
                  <span className="flex items-center gap-1 bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    LIVE
                  </span>
                )}
                <span className="material-symbols-outlined text-on-surface-variant text-sm">arrow_forward</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Profile Panel ─────────────────────────────────────────────────────────────
function ProfilePanel({
  variant,
  onClose,
  stationsCount,
  listenersCount,
  isLive,
  appUser,
  onEditProfile,
  onFavorites,
  onNotifications,
}: {
  variant: 'landing' | 'directory' | 'admin' | 'creator';
  onClose: () => void;
  stationsCount: number;
  listenersCount: number;
  isLive: boolean;
  appUser: AppUser | null;
  onEditProfile: () => void;
  onFavorites: () => void;
  onNotifications: () => void;
}) {
  const isAdmin = variant === 'admin';
  const isCreatorStudio = variant === 'creator';
  const creatorName = appUser
    ? `${appUser.firstName || 'Station'} ${appUser.lastName || 'Manager'}`.trim()
    : 'Guest Listener';
  const creatorEmail = appUser?.email || 'Sign in to manage stations';
  const { showConfirm } = useAlert();

  return (
    <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)] border border-[#E6C280]/20 obsidian-glass-card overflow-hidden z-[200]">
      {/* User card */}
      <div className="px-5 pt-5 pb-4 border-b border-[#E6C280]/20 bg-black/40">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full border-2 border-[#E6C280]/60 flex items-center justify-center text-[#E6C280] font-bold text-lg bg-black/60 shadow-inner">
            {creatorName.substring(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-white truncate">{creatorName}</p>
            <p className="text-xs text-white/60 truncate">{creatorEmail}</p>
          </div>
          {isAdmin && (
            <span className="text-[9px] font-bold bg-[#E6C280] text-black px-2 py-0.5 rounded-full uppercase">Admin</span>
          )}
          {isCreatorStudio && appUser?.role === 'creator' && (
            <span className="text-[9px] font-bold bg-[#E6C280] text-black px-2 py-0.5 rounded-full uppercase">Creator</span>
          )}
        </div>
        <div className="mt-3 flex gap-3 text-center">
          <div className="flex-1 bg-black/40 rounded-lg py-2 border border-white/5">
            <p className="font-bold text-sm text-white">{stationsCount}</p>
            <p className="text-[9px] text-[#E6C280]/80 uppercase tracking-wide">Stations</p>
          </div>
          <div className="flex-1 bg-black/40 rounded-lg py-2 border border-white/5">
            <p className="font-bold text-sm text-white">
              {listenersCount >= 1000 ? `${(listenersCount / 1000).toFixed(1)}K` : listenersCount}
            </p>
            <p className="text-[9px] text-[#E6C280]/80 uppercase tracking-wide">Listeners</p>
          </div>
          <div className="flex-1 bg-black/40 rounded-lg py-2 border border-white/5">
            <p className={`font-bold text-sm ${isLive ? 'text-amber-500 glow-amber-live' : 'text-white/40'}`}>
              {isLive ? 'LIVE' : 'OFFLINE'}
            </p>
            <p className="text-[9px] text-[#E6C280]/80 uppercase tracking-wide">Status</p>
          </div>
        </div>
      </div>

      {/* Menu items */}
      <div className="py-2">
        {isAdmin ? (
          <>
            <Link href="/admin" prefetch={false} onClick={onClose}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant">dashboard</span>
              <span className="text-sm text-on-surface">Admin Dashboard</span>
            </Link>
            <Link href="/admin/settings" prefetch={false} onClick={onClose}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant">settings</span>
              <span className="text-sm text-on-surface">Admin Settings</span>
            </Link>
            <Link href="/admin/analytics" prefetch={false} onClick={onClose}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant">bar_chart</span>
              <span className="text-sm text-on-surface">Platform Analytics</span>
            </Link>
          </>
        ) : appUser?.role === 'creator' ? (
          <>
            <Link href="/station-dashboard" prefetch={false} onClick={onClose}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant">radio</span>
              <span className="text-sm text-on-surface">My Stations</span>
            </Link>
            <Link href="/station-dashboard/requests" prefetch={false} onClick={onClose}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant">queue_music</span>
              <span className="text-sm text-on-surface">Song Requests</span>
            </Link>
            <Link href="/listener-directory" prefetch={false} onClick={onClose}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant">headphones</span>
              <span className="text-sm text-on-surface">Listen Live</span>
            </Link>
          </>
        ) : appUser ? (
          <>
            <button type="button" onClick={() => { onEditProfile(); onClose(); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors text-left">
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant">person</span>
              <span className="text-sm text-on-surface">Edit Profile</span>
            </button>
            <button type="button" onClick={() => { onFavorites(); onClose(); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors text-left">
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant">favorite</span>
              <span className="text-sm text-on-surface">Favourite Stations</span>
            </button>
            <button type="button" onClick={() => { onNotifications(); onClose(); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors text-left">
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant">notifications</span>
              <span className="text-sm text-on-surface">Notification Preferences</span>
            </button>
          </>
        ) : (
          <Link href="/login" prefetch={false} onClick={onClose} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors">
            <span className="material-symbols-outlined text-[20px] text-primary">login</span>
            <span className="text-sm text-primary font-semibold">Sign In</span>
          </Link>
        )}

        <div className="my-1 border-t border-outline-variant/30" />

        {appUser?.role === 'creator' || appUser?.role === 'admin' ? (
          <Link href={appUser ? getHomeRoute(appUser.role) : '/creator-signup'} prefetch={false} onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors">
            <span className="material-symbols-outlined text-[20px] text-primary">dashboard</span>
            <span className="text-sm text-primary font-semibold">Open Studio</span>
          </Link>
        ) : (
          <Link href="/creator-signup" prefetch={false} onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors">
            <span className="material-symbols-outlined text-[20px] text-primary">add_circle</span>
            <span className="text-sm text-primary font-semibold">Go Live — Launch Station</span>
          </Link>
        )}

        <button
          onClick={() => showConfirm({
            title: 'Confirm Sign Out',
            message: 'Are you sure you want to sign out of your AirCue account? You will need to sign in again to access your station and broadcast controls.',
            type: 'warning',
            confirmText: 'Sign Out',
            cancelText: 'Stay Logged In',
            isDangerous: true,
            onConfirm: () => {
              signOut(auth)
                .then(() => onClose())
                .catch(err => console.error('Sign out failed:', err));
            }
          })}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-error/5 transition-colors text-left"
        >
          <span className="material-symbols-outlined text-[20px] text-error">logout</span>
          <span className="text-sm text-error">Sign Out</span>
        </button>
      </div>
    </div>
  );
}

// ─── Main Header Component ─────────────────────────────────────────────────────
export default function Header({ variant, activeTab: customActiveTab }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { appUser } = useAuthState();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showNotifPrefs, setShowNotifPrefs] = useState(false);

  // Firestore Notification state
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const markAllNotifsRead = async () => {
    try {
      const batch = writeBatch(db);
      notifications.forEach(n => {
        if (n.unread) {
          batch.update(doc(db, 'notifications', n.id), { unread: false });
        }
      });
      await batch.commit();
      setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all read in Firestore:', err);
    }
  };

  const markNotifAsRead = async (n: AppNotification) => {
    if (!n.unread) return;
    try {
      await updateDoc(doc(db, 'notifications', n.id), { unread: false });
      setNotifications(prev => prev.map(notif => notif.id === n.id ? { ...notif, unread: false } : notif));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to update notification status:', err);
    }
  };

  // Dynamic stations count & aggregated listeners
  const [stationsCount, setStationsCount] = useState(0);
  const [listenersCount, setListenersCount] = useState(0);
  const [isLive, setIsLive] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const notifsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const searchResults = useStationSearch(searchValue);

  // 1. Dynamic Firestore Notifications Sync & Seeding
  useEffect(() => {
    const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(30));
    const unsub = onSnapshot(q, async snap => {
      if (snap.empty && DEMO_MODE && appUser?.role === 'admin') {
        // No notifications in database yet, auto-seed them
        console.log('Seeding initial notifications in database...');
        try {
          const promises = SEED_NOTIFS.map(item => {
            const { agoMs, ...rest } = item;
            return addDoc(collection(db, 'notifications'), {
              ...rest,
              createdAt: Timestamp.fromDate(new Date(Date.now() - agoMs))
            });
          });
          await Promise.all(promises);
        } catch (err) {
          console.error('Failed to seed notifications:', err);
        }
      } else {
        const list = snap.docs.map(d => ({
          id: d.id,
          ...d.data()
        } as AppNotification));
        setNotifications(list);
        setUnreadCount(list.filter(n => n.unread).length);
      }
    });

    return () => unsub();
  }, [appUser?.role]);

  // 2. Dynamic profile metrics calculation from stations database in real-time
  useEffect(() => {
    const canReadAllStations = appUser?.role === 'admin' || appUser?.role === 'creator';
    const q = canReadAllStations
      ? query(collection(db, 'stations'))
      : query(collection(db, 'stations'), where('status', '==', 'ONLINE'));
    const unsub = onSnapshot(q, snap => {
      const allStations = snap.docs.map(d => ({ id: d.id, ...d.data() } as Station));
      setStationsCount(allStations.length);

      // Determine live state
      const hasLive = allStations.some(s => s.status === 'ONLINE');
      setIsLive(hasLive);
    });

    return () => unsub();
  }, [appUser?.role]);

  // 3. Real-time subscription to station listeners to calculate aggregated total
  useEffect(() => {
    const q = collection(db, 'stationListeners');
    const unsub = onSnapshot(q, snap => {
      let sum = 0;
      snap.docs.forEach(d => {
        const count = d.data().count || 0;
        if (count > 0) {
          sum += count;
        }
      });
      setListenersCount(sum);
    }, err => {
      console.error('Error fetching listener metrics in Header:', err);
    });

    return () => unsub();
  }, []);

  // Close panels when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) { setSearchOpen(false); }
      if (notifsRef.current && !notifsRef.current.contains(e.target as Node)) { setNotifsOpen(false); }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) { setProfileOpen(false); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const studioHref = appUser ? getHomeRoute(appUser.role) : '/creator-signup';
  const studioLabel = appUser?.role === 'admin' ? 'Admin Console' : appUser?.role === 'creator' ? 'My Studio' : 'Go Live';

  // Auto-detect activeTab
  let activeTab = customActiveTab;
  if (!activeTab) {
    if (pathname === '/admin' || pathname === '/admin/' || pathname.startsWith('/admin/stations')) activeTab = 'dashboard';
    else if (pathname.startsWith('/admin/analytics')) activeTab = 'analytics';
    else if (pathname.startsWith('/admin/schedules')) activeTab = 'schedules';
    else if (pathname === '/listener-directory') activeTab = 'directory';
    else if (pathname.startsWith('/station-dashboard')) activeTab = 'dashboard';
  }

  const handleSelectStation = useCallback((s: Station) => {
    setSearchOpen(false);
    setSearchValue('');
    router.push(`/listener-directory?play=${s.id}`);
  }, [router]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchValue.trim()) {
      setSearchOpen(false);
      router.push(`/listener-directory?q=${encodeURIComponent(searchValue.trim())}`);
    }
  }, [searchValue, router]);

  const renderNavLinks = (className: string, linkCls: string, activeCls: string) => (
    <nav className={className}>
      <Link className={activeTab === 'directory' ? activeCls : linkCls} href="/listener-directory" prefetch={false}>Directory</Link>
      {variant === 'admin' && (
        <>
          <Link className={activeTab === 'dashboard' ? activeCls : linkCls} href="/admin" prefetch={false}>Dashboard</Link>
          <Link className={activeTab === 'analytics' ? activeCls : linkCls} href="/admin/analytics" prefetch={false}>Analytics</Link>
          <Link className={activeTab === 'schedules' ? activeCls : linkCls} href="/admin/schedules" prefetch={false}>Schedules</Link>
        </>
      )}
      {variant === 'creator' && (
        <>
          <Link className={activeTab === 'dashboard' ? activeCls : linkCls} href="/station-dashboard" prefetch={false}>My Stations</Link>
          <Link className={pathname.startsWith('/station-dashboard/requests') ? activeCls : linkCls} href="/station-dashboard/requests" prefetch={false}>Requests</Link>
        </>
      )}
    </nav>
  );

  // ── Shared icon row ─────────────────────────────────────────────────────────
  const renderIconRow = (searchBg = 'bg-surface-container-lowest') => (
    <div className="flex items-center gap-1">
      {/* Search icon (mobile / compact) */}
      <div ref={searchRef} className="relative lg:hidden">
        <button
          id="header-search-btn"
          onClick={() => { setSearchOpen(o => !o); setNotifsOpen(false); setProfileOpen(false); }}
          className="p-2 hover:bg-surface-variant rounded-full text-on-surface-variant transition-colors"
        >
          <span className="material-symbols-outlined">search</span>
        </button>
        {searchOpen && (
          <div className="absolute right-0 top-full mt-2 w-72 z-[200]">
            <input
              autoFocus
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className={`w-full ${searchBg} border border-outline-variant rounded-full py-2 pl-4 pr-4 text-body-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none`}
              placeholder="Search stations..."
            />
            {searchValue && (
              <SearchDropdown searchValue={searchValue} results={searchResults} onSelect={handleSelectStation} />
            )}
          </div>
        )}
      </div>

      {/* Notifications */}
      <div ref={notifsRef} className="relative">
        <button
          id="header-notifications-btn"
          onClick={() => { setNotifsOpen(o => !o); setProfileOpen(false); setSearchOpen(false); }}
          className="relative p-2 hover:bg-surface-variant rounded-full text-on-surface-variant transition-colors"
          aria-label="Notifications"
        >
          <span className="material-symbols-outlined">notifications</span>
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-primary text-on-primary text-[8px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
{notifsOpen && (
           <NotificationPanel
             notifs={notifications}
             unreadCount={unreadCount}
             onClose={() => setNotifsOpen(false)}
             onMarkAllRead={markAllNotifsRead}
             onMarkAsRead={markNotifAsRead}
           />
         )}
      </div>

      {/* Profile */}
      <div ref={profileRef} className="relative">
        <button
          id="header-profile-btn"
          onClick={() => { setProfileOpen(o => !o); setNotifsOpen(false); setSearchOpen(false); }}
          className="p-2 hover:bg-surface-variant rounded-full text-on-surface-variant transition-colors"
          aria-label="Profile"
        >
          <span className="material-symbols-outlined">account_circle</span>
        </button>
        {profileOpen && (
          <ProfilePanel
            variant={variant}
            onClose={() => setProfileOpen(false)}
            stationsCount={stationsCount}
            listenersCount={listenersCount}
            isLive={isLive}
            appUser={appUser}
            onEditProfile={() => setShowEditProfile(true)}
            onFavorites={() => setShowFavorites(true)}
            onNotifications={() => setShowNotifPrefs(true)}
          />
        )}
      </div>
    </div>
  );

  // ── Shared desktop search bar ───────────────────────────────────────────────
  const renderDesktopSearch = (
    bg = 'bg-surface-container-lowest',
    border = 'border-outline-variant',
    textCls = 'text-on-surface'
  ) => (
    <div ref={searchRef} className="hidden lg:flex relative">
      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">search</span>
      <input
        id="header-search-input"
        value={searchValue}
        onChange={e => { setSearchValue(e.target.value); setNotifsOpen(false); setProfileOpen(false); }}
        onFocus={() => setSearchOpen(true)}
        onKeyDown={handleKeyDown}
        className={`${bg} ${textCls} border ${border} rounded-full py-2 pl-10 pr-4 text-body-sm placeholder:text-white/30 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all w-64`}
        placeholder="Search stations..."
      />
      {searchOpen && searchValue && (
        <SearchDropdown searchValue={searchValue} results={searchResults} onSelect={handleSelectStation} />
      )}
    </div>
  );

  const profileModals = appUser ? (
    <>
      {showEditProfile && <EditProfileModal appUser={appUser} onClose={() => setShowEditProfile(false)} />}
      {showFavorites && <FavoritesModal onClose={() => setShowFavorites(false)} />}
      {showNotifPrefs && <NotificationPrefsModal appUser={appUser} onClose={() => setShowNotifPrefs(false)} />}
    </>
  ) : null;

  // ─────────────────────────────── VARIANTS ───────────────────────────────────
  if (variant === 'landing') {
    return (
      <>
        {profileModals}
        <header className="modern-glass-dark fixed top-0 w-full z-[100] h-16 flex justify-between items-center px-4 md:px-[32px] fluid-transition">

          {/* Left section: Logo and Directory nav */}
          <div className="flex items-center gap-4">
            <Link href="/" prefetch={false} className="hover:opacity-85 transition-opacity">
              <img src="/logo.png" alt="Ghana Radio" className="h-20 w-auto" />
            </Link>
            <div className="relative group">
              <Link href="/listener-directory" prefetch={false} className={`font-headline-md tracking-tighter transition-colors ${pathname === '/listener-directory' ? 'text-primary' : 'text-on-surface hover:text-primary'}`}>
                Directory
              </Link>
              {/* Underline accent */}
              <span className={`absolute left-0 -bottom-1 h-[2px] bg-primary transition-all duration-300 ${pathname === '/listener-directory' ? 'w-full' : 'w-0 group-hover:w-full'}`}></span>
            </div>
          </div>
          {/* Center section: Pill-shaped Search Bar */}
          <div ref={searchRef} className="flex items-center relative">
            <div className="relative w-64">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-effects-none">search</span>
              <input
                id="header-search-input"
                value={searchValue}
                onChange={e => { setSearchValue(e.target.value); setNotifsOpen(false); setProfileOpen(false); }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={handleKeyDown}
                className="bg-surface-container-lowest border border-primary/20 rounded-full py-2 pl-10 pr-4 text-body-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none shadow-inner"
                placeholder="Search stations..."
              />
              {searchOpen && searchValue && (
                <SearchDropdown searchValue={searchValue} results={searchResults} onSelect={handleSelectStation} />
              )}
            </div>
          </div>
          {/* Right section: Sign In, Notification, Profile */}
          <div className="flex items-center gap-2">
            {!appUser ? (
              <Link href="/login" prefetch={false}>
                <button className="border border-primary/20 text-on-primary px-4 py-2 rounded-full font-label-md text-label-md hover:opacity-90 active:scale-95 transition-all">
                  Sign In
                </button>
              </Link>
            ) : null}
            {renderIconRow()}
          </div>
        </header>
      </>
    );
  }

  if (variant === 'directory') {
    return (
      <>
        {profileModals}
        <nav className="modern-glass-dark flex justify-between items-center w-full px-4 md:px-[32px] h-16 fixed top-0 z-50 fluid-transition">
          <div className="flex items-center gap-4">
            <Link href="/" prefetch={false} className="hover:opacity-85 transition-opacity">
              <img src="/logo.png" alt="Ghana Radio" className="h-20 w-auto" />
            </Link>
            <div className="relative group">
              <Link href="/listener-directory" prefetch={false} className={`font-headline-md tracking-tighter transition-colors ${pathname === '/listener-directory' ? 'text-primary' : 'text-on-surface hover:text-primary'}`}>
                Directory
              </Link>
              {/* Underline accent */}
              <span className={`absolute left-0 -bottom-1 h-[2px] bg-primary transition-all duration-300 ${pathname === '/listener-directory' ? 'w-full' : 'w-0 group-hover:w-full'}`}></span>
            </div>
          </div>
          {/* Center section: Pill-shaped Search Bar */}
          <div ref={searchRef} className="flex items-center relative">
            <div className="relative w-64">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-effects-none">search</span>
              <input
                id="header-search-input"
                value={searchValue}
                onChange={e => { setSearchValue(e.target.value); setNotifsOpen(false); setProfileOpen(false); }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={handleKeyDown}
                className="bg-surface-container-lowest border border-primary/20 rounded-full py-2 pl-10 pr-4 text-body-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none shadow-inner"
                placeholder="Search stations..."
              />
              {searchOpen && searchValue && (
                <SearchDropdown searchValue={searchValue} results={searchResults} onSelect={handleSelectStation} />
              )}
            </div>
          </div>
          {/* Right section: Sign In, Notification, Profile */}
          <div className="flex items-center gap-2">
            {!appUser ? (
              <Link href="/login" prefetch={false}>
                <button className="border border-primary/20 text-on-primary px-4 py-2 rounded-full font-label-md text-label-md hover:opacity-90 active:scale-95 transition-all">
                  Sign In
                </button>
              </Link>
            ) : null}
            {renderIconRow()}
          </div>
        </nav>
      </>
    );
  }

  if (variant === 'creator') {
    return (
      <>
        {profileModals}
        <header className="modern-glass-dark flex justify-between items-center w-full px-4 md:px-[32px] h-16 fixed top-0 z-50 fluid-transition">
          <div className="flex items-center gap-4">
            <Link href="/" prefetch={false} className="hover:opacity-85 transition-opacity">
              <img src="/logo.png" alt="Ghana Radio" className="h-20 w-auto" />
            </Link>
            <div className="relative group">
              <Link href="/listener-directory" prefetch={false} className={`font-headline-md tracking-tighter transition-colors ${pathname === '/listener-directory' ? 'text-primary' : 'text-on-surface hover:text-primary'}`}>
                Directory
              </Link>
              {/* Underline accent */}
              <span className={`absolute left-0 -bottom-1 h-[2px] bg-primary transition-all duration-300 ${pathname === '/listener-directory' ? 'w-full' : 'w-0 group-hover:w-full'}`}></span>
            </div>
          </div>
          {/* Center section: Pill-shaped Search Bar */}
          <div ref={searchRef} className="flex items-center relative">
            <div className="relative w-64">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-effects-none">search</span>
              <input
                id="header-search-input"
                value={searchValue}
                onChange={e => { setSearchValue(e.target.value); setNotifsOpen(false); setProfileOpen(false); }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={handleKeyDown}
                className="bg-surface-container-lowest border border-primary/20 rounded-full py-2 pl-10 pr-4 text-body-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none shadow-inner"
                placeholder="Search stations..."
              />
              {searchOpen && searchValue && (
                <SearchDropdown searchValue={searchValue} results={searchResults} onSelect={handleSelectStation} />
              )}
            </div>
          </div>
          {/* Right section: Nav + Notification + Profile */}
          <div className="flex items-center gap-4">
            {renderNavLinks(
              "hidden xl:flex gap-6",
              "text-white/60 font-label-md hover:text-primary transition-colors",
              "text-primary border-b-2 border-primary pb-1 font-label-md font-bold"
            )}
            {!appUser ? (
              <Link href="/login" prefetch={false}>
                <button className="border border-primary/20 text-on-primary px-4 py-2 rounded-full font-label-md text-label-md hover:opacity-90 active:scale-95 transition-all">
                  Sign In
                </button>
              </Link>
            ) : null}
            {renderIconRow()}
          </div>
        </header>
      </>
    );
  }

  // Admin variant
  return (
    <>
      {profileModals}
      <header className="modern-glass-dark flex justify-between items-center w-full px-4 md:px-[32px] h-16 border-b border-white/5">
        <div className="flex items-center gap-8">
          <img src="/logo.png" alt="Ghana Radio" className="h-20 w-auto" />
          {renderDesktopSearch('bg-white/5', 'border-white/10', 'text-white')}
        </div>
        <div className="flex items-center gap-8">
          {renderNavLinks(
            "hidden xl:flex gap-8",
            "text-white/50 font-label-md hover:text-primary transition-colors",
            "text-primary border-b-2 border-primary font-label-md font-bold"
          )}
          <div className="flex items-center gap-2 border-l border-white/10 pl-6">
            {renderIconRow()}
            <Link href={studioHref} prefetch={false}>
              <button className="bg-primary text-black px-6 py-2 rounded-full font-label-md font-bold hover:opacity-90 active:scale-95 transition-all ml-2">
                {studioLabel}
              </button>
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}
