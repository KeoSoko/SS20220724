import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface PendingUpload {
  id: string;
  data: any;
  endpoint: string;
  timestamp: number;
  retryCount: number;
}

const CONSECUTIVE_FAILURES_THRESHOLD = 3;
const HEALTH_CHECK_TIMEOUT_MS = 8000;
const HEALTH_CHECK_INTERVAL_MS = 30000;

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const queryClient = useQueryClient();
  const failureCountRef = useRef(0);

  const checkConnectivity = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
      
      const response = await fetch('/api/health', {
        method: 'HEAD',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const reachable = response.ok || response.status === 404;

      if (reachable) {
        failureCountRef.current = 0;
        setIsOnline(true);
        return true;
      }

      failureCountRef.current += 1;
      if (failureCountRef.current >= CONSECUTIVE_FAILURES_THRESHOLD) {
        setIsOnline(false);
      }
      return false;
    } catch (error) {
      failureCountRef.current += 1;
      console.log(`[OfflineSync] Connectivity check failed (${failureCountRef.current}/${CONSECUTIVE_FAILURES_THRESHOLD})`);
      if (failureCountRef.current >= CONSECUTIVE_FAILURES_THRESHOLD) {
        setIsOnline(false);
      }
      return false;
    }
  };

  useEffect(() => {
    checkConnectivity();
    
    const interval = setInterval(checkConnectivity, HEALTH_CHECK_INTERVAL_MS);

    const stored = localStorage.getItem('pendingUploads');
    if (stored) {
      const loadedUploads = JSON.parse(stored);
      console.log(`[OfflineSync] Loaded ${loadedUploads.length} pending uploads from storage`);
      setPendingUploads(loadedUploads);
    }

    const handleOnline = async () => {
      console.log('[OfflineSync] Browser reports online, verifying...');
      const actuallyOnline = await checkConnectivity();
      if (actuallyOnline) {
        setTimeout(() => {
          processPendingUploads();
        }, 1000);
      }
    };

    const handleOffline = () => {
      console.log('[OfflineSync] Browser reports offline');
      failureCountRef.current = CONSECUTIVE_FAILURES_THRESHOLD;
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);
  
  useEffect(() => {
    if (isOnline && pendingUploads.length > 0) {
      console.log(`[OfflineSync] State changed - ${pendingUploads.length} uploads pending, attempting sync...`);
      setTimeout(() => {
        processPendingUploads();
      }, 2000);
    }
  }, [isOnline, pendingUploads.length]);

  const addPendingUpload = (data: any, endpoint: string) => {
    const upload: PendingUpload = {
      id: crypto.randomUUID(),
      data,
      endpoint,
      timestamp: Date.now(),
      retryCount: 0
    };

    const updated = [...pendingUploads, upload];
    setPendingUploads(updated);
    localStorage.setItem('pendingUploads', JSON.stringify(updated));
  };

  const processPendingUploads = async () => {
    if (!isOnline || pendingUploads.length === 0) return;

    console.log(`[OfflineSync] Processing ${pendingUploads.length} pending uploads...`);

    for (const upload of pendingUploads) {
      try {
        console.log(`[OfflineSync] Syncing upload ${upload.id} to ${upload.endpoint}`);
        
        const response = await apiRequest('POST', upload.endpoint, upload.data);

        if (response.ok) {
          console.log(`[OfflineSync] Successfully synced upload ${upload.id}`);
          removePendingUpload(upload.id);
          queryClient.invalidateQueries({ queryKey: ['/api/receipts'] });
        } else {
          console.log(`[OfflineSync] Upload ${upload.id} failed, retry count: ${upload.retryCount}`);
          if (upload.retryCount < 3) {
            updateRetryCount(upload.id);
          } else {
            console.log(`[OfflineSync] Upload ${upload.id} exceeded retry limit, removing`);
            removePendingUpload(upload.id);
          }
        }
      } catch (error) {
        console.log(`[OfflineSync] Upload ${upload.id} error:`, error);
        if (upload.retryCount < 3) {
          updateRetryCount(upload.id);
        } else {
          console.log(`[OfflineSync] Upload ${upload.id} exceeded retry limit, removing`);
          removePendingUpload(upload.id);
        }
      }
    }
  };

  const removePendingUpload = (id: string) => {
    const updated = pendingUploads.filter(u => u.id !== id);
    setPendingUploads(updated);
    localStorage.setItem('pendingUploads', JSON.stringify(updated));
  };

  const updateRetryCount = (id: string) => {
    const updated = pendingUploads.map(u => 
      u.id === id ? { ...u, retryCount: u.retryCount + 1 } : u
    );
    setPendingUploads(updated);
    localStorage.setItem('pendingUploads', JSON.stringify(updated));
  };

  return {
    isOnline,
    pendingUploads,
    addPendingUpload,
    processPendingUploads
  };
}