import { BlobServiceClient, ContainerClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from "@azure/storage-blob";
import { log } from "./vite";

// Container name for receipts
const CONTAINER_NAME = "receipt-images";

export class AzureBlobStorage {
  private blobServiceClient: BlobServiceClient;
  private containerClient: ContainerClient;
  private sharedKeyCredential: StorageSharedKeyCredential | null = null;
  private accountName: string = '';
  private initialized: boolean = false;

  constructor() {
    // Try connection string first, then fall back to account name/key
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    // Prioritize slipsstor1 credentials if available
    const accountName = process.env.SLIPSSTOR1_STORAGE_ACCOUNT_NAME || process.env.AZURE_STORAGE_ACCOUNT_NAME;
    const accountKey = process.env.SLIPSSTOR1_STORAGE_ACCOUNT_KEY || process.env.AZURE_STORAGE_ACCOUNT_KEY;
    
    if (connectionString) {
      // Use connection string if available
      try {
        const accountNameMatch = connectionString.match(/AccountName=([^;]+)/i);
        if (accountNameMatch && accountNameMatch[1]) {
          this.accountName = accountNameMatch[1];
        }
        
        const accountKeyMatch = connectionString.match(/AccountKey=([^;]+)/i);
        if (accountKeyMatch && accountKeyMatch[1] && this.accountName) {
          this.sharedKeyCredential = new StorageSharedKeyCredential(
            this.accountName,
            accountKeyMatch[1]
          );
        }
      } catch (error) {
        log(`Warning: Unable to extract credentials for SAS generation: ${error}`, "azure");
      }
      
      this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    } else if (accountName && accountKey) {
      // Use account name and key directly
      this.accountName = accountName;
      this.sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
      
      const credential = this.sharedKeyCredential;
      this.blobServiceClient = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net`,
        credential
      );
      
      log(`Initialized Azure Storage with account: ${accountName}`, "azure");
      log(`Azure Storage URL will be: https://${accountName}.blob.core.windows.net`, "azure");
    } else {
      throw new Error("Azure Storage credentials not found. Please provide either AZURE_STORAGE_CONNECTION_STRING or both AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY");
    }
    
    this.containerClient = this.blobServiceClient.getContainerClient(CONTAINER_NAME);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Create the container if it doesn't exist
      if (!(await this.containerClient.exists())) {
        log(`Creating container "${CONTAINER_NAME}"...`, "azure");
        // Create with private access by default - safer for production
        await this.containerClient.create();
        log(`Container "${CONTAINER_NAME}" created successfully`, "azure");
      }
      this.initialized = true;
    } catch (error) {
      log(`Error initializing Azure Blob Storage: ${error}`, "azure");
      throw error;
    }
  }

  /**
   * Upload a file to Azure Blob Storage
   * @param base64Data Base64 encoded file data (with data URL prefix)
   * @param fileName Original file name
   * @returns Promise with the blob URL and blob name
   */
  async uploadFile(base64Data: string, fileName: string): Promise<{ blobUrl: string, blobName: string }> {
    await this.initialize();
    
    try {
      // Validate file type from base64 data URL
      const mimeTypeMatch = base64Data.match(/^data:([^;]+);base64,/);
      if (!mimeTypeMatch) {
        throw new Error('Invalid file format - must be a valid image');
      }
      
      const mimeType = mimeTypeMatch[1];
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
      
      if (!allowedTypes.includes(mimeType)) {
        throw new Error(`File type ${mimeType} not allowed. Must be one of: ${allowedTypes.join(', ')}`);
      }
      
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 15);
      
      let fileExtension = fileName.split('.').pop() || 'jpg';
      if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
        fileExtension = 'jpg';
      } else if (mimeType === 'image/png') {
        fileExtension = 'png';
      } else if (mimeType === 'image/webp') {
        fileExtension = 'webp';
      } else if (mimeType === 'application/pdf') {
        fileExtension = 'pdf';
      }
      
      const blobName = `receipt_${timestamp}_${randomString}.${fileExtension}`;
      
      // Convert base64 to buffer
      const base64 = base64Data.split(';base64,').pop() || '';
      const buffer = Buffer.from(base64, 'base64');
      
      // Validate file size (max 40MB)
      const maxSize = 40 * 1024 * 1024; // 40MB
      if (buffer.length > maxSize) {
        throw new Error('File size exceeds 40MB limit');
      }
      
      // Upload blob with proper content type and cache headers
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.upload(buffer, buffer.length, {
        blobHTTPHeaders: {
          blobContentType: mimeType,
          blobCacheControl: 'public, max-age=31536000' // 1 year cache
        }
      });
      
      // Generate long-lived SAS URL (1 year expiry like Python version)
      let blobUrl = blockBlobClient.url;
      const sasUrl = await this.generateSasUrl(blobName, 24 * 365); // 1 year
      
      if (sasUrl) {
        blobUrl = sasUrl;
        log(`Generated long-lived SAS URL for blob "${blobName}"`, "azure");
      } else {
        log(`WARNING: Using non-SAS URL for blob "${blobName}". This might not be accessible.`, "azure");
      }
      
      log(`Uploaded blob "${blobName}" successfully (${mimeType}, ${buffer.length} bytes)`, "azure");
      
      return { blobUrl, blobName };
    } catch (error) {
      log(`Error uploading to Azure Blob Storage: ${error}`, "azure");
      throw error;
    }
  }

  /**
   * Delete a blob from Azure Blob Storage
   * @param blobName The name of the blob to delete
   */
  async deleteFile(blobName: string): Promise<void> {
    await this.initialize();
    
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.delete();
      log(`Deleted blob "${blobName}" successfully`, "azure");
    } catch (error) {
      log(`Error deleting from Azure Blob Storage: ${error}`, "azure");
      throw error;
    }
  }
  
  /**
   * Generate a SAS URL for a private blob that allows read access for a limited time
   * @param blobName Name of the blob
   * @param expiryHours Number of hours until the SAS token expires
   * @returns URL with SAS token for read access
   */
  async generateSasUrl(blobName: string, expiryHours: number = 24): Promise<string | null> {
    try {
      if (!this.sharedKeyCredential || !this.accountName) {
        log(`Unable to generate SAS URL: Missing credentials. accountName=${this.accountName}, hasCredential=${!!this.sharedKeyCredential}`, "azure");
        return null;
      }
      
      log(`Generating SAS URL for blob: ${blobName} with account: ${this.accountName}`, "azure");
      
      // Check if blob exists and handle archived blobs
      try {
        const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
        const exists = await blockBlobClient.exists();
        if (!exists) {
          log(`Blob does not exist: ${blobName}`, "azure");
          return null;
        }
        
        // Check blob properties to see if it's archived
        const properties = await blockBlobClient.getProperties();
        log(`Blob exists, access tier: ${properties.accessTier}, archive status: ${properties.archiveStatus}`, "azure");
        
        if (properties.accessTier === 'Archive') {
          log(`Blob is archived, initiating rehydration: ${blobName}`, "azure");
          
          // Rehydrate blob to Hot tier for immediate access
          await blockBlobClient.setAccessTier('Hot');
          log(`Initiated rehydration for blob: ${blobName}`, "azure");
          
          // Note: Rehydration can take time, but we'll still generate the SAS URL
          // The blob will be accessible once rehydration completes
        }
        
        log(`Blob exists, proceeding with SAS URL generation: ${blobName}`, "azure");
      } catch (existsError) {
        log(`Error checking blob existence: ${existsError}`, "azure");
        return null;
      }
      
      // Set SAS expiry time
      const expiryTime = new Date();
      expiryTime.setHours(expiryTime.getHours() + expiryHours);
      
      // Create SAS token with read permission
      const sasOptions = {
        containerName: CONTAINER_NAME,
        blobName: blobName,
        permissions: BlobSASPermissions.parse("r"), // Read-only permission
        expiresOn: expiryTime,
      };
      
      const sasToken = generateBlobSASQueryParameters(
        sasOptions,
        this.sharedKeyCredential
      ).toString();
      
      // Build the correct blob URL with the current account name
      const blobUrl = `https://${this.accountName}.blob.core.windows.net/${CONTAINER_NAME}/${blobName}`;
      const sasUrl = `${blobUrl}?${sasToken}`;
      
      log(`Generated SAS URL: ${sasUrl.substring(0, 100)}...`, "azure");
      log(`Successfully generated SAS URL for blob: ${blobName}`, "azure");
      
      return sasUrl;
    } catch (error) {
      log(`Error generating SAS URL: ${error}`, "azure");
      return null;
    }
  }
}

// Export a singleton instance
export const azureStorage = new AzureBlobStorage();