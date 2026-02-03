import sharp from 'sharp';
import { log } from './vite';

export class ImagePreprocessor {
  /**
   * Enhance image quality before OCR processing
   * Applies auto-rotate, contrast adjustment, sharpening, and noise reduction
   * @param base64Data Base64 encoded image data with data URL prefix
   * @returns Enhanced base64 image data
   */
  async enhanceImage(base64Data: string): Promise<string> {
    try {
      log('Starting image pre-processing...', 'image');
      
      // Extract base64 content and detect format
      const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) {
        throw new Error('Invalid base64 image data');
      }
      
      const [, format, base64Content] = matches;
      const buffer = Buffer.from(base64Content, 'base64');
      
      log(`Original image size: ${(buffer.length / 1024).toFixed(2)} KB`, 'image');
      
      // Process image with Sharp
      const processedBuffer = await sharp(buffer)
        // Auto-rotate based on EXIF orientation
        .rotate()
        // Normalize image (auto-level colors)
        .normalize()
        // Enhance contrast
        .linear(1.2, -(128 * 1.2) + 128)
        // Sharpen for better text recognition
        .sharpen(1)
        // Reduce noise while preserving edges
        .median(3)
        // Ensure image is not too large for OCR
        .resize({
          width: 2000,
          height: 2000,
          fit: 'inside',
          withoutEnlargement: true
        })
        // Convert to PNG for lossless quality
        .png({
          quality: 95,
          compressionLevel: 6
        })
        .toBuffer();
      
      log(`Processed image size: ${(processedBuffer.length / 1024).toFixed(2)} KB`, 'image');
      
      // Convert back to base64 with data URL prefix
      const processedBase64 = processedBuffer.toString('base64');
      const result = `data:image/png;base64,${processedBase64}`;
      
      log('Image pre-processing complete', 'image');
      return result;
      
    } catch (error) {
      log(`Image pre-processing failed: ${error}. Using original image.`, 'image');
      // Return original image if preprocessing fails
      return base64Data;
    }
  }
  
  /**
   * Quick validation to check if image enhancement is needed
   * @param base64Data Base64 encoded image data
   * @returns Whether enhancement is recommended
   */
  async shouldEnhance(base64Data: string): Promise<boolean> {
    try {
      const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) return false;
      
      const [, , base64Content] = matches;
      const buffer = Buffer.from(base64Content, 'base64');
      
      // Get image metadata
      const metadata = await sharp(buffer).metadata();
      
      // Enhance if:
      // - Image is very large (>3MB)
      // - Image is very small (<100KB)
      // - Image has rotation metadata
      const sizeKB = buffer.length / 1024;
      const needsEnhancement = 
        sizeKB > 3000 || 
        sizeKB < 100 || 
        (metadata.orientation !== undefined && metadata.orientation !== 1);
      
      return needsEnhancement;
      
    } catch (error) {
      // If we can't analyze, err on the side of enhancing
      return true;
    }
  }
}

export const imagePreprocessor = new ImagePreprocessor();
