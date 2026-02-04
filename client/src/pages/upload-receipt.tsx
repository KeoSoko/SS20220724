import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { AlertCircle, Camera, CheckCircle2, Loader2, Upload, FileImage, Plus, Settings, Copy } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";
import { EXPENSE_CATEGORIES, ExpenseCategory } from "@shared/schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { BackButton } from "@/components/back-button";
import { EnhancedCamera } from "@/components/enhanced-camera";
import { CameraPermissionPrompt } from "@/components/camera-permission-prompt";
import { UploadErrorBoundary } from "@/components/ui/error-boundaries";
import { optimizeImage, validateImageFile, formatFileSize } from "@/utils/image-optimization";
import { ProgressiveImage } from "@/components/ui/progressive-image";
import imageCompression from "browser-image-compression";
import { 
  EnhancedButton,
  SpacingContainer,
  EnhancedEmptyState
} from "@/components/ui/enhanced-components";
import { UnifiedSmartSearch } from "@/components/ui/unified-smart-search";
import { motion } from "framer-motion";
import { RecurringExpenseDetector } from "@/components/recurring-expense-detector";

// Format currency for South African Rands
const formatCurrency = (amount: string | number) => {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return 'R ' + numAmount.toFixed(2);
};

export default function UploadReceipt() {
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { isOnline, addPendingUpload } = useOfflineSync();
  const clientUploadIdRef = useRef<string>(crypto.randomUUID());
  
  // Scanning states
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<string>("");
  const [progressValue, setProgressValue] = useState(0);
  
  // Multi-scan session tracking
  const [sessionReceiptCount, setSessionReceiptCount] = useState(0);
  const [continuousMode, setContinuousMode] = useState(false);
  
  // Batch gallery import
  interface BatchFile {
    id: string;
    file: File;
    name: string;
    status: 'pending' | 'processing' | 'completed' | 'error';
    error?: string;
  }
  const [batchMode, setBatchMode] = useState(false);
  const [batchQueue, setBatchQueue] = useState<BatchFile[]>([]);
  const [batchProcessingIndex, setBatchProcessingIndex] = useState(-1);
  
  // Form data states
  const [imageData, setImageData] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("");
  const [date, setDate] = useState("");
  const [total, setTotal] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [customCategoryName, setCustomCategoryName] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Array<{name: string, price: string}>>([]);
  const [confidenceScore, setConfidenceScore] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState(false);
  const [showCameraPermission, setShowCameraPermission] = useState(false);
  const [newReceiptId, setNewReceiptId] = useState<number | null>(null);
  
  // Additional receipt properties for better UX
  const [isRecurring, setIsRecurring] = useState(false);
  const [isTaxDeductible, setIsTaxDeductible] = useState(false);
  
  // PDF processing state - PDFs can't be previewed until converted on server
  const [isPdfProcessing, setIsPdfProcessing] = useState(false);

  // Duplicate detection states
  interface DuplicateReceipt {
    id: number;
    storeName: string;
    date: string;
    total: string;
    category: string;
  }
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateReceipts, setDuplicateReceipts] = useState<DuplicateReceipt[]>([]);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const [pendingContinuousMode, setPendingContinuousMode] = useState(false);
  const [allowDuplicateSave, setAllowDuplicateSave] = useState(false);

  // Session storage key for preserving form state
  const FORM_STATE_KEY = 'upload_receipt_form_state';

  // Save form state to session storage
  const saveFormState = () => {
    const formState = {
      imageData,
      previewUrl,
      storeName,
      date,
      total,
      category,
      customCategoryName,
      notes,
      items,
      confidenceScore,
      isRecurring,
      isTaxDeductible
    };
    sessionStorage.setItem(FORM_STATE_KEY, JSON.stringify(formState));
  };

  // Restore form state from session storage
  const restoreFormState = () => {
    try {
      const savedState = sessionStorage.getItem(FORM_STATE_KEY);
      if (savedState) {
        const formState = JSON.parse(savedState);
        setImageData(formState.imageData || null);
        setPreviewUrl(formState.previewUrl || null);
        setStoreName(formState.storeName || "");
        setDate(formState.date || "");
        setTotal(formState.total || "");
        setCategory(formState.category || "other");
        const restoredCategory = formState.category || "other";
        const restoredCustomCategory = formState.customCategoryName ||
          (!EXPENSE_CATEGORIES.includes(restoredCategory as ExpenseCategory) ? restoredCategory : null);
        setCustomCategoryName(restoredCustomCategory || null);
        setNotes(formState.notes || "");
        setItems(formState.items || []);
        setConfidenceScore(formState.confidenceScore || null);
        setIsRecurring(formState.isRecurring || false);
        setIsTaxDeductible(formState.isTaxDeductible || false);
        
        // Clear the saved state after restoring
        sessionStorage.removeItem(FORM_STATE_KEY);
        
        toast({
          title: "Form state restored",
          description: "Your receipt data has been preserved from before.",
        });
      }
    } catch (error) {
      console.error('Failed to restore form state:', error);
    }
  };

  // Restore form state on component mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      restoreFormState();
    }
  }, []);

  // Reset form for another scan (used in continuous mode)
  const resetForAnotherScan = () => {
    clientUploadIdRef.current = crypto.randomUUID();
    setImageData(null);
    setPreviewUrl(null);
    setStoreName("");
    setDate("");
    setTotal("");
    setCategory("other");
    setCustomCategoryName(null);
    setNotes("");
    setItems([]);
    setConfidenceScore(null);
    setIsRecurring(false);
    setIsTaxDeductible(false);
    setProgressValue(0);
    setScanProgress("");
    setIsScanning(false);
    setIsPdfProcessing(false);
  };

  // Handle "Save & Scan Another" action
  const handleSaveAndScanAnother = async (e: React.FormEvent) => {
    e.preventDefault();
    checkForDuplicates(true);
  };

  // Handle batch file selection (multiple gallery images)
  const handleBatchFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    // If single file, use normal flow
    if (files.length === 1) {
      handleFileChange(e);
      return;
    }
    
    // Multiple files - enter batch mode
    const newBatchFiles: BatchFile[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const validation = validateImageFile(file);
      
      if (validation.isValid) {
        newBatchFiles.push({
          id: `batch-${Date.now()}-${i}`,
          file,
          name: file.name,
          status: 'pending'
        });
      } else {
        toast({
          title: `Invalid file: ${file.name}`,
          description: validation.error,
          variant: "destructive",
        });
      }
    }
    
    if (newBatchFiles.length > 0) {
      setBatchQueue(newBatchFiles);
      setBatchMode(true);
      
      toast({
        title: `${newBatchFiles.length} receipts selected`,
        description: "Tap 'Start Processing' to scan all receipts",
      });
    }
    
    // Reset the input
    e.target.value = '';
  };

  // Process batch queue
  const processBatchQueue = async () => {
    if (batchQueue.length === 0) return;
    
    for (let i = 0; i < batchQueue.length; i++) {
      const batchFile = batchQueue[i];
      setBatchProcessingIndex(i);
      
      // Update status to processing
      setBatchQueue(prev => prev.map((item, idx) => 
        idx === i ? { ...item, status: 'processing' as const } : item
      ));
      
      try {
        // Read file as data URL
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(batchFile.file);
        });
        
        // Optimize image
        const optimizedResult = await optimizeImage(batchFile.file, 'receipt');
        
        // If online, scan the receipt
        if (isOnline) {
          try {
            const res = await apiRequest("POST", "/api/receipts/scan", { 
              imageData: optimizedResult.dataUrl 
            });
            
            if (res.ok) {
              const scanData = await res.json();
              
              // Upload the receipt
              await apiRequest("POST", "/api/receipts", {
                storeName: scanData.storeName || `Receipt ${i + 1}`,
                date: scanData.date ? formatScanDate(scanData.date) : new Date().toISOString().split('T')[0],
                total: scanData.total || "0.00",
                items: Array.isArray(scanData.items) ? scanData.items : [],
                category: scanData.category || "other",
                notes: `Batch imported receipt`,
                confidenceScore: scanData.confidenceScore || null,
                imageData: optimizedResult.dataUrl,
                isRecurring: false,
                isTaxDeductible: false,
              });
              
              // Mark as completed
              setBatchQueue(prev => prev.map((item, idx) => 
                idx === i ? { ...item, status: 'completed' as const } : item
              ));
              
              setSessionReceiptCount(prev => prev + 1);
            } else {
              throw new Error('Scan failed');
            }
          } catch (error) {
            // Scan/upload failed, mark with error
            setBatchQueue(prev => prev.map((item, idx) => 
              idx === i ? { 
                ...item, 
                status: 'error' as const,
                error: error instanceof Error ? error.message : 'Processing failed'
              } : item
            ));
          }
        } else {
          // Offline - add to pending uploads
          addPendingUpload({
            clientUploadId: crypto.randomUUID(),
            storeName: `Pending Receipt ${i + 1}`,
            date: new Date().toISOString().split('T')[0],
            total: "0.00",
            items: [],
            category: "other",
            notes: "Batch imported while offline - needs review",
            confidenceScore: null,
            imageData: optimizedResult.dataUrl,
            isRecurring: false,
            isTaxDeductible: false,
          }, '/api/receipts');
          
          setBatchQueue(prev => prev.map((item, idx) => 
            idx === i ? { ...item, status: 'completed' as const } : item
          ));
          
          setSessionReceiptCount(prev => prev + 1);
        }
      } catch (error) {
        setBatchQueue(prev => prev.map((item, idx) => 
          idx === i ? { 
            ...item, 
            status: 'error' as const,
            error: error instanceof Error ? error.message : 'Processing failed'
          } : item
        ));
      }
    }
    
    setBatchProcessingIndex(-1);
    
    // Invalidate queries
    queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
    
    const completedCount = batchQueue.filter(f => f.status === 'completed').length;
    
    toast({
      title: "Batch processing complete",
      description: `${completedCount} of ${batchQueue.length} receipts saved`,
    });
  };

  // Helper to format scan date
  const formatScanDate = (dateStr: string): string => {
    const dateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;
    const match = dateStr.match(dateRegex);
    
    if (match) {
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      let year = match[3];
      if (year.length === 2) year = '20' + year;
      return `${year}-${month}-${day}`;
    }
    
    const parsedDate = new Date(dateStr);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString().split('T')[0];
    }
    
    return new Date().toISOString().split('T')[0];
  };

  // Cancel batch mode
  const cancelBatchMode = () => {
    setBatchMode(false);
    setBatchQueue([]);
    setBatchProcessingIndex(-1);
  };

  // Query for custom categories
  const { data: customCategories = [] } = useQuery({
    queryKey: ["/api/custom-categories"],
    enabled: !!user, // Only fetch when user is authenticated
  });

  // OCR scanning mutation
  const scanMutation = useMutation({
    mutationFn: async (imageData: string) => {
      // Check if offline first - skip scanning entirely
      if (!isOnline) {
        setScanProgress("📱 You're offline - please fill in receipt details manually");
        setProgressValue(0);
        setIsScanning(false);
        
        toast({
          title: "📱 Offline mode",
          description: "You're offline - please fill in receipt details manually. The receipt will be saved when you're back online.",
          variant: "default",
          duration: 6000,
        });
        
        // Return early without trying to scan
        return { offline: true };
      }
      
      // Start with progressive updates
      setScanProgress("🔍 Scanning your receipt...");
      setProgressValue(25);
      
      // Create a timeout that updates progress gradually while we wait for Azure
      const startTime = Date.now();
      const progressInterval = setInterval(() => {
        const elapsedTime = Date.now() - startTime;
        // Calculate a progressive increment (max 45% more progress over 30 seconds)
        if (elapsedTime < 30000) {
          const additionalProgress = Math.min(45, Math.floor(elapsedTime / 30000 * 45));
          setProgressValue(25 + additionalProgress);
          
          // Update the message periodically to show activity
          if (elapsedTime > 20000) {
            setScanProgress("📄 Almost done reading your receipt...");
          } else if (elapsedTime > 15000) {
            setScanProgress("💡 Extracting purchase details...");
          } else if (elapsedTime > 10000) {
            setScanProgress("🤖 AI is analyzing your receipt...");
          } else if (elapsedTime > 5000) {
            setScanProgress("🔍 Processing receipt image...");
          }
        }
      }, 1000);
      
      try {
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Scanning timed out - please enter details manually'));
          }, 30000); // 30 second timeout
        });
        
        // Race between API call and timeout
        const apiPromise = apiRequest("POST", "/api/receipts/scan", { imageData });
        const res = await Promise.race([apiPromise, timeoutPromise]) as Response;
        
        // Check if the response is not OK (handles various error status codes)
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          
          // Use the server's error message if available, otherwise create a generic one
          const errorMessage = errorData.message || errorData.error || "Connection to OCR failed. Please enter receipt details manually.";
          
          // Clean up interval and throw with server's error message
          clearInterval(progressInterval);
          throw new Error(errorMessage);
        }
        
        const data = await res.json();
        
        // Clear the interval and set progress to 70%
        clearInterval(progressInterval);
        setProgressValue(70);
        setScanProgress("✅ Receipt successfully scanned!");
        
        return data;
      } catch (error) {
        // Clean up interval if there's an error
        clearInterval(progressInterval);
        throw error;
      }
    },
    onSuccess: (data) => {
      // Increment progress to show we're processing the results
      setProgressValue(75);
      setScanProgress("📋 Organizing your receipt data...");
      
      // Update imageData if scan returned converted image (e.g., PDF → JPEG conversion)
      if (data.imageData?.startsWith('data:image/')) {
        setImageData(data.imageData);
        setPreviewUrl(data.imageData);
        setIsPdfProcessing(false); // Clear PDF processing state once we have the image
      }
      
      // Populate the form with the OCR results
      setStoreName(data.storeName || "");
      
      // Handle date format from OCR properly
      try {
        if (data.date) {
          setProgressValue(80);
          setScanProgress("📅 Processing receipt date...");
          // SA date format comes as DD/MM/YY but input[type="date"] needs YYYY-MM-DD
          // Check if the date is in DD/MM/YY or DD/MM/YYYY format
          const dateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;
          const match = data.date.match(dateRegex);
          
          if (match) {
            // Extract components from DD/MM/YY format
            const day = match[1].padStart(2, '0');
            const month = match[2].padStart(2, '0');
            let year = match[3];
            
            // Handle 2-digit year
            if (year.length === 2) {
              // If year is 2 digits, assume 20xx for modern dates
              year = '20' + year;
            }
            
            // Convert to YYYY-MM-DD format for the input field
            const formattedDate = `${year}-${month}-${day}`;
            setDate(formattedDate);
          } else {
            // Try general parsing if not in the DD/MM/YY format
            const parsedDate = new Date(data.date);
            if (!isNaN(parsedDate.getTime())) {
              // Format date as YYYY-MM-DD for the date input
              const formattedDate = parsedDate.toISOString().split('T')[0];
              setDate(formattedDate);
            } else {
              // If we can't parse it at all, default to today
              setDate(new Date().toISOString().split('T')[0]);
            }
          }
        } else {
          // Default to today if no date was provided
          setDate(new Date().toISOString().split('T')[0]);
        }
      } catch (error) {
        // Fallback to today's date if there's any error
        console.error("Error parsing date:", error);
        setDate(new Date().toISOString().split('T')[0]);
      }
      
      setProgressValue(85);
      setScanProgress("Setting receipt details...");
      
      setTotal(data.total || "0.00");
      
      // Ensure items is an array
      const items = Array.isArray(data.items) ? data.items : [];
      setItems(items);
      
      setConfidenceScore(data.confidenceScore || null);
      
      setProgressValue(90);
      setScanProgress("🏷️ Using AI-suggested category...");
      
      // Use AI-suggested category from the scan response
      if (data.category && data.category !== 'other') {
        setCategory(data.category as ExpenseCategory);
        setCustomCategoryName(null);
      } else {
        // Only use fallback categorization if AI didn't provide a category
        const lowerStoreName = data.storeName.toLowerCase();
        const itemNames = items.map((item: {name: string, price: string}) => item.name.toLowerCase()).join(' ');
        const combined = `${lowerStoreName} ${itemNames}`;
        
        // Category keyword mapping as fallback
        const categoryRules: Record<string, string[]> = {
          dining: ['restaurant', 'cafe', 'bar', 'bistro', 'eatery', 'dining', 'food court', 'pizzeria'],
          groceries: ['market', 'grocery', 'supermarket', 'food', 'fresh', 'produce', 'bakery'],
          transportation: ['gas', 'uber', 'lyft', 'taxi', 'transport', 'fuel', 'petrol', 'station'],
          entertainment: ['cinema', 'movie', 'theater', 'game', 'park', 'entertainment'],
          shopping: ['mall', 'store', 'retail', 'shop', 'boutique', 'clothing', 'fashion'],
          healthcare: ['pharmacy', 'medical', 'doctor', 'clinic', 'hospital', 'health'],
          utilities: ['electric', 'water', 'utility', 'power', 'energy', 'internet', 'phone'],
          office_supplies: ['office', 'stationary', 'supplies', 'print', 'paper']
        };
        
        // Find matching category as fallback
        let matchedCategory = 'other';
        let highestMatchCount = 0;
        
        for (const [category, keywords] of Object.entries(categoryRules)) {
          const matchCount = keywords.filter((keyword: string) => combined.includes(keyword)).length;
          if (matchCount > highestMatchCount) {
            highestMatchCount = matchCount;
            matchedCategory = category;
          }
        }
        
        setCategory(matchedCategory as ExpenseCategory);
        setCustomCategoryName(null);
      }
      
      // Complete the process
      setProgressValue(95);
      
      setTimeout(() => {
        setProgressValue(100);
        setScanProgress("🎉 Receipt ready for review!");
        setIsScanning(false);
      }, 500);
    },
    onError: (error: Error) => {
      setIsScanning(false);
      setScanProgress("");
      setProgressValue(0);
      
      console.error("OCR scanning error:", error);
      
      // Check if this is a subscription/trial expiration error FIRST
      if (
        error.message.includes('Active subscription required') ||
        error.message.includes('trial has ended') ||
        error.message.includes('Please subscribe to continue') ||
        (error.message.includes('403') && error.message.includes('subscription'))
      ) {
        toast({
          title: "🔒 Trial has ended",
          description: "Your free trial has expired. Subscribe to continue scanning receipts.",
          variant: "destructive",
          action: (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setLocation('/subscription')}
              className="bg-white text-gray-900 hover:bg-gray-50 hover:text-gray-900 border-gray-300"
            >
              Upgrade Now
            </Button>
          ),
          duration: 8000, // Show longer for important message
        });
        
        // Don't allow manual entry for subscription errors - redirect to subscription page
        setTimeout(() => {
          setLocation('/subscription');
        }, 3000);
        
        return;
      }
      
      // Handle specific Azure OCR connection errors
      if (error.message.includes("invalid subscription key") || 
          error.message.includes("Access denied") ||
          error.message.includes("API endpoint") ||
          error.message.includes("service unavailable") ||
          error.message.includes("Connection failed") ||
          error.message.includes("Network Error") ||
          error.message.includes("Failed to fetch")) {
        
        console.error("Azure OCR connection failed:", error.message);
        
        // If offline, show appropriate message
        if (!isOnline) {
          toast({
            title: "📱 Scanning offline",
            description: "You're offline - please fill in receipt details manually. The receipt will be saved when you're back online.",
            variant: "default",
            duration: 6000,
          });
        } else {
          // Show the specific UX message you requested
          toast({
            title: "Connection to OCR failed",
            description: "Connection to OCR failed. Please enter receipt details manually.",
            variant: "destructive",
            duration: 6000, // Show longer for important message
          });
        }
        
        // Keep the form in editing mode so user can enter details manually
        // Don't redirect, let them fill out the form
        return;
      }
      
      // Handle timeout errors
      if (error.message.includes("timed out") || error.message.includes("timeout")) {
        toast({
          title: "Scanning took too long",
          description: "Receipt processing timed out. Please enter receipt details manually.",
          variant: "destructive",
          duration: 6000,
        });
        return;
      }
      
      // Handle image quality issues
      if (error.message.includes("No receipt data found") || error.message.includes("Receipt data not detected")) {
        toast({
          title: "Receipt not detected",
          description: "Could not detect receipt data in your image. Please enter receipt details manually.",
          variant: "destructive",
          duration: 6000,
        });
        return;
      }
      
      // Generic fallback error
      toast({
        title: "Scanning failed",
        description: "Unable to scan receipt automatically. Please enter receipt details manually.",
        variant: "destructive",
        duration: 6000,
      });
    },
  });

  // Upload receipt mutation
  const getNormalizedReceiptValues = () => {
    const isPredefinedCategory = EXPENSE_CATEGORIES.includes(category as ExpenseCategory);
    const customCategoryLabel = customCategoryName?.trim()
      || (!isPredefinedCategory && category.trim() ? category.trim() : null);
    const cleanedNotes = notes ? notes.replace(/\[Custom Category: .*?\]\s*/i, "").trim() : "";
    const normalizedNotes = customCategoryLabel
      ? (() => {
          const prefix = `[Custom Category: ${customCategoryLabel}]`;
          return cleanedNotes ? `${prefix} ${cleanedNotes}` : prefix;
        })()
      : (cleanedNotes || null);
    const normalizedCategory = isPredefinedCategory ? category : "other";

    return { normalizedCategory, normalizedNotes };
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!imageData) {
        throw new Error("No image data available");
      }
      const { normalizedCategory, normalizedNotes } = getNormalizedReceiptValues();
      const clientUploadId = clientUploadIdRef.current;
      
      // Always save offline first to prevent hanging
      console.log("[Upload] Save attempt - isOnline:", isOnline, "navigator.onLine:", navigator.onLine);
      
      // Prepare receipt data
      const receiptData = {
        clientUploadId,
        storeName,
        date,
        total,
        items: Array.isArray(items) ? items : [],
        category: normalizedCategory,
        notes: normalizedNotes,
        confidenceScore: confidenceScore || null,
        imageData,
        isRecurring,
        isTaxDeductible,
        allowDuplicate: allowDuplicateSave,
      };
      
      // If offline, use the offline sync system
      if (!isOnline) {
        // Use the proper offline sync method
        addPendingUpload(receiptData, '/api/receipts');
        
        toast({
          title: "📱 Receipt saved offline",
          description: "Your receipt is saved and will sync when you're back online.",
          variant: "default",
          duration: 4000,
        });
        
        // Navigate back to home page
        setTimeout(() => {
          setLocation('/home');
        }, 1500);
        
        return { offline: true };
      }
      
      // If online, try to sync immediately with timeout
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Save timeout'));
          }, 10000); // 10 second timeout for saving
        });
        
        // Race between API call and timeout
        const apiPromise = apiRequest("POST", "/api/receipts", {
          clientUploadId,
          storeName,
          date,
          total,
          items: Array.isArray(items) ? items : [],
          category: normalizedCategory,
          notes: normalizedNotes,
          confidenceScore: confidenceScore || null,
          imageData,
          isRecurring,
          isTaxDeductible,
          allowDuplicate: allowDuplicateSave,
        });
        
        const res = await Promise.race([apiPromise, timeoutPromise]) as Response;
        
        // If successful, remove from pending uploads
        const currentPending = JSON.parse(localStorage.getItem('pendingUploads') || '[]');
        const updatedPending = currentPending.slice(0, -1); // Remove the one we just added
        localStorage.setItem('pendingUploads', JSON.stringify(updatedPending));
        
        return res;
      } catch (error) {
        // If API call fails, just show success message for offline save
        console.log("[Upload] API call failed, keeping in offline storage:", error);
        
        toast({
          title: "📱 Receipt saved offline", 
          description: "Your receipt is saved and will sync when you're back online.",
          variant: "default",
          duration: 4000,
        });
        
        // Navigate back to home page
        setTimeout(() => {
          setLocation('/home');
        }, 1500);
        
        return { offline: true };
      }
      
      // Start with 0% progress for online save
      setScanProgress("💾 Preparing to save your receipt...");
      setProgressValue(0);
      
      // Ensure items is always an array before sending to server
      const itemsArray = Array.isArray(items) ? items : [];
      
      // Upload progress simulation - gradually increase from 0 to 50%
      let progress = 0;
      const progressInterval = setInterval(() => {
        // Increment by small amounts
        progress += 5;
        if (progress <= 45) {
          setProgressValue(progress);
          
          // Update progress message
          if (progress > 35) {
            setScanProgress("☁️ Saving to your secure storage...");
          } else if (progress > 20) {
            setScanProgress("📝 Recording receipt details...");
          } else if (progress > 10) {
            setScanProgress("📤 Uploading receipt image...");
          }
        }
      }, 300);
      
      try {
        // Upload receipt data to server
        const res = await apiRequest("POST", "/api/receipts", {
          clientUploadId,
          storeName,
          date,
          total,
          items: itemsArray,
          category: normalizedCategory,
          notes: normalizedNotes,
          confidenceScore: confidenceScore || null,
          imageData,
          isRecurring,
          isTaxDeductible,
          allowDuplicate: allowDuplicateSave,
        });
        
        // Upload complete
        clearInterval(progressInterval);
        setProgressValue(50);
        setScanProgress("✅ Upload complete, finalizing receipt...");
        
        return await res.json();
      } catch (error) {
        clearInterval(progressInterval);
        throw error;
      }
    },
    onSuccess: (data) => {
      // Check if this is an offline response from service worker
      if (data && data.offline === true) {
        setAllowDuplicateSave(false);
        const { normalizedCategory, normalizedNotes } = getNormalizedReceiptValues();

        // Handle offline response - queue for sync
        addPendingUpload({
          clientUploadId: clientUploadIdRef.current,
          storeName,
          date,
          total,
          items: Array.isArray(items) ? items : [],
          category: normalizedCategory,
          notes: normalizedNotes,
          confidenceScore: confidenceScore || null,
          imageData,
          isRecurring,
          isTaxDeductible,
        }, '/api/receipts');
        
        setProgressValue(100);
        setScanProgress("📱 Receipt saved offline!");
        
        toast({
          title: "📱 Receipt saved offline",
          description: "Your receipt will be uploaded automatically when you're back online.",
          duration: 6000,
        });
        
        // Still redirect to home - receipt is "saved" offline
        setTimeout(() => {
          setLocation("/home");
        }, 2000);
        
        return;
      }
      
      // Normal online success handling
      setAllowDuplicateSave(false);
      // Invalidate receipts query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
      
      // If this receipt was marked as tax deductible, invalidate tax dashboard
      if (isTaxDeductible) {
        queryClient.invalidateQueries({ queryKey: ["/api/tax"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tax/dashboard"] });
      }
      
      // Store the receipt ID for recurring expense analysis
      setNewReceiptId(data.id);
      
      // Check for duplicate detection
      if (data.duplicateDetection?.isDuplicate) {
        // Show duplicate warning
        toast({
          title: "⚠️ Possible Duplicate Receipt",
          description: `This receipt might be a duplicate (${Math.round(data.duplicateDetection.similarity * 100)}% similar). ${data.duplicateDetection.reasoning}`,
          variant: "destructive",
          duration: 8000, // Show longer for important warning
        });
      }
      
      // Increment session counter
      setSessionReceiptCount(prev => prev + 1);
      const newCount = sessionReceiptCount + 1;
      
      // Show completion progress
      setProgressValue(75);
      setScanProgress("🎊 Receipt saved successfully!");
      
      // Check if we're in continuous mode (scan another)
      if (continuousMode) {
        setTimeout(() => {
          setProgressValue(100);
          setScanProgress("✨ Receipt saved! Opening camera...");
          
          toast({
            title: `✅ Receipt ${newCount} saved`,
            description: "Ready to scan the next receipt",
            duration: 2000,
          });
          
          // Reset form and go to camera mode
          setTimeout(() => {
            resetForAnotherScan();
            setContinuousMode(false);
            setCameraMode(true);
          }, 500);
        }, 300);
      } else {
        // Normal single-receipt flow
        // Slowly increase to 100% to show completion
        setTimeout(() => {
          setProgressValue(90);
          setScanProgress("🏁 Almost done...");
          
          setTimeout(() => {
            setProgressValue(100);
            setScanProgress("✨ All done! Receipt saved!");
            
            const toastTitle = data.duplicateDetection?.isDuplicate ? 
              "⚠️ Receipt saved (possible duplicate)" : 
              "🎉 Receipt uploaded successfully";
            
            // Show session summary if multiple receipts were scanned
            const description = newCount > 1 
              ? `${newCount} receipts saved in this session!`
              : "Your receipt has been processed and saved to your account";
            
            toast({
              title: toastTitle,
              description: description,
            });
            
            // Redirect after a short delay to show the success state
            setTimeout(() => {
              setLocation("/home");
            }, 1000);
          }, 300);
        }, 300);
      }
    },
    onError: (error: any) => {
      setProgressValue(0);
      setScanProgress("");
      setAllowDuplicateSave(false);
      
      // Check if this is an offline error from service worker or network failure
      const isOfflineError = !isOnline || 
        error.message.includes('Failed to fetch') || 
        error.message.includes('Network Error') ||
        error.offline === true ||
        (error.status === 503 && error.responseData?.offline);
      
      if (error.status === 409 && error.responseData?.duplicates?.length) {
        setAllowDuplicateSave(false);
        setDuplicateReceipts(error.responseData.duplicates);
        setShowDuplicateDialog(true);
        setIsCheckingDuplicate(false);
        return;
      }

      if (isOfflineError) {
        setAllowDuplicateSave(false);
        const { normalizedCategory, normalizedNotes } = getNormalizedReceiptValues();

        // Queue for offline sync
        addPendingUpload({
          clientUploadId: clientUploadIdRef.current,
          storeName,
          date,
          total,
          items: Array.isArray(items) ? items : [],
          category: normalizedCategory,
          notes: normalizedNotes,
          confidenceScore: confidenceScore || null,
          imageData,
          isRecurring,
          isTaxDeductible,
        }, '/api/receipts');
        
        toast({
          title: "📱 Receipt saved offline",
          description: "Your receipt will be uploaded automatically when you're back online.",
          duration: 6000,
        });
        
        // Still redirect to home - receipt is "saved" offline
        setTimeout(() => {
          setLocation("/home");
        }, 2000);
        
        return;
      }
      
      // Check if this is a subscription/trial expiration error
      if (error.status === 403 && (
        error.message.includes('Active subscription required') ||
        error.message.includes('trial has ended') ||
        error.responseData?.error === 'Active subscription required'
      )) {
        toast({
          title: "🔒 Trial has ended",
          description: "Your free trial has expired. Subscribe to continue uploading receipts.",
          variant: "destructive",
          action: (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setLocation('/subscription')}
              className="bg-white text-gray-900 hover:bg-gray-50 hover:text-gray-900 border-gray-300"
            >
              Upgrade Now
            </Button>
          ),
          duration: 8000, // Show longer for important message
        });
        
        // Don't save offline for subscription errors - redirect to subscription page
        setTimeout(() => {
          setLocation('/subscription');
        }, 3000);
        
        return;
      }
      
      // Generic error handling for other issues
      toast({
        title: "Failed to upload receipt",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Enhanced file handling with image optimization
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Advanced file validation
    const validation = validateImageFile(file);
    if (!validation.isValid) {
      toast({
        title: "Invalid file",
        description: validation.error,
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsScanning(true);
      setScanProgress("Preparing image for processing...");
      setProgressValue(0);
      
      // Optimize image for better processing
      setScanProgress("Optimizing image quality...");
      setProgressValue(5);
      
      const optimizedResult = await optimizeImage(file, 'receipt');
      
      setScanProgress(`Image optimized - ${optimizedResult.compressionRatio}% size reduction`);
      setProgressValue(15);
      
      // Set optimized image data
      // For PDFs: set imageData (needed for upload) but NOT previewUrl (can't render PDF in <img>)
      // The converted JPEG will be set in onSuccess after server conversion
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      setImageData(optimizedResult.dataUrl);
      if (isPdf) {
        setPreviewUrl(null);
        setIsPdfProcessing(true);
      } else {
        setPreviewUrl(optimizedResult.dataUrl);
        setIsPdfProcessing(false);
      }
      
      // Display optimization stats
      toast({
        title: "Image optimized",
        description: `Size reduced from ${formatFileSize(optimizedResult.originalSize)} to ${formatFileSize(optimizedResult.compressedSize)}`,
      });
      
      // Check if offline before starting scan
      if (!isOnline) {
        setIsScanning(false);
        setScanProgress("");
        setProgressValue(0);
        
        toast({
          title: "📱 You're offline",
          description: "Please fill in receipt details manually. The receipt will be saved when you're back online.",
          variant: "default",
          duration: 6000,
        });
        return;
      }
      
      setScanProgress("Starting AI analysis...");
      setProgressValue(20);
      
      // Scan the optimized receipt
      await scanMutation.mutateAsync(optimizedResult.dataUrl);
    } catch (error) {
      setIsScanning(false);
      setScanProgress("");
      setProgressValue(0);
      
      // Check if this is a subscription/trial expiration error
      const errorMessage = error instanceof Error ? error.message : "Failed to process image";
      if (
        errorMessage.includes('Active subscription required') ||
        errorMessage.includes('trial has ended') ||
        errorMessage.includes('Please subscribe to continue')
      ) {
        toast({
          title: "🔒 Trial has ended",
          description: "Your free trial has expired. Subscribe to continue scanning receipts.",
          variant: "destructive",
          action: (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setLocation('/subscription')}
              className="bg-white text-gray-900 hover:bg-gray-50 hover:text-gray-900 border-gray-300"
            >
              Upgrade Now
            </Button>
          ),
          duration: 8000,
        });
        
        setTimeout(() => {
          setLocation('/subscription');
        }, 3000);
        
        return;
      }
      
      toast({
        title: "Processing failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  // Handle camera capture (mobile only) - check permissions first
  const handleCameraCapture = async () => {
    console.log("[Upload] Camera capture button clicked");
    
    try {
      // Check if camera is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error("[Upload] Camera API not supported");
        toast({
          title: "Camera not available",
          description: "Camera access is not supported on this device or browser.",
          variant: "destructive",
        });
        return;
      }

      console.log("[Upload] Testing camera permissions...");
      
      // Try to access camera directly
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      
      console.log("[Upload] Camera permission granted, starting camera mode");
      
      // If we get here, permission was granted - stop the stream and start camera mode
      stream.getTracks().forEach(track => track.stop());
      setCameraMode(true);
      
    } catch (error) {
      console.error("[Upload] Camera permission error:", error);
      console.error("[Upload] Error details:", {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Permission denied or other error - show permission dialog
      setShowCameraPermission(true);
    }
  };

  // Handle camera permission granted
  const handleCameraPermissionGranted = () => {
    setShowCameraPermission(false);
    setCameraMode(true);
  };

  // Handle camera permission denied
  const handleCameraPermissionDenied = () => {
    setShowCameraPermission(false);
    // Keep in file upload mode
  };

  // Handle camera data from EnhancedCamera component
  const handleCameraData = async (capturedImageData: string) => {
    console.log("[Upload] Camera data received, length:", capturedImageData.length);
    setCameraMode(false);
    setImageData(capturedImageData);
    setPreviewUrl(capturedImageData);
    
    // Check if offline before starting scan
    if (!isOnline) {
      toast({
        title: "📱 You're offline",
        description: "Please fill in receipt details manually. The receipt will be saved when you're back online.",
        variant: "default",
        duration: 6000,
      });
      return;
    }
    
    // Start scanning process
    setIsScanning(true);
    setScanProgress("🚀 Starting AI analysis...");
    setProgressValue(20);
    
    try {
      console.log("[Upload] Starting OCR scan...");
      // Scan the receipt with Azure OCR
      await scanMutation.mutateAsync(capturedImageData);
      console.log("[Upload] OCR scan completed successfully");
    } catch (error) {
      console.error("[Upload] OCR scan failed:", error);
      setIsScanning(false);
      setScanProgress("");
      setProgressValue(0);
      
      // Check if this is a subscription/trial expiration error
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      if (
        errorMessage.includes('Active subscription required') ||
        errorMessage.includes('trial has ended') ||
        errorMessage.includes('Please subscribe to continue')
      ) {
        toast({
          title: "🔒 Trial has ended",
          description: "Your free trial has expired. Subscribe to continue scanning receipts.",
          variant: "destructive",
          action: (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setLocation('/subscription')}
              className="bg-white text-gray-900 hover:bg-gray-50 hover:text-gray-900 border-gray-300"
            >
              Upgrade Now
            </Button>
          ),
          duration: 8000,
        });
        
        setTimeout(() => {
          setLocation('/subscription');
        }, 3000);
        
        return;
      }
      
      toast({
        title: "Error processing image",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  // Check for duplicate receipts before saving
  const checkForDuplicates = async (isContinuousMode: boolean = false) => {
    if (!storeName || !date || !total) {
      toast({
        title: "Missing information",
        description: "Please fill in store name, date, and total amount.",
        variant: "destructive",
      });
      return;
    }

    // Skip duplicate check if offline
    if (!isOnline) {
      if (isContinuousMode) {
        setContinuousMode(true);
      }
      uploadMutation.mutate();
      return;
    }

    setIsCheckingDuplicate(true);
    setPendingContinuousMode(isContinuousMode);

    try {
      const response = await apiRequest("POST", "/api/receipts/check-duplicate", {
        storeName,
        date,
        total,
      });

      const data = await response.json();

      if (data.hasDuplicates && data.duplicates.length > 0) {
        setDuplicateReceipts(data.duplicates);
        setShowDuplicateDialog(true);
      } else {
        // No duplicates, proceed with save
        if (isContinuousMode) {
          setContinuousMode(true);
        }
        uploadMutation.mutate();
      }
    } catch (error) {
      console.error("Error checking for duplicates:", error);
      // On error, proceed with save anyway
      if (isContinuousMode) {
        setContinuousMode(true);
      }
      uploadMutation.mutate();
    } finally {
      setIsCheckingDuplicate(false);
    }
  };

  // Handle proceeding with save despite duplicate
  const handleProceedWithSave = () => {
    setShowDuplicateDialog(false);
    setDuplicateReceipts([]);
    setAllowDuplicateSave(true);
    if (pendingContinuousMode) {
      setContinuousMode(true);
    }
    uploadMutation.mutate();
  };

  // Handle canceling save due to duplicate
  const handleCancelDuplicateSave = () => {
    setShowDuplicateDialog(false);
    setDuplicateReceipts([]);
    setPendingContinuousMode(false);
    setAllowDuplicateSave(false);
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    checkForDuplicates(false);
  };

  // Camera permission prompt
  if (showCameraPermission) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <CameraPermissionPrompt
          onPermissionGranted={handleCameraPermissionGranted}
          onPermissionDenied={handleCameraPermissionDenied}
        />
      </div>
    );
  }

  // Enhanced camera component
  if (cameraMode) {
    return (
      <EnhancedCamera
        onImageCapture={handleCameraData}
        onCancel={() => setCameraMode(false)}
      />
    );
  }

  return (
    <div className="min-h-screen android-safe-area responsive-container p-4 pb-24 md:pb-8 md:p-8 lg:landscape-optimized">
      <div className="max-w-md mx-auto lg:max-w-4xl lg:landscape-content">
        <div className="flex items-center mb-4">
          <BackButton fallbackPath="/home" />
          <h1 className="text-3xl font-bold ml-2">Upload Receipt</h1>
        </div>
        <p className="text-gray-500 mb-4">
          Upload a receipt image to scan and categorize your expenses
        </p>
        
        {/* Offline status indicator */}
        {!isOnline && (
          <div className="mb-6 p-3 bg-orange-50 border border-orange-200 rounded-md">
            <div className="flex items-center gap-2 text-orange-700">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">You're offline</span>
            </div>
            <p className="text-xs text-orange-600 mt-1">
              You can still capture receipts. They'll be uploaded when you're back online.
            </p>
          </div>
        )}

        {/* Batch Mode UI */}
        {batchMode ? (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Batch Import</h3>
                  <Badge variant="secondary">
                    {batchQueue.length} receipt{batchQueue.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
                
                {/* Progress overview */}
                {batchProcessingIndex >= 0 && (
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between text-sm">
                      <span>Processing receipt {batchProcessingIndex + 1} of {batchQueue.length}</span>
                      <span>{Math.round(((batchProcessingIndex + 1) / batchQueue.length) * 100)}%</span>
                    </div>
                    <Progress 
                      value={((batchProcessingIndex + 1) / batchQueue.length) * 100} 
                      className="h-2" 
                    />
                  </div>
                )}
                
                {/* Batch file list */}
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {batchQueue.map((file, index) => (
                    <div 
                      key={file.id}
                      className={`flex items-center justify-between p-3 border rounded-md transition-colors ${
                        file.status === 'processing' ? 'bg-blue-50 border-blue-200' :
                        file.status === 'completed' ? 'bg-green-50 border-green-200' :
                        file.status === 'error' ? 'bg-red-50 border-red-200' :
                        'bg-gray-50 border-gray-200'
                      }`}
                      data-testid={`batch-file-${index}`}
                    >
                      <div className="flex items-center gap-3">
                        <FileImage className={`h-5 w-5 ${
                          file.status === 'processing' ? 'text-blue-500' :
                          file.status === 'completed' ? 'text-green-500' :
                          file.status === 'error' ? 'text-red-500' :
                          'text-gray-400'
                        }`} />
                        <div>
                          <p className="text-sm font-medium truncate max-w-[180px]">
                            {file.name}
                          </p>
                          {file.error && (
                            <p className="text-xs text-red-500">{file.error}</p>
                          )}
                        </div>
                      </div>
                      <div>
                        {file.status === 'pending' && (
                          <Badge variant="outline" className="text-xs">Pending</Badge>
                        )}
                        {file.status === 'processing' && (
                          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                        )}
                        {file.status === 'completed' && (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        )}
                        {file.status === 'error' && (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Action buttons */}
                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={cancelBatchMode}
                    disabled={batchProcessingIndex >= 0}
                    className="flex-1"
                    data-testid="button-cancel-batch"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={processBatchQueue}
                    disabled={batchProcessingIndex >= 0 || batchQueue.every(f => f.status !== 'pending')}
                    className="flex-1"
                    data-testid="button-start-batch"
                  >
                    {batchProcessingIndex >= 0 ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : batchQueue.every(f => f.status !== 'pending') ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Done
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Start Processing
                      </>
                    )}
                  </Button>
                </div>
                
                {/* Session summary when done */}
                {batchQueue.every(f => f.status !== 'pending' && f.status !== 'processing') && (
                  <div className="pt-4 border-t">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium">
                          {batchQueue.filter(f => f.status === 'completed').length} receipts saved
                        </p>
                        {batchQueue.some(f => f.status === 'error') && (
                          <p className="text-xs text-red-500">
                            {batchQueue.filter(f => f.status === 'error').length} failed
                          </p>
                        )}
                      </div>
                      <Button
                        variant="default"
                        onClick={() => setLocation('/home')}
                        data-testid="button-batch-done"
                      >
                        View Receipts
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ) : !imageData ? (
          // Upload/capture interface
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="receipt">Receipt Image or PDF</Label>
                  {/* Single file input */}
                  <Input
                    id="receipt"
                    name="receipt"
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp,image/*,application/pdf,.pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {/* Multi-file input for batch import */}
                  <Input
                    id="receipt-batch"
                    name="receipt-batch"
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp,image/*,application/pdf,.pdf"
                    multiple
                    onChange={handleBatchFileSelect}
                    className="hidden"
                  />
                  
                  <SpacingContainer size="md">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <EnhancedButton 
                          onClick={() => {
                            const fileInput = document.getElementById("receipt") as HTMLInputElement;
                            if (fileInput) {
                              fileInput.click();
                            }
                          }}
                          className="h-32 w-full bg-secondary hover:bg-secondary/90 border-2 border-dashed border-gray-300 hover:border-primary/50 transition-all duration-200"
                          variant="default"
                          style={{ minHeight: '128px', minWidth: '100%' }}
                          data-testid="button-upload-single"
                        >
                          <div className="flex flex-col items-center space-y-2">
                            <FileImage className="h-10 w-10 mb-2 text-primary" />
                            <span className="font-medium">Upload File</span>
                            <span className="text-xs text-gray-500">Image or PDF</span>
                          </div>
                        </EnhancedButton>
                      </motion.div>
                      
                      {isMobile && (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: 0.1 }}
                        >
                          <EnhancedButton 
                            onClick={handleCameraCapture}
                            className="h-32 w-full bg-secondary hover:bg-secondary/90 border-2 border-dashed border-gray-300 hover:border-primary/50"
                            variant="default"
                            style={{ minHeight: '128px', minWidth: '100%' }}
                            data-testid="button-camera-capture"
                          >
                            <div className="flex flex-col items-center space-y-2">
                              <Camera className="h-10 w-10 mb-2 text-primary" />
                              <span className="font-medium">Take Picture</span>
                              <span className="text-xs text-gray-500">Use your camera</span>
                            </div>
                          </EnhancedButton>
                        </motion.div>
                      )}
                    </div>
                    
                    {/* Batch Import button */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.2 }}
                      className="mt-4"
                    >
                      <EnhancedButton 
                        onClick={() => {
                          const fileInput = document.getElementById("receipt-batch") as HTMLInputElement;
                          if (fileInput) {
                            fileInput.click();
                          }
                        }}
                        className="w-full h-16 bg-gradient-to-r from-primary/10 to-primary/5 hover:from-primary/20 hover:to-primary/10 border border-primary/30 hover:border-primary/50"
                        variant="default"
                        data-testid="button-batch-import"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex -space-x-2">
                            <FileImage className="h-5 w-5 text-primary" />
                            <FileImage className="h-5 w-5 text-primary/70" />
                            <Plus className="h-4 w-4 text-primary/50" />
                          </div>
                          <div className="text-left">
                            <span className="font-medium text-primary">Batch Import</span>
                            <span className="text-xs text-gray-500 block">Select multiple receipts at once</span>
                          </div>
                        </div>
                      </EnhancedButton>
                    </motion.div>
                  </SpacingContainer>
                  
                  <p className="text-xs text-gray-500 mt-2">
                    Maximum file size: 40MB. Supported formats: JPG, PNG, BMP
                  </p>
                </div>


              </div>
            </CardContent>
          </Card>
        ) : (
          // Receipt editing interface after upload
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Progress bar during processing */}
                {(isScanning || uploadMutation.isPending) && (
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {scanProgress}
                      </span>
                      <span className="text-sm font-medium">{progressValue}%</span>
                    </div>
                    <Progress value={progressValue} className="h-2" />
                  </div>
                )}
                
                {/* Enhanced Preview image with progressive loading */}
                {previewUrl && (
                  <div className="relative mb-4 border rounded-none overflow-hidden">
                    <ProgressiveImage
                      src={previewUrl} 
                      alt="Receipt preview" 
                      className="aspect-[3/4] w-full object-cover"
                    />
                    {confidenceScore && (
                      <div className="absolute bottom-2 right-2">
                        <Badge variant={parseFloat(confidenceScore) > 0.7 ? "outline" : "destructive"}>
                          {parseFloat(confidenceScore) > 0.7 ? (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          ) : (
                            <AlertCircle className="h-3 w-3 mr-1" />
                          )}
                          Confidence: {Math.round(parseFloat(confidenceScore) * 100)}%
                        </Badge>
                      </div>
                    )}
                  </div>
                )}
                
                {/* PDF Processing Placeholder - shown while server converts PDF to image */}
                {isPdfProcessing && !previewUrl && (
                  <div className="relative mb-4 border rounded-none overflow-hidden bg-muted">
                    <div className="aspect-[3/4] w-full flex flex-col items-center justify-center gap-4">
                      <FileImage className="h-16 w-16 text-muted-foreground" />
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Converting PDF for preview...</span>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Receipt details */}
                <div className="space-y-4">
                  {/* Store Name */}
                  <div className="space-y-2">
                    <Label htmlFor="storeName">Store Name</Label>
                    <Input
                      id="storeName"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      placeholder="Enter store name"
                      required
                      disabled={isScanning}
                    />
                  </div>
                  
                  {/* Date & Total - stacked on mobile, side by side on larger screens */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="date">Date</Label>
                      <Input
                        id="date"
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        required
                        disabled={isScanning}
                        className="h-10 w-full text-left appearance-none [&::-webkit-datetime-edit]:text-left [&::-webkit-date-and-time-value]:text-left [&::-webkit-inner-spin-button]:hidden [&::-webkit-calendar-picker-indicator]:opacity-100"
                        style={{ minHeight: '40px', maxHeight: '40px' }}
                        data-testid="input-date"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="total">Total Amount</Label>
                      <Input
                        id="total"
                        value={total}
                        onChange={(e) => setTotal(e.target.value)}
                        placeholder="0.00"
                        required
                        disabled={isScanning}
                        className="h-10"
                        data-testid="input-total"
                      />
                    </div>
                  </div>
                  
                  {/* Category - Dropdown */}
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Category</Label>
                    
                    <div className="space-y-3">
                      <Select 
                        value={category} 
                        onValueChange={(value) => {
                          const matchedCustomCategory = Array.isArray(customCategories)
                            ? customCategories.find((customCat: any) => customCat.name === value)
                            : null;

                          setCategory(value);
                          setCustomCategoryName(
                            matchedCustomCategory
                              ? (matchedCustomCategory.displayName || matchedCustomCategory.name)
                              : null
                          );
                        }}
                        disabled={isScanning}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPENSE_CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat.charAt(0).toUpperCase() + cat.slice(1).replace('_', ' ')}
                            </SelectItem>
                          ))}
                          {Array.isArray(customCategories) && customCategories.length > 0 && (
                            <>
                              {customCategories.map((customCat: any) => (
                                <SelectItem key={`custom-${customCat.id}`} value={customCat.name}>
                                  {customCat.displayName}
                                </SelectItem>
                              ))}
                            </>
                          )}
                          <div className="border-t border-gray-200 mt-2 pt-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="w-full justify-start text-sm text-gray-600 hover:text-gray-900"
                              type="button"
                              onClick={() => {
                                saveFormState();
                                setLocation("/categories");
                              }}
                            >
                              <Plus className="w-4 h-4 mr-2" />
                              Manage Custom Categories
                            </Button>
                          </div>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  {/* Notes */}
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes (Optional)</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add any notes about this receipt"
                      disabled={isScanning}
                    />
                  </div>
                  
                  {/* Receipt Properties - Recurring and Tax Deductible */}
                  <div className="space-y-4">
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="isRecurring"
                        checked={isRecurring}
                        onCheckedChange={(checked) => setIsRecurring(!!checked)}
                        disabled={isScanning}
                      />
                      <Label htmlFor="isRecurring" className="text-sm font-normal cursor-pointer">
                        This is a recurring expense
                      </Label>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="isTaxDeductible"
                        checked={isTaxDeductible}
                        onCheckedChange={(checked) => setIsTaxDeductible(!!checked)}
                        disabled={isScanning}
                      />
                      <Label htmlFor="isTaxDeductible" className="text-sm font-normal cursor-pointer">
                        This expense is tax deductible
                      </Label>
                    </div>
                  </div>

                </div>
              </form>
            </CardContent>
            
            <CardFooter className="flex flex-col gap-4 pt-6">
              {/* Session counter badge */}
              {sessionReceiptCount > 0 && (
                <div className="w-full flex justify-center mb-2">
                  <Badge variant="secondary" className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3" />
                    {sessionReceiptCount} receipt{sessionReceiptCount > 1 ? 's' : ''} saved this session
                  </Badge>
                </div>
              )}
              
              <div className="flex flex-wrap gap-3 justify-end w-full">
                <EnhancedButton 
                  variant="default" 
                  onClick={() => {
                    setImageData(null);
                    setPreviewUrl(null);
                    setStoreName("");
                    setDate("");
                    setTotal("");
                    setCategory("other");
                    setCustomCategoryName(null);
                    setNotes("");
                    setItems([]);
                    setConfidenceScore(null);
                  }}
                  disabled={isScanning || uploadMutation.isPending}
                  className="min-w-[80px]"
                  data-testid="button-cancel-upload"
                >
                  Cancel
                </EnhancedButton>
                
                {/* Scan Another button - only show on mobile */}
                {isMobile && (
                  <EnhancedButton 
                    variant="default"
                    onClick={handleSaveAndScanAnother}
                    disabled={isScanning || uploadMutation.isPending || isCheckingDuplicate || !storeName || !date || !total}
                    className="min-w-[120px] bg-secondary hover:bg-secondary/80"
                    data-testid="button-save-scan-another"
                  >
                    {uploadMutation.isPending && continuousMode ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Camera className="h-4 w-4 mr-2" />
                        Save & Scan Next
                      </>
                    )}
                  </EnhancedButton>
                )}
                
                <EnhancedButton 
                  variant="primary"
                  isPrimary={true}
                  onClick={handleSubmit}
                  disabled={isScanning || uploadMutation.isPending || isCheckingDuplicate || !storeName || !date || !total}
                  className="min-w-[120px]"
                  data-testid="button-save-receipt"
                >
                  {isCheckingDuplicate ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Checking...
                    </>
                  ) : uploadMutation.isPending && !continuousMode ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Save Receipt
                    </>
                  )}
                </EnhancedButton>
              </div>
            </CardFooter>
          </Card>
        )}
      </div>
      
      {/* Recurring Expense Detector */}
      {newReceiptId && (
        <RecurringExpenseDetector receiptId={newReceiptId} />
      )}

      {/* Duplicate Receipt Warning Dialog */}
      <AlertDialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5 text-orange-500" />
              Potential Duplicate Receipt
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  We found {duplicateReceipts.length} existing receipt{duplicateReceipts.length > 1 ? 's' : ''} with the same store, date, and amount:
                </p>
                <div className="bg-orange-50 border border-orange-200 rounded-md p-3 space-y-2">
                  {duplicateReceipts.map((dup) => (
                    <div key={dup.id} className="text-sm">
                      <span className="font-medium">{dup.storeName}</span>
                      <span className="text-gray-500"> - </span>
                      <span>R{parseFloat(dup.total).toFixed(2)}</span>
                      <span className="text-gray-500"> on </span>
                      <span>{new Date(dup.date).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-gray-600">
                  Do you still want to save this receipt?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDuplicateSave}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleProceedWithSave}>
              Save Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
