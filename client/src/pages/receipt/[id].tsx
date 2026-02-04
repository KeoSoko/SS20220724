import React, { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import { Receipt, EXPENSE_CATEGORIES, EXPENSE_SUBCATEGORIES, ExpenseCategory } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { exportToPDF } from "@/lib/export-individual";
import { 
  ArrowLeft, 
  Calendar, 
  CheckCircle2, 
  Download, 
  Edit2, 
  FileText, 
  Loader2, 
  Plus,
  RefreshCcw,
  Save, 
  ShoppingBag, 
  Split,
  Tag, 
  Tags, 
  Trash2, 
  Utensils, 
  X
} from "lucide-react";

// Category icon mapping
const getCategoryIcon = (category: string) => {
  switch(category) {
    case 'food':
    case 'dining':
      return <Utensils className="h-4 w-4" />;
    case 'groceries':
      return <ShoppingBag className="h-4 w-4" />;
    default:
      return <Tags className="h-4 w-4" />;
  }
};

// Format currency for South African Rands
const formatCurrency = (amount: number) => {
  return 'R ' + amount.toFixed(2);
};

// Category color mapping
const getCategoryColor = (category: string): string => {
  const colorMap: Record<string, string> = {
    'food': 'bg-orange-100 text-orange-800 border-orange-200',
    'groceries': 'bg-green-100 text-green-800 border-green-200',
    'dining': 'bg-red-100 text-red-800 border-red-200',
    'transportation': 'bg-blue-100 text-blue-800 border-blue-200',
    'entertainment': 'bg-purple-100 text-purple-800 border-purple-200',
    'utilities': 'bg-cyan-100 text-cyan-800 border-cyan-200',
    'rent': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'travel': 'bg-pink-100 text-pink-800 border-pink-200',
    'healthcare': 'bg-emerald-100 text-emerald-800 border-emerald-200',
    'education': 'bg-indigo-100 text-indigo-800 border-indigo-200',
    'shopping': 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
    'office_supplies': 'bg-teal-100 text-teal-800 border-teal-200',
    'personal_care': 'bg-rose-100 text-rose-800 border-rose-200',
    'gifts': 'bg-amber-100 text-amber-800 border-amber-200',
  };

  return colorMap[category] || 'bg-gray-100 text-gray-800 border-gray-200';
};

export default function ReceiptDetail() {
  // Extract params from useParams (not working correctly with Wouter)
  const params = useParams();
  // Extract id from the URL path directly as a fallback
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  // Extract ID from the URL manually since useParams isn't working
  const pathParts = location.split('/');
  const idFromPath = pathParts[pathParts.length - 1];

  // Use the ID from path since useParams is not working
  const id = idFromPath;

  console.log(`[Debug] Current path: ${location}, Path parts: ${JSON.stringify(pathParts)}`);
  console.log(`[Debug] ID from path: ${idFromPath}, Params: ${JSON.stringify(params)}`);

  // Convert ID to number and validate with parseInt for safety (base 10)
  const receiptId = parseInt(id, 10);
  const isValidId = !isNaN(receiptId) && receiptId > 0;

  console.log(`[Debug] Parsed ID: ${receiptId}, isValidId: ${isValidId}`);

  // Handle invalid ID with toast and redirect
  useEffect(() => {
    if (id && !isValidId) {
      console.error(`[navigation] Invalid receipt ID: ${id}`);
      toast({
        title: "Invalid Receipt ID",
        description: "Please check the URL and try again",
        variant: "destructive"
      });
      setLocation("/");
      return;
    }
  }, [id, isValidId, setLocation, toast]);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editedStoreName, setEditedStoreName] = useState("");
  const [editedDate, setEditedDate] = useState("");
  const [editedTotal, setEditedTotal] = useState("");
  const [editedCategory, setEditedCategory] = useState<ExpenseCategory>("other");
  const [customCategory, setCustomCategory] = useState("");
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [editedNotes, setEditedNotes] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isRefreshingImage, setIsRefreshingImage] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<number>(0);
  const [imageErrorCount, setImageErrorCount] = useState<number>(0);
  
  // Advanced categorization state
  const [editedSubcategory, setEditedSubcategory] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState("monthly");
  const [isTaxDeductible, setIsTaxDeductible] = useState(false);
  const [taxCategory, setTaxCategory] = useState("");
  
  // Split receipt state
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [splits, setSplits] = useState([
    { category: "groceries", amount: 0, notes: "" },
    { category: "dining_takeaways", amount: 0, notes: "" }
  ]);
  const [splitMode, setSplitMode] = useState<"amount" | "percentage">("amount");

  // Get a specific receipt
  const { data: receipt, isLoading, error } = useQuery<Receipt>({
    queryKey: [`/api/receipts/${id}`],
    enabled: isValidId, // Only run query if ID is valid
  });

  // Query for custom categories
  const { data: customCategories = [], isLoading: customCategoriesLoading, error: customCategoriesError } = useQuery<Array<{ id: number; name: string; isActive: boolean }>>({
    queryKey: ["/api/custom-categories"],
    enabled: !!user, // Only fetch when user is authenticated
  });

  // Debug custom categories data structure
  useEffect(() => {
    console.log("Custom categories query state:", { 
      isLoading: customCategoriesLoading,
      error: customCategoriesError,
      data: customCategories,
      length: customCategories?.length || 0,
      isValidId,
      id
    });
  }, [customCategories, customCategoriesLoading, customCategoriesError, isValidId, id]);

  const buildNotesWithCustomCategory = (
    notesValue: string,
    categoryValue: ExpenseCategory,
    customCategoryValue: string
  ) => {
    const cleanedNotes = notesValue
      ? notesValue.replace(/\[Custom Category: .*?\]\s*/i, "").trim()
      : "";

    if (categoryValue !== "other" || !customCategoryValue.trim()) {
      return cleanedNotes || null;
    }

    const prefix = `[Custom Category: ${customCategoryValue.trim()}]`;
    return cleanedNotes ? `${prefix} ${cleanedNotes}` : prefix;
  };



  // Handle query error
  useEffect(() => {
    if (error) {
      console.error("Error fetching receipt:", error);
      toast({
        title: "Error loading receipt",
        description: "Could not load receipt details",
        variant: "destructive"
      });
    }
  }, [error, toast]);

  // Handle receipt data when it loads
  useEffect(() => {
    if (receipt) {
      console.log(`Receipt data loaded:`, { blobUrl: receipt.blobUrl, imageData: receipt.imageData, blobName: receipt.blobName });
      
      // Initialize form with current values
      setEditedStoreName(receipt.storeName);
      setEditedDate(format(new Date(receipt.date), "yyyy-MM-dd"));
      setEditedTotal(receipt.total);
      setEditedCategory(receipt.category as ExpenseCategory);

      // Set advanced categorization fields
      setEditedSubcategory(receipt.subcategory || "");
      setIsRecurring(receipt.isRecurring || false);
      setIsTaxDeductible(receipt.isTaxDeductible || false);
      setRecurringFrequency(receipt.frequency || "monthly");
      setIsTaxDeductible(receipt.isTaxDeductible || false);
      setTaxCategory(receipt.taxCategory || "");

      // Check if there's a custom category in the notes
      const customCategoryMatch = receipt.notes?.match(/\[Custom Category: (.*?)\]/);
      if (customCategoryMatch && receipt.category === "other") {
        setCustomCategory(customCategoryMatch[1]);
        setShowCustomCategory(true);
        // Remove the custom category prefix from notes
        const cleanedNotes = (receipt.notes ?? "").replace(/\[Custom Category: .*?\]\s*/, "").trim();
        setEditedNotes(cleanedNotes);
      } else {
        setEditedNotes(receipt.notes || "");
      }

      // Handle image URL - prioritize local imageData over Azure blobUrl
      // Since Azure storage isn't set up, imageData (base64) should be used if available
      const storedImageUrl = receipt.imageData || receipt.blobUrl || null;
      console.log(`Setting image URL for receipt ${receipt.id}:`, storedImageUrl ? 'URL/data available' : 'No image');
      console.log(`Image source: ${receipt.imageData ? 'Local storage (base64)' : receipt.blobUrl ? 'Azure blob' : 'None'}`);
      setImageUrl(storedImageUrl);
    }
  }, [receipt]);

  // Refresh image URL mutation
  const refreshImageMutation = useMutation({
    mutationFn: async () => {
      // Early validation - prevent API calls with invalid IDs
      if (!isValidId) {
        throw new Error("Invalid receipt ID");
      }

      setIsRefreshingImage(true);
      const res = await apiRequest("GET", `/api/receipts/${id}/refresh-image-url`);
      return await res.json();
    },
    onSuccess: (data) => {
      // Update the image URL with the new SAS URL and force browser cache refresh
      const cacheBustedUrl = `${data.imageUrl}&cache=${Date.now()}`;
      setImageUrl(cacheBustedUrl);
      
      // Also invalidate the receipt query to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/receipts", id] });
      
      toast({
        title: "Image URL refreshed",
        description: "The receipt image link has been updated",
      });
    },
    onError: (error: Error) => {
      // Don't show 404 errors to user - Azure storage may not be configured
      // Only show toast for unexpected errors
      if (!error.message.includes("404") && !error.message.includes("Image not available")) {
        toast({
          title: "Failed to refresh image URL",
          description: error.message,
          variant: "destructive",
        });
      }
      console.log("Refresh image failed (expected when Azure storage not configured):", error.message);
    },
    onSettled: () => {
      setIsRefreshingImage(false);
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      // Early validation - prevent API calls with invalid IDs
      if (!isValidId) {
        throw new Error("Invalid receipt ID");
      }

      await apiRequest("DELETE", `/api/receipts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
      toast({
        title: "Receipt deleted",
        description: "The receipt has been permanently deleted",
      });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete receipt",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      // Early validation - prevent API calls with invalid IDs
      if (!isValidId) {
        throw new Error("Invalid receipt ID");
      }

      // Prepare update data
      const updateData: any = {
        storeName: editedStoreName,
        date: editedDate,
        total: editedTotal,
        category: editedCategory,
        notes: buildNotesWithCustomCategory(editedNotes, editedCategory, customCategory),
        
        // Advanced categorization fields
        subcategory: editedSubcategory || null,
        isRecurring: isRecurring,
        frequency: isRecurring ? recurringFrequency : null,
        isTaxDeductible: isTaxDeductible,
        taxCategory: isTaxDeductible ? taxCategory : null,
      };

      // Add custom category to notes if provided
      if (editedCategory === "other" && customCategory.trim()) {
        updateData.notes = `[Custom Category: ${customCategory}] ${editedNotes || ""}`.trim();
      }

      await apiRequest("PATCH", `/api/receipts/${id}`, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/receipts/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
      
      // Invalidate all analytics queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/monthly"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/subcategories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/recurring"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/tax-deductibles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/category-comparison"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/weekly"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/category-breakdown"] });
      
      // Invalidate tax dashboard if tax deductible status changed
      queryClient.invalidateQueries({ queryKey: ["/api/tax"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tax/dashboard"] });

      toast({
        title: "Receipt updated",
        description: "Changes have been saved successfully",
      });

      setIsEditing(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update receipt",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Split receipt mutation
  const splitMutation = useMutation({
    mutationFn: async () => {
      if (!isValidId || !receipt) {
        throw new Error("Invalid receipt or receipt ID");
      }

      const receiptTotal = parseFloat(receipt.total);
      const splitData = {
        originalReceiptId: receiptId,
        splits: splits.map(split => {
          const amount = Number(split.amount) || 0;
          const percentage = receiptTotal > 0 ? (amount / receiptTotal) * 100 : 0;
          return {
            category: split.category,
            percentage: Number(percentage.toFixed(2)),
            amount: amount.toFixed(2),
            notes: split.notes
          };
        })
      };

      await apiRequest("POST", `/api/receipts/${receiptId}/split`, splitData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/monthly"] });
      
      toast({
        title: "Receipt split successfully",
        description: "The receipt has been split into separate entries",
      });
      
      setShowSplitDialog(false);
      setLocation("/home");
    },
    onError: (error: Error) => {
      toast({
        title: "Error splitting receipt",
        description: error.message || "Failed to split receipt",
        variant: "destructive",
      });
    },
  });

  // Add split functionality
  const addSplit = () => {
    if (splits.length < 5) {
      setSplits([...splits, { category: "other", amount: 0, notes: "" }]);
    }
  };

  const removeSplit = (index: number) => {
    if (splits.length > 2) {
      setSplits(splits.filter((_, i) => i !== index));
    }
  };

  const updateSplit = (index: number, field: string, value: any) => {
    setSplits(splits.map((split, i) => 
      i === index ? { ...split, [field]: value } : split
    ));
  };

  const balanceSplits = () => {
    if (!receipt) return;
    const receiptTotal = parseFloat(receipt.total);
    const totalAmount = splits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
    if (receiptTotal === 0 || totalAmount === receiptTotal) {
      return;
    }
    const difference = receiptTotal - totalAmount;
    const splitCount = splits.length;
    const adjustment = difference / splitCount;
    setSplits(splits.map(split => ({
      ...split,
      amount: Math.max(0, (Number(split.amount) || 0) + adjustment)
    })));
  };

  const receiptTotal = receipt ? parseFloat(receipt.total) : 0;
  const totalSplitAmount = splits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
  const totalSplitPercentage = receiptTotal > 0 ? (totalSplitAmount / receiptTotal) * 100 : 0;
  const isSplitBalanced = receiptTotal === 0 || Math.abs(totalSplitAmount - receiptTotal) < 0.01;

  // Invalid ID state
  if (!isValidId) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-4">Invalid Receipt ID</h1>
          <p className="mb-4 text-muted-foreground">
            The receipt ID provided is invalid or missing.
          </p>
          <Button onClick={() => setLocation("/home")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  // Not found state
  if (!receipt) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-4">Receipt not found</h1>
          <Button onClick={() => setLocation("/home")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Top navigation and actions */}
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
          {!isEditing && (
            <Button variant="outline" onClick={() => setLocation("/home")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}

          <div className={`flex flex-wrap gap-2 ${isEditing ? 'w-full justify-between' : ''}`}>
            {!isEditing ? (
              <>
                <Button 
                  variant="outline"
                  onClick={async () => {
                    try {
                      await exportToPDF(receipt);
                      toast({
                        title: "PDF Exported",
                        description: "Receipt PDF with image has been downloaded",
                      });
                    } catch (error) {
                      toast({
                        title: "Export Failed",
                        description: "Could not export receipt to PDF",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Export PDF
                </Button>

                <Button 
                  variant="outline"
                  onClick={() => {
                    // Initialize splits with current receipt data
                    const receiptTotal = receipt ? parseFloat(receipt.total) : 0;
                    const half = receiptTotal / 2;
                    setSplits([
                      { category: "groceries", amount: half, notes: "" },
                      { category: "dining_takeaways", amount: receiptTotal - half, notes: "" }
                    ]);
                    setShowSplitDialog(true);
                  }}
                >
                  <Split className="h-4 w-4 mr-2" />
                  Split Receipt
                </Button>

                <Button 
                  variant="outline"
                  onClick={async () => {
                    // Ensure form fields are initialized with current values when Edit is clicked
                    setEditedStoreName(receipt.storeName);
                    setEditedDate(format(new Date(receipt.date), "yyyy-MM-dd"));
                    setEditedTotal(receipt.total);
                    setEditedCategory(receipt.category as ExpenseCategory);
                    
                    // Handle custom category if present
                    const customCategoryMatch = receipt.notes?.match(/\[Custom Category: (.*?)\]/);
                    if (customCategoryMatch && receipt.category === "other") {
                      setCustomCategory(customCategoryMatch[1]);
                      setShowCustomCategory(true);
                      // Remove the custom category prefix from notes
                      const cleanedNotes = (receipt.notes ?? "").replace(/\[Custom Category: .*?\]\s*/, "").trim();
                      setEditedNotes(cleanedNotes);
                    } else {
                      setEditedNotes(receipt.notes || "");
                    }
                    
                    // Auto-refresh image URL when entering edit mode
                    if (receipt.blobName) {
                      try {
                        setIsRefreshingImage(true);
                        const res = await apiRequest("GET", `/api/receipts/${id}/refresh-image-url`);
                        const data = await res.json();
                        if (data.imageUrl) {
                          console.log("Successfully refreshed image URL when entering edit mode");
                          setImageUrl(data.imageUrl);
                        }
                      } catch (error) {
                        console.error("Failed to refresh image URL in edit mode:", error);
                      } finally {
                        setIsRefreshingImage(false);
                      }
                    }
                    
                    setIsEditing(true);
                  }}
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the
                        receipt and its data.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate()}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {deleteMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Delete"
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : (
              <>
                <Button 
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>

                <Button 
                  onClick={() => updateMutation.mutate()}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Changes
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Receipt details card */}
        <Card className="mb-6">
          <CardHeader className="pb-4">
            {!isEditing ? (
              <>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl">{receipt.storeName}</CardTitle>
                    <CardDescription className="mt-1 flex items-center">
                      <Calendar className="h-4 w-4 mr-1" />
                      {format(new Date(receipt.date), "d MMMM yyyy")} {/* South African format: day month year */}
                    </CardDescription>
                  </div>
                  <Badge 
                    className={`${getCategoryColor(receipt.category)}`}
                  >
                    {getCategoryIcon(receipt.category)}
                    <span className="ml-1">
                      {receipt.category === "other" && receipt.notes?.includes("[Custom Category:") ? (
                        receipt.notes.match(/\[Custom Category: (.*?)\]/)?.[1] || "Other"
                      ) : (
                        receipt.category.charAt(0).toUpperCase() + 
                        receipt.category.slice(1).replace('_', ' ')
                      )}
                    </span>
                  </Badge>
                </div>
              </>
            ) : (
              <>
                <CardTitle className="text-xl mb-4">Edit Receipt Details</CardTitle>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="storeName">Store Name</Label>
                    <Input
                      id="storeName"
                      value={editedStoreName}
                      onChange={(e) => setEditedStoreName(e.target.value)}
                      placeholder="Enter store name"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="date">Date</Label>
                      <Input
                        id="date"
                        type="date"
                        value={editedDate}
                        onChange={(e) => setEditedDate(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="total">Total Amount</Label>
                      <Input
                        id="total"
                        value={editedTotal}
                        onChange={(e) => setEditedTotal(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select
                      value={editedCategory}
                      onValueChange={(value) => {
                        const matchedCustomCategory = Array.isArray(customCategories)
                          ? customCategories.find((customCat: any) => customCat.name === value)
                          : null;

                        if (matchedCustomCategory) {
                          setEditedCategory("other");
                          setCustomCategory(matchedCustomCategory.name);
                          setShowCustomCategory(true);
                          return;
                        }

                        setEditedCategory(value as ExpenseCategory);
                        setShowCustomCategory(value === "other");
                        if (value !== "other") {
                          setCustomCategory("");
                        }
                      }}
                    >
                      <SelectTrigger>
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
                          <Link href="/categories">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="w-full justify-start text-sm text-gray-600 hover:text-gray-900"
                              type="button"
                            >
                              <Plus className="w-4 h-4 mr-2" />
                              Manage Custom Categories
                            </Button>
                          </Link>
                        </div>
                      </SelectContent>
                    </Select>
                  </div>

                  {showCustomCategory && (
                    <div className="space-y-2">
                      <Label htmlFor="customCategory">Custom Category Name</Label>
                      <Input
                        id="customCategory"
                        value={customCategory}
                        onChange={(e) => setCustomCategory(e.target.value)}
                        placeholder="Enter a custom category name"
                      />
                    </div>
                  )}
                  
                  {/* Subcategory selector - only shown if a valid category is selected */}
                  {editedCategory !== "other" && (
                    <div className="space-y-2">
                      <Label htmlFor="subcategory">Subcategory</Label>
                      <Select
                        value={editedSubcategory}
                        onValueChange={(value) => setEditedSubcategory(value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a subcategory (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {EXPENSE_SUBCATEGORIES[editedCategory]?.map((subcat) => (
                            <SelectItem key={subcat} value={subcat}>
                              {subcat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
                  {/* Recurring expense toggle and frequency */}
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="isRecurring"
                        checked={isRecurring}
                        onChange={(e) => setIsRecurring(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <Label htmlFor="isRecurring" className="font-normal cursor-pointer">
                        This is a recurring expense
                      </Label>
                    </div>
                    
                    {isRecurring && (
                      <div className="pl-6 space-y-2">
                        <Label htmlFor="frequency">Frequency</Label>
                        <Select
                          value={recurringFrequency}
                          onValueChange={(value) => setRecurringFrequency(value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="quarterly">Quarterly</SelectItem>
                            <SelectItem value="annually">Annually</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  
                  {/* Tax-deductible toggle and category */}
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="isTaxDeductible"
                        checked={isTaxDeductible}
                        onChange={(e) => setIsTaxDeductible(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <Label htmlFor="isTaxDeductible" className="font-normal cursor-pointer">
                        This expense is tax deductible
                      </Label>
                    </div>
                    
                    {isTaxDeductible && (
                      <div className="pl-6 space-y-2">
                        <Label htmlFor="taxCategory">Tax Category</Label>
                        <Input
                          id="taxCategory"
                          value={taxCategory}
                          onChange={(e) => setTaxCategory(e.target.value)}
                          placeholder="Business Expense, Medical, etc."
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes (Optional)</Label>
                    <Textarea
                      id="notes"
                      value={editedNotes}
                      onChange={(e) => setEditedNotes(e.target.value)}
                      placeholder="Add any notes about this receipt"
                      rows={3}
                    />
                  </div>
                </div>
              </>
            )}
          </CardHeader>

          {!isEditing && (
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Amount</p>
                    <p className="text-xl font-medium">{formatCurrency(parseFloat(receipt.total))}</p>
                  </div>

                  {receipt.confidenceScore && (
                    <div>
                      <p className="text-sm text-muted-foreground">OCR Confidence</p>
                      <div className="flex items-center">
                        {parseFloat(receipt.confidenceScore) > 0.7 ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 mr-1" />
                        ) : (
                          <Tag className="h-4 w-4 text-yellow-500 mr-1" />
                        )}
                        <span>
                          {Math.round(parseFloat(receipt.confidenceScore) * 100)}% 
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {receipt.notes && (
                  <div>
                    <p className="text-sm text-muted-foreground">Notes</p>
                    <p className="mt-1 italic text-sm">
                      {receipt.notes.replace(/\[Custom Category: .*?\]\s*/, "")}
                    </p>
                  </div>
                )}
                
                {/* Advanced categorization information */}
                {receipt.subcategory && (
                  <div className="mt-4">
                    <p className="text-sm text-muted-foreground">Subcategory</p>
                    <p className="mt-1 text-sm">
                      {receipt.subcategory}
                    </p>
                  </div>
                )}
                
                {receipt.isRecurring && (
                  <div className="mt-4">
                    <div className="flex items-center">
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        <RefreshCcw className="h-3 w-3 mr-1" />
                        Recurring {receipt.frequency || "Monthly"}
                      </Badge>
                    </div>
                  </div>
                )}
                
                {receipt.isTaxDeductible && (
                  <div className="mt-4">
                    <div className="flex items-center">
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Tax Deductible {receipt.taxCategory ? `(${receipt.taxCategory})` : ''}
                      </Badge>
                    </div>
                  </div>
                )}


              </div>
            </CardContent>
          )}
        </Card>

        {/* Receipt image card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>Receipt Image</CardTitle>
            {receipt.blobName && !receipt.imageData && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => refreshImageMutation.mutate()}
                disabled={refreshImageMutation.isPending || isRefreshingImage}
              >
                {refreshImageMutation.isPending || isRefreshingImage ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCcw className="h-4 w-4 mr-2" />
                )}
                Refresh URL
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex justify-center">
            {isRefreshingImage ? (
              <div className="flex items-center justify-center h-[400px] w-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading image...</span>
              </div>
            ) : imageErrorCount >= 3 && receipt?.blobName && !receipt?.imageData ? (
              <div className="flex flex-col items-center justify-center h-[400px] w-full bg-gray-50 border-2 border-dashed border-gray-300 rounded-none">
                <FileText className="h-12 w-12 text-gray-400 mb-4" />
                <p className="text-gray-600 text-center max-w-md">
                  Receipt image stored in cloud storage (Azure) but not currently accessible.
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  The receipt data is safely stored and can be viewed once cloud storage is configured.
                </p>
              </div>
            ) : (
              <img
                src={imageUrl || "https://placehold.co/300x400/lightgray/gray?text=No+Image"}
                alt="Receipt"
                className="max-w-full max-h-[600px] object-contain rounded-none"
                onLoad={() => {
                  // Reset error count when image loads successfully
                  setImageErrorCount(0);
                }}
                onError={async (e) => {
                  const now = Date.now();
                  
                  // Always increment error count for tracking
                  setImageErrorCount(prev => prev + 1);
                  
                  // Rate limiting: only refresh once every 10 seconds and max 3 attempts
                  if (now - lastRefreshTime > 10000 && imageErrorCount < 3 && receipt?.blobName && !isRefreshingImage) {
                    console.log(`Image failed to load, attempting refresh... (attempt ${imageErrorCount + 1}/3)`);
                    try {
                      setIsRefreshingImage(true);
                      setLastRefreshTime(now);
                      
                      const res = await apiRequest("GET", `/api/receipts/${id}/refresh-image-url`);
                      const { imageUrl } = await res.json();
                      if (imageUrl && imageUrl !== (e.target as HTMLImageElement).src) {
                        console.log("Got new image URL, updating...");
                        // Add cache-busting parameter to force browser refresh
                        const cacheBustedUrl = `${imageUrl}&cache=${Date.now()}`;
                        setImageUrl(cacheBustedUrl);
                      } else {
                        console.log("No new URL available, keeping current");
                      }
                    } catch (error) {
                      console.error("Failed to refresh image URL:", error);
                      // Don't show 404 errors to user - Azure storage may not be configured
                    } finally {
                      setIsRefreshingImage(false);
                    }
                  } else {
                    console.log(`Rate limited: skipping image refresh (error count: ${imageErrorCount + 1})`);
                  }
                }}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Split Receipt Dialog */}
      <Dialog open={showSplitDialog} onOpenChange={setShowSplitDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-base">Split Receipt</DialogTitle>
            <DialogDescription className="text-xs">
              Split into multiple categories. Enter amounts or percentages.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                Total: {receipt ? formatCurrency(parseFloat(receipt.total)) : ''}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant={splitMode === "amount" ? "default" : "outline"}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setSplitMode("amount")}
                >
                  Amount
                </Button>
                <Button
                  type="button"
                  variant={splitMode === "percentage" ? "default" : "outline"}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setSplitMode("percentage")}
                >
                  Percentage
                </Button>
              </div>
            </div>
            
            {splits.map((split, index) => (
              <div key={index} className="p-3 border rounded-none space-y-2">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-medium">Split {index + 1}</h4>
                  {splits.length > 2 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => removeSplit(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Category</Label>
                    <Select
                      value={split.category}
                      onValueChange={(value) => updateSplit(index, 'category', value)}
                    >
                      <SelectTrigger className="w-full h-9">
                        <SelectValue className="truncate" />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat.charAt(0).toUpperCase() + cat.slice(1).replace('_', ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs">{splitMode === "amount" ? "Amount" : "Percentage"}</Label>
                    {splitMode === "amount" ? (
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="h-9"
                        value={split.amount === 0 ? "" : split.amount}
                        onChange={(e) => updateSplit(index, 'amount', e.target.value === "" ? 0 : parseFloat(e.target.value))}
                        placeholder="0.00"
                      />
                    ) : (
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        className="h-9"
                        value={receiptTotal > 0 && split.amount > 0 ? ((Number(split.amount) || 0) / receiptTotal) * 100 : ""}
                        onChange={(e) => {
                          const percent = e.target.value === "" ? 0 : parseFloat(e.target.value);
                          updateSplit(index, 'amount', receiptTotal * percent / 100);
                        }}
                        placeholder="0"
                      />
                    )}
                  </div>
                </div>
                
                <div className="space-y-1">
                  <Label className="text-xs">Notes (optional)</Label>
                  <Input
                    className="h-9"
                    value={split.notes}
                    onChange={(e) => updateSplit(index, 'notes', e.target.value)}
                    placeholder="Notes for this split"
                  />
                </div>
                
                <div className="text-xs text-muted-foreground">
                  {splitMode === "amount"
                    ? `${receiptTotal > 0 ? ((Number(split.amount) || 0) / receiptTotal * 100).toFixed(1) : "0"}%`
                    : formatCurrency(Number(split.amount) || 0)}
                </div>
              </div>
            ))}
            
            <div className="flex justify-between items-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={addSplit}
                disabled={splits.length >= 5}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Split
              </Button>
              
              <div className="text-xs font-medium">
                Total: {formatCurrency(totalSplitAmount)} ({totalSplitPercentage.toFixed(0)}%)
                {!isSplitBalanced && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={balanceSplits}
                    className="ml-2"
                  >
                    Balance
                  </Button>
                )}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSplitDialog(false)}
            >
              Cancel
            </Button>
              <Button
                onClick={() => splitMutation.mutate()}
                disabled={
                  splitMutation.isPending ||
                  !isSplitBalanced
                }
              >
              {splitMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Splitting...
                </>
              ) : (
                'Split Receipt'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
