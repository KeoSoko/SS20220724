import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';

export interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  isInTrial: boolean;
  subscriptionType: 'none' | 'trial' | 'premium';
  trialDaysRemaining?: number;
  subscriptionPlatform?: 'paystack' | 'google_play' | 'apple';
}

const getStoredToken = (): string | null => {
  return localStorage.getItem('auth_token');
};

export function useSubscription() {
  const hasToken = !!getStoredToken();
  
  const query = useQuery<SubscriptionStatus | null>({
    queryKey: ['/api/subscription/status'],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: hasToken,
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