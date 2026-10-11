import { useState, useEffect, useCallback } from 'react';

export interface OnlineStatusState {
  isOnline: boolean;
  wasOffline: boolean;
  isReconnecting: boolean;
  reconnectedJustNow: boolean;
  lastOnlineChange: Date;
  syncNow: () => void;
}

export function useOnlineStatus(): OnlineStatusState {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [wasOffline, setWasOffline] = useState<boolean>(false);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [reconnectedJustNow, setReconnectedJustNow] = useState<boolean>(false);
  const [lastOnlineChange, setLastOnlineChange] = useState<Date>(() => new Date());

  const handleOnline = useCallback(() => {
    setIsOnline(true);
    setLastOnlineChange(new Date());
    setIsReconnecting(true);
    setReconnectedJustNow(true);

    // Simulate/display active sync feedback
    const timer = setTimeout(() => {
      setIsReconnecting(false);
    }, 2800);

    const justNowTimer = setTimeout(() => {
      setReconnectedJustNow(false);
      setWasOffline(false);
    }, 6000);

    return () => {
      clearTimeout(timer);
      clearTimeout(justNowTimer);
    };
  }, []);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    setWasOffline(true);
    setIsReconnecting(false);
    setReconnectedJustNow(false);
    setLastOnlineChange(new Date());
  }, []);

  const syncNow = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      setIsReconnecting(true);
      setTimeout(() => {
        setIsReconnecting(false);
        setReconnectedJustNow(true);
        setTimeout(() => setReconnectedJustNow(false), 3000);
      }, 1200);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleFirestoreOfflineEvent = () => {
      setWasOffline(true);
      setIsOnline(false);
    };
    const handleFirestoreOnlineEvent = () => {
      setIsOnline(true);
      setWasOffline(false);
      setReconnectedJustNow(true);
      setTimeout(() => setReconnectedJustNow(false), 4000);
    };

    window.addEventListener('firestore-offline', handleFirestoreOfflineEvent);
    window.addEventListener('firestore-online', handleFirestoreOnlineEvent);

    // Initial check
    if (!navigator.onLine) {
      setWasOffline(true);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('firestore-offline', handleFirestoreOfflineEvent);
      window.removeEventListener('firestore-online', handleFirestoreOnlineEvent);
    };
  }, [handleOnline, handleOffline]);

  return {
    isOnline,
    wasOffline,
    isReconnecting,
    reconnectedJustNow,
    lastOnlineChange,
    syncNow
  };
}
