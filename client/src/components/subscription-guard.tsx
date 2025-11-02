import { ReactNode } from 'react';
import { useSubscription } from '@/hooks/use-subscription';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Crown, Clock, AlertTriangle } from 'lucide-react';
import { useLocation } from 'wouter';

interface SubscriptionGuardProps {
  children: ReactNode;
  feature?: string;
  fallback?: ReactNode;
}

export function SubscriptionGuard({ children, feature, fallback }: SubscriptionGuardProps) {
  const { subscription, hasAccess, isTrialing, needsUpgrade, isLoading } = useSubscription();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <Card className="max-w-md mx-auto mt-8">
      <CardHeader className="text-center">
        <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
          {isTrialing ? (
            <Clock className="w-8 h-8 text-orange-600" />
          ) : (
            <Crown className="w-8 h-8 text-orange-600" />
          )}
        </div>
        <CardTitle className="text-xl">
          {isTrialing 
            ? `${subscription?.trialDaysRemaining || 0} days left in trial`
            : 'Premium Feature'
          }
        </CardTitle>
        <CardDescription>
          {isTrialing
            ? 'Your free trial is ending soon. Subscribe to continue accessing all features.'
            : 'Your trial has ended. Subscribe to continue using Simple Slips premium features.'
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {needsUpgrade && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">Subscription required</p>
              <p>Subscribe to premium to continue using all Simple Slips features.</p>
            </div>
          </div>
        )}
        
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Premium includes:</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>✓ Unlimited receipt uploads</li>
            <li>✓ AI-powered categorization</li>
            <li>✓ Advanced export options</li>
            <li>✓ Tax deductible tracking</li>
            <li>✓ Smart search and analytics</li>
          </ul>
        </div>

        <Button 
          onClick={() => setLocation('/subscription')} 
          className="w-full"
        >
          <Crown className="w-4 h-4 mr-2" />
          Upgrade to Premium - R49/month
        </Button>

        {isTrialing && (
          <Button 
            variant="outline" 
            onClick={() => setLocation('/dashboard')}
            className="w-full"
          >
            Continue with Trial
          </Button>
        )}
      </CardContent>
    </Card>
  );
}