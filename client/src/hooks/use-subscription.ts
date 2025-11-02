import { useQuery } from '@tanstack/react-query';

export interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  isInTrial: boolean;
  subscriptionType: 'none' | 'trial' | 'premium';
  trialDaysRemaining?: number;
  subscriptionPlatform?: 'paystack' | 'google_play' | 'apple';
}

export function useSubscription() {
  const query = useQuery({
    queryKey: ['/api/subscription/status'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/subscription/status', {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          if (response.status === 401) {
            // User not authenticated - return null to indicate auth failure
            console.log('[useSubscription] 401 - User not authenticated, returning null');
            return null;
          }
          
          // Try to get error details from response
          let errorMessage = 'Failed to fetch subscription status';
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          } catch {
            // If we can't parse the error, use the status text
            errorMessage = response.statusText || errorMessage;
          }
          
          throw new Error(errorMessage);
        }
        
        const data = await response.json() as SubscriptionStatus;
        console.log('[useSubscription] Subscription status:', data);
        return data;
      } catch (error) {
        console.error('[useSubscription] Error fetching subscription status:', error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      // Don't retry on 401 (authentication errors)
      if (error instanceof Error && error.message.includes('401')) {
        return false;
      }
      // Retry up to 2 times for other errors
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  return {
    ...query,
    subscription: query.data,
    isLoading: query.isLoading,
    isPremium: query.data?.subscriptionType === 'premium',
    isTrialing: query.data?.isInTrial === true,
    hasAccess: query.data?.hasActiveSubscription === true,
    needsUpgrade: query.data === null ? false : query.data?.subscriptionType === 'none'
  };
}