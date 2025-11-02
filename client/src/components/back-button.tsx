import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeftIcon } from 'lucide-react';
import { useLocation } from 'wouter';

interface BackButtonProps {
  // Default to '/home' if no fallback is provided
  fallbackPath?: string;
}

/**
 * Consistent back button component that navigates to the previous page
 * or fallbacks to a specified path if no history is available
 */
export function BackButton({ fallbackPath = '/home' }: BackButtonProps) {
  const [_, navigate] = useLocation();

  const handleBack = () => {
    // Check if user came from within the app (has meaningful history)
    const hasHistory = window.history.length > 1;
    const referrer = document.referrer;
    const currentOrigin = window.location.origin;
    
    // If user has history and came from the same origin, use browser back
    if (hasHistory && referrer && referrer.startsWith(currentOrigin)) {
      window.history.back();
    } else {
      // Otherwise, navigate to fallback path for better UX
      navigate(fallbackPath);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleBack}
      className="text-black"
      aria-label="Go back"
    >
      <ChevronLeftIcon className="h-6 w-6" />
    </Button>
  );
}