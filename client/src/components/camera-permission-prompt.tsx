import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Camera, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useMobileFeatures } from '@/hooks/use-mobile-features';

interface CameraPermissionPromptProps {
  onPermissionGranted: () => void;
  onPermissionDenied: () => void;
}

export function CameraPermissionPrompt({ onPermissionGranted, onPermissionDenied }: CameraPermissionPromptProps) {
  const [isRequesting, setIsRequesting] = useState(false);
  const [permissionState, setPermissionState] = useState<'prompt' | 'denied' | 'granted'>('prompt');
  const { supportsCamera, requestCameraPermission } = useMobileFeatures();

  const handleRequestPermission = async () => {
    if (!supportsCamera) {
      setPermissionState('denied');
      onPermissionDenied();
      return;
    }

    setIsRequesting(true);
    try {
      const granted = await requestCameraPermission();
      if (granted) {
        setPermissionState('granted');
        onPermissionGranted();
      } else {
        setPermissionState('denied');
        onPermissionDenied();
      }
    } catch (error) {
      setPermissionState('denied');
      onPermissionDenied();
    } finally {
      setIsRequesting(false);
    }
  };

  if (!supportsCamera) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-lg flex items-center justify-center">
            <Camera className="w-8 h-8 text-gray-400" />
          </div>
          <CardTitle>Camera Not Available</CardTitle>
          <CardDescription>
            Camera access is not supported on this device or browser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onPermissionDenied} className="w-full" variant="outline">
            Continue Without Camera
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (permissionState === 'denied') {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-none flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <CardTitle>Camera Permission Denied</CardTitle>
          <CardDescription>
            Camera access is required to scan receipts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              To enable camera access, please allow camera permissions in your browser settings and refresh the page.
            </AlertDescription>
          </Alert>
          <div className="flex gap-2">
            <Button onClick={handleRequestPermission} variant="outline" className="flex-1">
              Try Again
            </Button>
            <Button 
              onClick={() => {
                onPermissionDenied();
                // Trigger file input after a short delay
                setTimeout(() => {
                  const fileInput = document.getElementById("receipt") as HTMLInputElement;
                  if (fileInput) {
                    fileInput.click();
                  }
                }, 100);
              }} 
              className="flex-1"
            >
              Use File Upload
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (permissionState === 'granted') {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-none flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <CardTitle>Camera Ready</CardTitle>
          <CardDescription>
            Camera access granted. You can now scan receipts.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-none flex items-center justify-center">
          <Camera className="w-8 h-8 text-blue-600" />
        </div>
        <CardTitle>Camera Permission Required</CardTitle>
        <CardDescription>
          To take pictures of receipts, Simple Slips needs camera access. Your privacy is protected - images are processed securely.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Camera className="h-4 w-4" />
          <AlertDescription>
            Camera access allows you to quickly scan receipts by taking photos directly in the app.
          </AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Button 
            onClick={handleRequestPermission} 
            className="flex-1"
            disabled={isRequesting}
          >
            {isRequesting ? 'Requesting...' : 'Allow Camera'}
          </Button>
          <Button onClick={onPermissionDenied} variant="outline" className="flex-1">
            Use File Upload
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}