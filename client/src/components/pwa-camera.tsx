import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Upload, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMobileFeatures } from '@/hooks/use-mobile-features';

interface PWACameraProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

export function PWACamera({ onCapture, onClose }: PWACameraProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { supportsCamera, deviceType } = useMobileFeatures();

  const startCamera = useCallback(async () => {
    if (!supportsCamera) {
      setError('Camera not supported on this device');
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setError(null);
    } catch (err) {
      console.error('Camera access failed:', err);
      setError('Camera access denied. Please allow camera permissions and try again.');
    }
  }, [facingMode, supportsCamera]);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }, [stream]);

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsCapturing(true);
    
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) throw new Error('Could not get canvas context');

      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw the video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert to blob with high quality
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const file = new File([blob], `receipt-${Date.now()}.jpg`, {
              type: 'image/jpeg',
            });
            onCapture(file);
            stopCamera();
          }
        },
        'image/jpeg',
        0.9
      );
    } catch (err) {
      console.error('Photo capture failed:', err);
      setError('Failed to capture photo. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  }, [onCapture, stopCamera]);

  const switchCamera = useCallback(() => {
    setFacingMode(current => current === 'user' ? 'environment' : 'user');
  }, []);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onCapture(file);
    }
  }, [onCapture]);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  // Stop camera when component unmounts
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  if (error) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-6 max-w-md w-full">
          <Alert className="mb-4">
            <Camera className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          
          <div className="space-y-3">
            <Button onClick={startCamera} className="w-full">
              <Camera className="w-4 h-4 mr-2" />
              Try Camera Again
            </Button>
            
            <div className="relative">
              <Button variant="outline" className="w-full" asChild>
                <label htmlFor="file-upload" className="cursor-pointer">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload from Gallery
                </label>
              </Button>
              <input
                id="file-upload"
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>
            
            <Button variant="outline" onClick={onClose} className="w-full">
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50">
      {/* Video Stream */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />
      
      {/* Capture Overlay */}
      <div className="absolute inset-0 flex flex-col justify-between p-4">
        {/* Top Controls */}
        <div className="flex justify-between items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-white bg-black bg-opacity-50 hover:bg-opacity-70"
          >
            <X className="w-5 h-5" />
          </Button>
          
          <div className="flex gap-2">
            {deviceType === 'mobile' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={switchCamera}
                className="text-white bg-black bg-opacity-50 hover:bg-opacity-70"
              >
                <RotateCcw className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>

        {/* Center Guide */}
        <div className="flex-1 flex items-center justify-center">
          <div className="border-2 border-white border-dashed rounded-lg w-80 h-48 flex items-center justify-center">
            <p className="text-white text-center text-sm bg-black bg-opacity-50 px-3 py-1 rounded">
              Position receipt within frame
            </p>
          </div>
        </div>

        {/* Bottom Controls */}
        <div className="flex justify-center items-center">
          <div className="flex items-center gap-6">
            {/* Gallery Upload */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                className="text-white bg-black bg-opacity-50 hover:bg-opacity-70 w-12 h-12 rounded-full"
                asChild
              >
                <label htmlFor="gallery-upload" className="cursor-pointer">
                  <Upload className="w-5 h-5" />
                </label>
              </Button>
              <input
                id="gallery-upload"
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>

            {/* Capture Button */}
            <Button
              onClick={capturePhoto}
              disabled={isCapturing || !stream}
              className="w-16 h-16 rounded-full bg-white hover:bg-gray-100 text-black border-4 border-gray-300"
            >
              {isCapturing ? (
                <div className="animate-spin w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full" />
              ) : (
                <Camera className="w-8 h-8" />
              )}
            </Button>

            {/* Placeholder for symmetry */}
            <div className="w-12 h-12" />
          </div>
        </div>
      </div>

      {/* Hidden canvas for photo capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}