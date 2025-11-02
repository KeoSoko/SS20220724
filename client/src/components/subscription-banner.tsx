import { useSubscription } from '@/hooks/use-subscription';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Clock, Crown, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { useState } from 'react';

export function SubscriptionBanner() {
  const { user } = useAuth();
  const { subscription, isTrialing, needsUpgrade, isLoading, isPremium, hasAccess } = useSubscription();
  const [location, setLocation] = useLocation();
  const [dismissed, setDismissed] = useState(false);


  // Don't show banner if user is not logged in or on auth/splash pages
  if (!user || location === '/auth' || location === '/verify-email' || location === '/reset-password' || location === '/' || location === '/splash') {
    return null;
  }

  // Don't show banner while loading subscription status
  if (isLoading) {
    return null;
  }

  // CRITICAL: Don't show banner for premium users (check multiple conditions)
  if (isPremium || hasAccess || (subscription && subscription.subscriptionType === 'premium')) {
    return null;
  }

  // If subscription API failed but we have subscription data, don't show banner
  if (subscription && subscription.hasActiveSubscription) {
    return null;
  }

  // IMPORTANT: Only hide banner if explicitly premium, not for trial users or auth issues
  // Trial users need to see upgrade prompts even if subscription API fails temporarily

  // Show banner only for confirmed trial/non-premium users, not when data is loading
  const showUpgradeBanner = isTrialing || needsUpgrade;

  if (dismissed || !showUpgradeBanner) {
    return null;
  }

  const daysRemaining = subscription?.trialDaysRemaining || 0;
  const isTrialActive = isTrialing && daysRemaining > 0;
  const isTrialEndingSoon = isTrialing && daysRemaining <= 3;

  // Main upgrade banner (for active trial or expired trial)
  if (showUpgradeBanner) {
    return (
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-4 relative">
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-2 right-2 p-1 hover:bg-white/20 rounded-full transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        
        <div className="flex items-center justify-between max-w-6xl mx-auto pr-8">
          <div className="flex items-center space-x-3">
            <Crown className="w-6 h-6" />
            <div>
              <p className="font-medium">
                {isTrialActive ? 'Upgrade to Premium' : 'Subscribe for R99/month'}
              </p>
              <p className="text-sm text-orange-100">
                {isTrialActive 
                  ? `${daysRemaining} days left in trial - unlock unlimited access`
                  : 'Get premium features: unlimited scanning, AI insights, export tools'
                }
              </p>
            </div>
          </div>
          
          <Button
            onClick={() => setLocation('/subscription')}
            variant="secondary"
            size="sm"
            className="bg-white text-orange-600 hover:bg-orange-50"
          >
            {isTrialActive ? 'Upgrade to Premium' : 'Subscribe Now'}
          </Button>
        </div>
      </div>
    );
  }

  // Special styling for trials ending soon (3 days or less)
  if (isTrialEndingSoon) {
    return (
      <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white p-4 relative">
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-2 right-2 p-1 hover:bg-white/20 rounded-full transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        
        <div className="flex items-center justify-between max-w-6xl mx-auto pr-8">
          <div className="flex items-center space-x-3">
            <Clock className="w-6 h-6" />
            <div>
              <p className="font-medium">
                {daysRemaining === 0 
                  ? 'Trial expires today!' 
                  : `${daysRemaining} days left in your trial`
                }
              </p>
              <p className="text-sm text-amber-100">
                Upgrade now to continue accessing premium features
              </p>
            </div>
          </div>
          
          <Button
            onClick={() => setLocation('/subscription')}
            variant="secondary"
            size="sm"
            className="bg-white text-amber-600 hover:bg-amber-50"
          >
            Upgrade to Premium
          </Button>
        </div>
      </div>
    );
  }

  return null;
}