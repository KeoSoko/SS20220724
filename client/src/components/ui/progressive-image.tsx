import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";

interface ProgressiveImageProps {
  src: string;
  alt: string;
  className?: string;
  placeholder?: string;
  onLoad?: () => void;
  onError?: () => void;
  lazy?: boolean;
}

export function ProgressiveImage({
  src,
  alt,
  className,
  placeholder,
  onLoad,
  onError,
  lazy = true
}: ProgressiveImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(placeholder || '');

  useEffect(() => {
    if (!src) return;

    const img = new Image();
    img.onload = () => {
      setCurrentSrc(src);
      setIsLoaded(true);
      onLoad?.();
    };
    img.onerror = () => {
      setIsError(true);
      onError?.();
    };
    img.src = src;
  }, [src, onLoad, onError]);

  if (isError) {
    return (
      <div className={cn(
        "flex items-center justify-center bg-gray-100 text-gray-400",
        className
      )}>
        <EyeOff className="w-6 h-6" />
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <img
        src={currentSrc}
        alt={alt}
        loading={lazy ? "lazy" : "eager"}
        className={cn(
          "w-full h-auto object-contain transition-opacity duration-300",
          isLoaded ? "opacity-100" : "opacity-70"
        )}
      />
      {!isLoaded && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse" />
      )}
    </div>
  );
}

// Mobile-optimized receipt image viewer
interface ReceiptImageViewerProps {
  src: string;
  alt: string;
  className?: string;
  showFullscreen?: boolean;
}

export function ReceiptImageViewer({
  src,
  alt,
  className,
  showFullscreen = true
}: ReceiptImageViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleFullscreen = () => {
    if (showFullscreen) {
      setIsFullscreen(true);
    }
  };

  return (
    <>
      <div 
        className={cn(
          "relative cursor-pointer rounded-none overflow-hidden",
          className
        )}
        onClick={handleFullscreen}
      >
        <ProgressiveImage
          src={src}
          alt={alt}
          className="aspect-[3/4] hover:scale-105 transition-transform duration-200"
        />
        {showFullscreen && (
          <div className="absolute top-2 right-2 bg-black/50 rounded-none p-1">
            <Eye className="w-4 h-4 text-white" />
          </div>
        )}
      </div>

      {/* Fullscreen modal */}
      {isFullscreen && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setIsFullscreen(false)}
        >
          <div className="relative max-w-full max-h-full">
            <img
              src={src}
              alt={alt}
              className="max-w-full max-h-full object-contain"
            />
            <button
              className="absolute top-4 right-4 text-white hover:text-gray-300"
              onClick={() => setIsFullscreen(false)}
            >
              <EyeOff className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}