import React, { useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Camera, X, RotateCcw, Circle } from 'lucide-react';
import { useMobileFeatures } from '@/hooks/use-mobile-features';

interface MobileCameraProps {
  onCapture: (imageData: string) => void;
  onClose: () => void;
}

export function MobileCamera({ onCapture, onClose }: MobileCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const { supportsCamera } = useMobileFeatures();

  // Start camera stream
  const startCamera = useCallback(async () => {
    if (!supportsCamera || !videoRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      
      videoRef.current.srcObject = stream;
      setIsStreaming(true);
    } catch (error) {
      console.error('Error accessing camera:', error);
    }
  }, [facingMode, supportsCamera]);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsStreaming(false);
    }
  }, []);

  // Capture photo
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to base64 data URL
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    
    // Stop camera and notify parent
    stopCamera();
    onCapture(imageData);
  }, [stopCamera, onCapture]);

  // Switch camera (front/back)
  const switchCamera = useCallback(() => {
    stopCamera();
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  }, [stopCamera]);

  // Initialize camera when component mounts
  React.useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  // Update camera when facing mode changes
  React.useEffect(() => {
    if (isStreaming) {
      startCamera();
    }
  }, [facingMode, isStreaming, startCamera]);

  if (!supportsCamera) {
    return (
      <Card className="p-6 text-center">
        <Camera className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <h3 className="text-lg font-medium mb-2">Camera Not Available</h3>
        <p className="text-gray-600 mb-4">
          Camera access is not supported on this device or browser.
        </p>
        <Button onClick={onClose} variant="outline">
          Close
        </Button>
      </Card>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Camera view */}
      <div className="relative w-full h-full">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        
        {/* Overlay UI */}
        <div className="absolute inset-0 flex flex-col">
          {/* Top bar */}
          <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/50 to-transparent">
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="text-white hover:bg-white/20"
            >
              <X className="w-5 h-5" />
            </Button>
            
            <h2 className="text-white font-medium">Scan Receipt</h2>
            
            <Button
              size="sm"
              variant="ghost"
              onClick={switchCamera}
              className="text-white hover:bg-white/20"
            >
              <RotateCcw className="w-5 h-5" />
            </Button>
          </div>

          {/* Center guide */}
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-full max-w-sm aspect-[3/4] border-2 border-white/50 rounded-none relative">
              <div className="absolute top-0 left-0 w-6 h-6 border-l-2 border-t-2 border-white rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-6 h-6 border-r-2 border-t-2 border-white rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-l-2 border-b-2 border-white rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-r-2 border-b-2 border-white rounded-br-lg" />
              
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-white/80 text-sm text-center px-4">
                  Position receipt within the frame
                </p>
              </div>
            </div>
          </div>

          {/* Bottom controls */}
          <div className="p-8 bg-gradient-to-t from-black/50 to-transparent">
            <div className="flex items-center justify-center">
              <Button
                size="lg"
                onClick={capturePhoto}
                disabled={!isStreaming}
                className="w-16 h-16 rounded-none bg-white hover:bg-gray-200 text-black p-0"
              >
                <Circle className="w-8 h-8" />
              </Button>
            </div>
            
            <p className="text-white/80 text-sm text-center mt-4">
              Tap to capture receipt
            </p>
          </div>
        </div>
      </div>

      {/* Hidden canvas for image capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}