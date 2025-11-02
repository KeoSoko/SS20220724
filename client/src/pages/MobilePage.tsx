import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Camera, Upload, X, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function MobilePage() {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isCamera, setIsCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment', // Back camera
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCamera(true);
      }
    } catch (err) {
      toast({
        title: "Camera Error",
        description: "Unable to access camera. Please check permissions.",
        variant: "destructive"
      });
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      // Set canvas size to receipt aspect ratio (3:4)
      canvas.width = 300;
      canvas.height = 400;
      
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedImage(imageData);
        stopCamera();
        
        toast({
          title: "Receipt Captured!",
          description: "Photo captured successfully. In production, this would be processed with AI."
        });
      }
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
    }
    setIsCamera(false);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setCapturedImage(e.target?.result as string);
        toast({
          title: "Receipt Uploaded!",
          description: "Image uploaded successfully. In production, this would be processed with AI."
        });
      };
      reader.readAsDataURL(file);
    }
  };

  if (isCamera) {
    return (
      <div className="min-h-screen bg-black relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
        
        <div className="absolute top-4 right-4">
          <Button
            onClick={stopCamera}
            size="sm"
            variant="secondary"
            className="bg-black/60 text-white border-none hover:bg-black/80"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
          <Button
            onClick={capturePhoto}
            size="lg"
            className="w-16 h-16 rounded-full bg-white hover:bg-gray-100 text-[#0073AA] border-4 border-white"
          >
            <div className="w-12 h-12 rounded-full bg-[#0073AA]" />
          </Button>
        </div>
        
        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0073AA] to-[#005A87] p-4">
      <div className="max-w-md mx-auto space-y-6 pt-8">
        {/* Header */}
        <div className="text-center text-white">
          <h1 className="text-3xl font-bold mb-2">Simple Slips</h1>
          <p className="text-blue-100">Mobile Receipt Scanner</p>
        </div>

        {/* Captured Image Preview */}
        {capturedImage && (
          <Card className="p-4 bg-white/95">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-3 text-gray-800">Captured Receipt</h3>
              <img 
                src={capturedImage} 
                alt="Captured receipt" 
                className="w-full max-w-[200px] mx-auto rounded-lg shadow-md"
                style={{ aspectRatio: '3/4' }}
              />
              <Button
                onClick={() => setCapturedImage(null)}
                variant="outline"
                size="sm"
                className="mt-3"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="space-y-4">
          <Button
            onClick={startCamera}
            className="w-full h-14 bg-white text-[#0073AA] hover:bg-gray-50 text-lg font-semibold"
            size="lg"
          >
            <Camera className="h-6 w-6 mr-3" />
            Take Picture
          </Button>

          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
            className="w-full h-14 bg-white/20 text-white border-white/40 hover:bg-white/30 text-lg font-semibold"
            size="lg"
          >
            <Upload className="h-6 w-6 mr-3" />
            Upload from Gallery
          </Button>
        </div>

        {/* Features List */}
        <Card className="p-6 bg-white/10 backdrop-blur border-white/20">
          <h3 className="text-white font-semibold mb-3">Mobile Features</h3>
          <div className="space-y-2 text-sm text-blue-100">
            <div>• Native camera integration</div>
            <div>• Gallery image selection</div>
            <div>• Receipt-optimized aspect ratio</div>
            <div>• Professional capture interface</div>
            <div>• Ready for AI processing</div>
          </div>
        </Card>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>
    </div>
  );
}