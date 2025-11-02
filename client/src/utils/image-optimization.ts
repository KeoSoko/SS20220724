import imageCompression from 'browser-image-compression';

export interface ImageOptimizationOptions {
  maxSizeMB: number;
  maxWidthOrHeight: number;
  useWebWorker: boolean;
  quality: number;
}

export interface OptimizedImage {
  file: File;
  dataUrl: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

// Default optimization settings for different use cases
export const OPTIMIZATION_PRESETS = {
  receipt: {
    maxSizeMB: 2,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
    quality: 0.8
  },
  profile: {
    maxSizeMB: 0.5,
    maxWidthOrHeight: 400,
    useWebWorker: false, // Disable web workers for mobile compatibility
    quality: 0.9
  },
  thumbnail: {
    maxSizeMB: 0.1,
    maxWidthOrHeight: 200,
    useWebWorker: true,
    quality: 0.7
  }
} as const;

/**
 * Optimize image file for upload with progressive quality reduction
 */
export async function optimizeImage(
  file: File,
  preset: keyof typeof OPTIMIZATION_PRESETS = 'receipt'
): Promise<OptimizedImage> {
  const options = OPTIMIZATION_PRESETS[preset];
  const originalSize = file.size;
  
  try {
    // First attempt with standard settings
    let compressedFile = await imageCompression(file, options);
    
    // If still too large, reduce quality progressively
    if (compressedFile.size > options.maxSizeMB * 1024 * 1024) {
      const aggressiveOptions = {
        ...options,
        quality: Math.max(0.5, options.quality - 0.2),
        maxWidthOrHeight: Math.floor(options.maxWidthOrHeight * 0.8)
      };
      compressedFile = await imageCompression(file, aggressiveOptions);
    }
    
    // Generate data URL for preview
    const dataUrl = await imageCompression.getDataUrlFromFile(compressedFile);
    
    return {
      file: compressedFile,
      dataUrl,
      originalSize,
      compressedSize: compressedFile.size,
      compressionRatio: Math.round((1 - compressedFile.size / originalSize) * 100)
    };
  } catch (error) {
    console.error('Image optimization failed:', error);
    // Fallback: return original file with data URL
    const dataUrl = await imageCompression.getDataUrlFromFile(file);
    return {
      file,
      dataUrl,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 0
    };
  }
}

/**
 * Validate image file type and size before processing
 */
export function validateImageFile(file: File): { isValid: boolean; error?: string } {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const maxSize = 40 * 1024 * 1024; // 40MB limit
  
  if (!validTypes.includes(file.type)) {
    return {
      isValid: false,
      error: 'Please select a valid image file (JPEG, PNG, or WebP)'
    };
  }
  
  if (file.size > maxSize) {
    return {
      isValid: false,
      error: 'Image file is too large. Please select a file smaller than 40MB'
    };
  }
  
  return { isValid: true };
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}