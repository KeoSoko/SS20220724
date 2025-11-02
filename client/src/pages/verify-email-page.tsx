import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, Mail, Loader2, AlertCircle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

export function VerifyEmailPage() {
  const [location, setLocation] = useLocation();
  const [token, setToken] = useState('');
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [autoVerifyAttempted, setAutoVerifyAttempted] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  // Performance monitoring
  const startTime = Date.now();

  const verifyEmailMutation = useMutation({
    mutationFn: async ({ token }: { token: string }) => {
      const response = await apiRequest('POST', '/api/verify-email', { token });
      return response;
    },
    onSuccess: (data: any) => {
      setVerificationStatus('success');
      setMessage(data.message || 'Email verified successfully!');
      setRedirecting(true);
      
      setTimeout(() => {
        setLocation('/auth?verified=true&message=' + encodeURIComponent('Email verified successfully! You can now sign in.'));
      }, 2500);
    },
    onError: (error: any) => {
      // Check if token was already used (success case showing as error)
      if (error.message?.includes('invalid or has expired') || 
          error.message?.includes('Invalid token')) {
        setVerificationStatus('success');
        setMessage('Your email has already been verified! Redirecting to sign in...');
        setRedirecting(true);
        setTimeout(() => {
          setLocation('/auth?verified=true&message=' + encodeURIComponent('Email already verified! You can sign in now.'));
        }, 2500);
      } else {
        setVerificationStatus('error');
        setMessage(error.message || 'Failed to verify email. Please try again.');
      }
    }
  });

  // Auto-verification with clean logging
  useEffect(() => {
    const getVerificationToken = () => {
      try {
        return new URLSearchParams(window.location.search).get('token');
      } catch (e) {
        return null;
      }
    };

    const tokenParam = getVerificationToken();
    
    if (tokenParam && !autoVerifyAttempted) {
      console.log('[VERIFY] Auto-verification starting...');
      setAutoVerifyAttempted(true);
      setVerificationStatus('verifying');
      verifyEmailMutation.mutate({ token: tokenParam });
    }
  }, [location, autoVerifyAttempted]);

  const resendVerificationMutation = useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const response = await apiRequest('POST', '/api/resend-verification', { email });
      return response;
    },
    onSuccess: (data: any) => {
      setMessage(data.message || 'Verification email sent successfully!');
      setResendEmail('');
    },
    onError: (error: any) => {
      setMessage(error.message || 'Failed to send verification email. Please try again.');
    }
  });

  const handleManualVerification = () => {
    if (token.trim()) {
      setVerificationStatus('verifying');
      verifyEmailMutation.mutate({ token: token.trim() });
    }
  };

  const handleResendVerification = () => {
    if (resendEmail.trim()) {
      resendVerificationMutation.mutate({ email: resendEmail.trim() });
    }
  };

  if (verifyEmailMutation.isPending || verificationStatus === 'verifying') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-[#0073AA] mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Verifying Your Email</h2>
            <p className="text-gray-600 text-center">
              Please wait while we verify your email address...
            </p>
            <div className="mt-4 text-xs text-gray-400">
              Processing time: {Math.floor((Date.now() - startTime) / 1000)}s
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (verificationStatus === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Email Verified Successfully!</h2>
            <p className="text-gray-600 text-center mb-4">
              Great! Your email has been verified. You're now ready to sign in and start managing your receipts with Simple Slips.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800 text-center">
                <strong>Next step:</strong> Sign in with your username and password to access your account.
              </p>
            </div>
            <p className="text-sm text-gray-500 text-center">
              {redirecting ? 'Redirecting to sign in page... If this takes too long, click below.' : 'Click below to continue'}
            </p>
            {redirecting && (
              <div className="text-xs text-gray-400 text-center mt-2">
                Debug: Redirect initiated at {new Date().toLocaleTimeString()}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button 
              onClick={() => setLocation('/auth?verified=true&message=' + encodeURIComponent('Email verified successfully! You can now sign in.'))} 
              className="w-full bg-[#0073AA] hover:bg-[#005a87]"
            >
              Sign In Now
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Mail className="h-12 w-12 text-[#0073AA]" />
          </div>
          <CardTitle className="text-2xl font-bold">Verify Your Email</CardTitle>
          <CardDescription>
            Enter your verification token or request a new one
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {message && (
            <Alert className={verificationStatus === 'error' ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}>
              <div className="flex items-center">
                {verificationStatus === 'error' ? (
                  <AlertCircle className="h-4 w-4 text-red-600 mr-2" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                )}
                <AlertDescription className={verificationStatus === 'error' ? 'text-red-800' : 'text-green-800'}>
                  {message}
                </AlertDescription>
              </div>
            </Alert>
          )}

          <div className="space-y-4">
            <div>
              <Label htmlFor="token">Verification Token</Label>
              <Input
                id="token"
                type="text"
                placeholder="Enter verification token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
            
            <Button 
              onClick={handleManualVerification}
              disabled={!token.trim() || verifyEmailMutation.isPending}
              className="w-full bg-[#0073AA] hover:bg-[#005a87]"
            >
              {verifyEmailMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify Email'
              )}
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-50 text-gray-500">Or</span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="resendEmail">Resend Verification Email</Label>
              <Input
                id="resendEmail"
                type="email"
                placeholder="Enter your email address"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
              />
            </div>
            
            <Button 
              onClick={handleResendVerification}
              disabled={!resendEmail.trim() || resendVerificationMutation.isPending}
              variant="outline"
              className="w-full"
            >
              {resendVerificationMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Verification Email'
              )}
            </Button>
          </div>
        </CardContent>
        
        <CardFooter>
          <Button 
            onClick={() => setLocation('/auth')}
            variant="ghost"
            className="w-full"
          >
            Back to Login
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}