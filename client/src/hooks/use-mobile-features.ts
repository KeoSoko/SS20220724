import { useEffect, useState, useCallback } from 'react';

export interface MobileFeatures {
  isInstalled: boolean;
  canInstall: boolean;
  isOnline: boolean;
  isStandalone: boolean;
  supportsCamera: boolean;
  supportsFileAccess: boolean;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  installApp: () => Promise<void>;
  shareContent: (data: ShareData) => Promise<void>;
  requestCameraPermission: () => Promise<boolean>;
}

interface ShareData {
  title?: string;
  text?: string;
  url?: string;
  files?: File[];
}

export function useMobileFeatures(): MobileFeatures {
  const [isInstalled, setIsInstalled] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Check if running as installed PWA
  const isStandalone = 
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    window.location.search.includes('utm_source=homescreen');

  // Detect device type
  const getDeviceType = (): 'mobile' | 'tablet' | 'desktop' => {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  };

  const [deviceType, setDeviceType] = useState<'mobile' | 'tablet' | 'desktop'>(getDeviceType());

  // Check camera support and permissions
  const supportsCamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  // Request camera permissions
  const requestCameraPermission = useCallback(async (): Promise<boolean> => {
    if (!supportsCamera) return false;
    
    try {
      // Check if we already have permission
      if ('permissions' in navigator) {
        const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
        if (permission.state === 'granted') return true;
        if (permission.state === 'denied') return false;
      }
      
      // Request permission by trying to get user media
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      
      // Stop the stream immediately - we just wanted to check permission
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.error('Camera permission denied:', error);
      return false;
    }
  }, [supportsCamera]);

  // Check file access support
  const supportsFileAccess = 'File' in window && 'FileReader' in window;

  // Handle PWA install prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setCanInstall(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Handle online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Handle device orientation and resize
  useEffect(() => {
    const handleResize = () => {
      setDeviceType(getDeviceType());
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Install app function
  const installApp = useCallback(async () => {
    if (!deferredPrompt) {
      throw new Error('App installation not available');
    }

    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setCanInstall(false);
        setDeferredPrompt(null);
      }
    } catch (error) {
      console.error('Error installing app:', error);
      throw error;
    }
  }, [deferredPrompt]);

  // Share content function
  const shareContent = useCallback(async (data: ShareData) => {
    if (navigator.share) {
      try {
        await navigator.share(data);
      } catch (error) {
        // User cancelled or error occurred
        if ((error as Error).name !== 'AbortError') {
          throw error;
        }
      }
    } else {
      // Fallback to clipboard API
      if (data.url && navigator.clipboard) {
        await navigator.clipboard.writeText(data.url);
      } else {
        throw new Error('Sharing not supported on this device');
      }
    }
  }, []);

  // Register service worker for PWA functionality
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('[PWA] Service Worker registered:', registration);
        })
        .catch((error) => {
          console.error('[PWA] Service Worker registration failed:', error);
        });
    }
  }, []);

  return {
    isInstalled: isStandalone || isInstalled,
    canInstall,
    isOnline,
    isStandalone,
    supportsCamera,
    supportsFileAccess,
    deviceType,
    installApp,
    shareContent,
    requestCameraPermission,
  };
}