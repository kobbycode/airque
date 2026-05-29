'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  getOrCreateListenerSessionId,
  LISTENER_HEARTBEAT_MS,
  LISTENER_QUALIFY_MS,
} from '@/lib/listener-presence';

type EndReason = 'paused' | 'switched' | 'unload' | 'ended';

interface UseListenerPresenceOptions {
  stationId: string | null;
  stationName: string | null;
  isListening: boolean;
}

export interface ListenerPresenceState {
  /** This tab is counted after the qualify window while playing. */
  isRegistered: boolean;
  registeredStationId: string | null;
}

/**
 * Registers this browser tab as an active listener after sustained playback.
 * Returns registration state for optimistic UI when Cloud Functions lag.
 */
export function useListenerPresence({
  stationId,
  stationName,
  isListening,
}: UseListenerPresenceOptions): ListenerPresenceState {
  const [isRegistered, setIsRegistered] = useState(false);
  const [registeredStationId, setRegisteredStationId] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const activeStationIdRef = useRef<string | null>(null);
  const qualifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearRegistration = useCallback(() => {
    setIsRegistered(false);
    setRegisteredStationId(null);
  }, []);

  const clearQualifyTimer = useCallback(() => {
    if (qualifyTimerRef.current) {
      clearTimeout(qualifyTimerRef.current);
      qualifyTimerRef.current = null;
    }
  }, []);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const endSession = useCallback(
    async (reason: EndReason) => {
      clearQualifyTimer();
      clearHeartbeat();
      clearRegistration();

      const sessionId = sessionIdRef.current;
      const trackedStationId = activeStationIdRef.current;
      if (!sessionId || !trackedStationId) return;

      activeStationIdRef.current = null;

      try {
        await setDoc(
          doc(db, 'listenerSessions', sessionId),
          {
            state: 'ended',
            endedAt: serverTimestamp(),
            lastSeen: serverTimestamp(),
            endReason: reason,
          },
          { merge: true }
        );
      } catch (err) {
        console.error('Failed to end listener session:', err);
      }
    },
    [clearHeartbeat, clearQualifyTimer, clearRegistration]
  );

  const writeHeartbeat = useCallback(async (targetStationId: string, targetStationName: string) => {
    const sessionId = sessionIdRef.current ?? getOrCreateListenerSessionId();
    sessionIdRef.current = sessionId;

    const isFirstWrite = !activeStationIdRef.current;

    await setDoc(
      doc(db, 'listenerSessions', sessionId),
      {
        stationId: targetStationId,
        stationName: targetStationName,
        state: 'active',
        lastSeen: serverTimestamp(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 180) : '',
        ...(isFirstWrite ? { createdAt: serverTimestamp() } : {}),
      },
      { merge: true }
    );

    activeStationIdRef.current = targetStationId;
    setIsRegistered(true);
    setRegisteredStationId(targetStationId);
  }, []);

  const startQualifiedSession = useCallback(
    (targetStationId: string, targetStationName: string) => {
      writeHeartbeat(targetStationId, targetStationName).catch(err => {
        console.error('Failed to start listener session:', err);
        clearRegistration();
      });
      clearHeartbeat();
      heartbeatTimerRef.current = setInterval(() => {
        writeHeartbeat(targetStationId, targetStationName).catch(err => {
          console.error('Listener heartbeat failed:', err);
        });
      }, LISTENER_HEARTBEAT_MS);
    },
    [clearHeartbeat, clearRegistration, writeHeartbeat]
  );

  useEffect(() => {
    if (!sessionIdRef.current) {
      sessionIdRef.current = getOrCreateListenerSessionId();
    }
  }, []);

  useEffect(() => {
    const handleLeave = () => {
      void endSession('unload');
    };
    window.addEventListener('pagehide', handleLeave);
    return () => {
      window.removeEventListener('pagehide', handleLeave);
      void endSession('unload');
    };
  }, [endSession]);

  useEffect(() => {
    const shouldTrack = isListening && stationId && stationName;

    if (!shouldTrack) {
      if (activeStationIdRef.current) {
        void endSession('paused');
      } else {
        clearQualifyTimer();
        clearRegistration();
      }
      return;
    }

    if (activeStationIdRef.current && activeStationIdRef.current !== stationId) {
      void endSession('switched');
    }

    if (activeStationIdRef.current === stationId) {
      return;
    }

    clearQualifyTimer();
    clearRegistration();
    qualifyTimerRef.current = setTimeout(() => {
      qualifyTimerRef.current = null;
      if (!isListening || !stationId || !stationName) return;
      startQualifiedSession(stationId, stationName);
    }, LISTENER_QUALIFY_MS);

    return () => {
      clearQualifyTimer();
    };
  }, [
    isListening,
    stationId,
    stationName,
    endSession,
    clearQualifyTimer,
    clearRegistration,
    startQualifiedSession,
  ]);

  return { isRegistered, registeredStationId };
}
