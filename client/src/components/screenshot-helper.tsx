
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Camera, Download, Smartphone, Tablet } from 'lucide-react';

interface ScreenshotHelperProps {
  onCapture?: (screenshotName: string) => void;
}

export function ScreenshotHelper({ onCapture }: ScreenshotHelperProps) {
  const [deviceType, setDeviceType] = useState<'mobile' | 'tablet'>('mobile');
  const [isCapturing, setIsCapturing] = useState(false);

  const screenshots = [
    {
      name: 'home-screen',
      title: 'Home Screen',
      description: 'Dashboard with receipt overview and quick actions',
      route: '/home'
    },
    {
      name: 'upload-receipt',
      title: 'Upload Receipt',
      description: 'Camera interface for scanning receipts',
      route: '/upload'
    },
    {
      name: 'receipt-details',
      title: 'Receipt Details',
      description: 'Individual receipt view with editing options',
      route: '/receipt/11'
    },
    {
      name: 'analytics',
      title: 'Analytics Dashboard',
      description: 'Spending insights and category breakdown',
      route: '/analytics'
    },
    {
      name: 'tax-dashboard',
      title: 'Tax Dashboard',
      description: 'Tax deductions and planning tools',
      route: '/tax-dashboard'
    },
    {
      name: 'smart-search',
      title: 'Smart Search',
      description: 'AI-powered expense search and filtering',
      route: '/smart'
    }
  ];

  const captureScreenshot = async (screenshot: typeof screenshots[0]) => {
    setIsCapturing(true);
    
    try {
      // Navigate to the route
      window.location.href = screenshot.route;
      
      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Trigger download suggestion
      console.log(`Screenshot ready for: ${screenshot.name}`);
      console.log(`Device: ${deviceType}`);
      console.log(`Route: ${screenshot.route}`);
      
      if (onCapture) {
        onCapture(screenshot.name);
      }
      
    } catch (error) {
      console.error('Screenshot capture failed:', error);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          App Store Screenshot Helper
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Navigate through different screens to capture screenshots for app store submission
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Device Type Selector */}
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">Device Type:</span>
          <div className="flex gap-2">
            <Button
              variant={deviceType === 'mobile' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDeviceType('mobile')}
            >
              <Smartphone className="h-4 w-4 mr-2" />
              Mobile (390x844)
            </Button>
            <Button
              variant={deviceType === 'tablet' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDeviceType('tablet')}
            >
              <Tablet className="h-4 w-4 mr-2" />
              Tablet (1024x768)
            </Button>
          </div>
        </div>

        {/* Screenshot Instructions */}
        <div className="bg-blue-50 p-4 rounded-none border border-blue-200">
          <h3 className="font-medium text-blue-900 mb-2">Screenshot Instructions:</h3>
          <ol className="text-sm text-blue-800 space-y-1">
            <li>1. Select your device type above</li>
            <li>2. Click "Navigate & Capture" for each screen</li>
            <li>3. Wait for the page to load completely</li>
            <li>4. Use browser developer tools to set responsive dimensions</li>
            <li>5. Take screenshot using browser tools (F12 → Device Mode)</li>
          </ol>
        </div>

        {/* Screenshot Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {screenshots.map((screenshot) => (
            <div key={screenshot.name} className="border rounded-none p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-medium">{screenshot.title}</h3>
                  <p className="text-sm text-muted-foreground">{screenshot.description}</p>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={() => captureScreenshot(screenshot)}
                  disabled={isCapturing}
                  className="flex-1"
                >
                  {isCapturing ? 'Loading...' : 'Navigate & Capture'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(screenshot.route, '_blank')}
                >
                  Preview
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* App Store Requirements */}
        <div className="bg-gray-50 p-4 rounded-none border">
          <h3 className="font-medium mb-2">App Store Screenshot Requirements:</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-medium">iOS App Store:</h4>
              <ul className="text-muted-foreground space-y-1">
                <li>• iPhone: 1290x2796 (6.7") or 1179x2556 (6.1")</li>
                <li>• iPad: 2048x2732 (12.9") or 1620x2160 (10.9")</li>
                <li>• 3-10 screenshots required</li>
                <li>• No transparency or rounded corners</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium">Google Play Store:</h4>
              <ul className="text-muted-foreground space-y-1">
                <li>• Phone: 1080x1920 minimum</li>
                <li>• Tablet: 1200x1920 minimum</li>
                <li>• 2-8 screenshots required</li>
                <li>• PNG or JPEG format</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ScreenshotHelper;
