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
 * Check if file is a PDF
 */
export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

/**
 * Read file as data URL
 */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Optimize image file for upload with progressive quality reduction
 * PDFs are passed through without optimization (server will convert them)
 */
export async function optimizeImage(
  file: File,
  preset: keyof typeof OPTIMIZATION_PRESETS = 'receipt'
): Promise<OptimizedImage> {
  const originalSize = file.size;
  
  // Skip optimization for PDFs - server will convert them to images
  if (isPdfFile(file)) {
    console.log('PDF file detected, skipping client-side optimization');
    const dataUrl = await readFileAsDataUrl(file);
    return {
      file,
      dataUrl,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 0
    };
  }
  
  const options = OPTIMIZATION_PRESETS[preset];
  
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
    const dataUrl = await readFileAsDataUrl(file);
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
 * Validate image or PDF file type and size before processing
 */
export function validateImageFile(file: File): { isValid: boolean; error?: string } {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
  const maxSize = 50 * 1024 * 1024; // 50MB limit
  
  // Also check file extension for PDFs (some systems may not set correct MIME type)
  const isPdf = file.name.toLowerCase().endsWith('.pdf');
  
  if (!validTypes.includes(file.type) && !isPdf) {
    return {
      isValid: false,
      error: 'Please select a valid file (JPEG, PNG, WebP, or PDF)'
    };
  }
  
  if (file.size > maxSize) {
    return {
      isValid: false,
      error: 'File is too large. Please select a file smaller than 50MB'
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