import { useState, useEffect } from "react";

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkDevice = () => {
      // Enhanced mobile detection for PWA apps
      const screenWidth = window.screen.width;
      const windowWidth = window.innerWidth;
      const isPWA = window.matchMedia('(display-mode: standalone)').matches;
      const isAndroidPWA = (window.navigator as any).standalone || document.referrer.includes('android-app://');
      const userAgent = navigator.userAgent.toLowerCase();
      const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
      
      // Use multiple detection methods for PWA
      // Include tablets (iPad Mini: 768px, iPad Air: 820px+) up to 1024px as mobile for navigation
      const isMobileDevice = windowWidth < 1024 || screenWidth < 1024 || isMobileUA || isPWA || isAndroidPWA;
      
      
      setIsMobile(isMobileDevice);
    };

    // Check on mount
    checkDevice();

    // Listen for resize events and display mode changes
    window.addEventListener('resize', checkDevice);
    window.matchMedia('(display-mode: standalone)').addEventListener('change', checkDevice);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', checkDevice);
      window.matchMedia('(display-mode: standalone)').removeEventListener('change', checkDevice);
    };
  }, []);

  return isMobile;
}