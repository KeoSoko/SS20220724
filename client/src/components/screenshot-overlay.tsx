
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Smartphone, Tablet, Monitor } from 'lucide-react';

interface ScreenshotOverlayProps {
  isVisible: boolean;
  onClose: () => void;
  deviceType: 'mobile' | 'tablet' | 'desktop';
}

export function ScreenshotOverlay({ isVisible, onClose, deviceType }: ScreenshotOverlayProps) {
  const [dimensions, setDimensions] = useState({ width: 390, height: 844 });

  useEffect(() => {
    if (deviceType === 'mobile') {
      setDimensions({ width: 390, height: 844 }); // iPhone 14 Pro
    } else if (deviceType === 'tablet') {
      setDimensions({ width: 1024, height: 768 }); // iPad
    } else {
      setDimensions({ width: 1920, height: 1080 }); // Desktop
    }
  }, [deviceType]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Screenshot Frame</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {deviceType === 'mobile' ? (
              <Smartphone className="h-5 w-5 text-blue-600" />
            ) : deviceType === 'tablet' ? (
              <Tablet className="h-5 w-5 text-blue-600" />
            ) : (
              <Monitor className="h-5 w-5 text-blue-600" />
            )}
            <div>
              <p className="font-medium">
                {deviceType === 'mobile' ? 'iPhone' : deviceType === 'tablet' ? 'iPad' : 'Desktop'} Screenshot
              </p>
              <p className="text-sm text-muted-foreground">
                {dimensions.width} × {dimensions.height}
              </p>
            </div>
          </div>
          
          <div className="bg-blue-50 p-3 rounded-none border border-blue-200">
            <p className="text-sm text-blue-800">
              <strong>Instructions:</strong>
            </p>
            <ol className="text-sm text-blue-700 mt-1 space-y-1">
              <li>1. Press F12 to open Developer Tools</li>
              <li>2. Click the device icon (responsive mode)</li>
              <li>3. Set dimensions to {dimensions.width} × {dimensions.height}</li>
              <li>4. Take screenshot with your preferred tool</li>
            </ol>
          </div>
          
          <div className="flex gap-2">
            <Button 
              onClick={() => {
                // Copy dimensions to clipboard
                navigator.clipboard.writeText(`${dimensions.width}x${dimensions.height}`);
              }}
              className="flex-1"
            >
              Copy Dimensions
            </Button>
            <Button variant="outline" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
