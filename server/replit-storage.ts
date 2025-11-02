import * as fs from 'fs/promises';
import * as path from 'path';
import { log } from './vite';
import { azureStorage } from './azure-storage';

// Storage configuration
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'receipts');
const PROFILE_PICS_DIR = path.join(process.cwd(), 'uploads', 'profiles');
const MAX_STORAGE_GB = 15; // Threshold for Azure fallback (75% of 20GB limit)
const STORAGE_MONITOR_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

export interface StorageMetrics {
  totalSizeBytes: number;
  totalSizeGB: number;
  fileCount: number;
  utilizationPercent: number;
  shouldFallbackToAzure: boolean;
  lastChecked: Date;
}

export class ReplitStorageService {
  private initialized = false;
  private storageMetrics: StorageMetrics | null = null;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startStorageMonitoring();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure upload directories exist
      await fs.mkdir(UPLOADS_DIR, { recursive: true });
      await fs.mkdir(PROFILE_PICS_DIR, { recursive: true });
      
      // Initial storage metrics calculation
      await this.updateStorageMetrics();
      
      this.initialized = true;
      log('Replit storage service initialized successfully', 'storage');
    } catch (error) {
      log(`Error initializing Replit storage: ${error}`, 'storage');
      throw error;
    }
  }

  /**
   * Upload receipt image to local storage
   * @param base64Data Base64 encoded image data
   * @param originalFileName Original filename
   * @returns Local file path and URL
   */
  async uploadReceiptImage(base64Data: string, originalFileName: string): Promise<{
    localPath: string;
    publicUrl: string;
    fileName: string;
    usedAzureFallback: boolean;
  }> {
    await this.initialize();

    // Always use Azure storage first (primary storage for production)
    try {
      log('Using Azure storage as primary storage method', 'storage');
      const azureResult = await azureStorage.uploadFile(base64Data, originalFileName);
      return {
        localPath: '', // Not stored locally
        publicUrl: azureResult.blobUrl,
        fileName: azureResult.blobName,
        usedAzureFallback: false // Azure is primary, not fallback
      };
    } catch (azureError) {
      log(`Azure storage failed, falling back to local storage: ${azureError}`, 'storage');
      // Continue to local storage as true fallback
    }

    try {
      // Generate unique filename
      const fileExtension = originalFileName.split('.').pop() || 'jpg';
      const fileName = `receipt_${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExtension}`;
      const localPath = path.join(UPLOADS_DIR, fileName);

      // Remove data URL prefix and convert to buffer
      const base64 = base64Data.split(';base64,').pop() || '';
      const buffer = Buffer.from(base64, 'base64');

      // Write file to local storage
      await fs.writeFile(localPath, buffer);

      // Generate public URL for serving
      const publicUrl = `/uploads/receipts/${fileName}`;

      // Update storage metrics
      await this.updateStorageMetrics();

      log(`Receipt image saved locally: ${fileName} (${buffer.length} bytes)`, 'storage');

      return {
        localPath,
        publicUrl,
        fileName,
        usedAzureFallback: false
      };
    } catch (error) {
      log(`Error saving receipt to local storage: ${error}`, 'storage');
      // Fallback to Azure on local storage failure
      log('Falling back to Azure storage due to local storage error', 'storage');
      const azureResult = await azureStorage.uploadFile(base64Data, originalFileName);
      return {
        localPath: '',
        publicUrl: azureResult.blobUrl,
        fileName: azureResult.blobName,
        usedAzureFallback: true
      };
    }
  }

  /**
   * Upload profile picture to local storage
   * @param base64Data Base64 encoded image data
   * @param userId User ID for filename
   * @returns Local file path and URL
   */
  async uploadProfilePicture(base64Data: string, userId: number): Promise<{
    localPath: string;
    publicUrl: string;
    fileName: string;
    usedAzureFallback: boolean;
  }> {
    await this.initialize();

    // Check if we should use Azure fallback
    const metrics = await this.getStorageMetrics();
    if (metrics.shouldFallbackToAzure) {
      log('Storage capacity threshold reached, using Azure fallback for profile picture', 'storage');
      const timestamp = Date.now();
      const fileName = `profile_${userId}_${timestamp}.jpg`;
      const azureResult = await azureStorage.uploadFile(base64Data, fileName);
      return {
        localPath: '',
        publicUrl: azureResult.blobUrl,
        fileName: azureResult.blobName,
        usedAzureFallback: true
      };
    }

    try {
      // Generate filename for profile picture
      const timestamp = Date.now();
      const fileName = `profile_${userId}_${timestamp}.jpg`;
      const localPath = path.join(PROFILE_PICS_DIR, fileName);

      // Remove data URL prefix and convert to buffer
      const base64 = base64Data.split(';base64,').pop() || '';
      const buffer = Buffer.from(base64, 'base64');

      // Write file to local storage
      await fs.writeFile(localPath, buffer);

      // Generate public URL for serving
      const publicUrl = `/uploads/profiles/${fileName}`;

      // Update storage metrics
      await this.updateStorageMetrics();

      log(`Profile picture saved locally: ${fileName} (${buffer.length} bytes)`, 'storage');

      return {
        localPath,
        publicUrl,
        fileName,
        usedAzureFallback: false
      };
    } catch (error) {
      log(`Error saving profile picture to local storage: ${error}`, 'storage');
      // Fallback to Azure on local storage failure
      const timestamp = Date.now();
      const fileName = `profile_${userId}_${timestamp}.jpg`;
      const azureResult = await azureStorage.uploadFile(base64Data, fileName);
      return {
        localPath: '',
        publicUrl: azureResult.blobUrl,
        fileName: azureResult.blobName,
        usedAzureFallback: true
      };
    }
  }

  /**
   * Delete a file from local storage
   * @param fileName File name to delete
   * @param isProfilePic Whether it's a profile picture (different directory)
   */
  async deleteFile(fileName: string, isProfilePic = false): Promise<void> {
    try {
      const directory = isProfilePic ? PROFILE_PICS_DIR : UPLOADS_DIR;
      const filePath = path.join(directory, fileName);
      
      await fs.unlink(filePath);
      
      // Update storage metrics after deletion
      await this.updateStorageMetrics();
      
      log(`File deleted from local storage: ${fileName}`, 'storage');
    } catch (error) {
      log(`Error deleting file from local storage: ${error}`, 'storage');
      // Don't throw error for file deletion failures
    }
  }

  /**
   * Calculate and update storage metrics
   */
  async updateStorageMetrics(): Promise<StorageMetrics> {
    try {
      let totalSize = 0;
      let fileCount = 0;

      // Calculate size for receipts directory
      if (await this.directoryExists(UPLOADS_DIR)) {
        const receiptsStats = await this.calculateDirectorySize(UPLOADS_DIR);
        totalSize += receiptsStats.size;
        fileCount += receiptsStats.count;
      }

      // Calculate size for profiles directory
      if (await this.directoryExists(PROFILE_PICS_DIR)) {
        const profilesStats = await this.calculateDirectorySize(PROFILE_PICS_DIR);
        totalSize += profilesStats.size;
        fileCount += profilesStats.count;
      }

      const totalSizeGB = totalSize / (1024 * 1024 * 1024);
      const utilizationPercent = (totalSizeGB / MAX_STORAGE_GB) * 100;
      const shouldFallbackToAzure = totalSizeGB >= MAX_STORAGE_GB;

      this.storageMetrics = {
        totalSizeBytes: totalSize,
        totalSizeGB: parseFloat(totalSizeGB.toFixed(3)),
        fileCount,
        utilizationPercent: parseFloat(utilizationPercent.toFixed(2)),
        shouldFallbackToAzure,
        lastChecked: new Date()
      };

      log(`Storage metrics updated: ${totalSizeGB.toFixed(3)}GB used (${utilizationPercent.toFixed(2)}%), ${fileCount} files`, 'storage');

      if (shouldFallbackToAzure) {
        log(`WARNING: Storage threshold exceeded! Using Azure fallback for new uploads.`, 'storage');
      }

      return this.storageMetrics;
    } catch (error) {
      log(`Error updating storage metrics: ${error}`, 'storage');
      // Return default metrics on error
      return {
        totalSizeBytes: 0,
        totalSizeGB: 0,
        fileCount: 0,
        utilizationPercent: 0,
        shouldFallbackToAzure: false,
        lastChecked: new Date()
      };
    }
  }

  /**
   * Get current storage metrics
   */
  async getStorageMetrics(): Promise<StorageMetrics> {
    if (!this.storageMetrics) {
      return await this.updateStorageMetrics();
    }
    return this.storageMetrics;
  }

  /**
   * Start periodic storage monitoring
   */
  private startStorageMonitoring(): void {
    // Initial check on startup
    setTimeout(() => this.updateStorageMetrics(), 5000);

    // Periodic monitoring
    this.monitoringInterval = setInterval(async () => {
      await this.updateStorageMetrics();
    }, STORAGE_MONITOR_INTERVAL);

    log('Storage monitoring started - checking every 24 hours', 'storage');
  }

  /**
   * Stop storage monitoring (for cleanup)
   */
  stopStorageMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      log('Storage monitoring stopped', 'storage');
    }
  }

  /**
   * Calculate total size and file count for a directory
   */
  private async calculateDirectorySize(dirPath: string): Promise<{ size: number; count: number }> {
    let totalSize = 0;
    let fileCount = 0;

    try {
      const files = await fs.readdir(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.stat(filePath);
        
        if (stats.isFile()) {
          totalSize += stats.size;
          fileCount++;
        }
      }
    } catch (error) {
      log(`Error calculating directory size for ${dirPath}: ${error}`, 'storage');
    }

    return { size: totalSize, count: fileCount };
  }

  /**
   * Check if directory exists
   */
  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
}

export const replitStorage = new ReplitStorageService();