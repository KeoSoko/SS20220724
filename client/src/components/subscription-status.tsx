import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Crown, Calendar, CreditCard, AlertTriangle } from 'lucide-react';

interface SubscriptionStatusProps {
  subscription: {
    id: number;
    status: string;
    isTrialActive: boolean;
    trialEndDate: string | null;
    nextBillingDate: string | null;
    plan?: {
      displayName: string;
      price: number;
      currency: string;
      billingPeriod: string;
    };
  } | null;
  onCancel?: () => void;
  onUpgrade?: () => void;
}

export function SubscriptionStatus({ subscription, onCancel, onUpgrade }: SubscriptionStatusProps) {
  if (!subscription) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-gray-400" />
            No Active Subscription
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Start your free trial to unlock all premium features of Simple Slips.
          </p>
          <Button onClick={onUpgrade} className="w-full">
            Start Free Trial
          </Button>
        </CardContent>
      </Card>
    );
  }

  const getStatusBadge = () => {
    switch (subscription.status) {
      case 'trial':
        return <Badge variant="default" className="bg-blue-100 text-blue-800">Free Trial</Badge>;
      case 'active':
        return <Badge variant="default" className="bg-green-100 text-green-800">Active</Badge>;
      case 'expired':
        return <Badge variant="destructive">Expired</Badge>;
      case 'cancelled':
        return <Badge variant="secondary">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{subscription.status}</Badge>;
    }
  };

  const getTrialProgress = () => {
    if (!subscription.isTrialActive || !subscription.trialEndDate) return null;

    const now = new Date();
    const trialEnd = new Date(subscription.trialEndDate);
    const trialStart = new Date(trialEnd.getTime() - (7 * 24 * 60 * 60 * 1000)); // 7 days before end
    
    const totalTime = trialEnd.getTime() - trialStart.getTime();
    const remainingTime = Math.max(0, trialEnd.getTime() - now.getTime());
    const progressPercent = Math.max(0, ((totalTime - remainingTime) / totalTime) * 100);
    const daysLeft = Math.max(0, Math.ceil(remainingTime / (24 * 60 * 60 * 1000)));

    return { progressPercent, daysLeft };
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number, currency: string = 'ZAR') => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const trialProgress = getTrialProgress();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5" />
            Current Subscription
          </div>
          {getStatusBadge()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="font-medium">
            {subscription.plan?.displayName || 'Unknown Plan'}
          </h3>
          {subscription.plan && subscription.plan.price > 0 && (
            <p className="text-sm text-muted-foreground">
              R49.00 per {subscription.plan.billingPeriod}
            </p>
          )}
        </div>

        {subscription.isTrialActive && trialProgress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Trial Progress</span>
              <span className="font-medium">{trialProgress.daysLeft} days left</span>
            </div>
            <Progress value={trialProgress.progressPercent} className="h-2" />
            <p className="text-xs text-muted-foreground">
              Trial ends on {formatDate(subscription.trialEndDate!)}
            </p>
          </div>
        )}

        {subscription.status === 'active' && subscription.nextBillingDate && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>Next billing: {formatDate(subscription.nextBillingDate)}</span>
          </div>
        )}

        {subscription.status === 'expired' && (
          <div className="flex items-center gap-2 text-sm text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            <span>Your subscription has expired. Renew to continue using premium features.</span>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          {subscription.isTrialActive && (
            <Button onClick={onUpgrade} className="flex-1">
              Upgrade to Premium
            </Button>
          )}
          
          {subscription.status === 'active' && (
            <Button variant="outline" onClick={onCancel} className="flex-1">
              Cancel Subscription
            </Button>
          )}
          
          {subscription.status === 'expired' && (
            <Button onClick={onUpgrade} className="flex-1">
              Renew Subscription
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}