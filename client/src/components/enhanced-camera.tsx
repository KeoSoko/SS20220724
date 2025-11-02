import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, RotateCcw, Crop, Check, X } from "lucide-react";
import imageCompression from "browser-image-compression";

interface EnhancedCameraProps {
  onImageCapture: (imageData: string) => void;
  onCancel: () => void;
}

export function EnhancedCamera({ onImageCapture, onCancel }: EnhancedCameraProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startCamera = useCallback(async () => {
    // Don't start camera if already have a stream
    if (stream) {
      console.log("[Camera] Stream already exists, skipping camera start");
      return;
    }
    
    try {
      console.log("[Camera] Requesting camera access...");
      
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" }, // Use back camera on mobile
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 }
        }
      });
      
      console.log("[Camera] Camera access granted");
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          console.log("[Camera] Video metadata loaded");
          videoRef.current?.play().then(() => {
            console.log("[Camera] Video playback started successfully");
          }).catch((error) => {
            console.error("[Camera] Video playback failed:", error);
          });
        };
        
        // Force video to load
        videoRef.current.load();
      }
    } catch (error) {
      console.error("[Camera] Error accessing camera:", error);
      console.error("[Camera] Error details:", {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
      
      // Handle different error types
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          console.error("[Camera] Permission denied - user rejected camera access");
        } else if (error.name === 'NotFoundError') {
          console.error("[Camera] No camera found - device has no camera");
        } else if (error.name === 'NotSupportedError') {
          console.error("[Camera] Camera not supported - browser doesn't support getUserMedia");
        } else if (error.name === 'NotReadableError') {
          console.error("[Camera] Camera in use by another application");
        } else if (error.name === 'OverconstrainedError') {
          console.error("[Camera] Camera constraints cannot be satisfied");
        } else {
          console.error("[Camera] Unknown camera error:", error.name, error.message);
        }
      }
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      console.log("[Camera] Stopping camera stream");
      stream.getTracks().forEach(track => {
        track.stop();
        console.log("[Camera] Stopped track:", track.kind);
      });
      setStream(null);
      
      // Clear video source
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
  }, [stream]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw the video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to base64
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    setCapturedImage(imageData);
    stopCamera();
  }, [stopCamera]);

  const processImage = useCallback(async (imageData: string) => {
    console.log("[Camera] Processing captured image");
    setIsProcessing(true);
    
    try {
      // Convert base64 to blob
      const response = await fetch(imageData);
      const blob = await response.blob();
      
      console.log("[Camera] Image blob created:", blob.size, "bytes");
      
      // Compress image for better performance
      const compressedFile = await imageCompression(blob as File, {
        maxSizeMB: 3, // Increased for better quality
        maxWidthOrHeight: 1920,
        useWebWorker: false, // Disable web worker for mobile compatibility
        initialQuality: 0.85,
        fileType: 'image/jpeg'
      });

      console.log("[Camera] Image compressed from", blob.size, "to", compressedFile.size, "bytes");

      // Convert back to base64
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        console.log("[Camera] Image processing complete, sending to handler");
        onImageCapture(result);
      };
      reader.onerror = () => {
        console.error("[Camera] FileReader error, using original image");
        onImageCapture(imageData);
      };
      reader.readAsDataURL(compressedFile);
    } catch (error) {
      console.error("[Camera] Error processing image:", error);
      // Fallback to original image
      console.log("[Camera] Using original image as fallback");
      onImageCapture(imageData);
    } finally {
      setIsProcessing(false);
    }
  }, [onImageCapture]);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setCapturedImage(result);
    };
    reader.readAsDataURL(file);
  }, []);

  const retakePhoto = useCallback(() => {
    setCapturedImage(null);
    startCamera();
  }, [startCamera]);

  // Auto-start camera when component mounts
  useEffect(() => {
    console.log("[Camera] Component mounted, starting camera");
    console.log("[Camera] Browser capabilities:", {
      userAgent: navigator.userAgent,
      mediaDevices: !!navigator.mediaDevices,
      getUserMedia: !!navigator.mediaDevices?.getUserMedia,
      isSecureContext: window.isSecureContext,
      protocol: window.location.protocol
    });
    
    startCamera();
    
    return () => {
      console.log("[Camera] Component unmounting, stopping camera");
      stopCamera();
    };
  }, []); // Remove dependencies to prevent re-running

  // Ensure video stream is assigned when stream changes
  useEffect(() => {
    if (stream && videoRef.current) {
      console.log("[Camera] Assigning stream to video element");
      videoRef.current.srcObject = stream;
      
      // Force video to start playing
      const playVideo = async () => {
        try {
          await videoRef.current?.play();
          console.log("[Camera] Video is now playing");
        } catch (error) {
          console.error("[Camera] Failed to start video playback:", error);
        }
      };
      
      // Try to play immediately and on metadata load
      playVideo();
      
      if (videoRef.current) {
        videoRef.current.onloadedmetadata = () => {
          console.log("[Camera] Video metadata loaded, starting playback");
          playVideo();
        };
      }
    }
  }, [stream]);

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Enhanced Receipt Scanner
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Camera viewfinder or captured image */}
        <div className="relative bg-black rounded-none overflow-hidden">
          {!capturedImage ? (
            <>
              {stream ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-auto max-h-96 object-contain"
                    onLoadedData={() => console.log("[Camera] Video loaded")}
                    onCanPlay={() => console.log("[Camera] Video can play")}
                    onPlaying={() => console.log("[Camera] Video is playing")}
                    onError={(e) => console.error("[Camera] Video error:", e)}
                    onLoadStart={() => console.log("[Camera] Video load started")}
                  />
                  {/* Receipt detection overlay */}
                  <div className="absolute inset-4 border-2 border-white/50 rounded-none">
                    <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-blue-400"></div>
                    <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-blue-400"></div>
                    <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-blue-400"></div>
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-blue-400"></div>
                  </div>
                  <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-none text-sm">
                    Position receipt within the frame
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-white">
                  <div className="text-center">
                    <Camera className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Starting camera...</p>
                    <Button 
                      onClick={startCamera}
                      variant="outline" 
                      className="mt-4 text-white border-white hover:bg-white/10"
                    >
                      Retry Camera Access
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <img 
              src={capturedImage} 
              alt="Captured receipt" 
              className="w-full h-full object-contain"
            />
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap justify-center gap-2 md:gap-4 px-4">
          {!capturedImage ? (
            <>
              {stream && (
                <Button 
                  onClick={capturePhoto}
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-700 flex-shrink-0"
                >
                  <Camera className="h-5 w-5 mr-2" />
                  Capture
                </Button>
              )}
              <Button 
                variant="outline" 
                onClick={() => fileInputRef.current?.click()}
                className="flex-shrink-0"
              >
                <Crop className="h-4 w-4 mr-2" />
                Choose File
              </Button>
              <Button 
                variant="outline" 
                onClick={onCancel}
                className="flex-shrink-0"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button 
                onClick={() => processImage(capturedImage)}
                disabled={isProcessing}
                size="lg"
                className="bg-green-600 hover:bg-green-700 flex-shrink-0"
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin rounded-none h-4 w-4 border-b-2 border-white mr-2"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <Check className="h-5 w-5 mr-2" />
                    Use This Photo
                  </>
                )}
              </Button>
              <Button 
                variant="outline" 
                onClick={retakePhoto}
                disabled={isProcessing}
                className="flex-shrink-0"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Retake
              </Button>
            </>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Hidden canvas for image capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Camera tips */}
        <div className="bg-blue-50 rounded-none p-4">
          <h4 className="font-medium text-blue-900 mb-2">📸 Camera Tips</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Ensure good lighting for better text recognition</li>
            <li>• Keep the receipt flat and fully visible</li>
            <li>• Avoid shadows and reflections</li>
            <li>• Position the receipt within the blue corners</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}