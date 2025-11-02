import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Download, X, Smartphone } from 'lucide-react';
import { useMobileFeatures } from '@/hooks/use-mobile-features';

export function MobileInstallBanner() {
  const { canInstall, isInstalled, deviceType, installApp } = useMobileFeatures();
  const [dismissed, setDismissed] = useState(false);

  // Don't show if already installed, can't install, or user dismissed
  if (isInstalled || !canInstall || dismissed || deviceType === 'desktop') {
    return null;
  }

  const handleInstall = async () => {
    try {
      await installApp();
    } catch (error) {
      console.error('Installation failed:', error);
    }
  };

  return (
    <Card className="fixed bottom-4 left-4 right-4 z-50 p-4 bg-white shadow-lg border border-blue-200">
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 bg-blue-100 rounded-none flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-blue-600" />
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900">
            Install Simple Slips
          </h3>
          <p className="text-xs text-gray-600">
            Get the full app experience with offline access
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleInstall}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Download className="w-4 h-4 mr-1" />
            Install
          </Button>
          
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDismissed(true)}
            className="p-1"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}