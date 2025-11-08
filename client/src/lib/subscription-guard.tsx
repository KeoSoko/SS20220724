import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useSubscription } from '@/hooks/use-subscription';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Crown, Lock, Sparkles } from 'lucide-react';
import { PageLayout } from '@/components/page-layout';

interface SubscriptionGuardProps {
  children: React.ReactNode;
  featureName?: string;
}

export function SubscriptionGuard({ children, featureName = 'Business Hub' }: SubscriptionGuardProps) {
  const { subscription, isLoading, hasAccess, error } = useSubscription();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <PageLayout title={featureName} showBackButton={true}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground">Checking subscription status...</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  // Handle subscription API errors (network failures, server errors)
  // Don't lock out paying customers due to temporary issues
  if (error) {
    return (
      <PageLayout title={featureName} showBackButton={true}>
        <div className="max-w-2xl mx-auto p-6">
          <Card className="border-2 border-yellow-200">
            <CardHeader className="text-center space-y-4 pb-6">
              <div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
                <Lock className="h-8 w-8 text-yellow-600" />
              </div>
              <CardTitle className="text-2xl">Connection Issue</CardTitle>
              <CardDescription className="text-base">
                We're having trouble verifying your subscription status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-center text-sm text-muted-foreground">
                This might be due to a temporary network or server issue. Please try again.
              </p>
              
              <div className="flex flex-col gap-3">
                <Button 
                  size="lg" 
                  className="w-full"
                  onClick={() => window.location.reload()}
                  data-testid="button-retry-subscription"
                >
                  Retry Now
                </Button>
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="w-full"
                  onClick={() => setLocation('/home')}
                  data-testid="button-back-to-home"
                >
                  Back to Home
                </Button>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                If this issue persists, please contact support
              </p>
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );
  }

  // Allow access if user has active subscription (trial or premium)
  if (hasAccess) {
    return <>{children}</>;
  }

  // Show upgrade prompt for users without active subscription
  return (
    <PageLayout title={featureName} showBackButton={true}>
      <div className="max-w-2xl mx-auto p-6">
        <Card className="border-2 border-primary/20">
          <CardHeader className="text-center space-y-4 pb-6">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">
              Premium Feature: {featureName}
            </CardTitle>
            <CardDescription className="text-base">
              Upgrade to Simple Slips Premium to unlock professional business tools
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Feature Benefits */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Complete Business Management</p>
                  <p className="text-sm text-muted-foreground">
                    Create quotations, send invoices, track payments, and manage clients professionally
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">AI-Powered Email Assistant</p>
                  <p className="text-sm text-muted-foreground">
                    Generate professional emails and payment reminders with GPT-4o
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Profit & Loss Reporting</p>
                  <p className="text-sm text-muted-foreground">
                    Track revenue and expenses together with professional PDF reports
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Smart Payment Tracking</p>
                  <p className="text-sm text-muted-foreground">
                    Automated reminders with urgency levels and payment predictions
                  </p>
                </div>
              </div>
            </div>

            {/* Pricing */}
            <div className="bg-primary/5 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-1">Simple pricing</p>
              <p className="text-3xl font-bold text-primary">R49<span className="text-lg font-normal">/month</span></p>
              <p className="text-sm text-muted-foreground mt-1">30-day free trial included</p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col gap-3">
              <Button 
                size="lg" 
                className="w-full"
                onClick={() => setLocation('/subscription')}
                data-testid="button-upgrade-to-premium"
              >
                <Crown className="h-5 w-5 mr-2" />
                Start Your Free Trial
              </Button>
              <Button 
                variant="outline" 
                size="lg" 
                className="w-full"
                onClick={() => setLocation('/home')}
                data-testid="button-back-to-home"
              >
                Back to Home
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              Your receipt tracking and basic features remain free during the trial
            </p>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
