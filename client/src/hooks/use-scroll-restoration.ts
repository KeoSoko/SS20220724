import { useEffect } from 'react';
import { useLocation } from 'wouter';

export function useScrollRestoration() {
  const [location] = useLocation();

  useEffect(() => {
    // Scroll to top when route changes
    window.scrollTo(0, 0);
  }, [location]);
}