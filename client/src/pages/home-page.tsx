import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ExpenseCategory, Receipt, EXPENSE_CATEGORIES } from "@shared/schema";
import { getReceiptCategoryLabel } from "@/utils/receipt-category";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  EnhancedButton,
  EnhancedReceiptCard,
  EnhancedEmptyState,
  SpacingContainer
} from "@/components/ui/enhanced-components";
import { FloatingActionButton } from "@/components/ui/floating-action-button";
import { PredictiveSearch } from "@/components/ui/predictive-search";
import { UnifiedSmartSearch } from "@/components/ui/unified-smart-search";
import { Swipeable, useReceiptSwipeActions } from "@/components/ui/swipeable";
import { motion } from "framer-motion";
import { useOfflineSync } from "@/hooks/use-offline-sync";

import { format } from "date-fns";
import { Link, useLocation, useRouter } from "wouter";
import { 
  Calendar as CalendarIcon, 
  Calculator,
  Download,
  FileText, 
  Filter, 
  Loader2, 
  Plus, 
  Receipt as ReceiptIcon,
  ShoppingBag,
  Tags,
  Tag,
  Trash2,
  Utensils,
  CheckSquare,
  Square,
  Camera,
  Search,
  LogOut,
  Brain,
  BarChart3,
  Users,
  Wallet,
  AlertTriangle,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Store,
  X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { PageLayout } from "@/components/page-layout";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import TaxAIAssistant from "@/components/TaxAIAssistant";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useMemo } from "react";


function HomePage() {
  console.log("[HomePage] Rendering HomePage component");
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>(() => {
    // Restore saved category filter if coming back from receipt detail
    const savedCategory = sessionStorage.getItem('home_category_filter');
    return savedCategory || "all";
  });
  const [showNeedsReview, setShowNeedsReview] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "amount" | "category">("date");
  const [activeTab, setActiveTab] = useState(() => {
    // Restore saved tab if coming back from receipt detail
    const savedTab = sessionStorage.getItem('home_active_tab');
    return savedTab || "analytics";
  });
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedReceipts, setSelectedReceipts] = useState<Set<number>>(new Set());
  const [isTaxAIOpen, setIsTaxAIOpen] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('');
  const isMobile = useIsMobile();
  const { isOnline, pendingUploads } = useOfflineSync();
  
  // Smart Filters state - restore from sessionStorage if coming back from receipt detail
  const [showSmartFilters, setShowSmartFilters] = useState(() => {
    return sessionStorage.getItem('home_show_smart_filters') === 'true';
  });
  const [dateFrom, setDateFrom] = useState<Date | undefined>(() => {
    const saved = sessionStorage.getItem('home_date_from');
    return saved ? new Date(saved) : undefined;
  });
  const [dateTo, setDateTo] = useState<Date | undefined>(() => {
    const saved = sessionStorage.getItem('home_date_to');
    return saved ? new Date(saved) : undefined;
  });
  const [amountMin, setAmountMin] = useState(() => {
    return sessionStorage.getItem('home_amount_min') || "";
  });
  const [amountMax, setAmountMax] = useState(() => {
    return sessionStorage.getItem('home_amount_max') || "";
  });
  const [vendorFilter, setVendorFilter] = useState(() => {
    return sessionStorage.getItem('home_vendor_filter') || "all";
  });

  // Fetch receipts
  const { data: receipts = [], isLoading, error } = useQuery<Receipt[]>({
    queryKey: ["/api/receipts"],
    enabled: !!user,
  });

  // Fetch monthly data for analytics
  const { data: monthlyData = [] } = useQuery<Array<{month: string, total: number}>>({
    queryKey: ["/api/analytics/monthly"],
    enabled: !!user,
  });

  // Fetch budget data
  const { data: budgets = [] } = useQuery<Array<{
    budgetId: number,
    budgetName: string,
    category: string,
    monthlyLimit: number,
    currentSpent: number,
    remainingBudget: number,
    percentageUsed: number,
    onTrack: boolean
  }>>({
    queryKey: ["/api/budgets"],
    enabled: !!user,
  });

  // Restore scroll position when returning from receipt detail page
  useEffect(() => {
    const savedPosition = sessionStorage.getItem('home_scroll_position');
    if (savedPosition && !isLoading && receipts.length > 0) {
      const scrollY = parseInt(savedPosition, 10);
      // Use setTimeout to ensure content is fully rendered after tab switch
      setTimeout(() => {
        window.scrollTo(0, scrollY);
        // Clear saved state after restoring
        sessionStorage.removeItem('home_scroll_position');
        sessionStorage.removeItem('home_active_tab');
        sessionStorage.removeItem('home_category_filter');
        sessionStorage.removeItem('home_show_smart_filters');
        sessionStorage.removeItem('home_date_from');
        sessionStorage.removeItem('home_date_to');
        sessionStorage.removeItem('home_amount_min');
        sessionStorage.removeItem('home_amount_max');
        sessionStorage.removeItem('home_vendor_filter');
      }, 300);
    }
  }, [isLoading, receipts.length]);

  // Fetch custom categories
  const { data: customCategories = [] } = useQuery<Array<{
    id: number,
    userId: number,
    name: string,
    displayName: string,
    description: string,
    color: string,
    icon: string,
    isActive: boolean
  }>>({
    queryKey: ["/api/custom-categories"],
    enabled: !!user,
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (receiptIds: number[]) => {
      console.log('Starting bulk delete for receipt IDs:', receiptIds);
      
      const results = await Promise.allSettled(
        receiptIds.map(async id => {
          try {
            await apiRequest('DELETE', `/api/receipts/${id}`);
            
            // Success
            console.log(`Successfully deleted receipt ${id}`);
            return { id, success: true };
          } catch (err: any) {
            // 404 means already deleted, which is fine
            if (err?.message?.includes('404') || err?.message?.includes('Not found')) {
              console.log(`Receipt ${id} already deleted (404)`);
              return { id, alreadyDeleted: true };
            }
            
            console.error(`Error deleting receipt ${id}:`, err);
            throw err;
          }
        })
      );
      
      const failed = results.filter(r => r.status === 'rejected');
      const succeeded = results.filter(r => r.status === 'fulfilled');
      
      console.log(`Bulk delete complete: ${succeeded.length} succeeded, ${failed.length} failed`);
      
      if (failed.length > 0) {
        console.error('Failed deletions:', failed);
        // Only throw if ALL deletions failed
        if (succeeded.length === 0) {
          throw new Error(`Failed to delete all ${failed.length} receipt(s)`);
        }
      }
      
      return results.map(r => r.status === 'fulfilled' ? r.value : null);
    },
    onSuccess: () => {
      console.log('Bulk delete mutation succeeded');
      queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/monthly"] });
      setSelectedReceipts(new Set());
      setBulkMode(false);
      toast({
        title: "Success",
        description: "Selected receipts have been deleted.",
      });
    },
    onError: (error) => {
      console.error('Bulk delete mutation error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete some receipts. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Bulk categorize mutation
  const bulkCategorizeMutation = useMutation({
    mutationFn: async ({ receiptIds, category }: { receiptIds: number[], category: string }) => {
      await Promise.all(
        receiptIds.map(id => 
          apiRequest('PATCH', `/api/receipts/${id}`, { category })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/receipts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/monthly'] });
      toast({
        title: "Receipts updated",
        description: `Successfully categorised ${selectedReceipts.size} receipt(s)`,
      });
      setSelectedReceipts(new Set());
      setShowCategoryDialog(false);
      setBulkCategory('');
      setBulkMode(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update receipts. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleBulkCategorize = () => {
    if (!bulkCategory) return;
    bulkCategorizeMutation.mutate({ 
      receiptIds: Array.from(selectedReceipts), 
      category: bulkCategory 
    });
  };

  // Helper to strip split suffix from vendor names (e.g., "Store Name (split 1/2)" -> "Store Name")
  const stripSplitSuffix = (name: string | null | undefined): string => {
    if (!name) return "";
    return name.replace(/\s*\(split \d+\/\d+\)$/i, "").trim();
  };

  // Unique vendors list for filter - normalize by stripping split suffixes
  const uniqueVendors = useMemo(() => {
    const vendors = new Set<string>();
    receipts.forEach(r => {
      if (r.storeName) {
        const baseVendor = stripSplitSuffix(r.storeName);
        if (baseVendor) vendors.add(baseVendor);
      }
    });
    return Array.from(vendors).sort();
  }, [receipts]);

  // Check if any smart filters are active
  const hasActiveSmartFilters = dateFrom || dateTo || amountMin || amountMax || vendorFilter !== "all";

  // Clear all smart filters
  const clearSmartFilters = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setAmountMin("");
    setAmountMax("");
    setVendorFilter("all");
  };

  // Filter and sort receipts
  const filteredReceipts = receipts
    .filter((receipt) => {
      const matchesSearch = receipt.storeName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          receipt.notes?.toLowerCase().includes(searchQuery.toLowerCase());
      const receiptCategoryLabel = getReceiptCategoryLabel(receipt.category, receipt.notes);
      const normalizedFilter = categoryFilter.toLowerCase().replace(/_/g, ' ');
      const normalizedLabel = receiptCategoryLabel.toLowerCase().replace(/_/g, ' ');
      const matchesCategory = categoryFilter === "all" || receipt.category === categoryFilter || normalizedLabel === normalizedFilter;
      
      // Filter by confidence score if "Needs Review" is enabled
      let matchesConfidence = true;
      if (showNeedsReview) {
        const raw = receipt.confidenceScore ? parseFloat(receipt.confidenceScore) : 100;
        const pct = raw > 1 ? raw : raw * 100;
        matchesConfidence = pct < 80;
      }
      
      // Smart Filters: Date range
      let matchesDateRange = true;
      if (dateFrom || dateTo) {
        const receiptDate = new Date(receipt.date);
        if (dateFrom) {
          matchesDateRange = matchesDateRange && receiptDate >= dateFrom;
        }
        if (dateTo) {
          const endOfDay = new Date(dateTo);
          endOfDay.setHours(23, 59, 59, 999);
          matchesDateRange = matchesDateRange && receiptDate <= endOfDay;
        }
      }

      // Smart Filters: Amount range
      let matchesAmountRange = true;
      const amount = parseFloat(receipt.total);
      if (amountMin && !isNaN(parseFloat(amountMin))) {
        matchesAmountRange = matchesAmountRange && amount >= parseFloat(amountMin);
      }
      if (amountMax && !isNaN(parseFloat(amountMax))) {
        matchesAmountRange = matchesAmountRange && amount <= parseFloat(amountMax);
      }

      // Smart Filters: Vendor - compare base vendor names (ignore split suffixes)
      const matchesVendor = vendorFilter === "all" || stripSplitSuffix(receipt.storeName) === vendorFilter;
      
      return matchesSearch && matchesCategory && matchesConfidence && matchesDateRange && matchesAmountRange && matchesVendor;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "date":
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case "amount":
          return parseFloat(b.total) - parseFloat(a.total);
        case "category":
          return (a.category || "").localeCompare(b.category || "");
        default:
          return 0;
      }
    });

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const selectAllReceipts = () => {
    setSelectedReceipts(new Set(filteredReceipts.map((r: Receipt) => r.id)));
  };

  const clearSelection = () => {
    setSelectedReceipts(new Set());
  };

  // Swipe actions helper function
  const getSwipeActions = (receipt: Receipt) => {
    return {
      leftActions: [
        {
          icon: <span className="text-sm">✏️</span>,
          onClick: () => {
            sessionStorage.setItem('home_scroll_position', window.scrollY.toString());
            sessionStorage.setItem('home_active_tab', activeTab);
            sessionStorage.setItem('home_category_filter', categoryFilter);
            sessionStorage.setItem('home_show_smart_filters', showSmartFilters.toString());
            if (dateFrom) sessionStorage.setItem('home_date_from', dateFrom.toISOString());
            if (dateTo) sessionStorage.setItem('home_date_to', dateTo.toISOString());
            sessionStorage.setItem('home_amount_min', amountMin);
            sessionStorage.setItem('home_amount_max', amountMax);
            sessionStorage.setItem('home_vendor_filter', vendorFilter);
            window.location.href = `/receipt/${receipt.id}/edit`;
          },
          color: '#3b82f6',
          label: 'Edit receipt'
        }
      ],
      rightActions: [
        {
          icon: <span className="text-sm">🏷️</span>,
          onClick: () => {
            // Handle tagging
            toast({
              title: "Feature Coming Soon",
              description: "Tagging functionality will be available soon.",
            });
          },
          color: '#8b5cf6',
          label: 'Add tags'
        },
        {
          icon: <span className="text-sm">🗑️</span>,
          onClick: () => {
            // Handle delete
            if (confirm('Are you sure you want to delete this receipt?')) {
              fetch(`/api/receipts/${receipt.id}`, { method: 'DELETE' })
                .then(() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
                  toast({
                    title: "Success",
                    description: "Receipt deleted successfully.",
                  });
                })
                .catch(() => {
                  toast({
                    title: "Error",
                    description: "Failed to delete receipt.",
                    variant: "destructive",
                  });
                });
            }
          },
          color: '#ef4444',
          label: 'Delete receipt'
        }
      ]
    };
  };

  if (isLoading) {
    return (
      <PageLayout title="Loading">
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout title="Error">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-gray-600">Please try refreshing the page</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 android-safe-area responsive-container">
      {/* Main Container with mobile spacing for FAB */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-6 space-y-6 landscape-optimized">
        {/* Header Section */}
        <div className="bg-white rounded-none shadow-sm border border-gray-200 p-6">
          {/* Top Navigation */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <img 
                  src="attached_assets/SIMPLE-slips.svg"
                  alt="Simple Slips" 
                  className="h-10 w-auto"
                  onError={(e) => {
                    // Fallback to text if image fails to load
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const fallback = document.createElement('div');
                    fallback.className = 'flex items-center gap-2';
                    fallback.innerHTML = `
                      <div class="w-8 h-8 bg-primary rounded-none flex items-center justify-center">
                        <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                        </svg>
                      </div>
                      <span class="text-xl font-bold text-gray-900">Simple Slips</span>
                    `;
                    target.parentNode?.appendChild(fallback);
                  }}
                />
              </div>
            </div>

            {/* Desktop Navigation Menu */}
            {!isMobile && (
              <div className="flex items-center gap-6">
                <Link href="/upload">
                  <Button className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white">
                    <Camera className="h-4 w-4" />
                    Scan Receipt
                  </Button>
                </Link>
                <Link href="/smart">
                  <Button variant="ghost" className="flex items-center gap-2">
                    <Brain className="h-4 w-4" />
                    Smart AI
                  </Button>
                </Link>
                <Link href="/analytics">
                  <Button variant="ghost" className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Insights
                  </Button>
                </Link>
                <Link href="/business-hub">
                  <Button variant="ghost" className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4" />
                    Business
                  </Button>
                </Link>
                <Link href="/profile">
                  <Button variant="ghost" className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    Profile
                  </Button>
                </Link>
              </div>
            )}

            {/* User Actions */}
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => logout()}
                aria-label="Logout"
              >
                <LogOut className="h-4 w-4 mr-2" />
                {!isMobile && "Logout"}
              </Button>
            </div>
          </div>

          {/* Welcome Section */}
          <div className="text-center">
            <h1 className="font-bold text-gray-900 text-[23px]">
              {getGreeting()}, {user?.fullName || user?.username}!
            </h1>
            <p className="text-gray-600 mt-1 text-[15px]">
              Let's show your wallet who's boss—Pro style.
            </p>
            
            {/* Offline sync status */}
            {!isOnline && (
              <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-md text-sm">
                <div className="flex items-center justify-center gap-2 text-orange-700">
                  <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                  <span>You're offline</span>
                </div>
              </div>
            )}
            
            {pendingUploads.length > 0 && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm">
                <div className="flex items-center justify-center gap-2 text-blue-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{pendingUploads.length} receipt{pendingUploads.length > 1 ? 's' : ''} waiting to upload</span>
                </div>
              </div>
            )}
            
            {/* Smart Search Integration */}
            <div className="mt-6 max-w-4xl mx-auto px-4">
              <div className="relative">
                <UnifiedSmartSearch 
                  source="home"
                  className="w-full"
                  showSuggestions={true}
                  currentData={receipts}
                  placeholder=""
                  onSearch={(query) => {
                    // Fallback navigation if component doesn't handle search
                    if (query.trim()) {
                      window.location.href = `/search?q=${encodeURIComponent(query)}`;
                    }
                  }}
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                  <div className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-none">
                    <Brain className="h-3 w-3" />
                    <span>Smart AI</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 text-sm text-gray-600">
                <div className="text-xs text-gray-700 font-medium mb-1">
                  Search receipts by store, category, amount, or date
                </div>
                <div className="text-xs text-gray-500 flex items-center gap-1">
                  <span>Try:</span>
                  <span className="text-blue-600">"Coffee"</span>
                  <span>or</span>
                  <span className="text-blue-600">"Woolworths"</span>
                  <span>or</span>
                  <span className="text-blue-600">"over R100"</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-none shadow-sm border border-gray-200 overflow-hidden">
          {/* Bulk Operations Toolbar - Desktop only */}
          {bulkMode && !isMobile && (
            <div className="p-6 bg-blue-50 border-b border-blue-200">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="text-sm font-medium text-blue-900">
                  {selectedReceipts.size} of {filteredReceipts.length} selected
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={selectAllReceipts}>
                    Select All
                  </Button>
                  <Button size="sm" variant="outline" onClick={clearSelection}>
                    Clear
                  </Button>
                </div>
              </div>
              {selectedReceipts.size > 0 && (
                <div className="flex gap-2 mt-4">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setShowCategoryDialog(true)}
                    disabled={bulkCategorizeMutation.isPending}
                  >
                    {bulkCategorizeMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Tag className="h-4 w-4 mr-2" />
                    )}
                    Bulk Categorise
                  </Button>
                  <Button 
                    size="sm" 
                    variant="destructive"
                    onClick={() => bulkDeleteMutation.mutate(Array.from(selectedReceipts))}
                    disabled={bulkDeleteMutation.isPending}
                  >
                    {bulkDeleteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Delete Selected
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Main Content Area */}
          <div className="p-6">
            <Tabs defaultValue="analytics" value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-6">
                <TabsTrigger value="analytics" className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Analytics
                </TabsTrigger>
                <TabsTrigger value="receipts" className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Receipts ({filteredReceipts.length})
                </TabsTrigger>
              </TabsList>

              {/* Analytics Tab */}
              <TabsContent value="analytics" className="space-y-6">
                {/* Quick Stats Cards - Desktop: 2 rows of 3 cards each */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 mb-6">
                    <Card className="hover:shadow-lg transition-shadow">
                      <CardContent className="overflow-hidden p-4 pl-[40px] pr-[40px] pt-[24px] pb-[24px]">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-none flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5 text-blue-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide truncate">Total Receipts</p>
                            <p className="text-xl font-bold text-gray-900 truncate">{receipts.length}</p>
                          </div>
                        </div>
                        {!isMobile && (
                          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                            <p className="text-xs text-gray-500 truncate">
                              {receipts.filter(r => new Date(r.createdAt).getMonth() === new Date().getMonth()).length} this month
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              Avg: R {receipts.length > 0 ? (receipts.reduce((sum, r) => sum + parseFloat(r.total || '0'), 0) / receipts.length).toFixed(0) : '0'} per receipt
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="hover:shadow-lg transition-shadow">
                      <CardContent className="overflow-hidden p-4 pl-[40px] pr-[40px] pt-[24px] pb-[24px]">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-green-100 rounded-none flex items-center justify-center shrink-0">
                            <Wallet className="w-5 h-5 text-green-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide truncate">This Month</p>
                            <p className="text-xl font-bold text-gray-900 truncate">
                              R {(() => {
                                // Get current month in YYYY-MM format
                                const currentMonth = new Date().toISOString().slice(0, 7);
                                // Find current month data
                                const currentMonthData = monthlyData.find(m => m.month === currentMonth);
                                return currentMonthData ? currentMonthData.total.toFixed(2) : '0.00';
                              })()}
                            </p>
                          </div>
                        </div>
                        {!isMobile && (
                          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                            <p className="text-xs text-gray-500 truncate">
                              {receipts.filter(r => new Date(r.date).getMonth() === new Date().getMonth()).length} receipts
                            </p>
                            <p className="text-xs text-green-600 truncate">
                              {(() => {
                                const currentMonth = new Date().toISOString().slice(0, 7);
                                const currentMonthData = monthlyData.find(m => m.month === currentMonth);
                                
                                // Get last month (previous month)
                                const lastMonthDate = new Date();
                                lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
                                const lastMonth = lastMonthDate.toISOString().slice(0, 7);
                                const lastMonthData = monthlyData.find(m => m.month === lastMonth);
                                
                                if (currentMonthData && lastMonthData) {
                                  const change = ((currentMonthData.total - lastMonthData.total) / lastMonthData.total * 100);
                                  return (change > 0 ? '+' : '') + change.toFixed(0) + '% vs last month';
                                }
                                return 'No comparison data';
                              })()}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Additional Desktop Cards */}
                    {!isMobile && (
                      <>
                        <Card className="hover:shadow-lg transition-shadow">
                          <CardContent className="overflow-hidden p-4 pl-[40px] pr-[40px] pt-[24px] pb-[24px]">
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 bg-purple-100 rounded-none flex items-center justify-center shrink-0">
                                <Tags className="w-5 h-5 text-purple-600" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-gray-600 uppercase tracking-wide truncate">Top Category</p>
                                <p className="text-lg font-bold text-gray-900 truncate">
                                  {(() => {
                                    const categoryCount = receipts.reduce((acc, receipt) => {
                                      acc[receipt.category] = (acc[receipt.category] || 0) + 1;
                                      return acc;
                                    }, {} as Record<string, number>);
                                    const topCategory = Object.entries(categoryCount).sort(([,a], [,b]) => b - a)[0];
                                    const categoryName = topCategory ? topCategory[0].charAt(0).toUpperCase() + topCategory[0].slice(1) : 'None';
                                    return categoryName.length > 10 ? categoryName.substring(0, 10) + '...' : categoryName;
                                  })()}
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                              <p className="text-xs text-gray-500 truncate">
                                {(() => {
                                  const categoryCount = receipts.reduce((acc, receipt) => {
                                    acc[receipt.category] = (acc[receipt.category] || 0) + 1;
                                    return acc;
                                  }, {} as Record<string, number>);
                                  const topCategory = Object.entries(categoryCount).sort(([,a], [,b]) => b - a)[0];
                                  return topCategory ? `${topCategory[1]} receipts` : '0 receipts';
                                })()}
                              </p>
                              <p className="text-xs text-purple-600 truncate">
                                R {(() => {
                                  const categoryCount = receipts.reduce((acc, receipt) => {
                                    acc[receipt.category] = (acc[receipt.category] || 0) + 1;
                                    return acc;
                                  }, {} as Record<string, number>);
                                  const topCategory = Object.entries(categoryCount).sort(([,a], [,b]) => b - a)[0];
                                  if (!topCategory) return '0.00';
                                  const categoryTotal = receipts
                                    .filter(r => r.category === topCategory[0])
                                    .reduce((sum, r) => sum + parseFloat(r.total || '0'), 0);
                                  return categoryTotal.toFixed(2);
                                })()} total
                              </p>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="hover:shadow-lg transition-shadow">
                          <CardContent className="overflow-hidden p-4 pl-[40px] pr-[40px] pt-[24px] pb-[24px]">
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 bg-orange-100 rounded-none flex items-center justify-center shrink-0">
                                <CalendarIcon className="w-5 h-5 text-orange-600" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-gray-600 uppercase tracking-wide truncate">Recent Activity</p>
                                <p className="text-xl font-bold text-gray-900 truncate">
                                  {receipts.filter(r => {
                                    const receiptDate = new Date(r.createdAt);
                                    const weekAgo = new Date();
                                    weekAgo.setDate(weekAgo.getDate() - 7);
                                    return receiptDate >= weekAgo;
                                  }).length}
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                              <p className="text-xs text-gray-500 truncate">
                                Last 7 days
                              </p>
                              <p className="text-xs text-orange-600 truncate">
                                R {receipts
                                  .filter(r => {
                                    const receiptDate = new Date(r.createdAt);
                                    const weekAgo = new Date();
                                    weekAgo.setDate(weekAgo.getDate() - 7);
                                    return receiptDate >= weekAgo;
                                  })
                                  .reduce((sum, r) => sum + parseFloat(r.total || '0'), 0)
                                  .toFixed(2)
                                } spent
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      </>
                    )}
                </div>

                {/* Monthly Budget Progress & Quick Actions */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Budget Progress Card */}
                  <Card>
                    <CardContent className="overflow-hidden p-6 pl-[40px] pr-[40px] pt-[60px] pb-[60px]">
                      <div className="space-y-4">
                        {/* Monthly spending goal */}
                        <Link href="/budgets" className="block space-y-2 hover:bg-gray-50 p-2 rounded-none transition-colors -m-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">Monthly Budget</span>
                            <span className="text-sm text-gray-500">
                              {(() => {
                                const totalBudget = budgets.reduce((sum, budget) => sum + budget.monthlyLimit, 0);
                                const totalSpent = budgets.reduce((sum, budget) => sum + budget.currentSpent, 0);
                                return totalBudget > 0 ? `R ${totalSpent.toFixed(2)} / R ${totalBudget.toFixed(2)}` : 'No budgets set';
                              })()}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-none h-3">
                            <div 
                              className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-none transition-all duration-300"
                              style={{ 
                                width: `${(() => {
                                  const totalBudget = budgets.reduce((sum, budget) => sum + budget.monthlyLimit, 0);
                                  const totalSpent = budgets.reduce((sum, budget) => sum + budget.currentSpent, 0);
                                  return totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0;
                                })()}%`
                              }}
                            ></div>
                          </div>
                          <div className="text-xs text-gray-600">
                            {(() => {
                              const totalBudget = budgets.reduce((sum, budget) => sum + budget.monthlyLimit, 0);
                              const totalSpent = budgets.reduce((sum, budget) => sum + budget.currentSpent, 0);
                              if (totalBudget === 0) return 'Click to set up budgets';
                              const percentage = (totalSpent / totalBudget) * 100;
                              return `${percentage.toFixed(1)}% of monthly budget`;
                            })()}
                          </div>
                        </Link>

                        {/* Tax-ready receipts goal */}
                        <Link href="/tax-pros" className="block space-y-2 hover:bg-gray-50 p-2 rounded-none transition-colors -m-2">
                          <div className={`flex justify-between items-center ${isMobile ? 'gap-4' : ''}`}>
                            <span className="text-sm font-medium">Tax Preparation</span>
                            <span className="text-sm text-gray-500">
                              {receipts.filter(r => r.isTaxDeductible).length} deductible
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-none h-3">
                            <div 
                              className="bg-gradient-to-r from-purple-500 to-purple-600 h-3 rounded-none transition-all duration-300"
                              style={{ 
                                width: `${receipts.length > 0 ? ((receipts.filter(r => r.isTaxDeductible).length / receipts.length) * 100) : 0}%` 
                              }}
                            ></div>
                          </div>
                          <div className="text-xs text-gray-600">
                            R {receipts.filter(r => r.isTaxDeductible).reduce((sum, r) => sum + parseFloat(r.total || '0'), 0).toLocaleString()} in deductions
                          </div>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Quick Actions Card */}
                  <Card>
                    <CardContent className="overflow-hidden p-6 pt-[60px] pb-[60px] pl-[40px] pr-[40px]">
                      <h3 className="font-semibold text-gray-900 mb-4">Quick Actions</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <Button 
                          variant="outline" 
                          className="h-auto p-4 flex flex-col gap-2 pt-[0px] pb-[0px] pl-[0px] pr-[0px]"
                          onClick={() => setIsTaxAIOpen(true)}
                          data-testid="button-tax-info-chat"
                        >
                          <Calculator className="w-5 h-5" />
                          <span className="font-medium text-[12px]">Tax Info</span>
                        </Button>
                        <Button variant="outline" className="h-auto p-4 flex flex-col gap-2" asChild>
                          <Link href="/analytics">
                            <BarChart3 className="w-5 h-5" />
                            <span className="text-[12px]">View Analytics</span>
                          </Link>
                        </Button>
                        <Button variant="outline" className="h-auto p-4 flex flex-col gap-2" asChild>
                          <Link href="/quotations">
                            <FileText className="w-5 h-5" />
                            <span className="text-[12px]">Quotations</span>
                          </Link>
                        </Button>
                        <Button variant="outline" className="h-auto p-4 flex flex-col gap-2" asChild>
                          <Link href="/exports">
                            <Download className="w-5 h-5" />
                            <span className="text-[12px]">Exports</span>
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Top Stores This Month */}
                <Card className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Store className="w-5 h-5 text-primary" />
                      <h3 className="font-semibold text-gray-900">Top Stores This Month</h3>
                    </div>
                    <div className="space-y-3">
                      {(() => {
                        const currentMonth = new Date().getMonth();
                        const currentYear = new Date().getFullYear();
                        const thisMonthReceipts = receipts.filter(r => {
                          const receiptDate = new Date(r.date);
                          return receiptDate.getMonth() === currentMonth && receiptDate.getFullYear() === currentYear;
                        });
                        
                        const vendorStats = thisMonthReceipts.reduce((acc, receipt) => {
                          const store = receipt.storeName || 'Unknown';
                          if (!acc[store]) {
                            acc[store] = { visits: 0, total: 0 };
                          }
                          acc[store].visits += 1;
                          acc[store].total += parseFloat(receipt.total || '0');
                          return acc;
                        }, {} as Record<string, { visits: number; total: number }>);
                        
                        const topVendors = Object.entries(vendorStats)
                          .sort(([, a], [, b]) => b.total - a.total)
                          .slice(0, 3);
                        
                        if (topVendors.length === 0) {
                          return (
                            <p className="text-sm text-gray-500 text-center py-4">
                              No receipts this month yet
                            </p>
                          );
                        }
                        
                        return topVendors.map(([store, stats], index) => (
                          <div 
                            key={store} 
                            className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                            data-testid={`top-vendor-${index}`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-sm font-medium text-gray-400 w-4">{index + 1}</span>
                              <span className="text-sm font-medium text-gray-900 truncate">{store}</span>
                            </div>
                            <div className="flex items-center gap-4 flex-shrink-0">
                              <span className="text-xs text-gray-500">{stats.visits} {stats.visits === 1 ? 'visit' : 'visits'}</span>
                              <span className="text-sm font-semibold text-primary">R{stats.total.toFixed(0)}</span>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  </CardContent>
                </Card>

              </TabsContent>

              {/* Receipts Tab */}
              <TabsContent value="receipts" className="space-y-4 pb-32">
                {/* Search and Basic Filters */}
                <div className="space-y-3">
                  <div className="flex-1">
                    <Label htmlFor="search" className="text-sm font-medium">Search receipts</Label>
                    <Input
                      id="search"
                      type="text"
                      placeholder="Search by store name or description..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full mt-1"
                      data-testid="input-search-receipts"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="category" className="text-sm font-medium">Category</Label>
                      <Select value={categoryFilter} onValueChange={setCategoryFilter as any}>
                        <SelectTrigger className="mt-1" data-testid="select-category-filter">
                          <SelectValue placeholder="All categories" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All categories</SelectItem>
                          {EXPENSE_CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat.charAt(0).toUpperCase() + cat.slice(1)}
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
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="sort" className="text-sm font-medium">Sort by</Label>
                      <Select value={sortBy} onValueChange={setSortBy as any}>
                        <SelectTrigger className="mt-1" data-testid="select-sort-by">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="date">Date</SelectItem>
                          <SelectItem value="amount">Amount</SelectItem>
                          <SelectItem value="category">Category</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={showNeedsReview ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowNeedsReview(!showNeedsReview)}
                    className={showNeedsReview ? "bg-amber-600 hover:bg-amber-700" : ""}
                    data-testid="button-filter-needs-review"
                  >
                    <AlertTriangle className="h-4 w-4 mr-1.5" />
                    Needs Review
                  </Button>
                  <Button
                    variant={bulkMode ? "default" : "outline"}
                    size="sm"
                    onClick={() => setBulkMode(!bulkMode)}
                    data-testid="button-bulk-select"
                  >
                    <CheckSquare className="h-4 w-4 mr-1.5" />
                    Bulk Select
                  </Button>
                </div>

                {/* Smart Filters - Collapsible */}
                <Collapsible open={showSmartFilters} onOpenChange={setShowSmartFilters}>
                  <CollapsibleTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="w-full justify-between text-gray-600 hover:text-gray-900 border border-dashed border-gray-300 hover:border-gray-400"
                      data-testid="button-toggle-smart-filters"
                    >
                      <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4" />
                        <span>Smart Filters</span>
                        {hasActiveSmartFilters && (
                          <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                            Active
                          </Badge>
                        )}
                      </div>
                      {showSmartFilters ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3">
                    <div className="p-4 bg-gray-50 rounded-[2px] border border-gray-200 space-y-4">
                      {/* Date Range */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <CalendarIcon className="h-4 w-4 text-gray-500" />
                          <Label className="text-sm font-medium">Date Range</Label>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-gray-500">From</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="w-full mt-1 justify-start text-left font-normal h-9 px-2 text-xs sm:text-sm sm:px-3"
                                  data-testid="input-date-from"
                                >
                                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5 flex-shrink-0" />
                                  <span className="truncate">
                                    {dateFrom ? format(dateFrom, "dd MMM") : "Pick date"}
                                  </span>
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={dateFrom}
                                  onSelect={setDateFrom}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div>
                            <Label className="text-xs text-gray-500">To</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="w-full mt-1 justify-start text-left font-normal h-9 px-2 text-xs sm:text-sm sm:px-3"
                                  data-testid="input-date-to"
                                >
                                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5 flex-shrink-0" />
                                  <span className="truncate">
                                    {dateTo ? format(dateTo, "dd MMM") : "Pick date"}
                                  </span>
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={dateTo}
                                  onSelect={setDateTo}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      </div>

                      {/* Amount Range */}
                      <div>
                        <Label className="text-sm font-medium">Amount Range (R)</Label>
                        <div className="grid grid-cols-2 gap-3 mt-2">
                          <div>
                            <Label className="text-xs text-gray-500">Min</Label>
                            <Input
                              type="number"
                              placeholder="0"
                              value={amountMin}
                              onChange={(e) => setAmountMin(e.target.value)}
                              className="mt-1"
                              data-testid="input-amount-min"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-gray-500">Max</Label>
                            <Input
                              type="number"
                              placeholder="No limit"
                              value={amountMax}
                              onChange={(e) => setAmountMax(e.target.value)}
                              className="mt-1"
                              data-testid="input-amount-max"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Vendor Filter */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Store className="h-4 w-4 text-gray-500" />
                          <Label className="text-sm font-medium">Vendor</Label>
                        </div>
                        <Select value={vendorFilter} onValueChange={setVendorFilter}>
                          <SelectTrigger data-testid="select-vendor-filter">
                            <SelectValue placeholder="All vendors" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All vendors</SelectItem>
                            {uniqueVendors.map((vendor) => (
                              <SelectItem key={vendor} value={vendor}>
                                {vendor}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Clear Filters Button */}
                      {hasActiveSmartFilters && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={clearSmartFilters}
                          className="w-full"
                          data-testid="button-clear-smart-filters"
                        >
                          <X className="h-4 w-4 mr-1.5" />
                          Clear All Filters
                        </Button>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Results count */}
                <div className="text-sm text-gray-500">
                  Showing {filteredReceipts.length} of {receipts.length} receipts
                </div>

                {/* Receipts List */}
                {filteredReceipts.length === 0 ? (
                  <EnhancedEmptyState
                    icon={<Search className="w-12 h-12 text-muted-foreground" />}
                    title="No receipts found"
                    description="Start by scanning your first receipt or adjust your search filters"
                    onAction={() => window.location.href = '/upload'}
                    actionLabel="Scan Receipt"
                  />
                ) : (
                  <SpacingContainer>
                    {filteredReceipts.map((receipt) => {
                      return (
                        <motion.div
                          key={receipt.id}
                          layout
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                        >
                          <Swipeable
                            leftActions={getSwipeActions(receipt).leftActions}
                            rightActions={getSwipeActions(receipt).rightActions}
                          >
                            <div className="relative">
                              {bulkMode && (
                                <div className="absolute left-2 top-2 z-10">
                                  <input
                                    type="checkbox"
                                    checked={selectedReceipts.has(receipt.id)}
                                    onChange={(e) => {
                                      const newSelected = new Set(selectedReceipts);
                                      if (e.target.checked) {
                                        newSelected.add(receipt.id);
                                      } else {
                                        newSelected.delete(receipt.id);
                                      }
                                      setSelectedReceipts(newSelected);
                                    }}
                                    className="w-4 h-4"
                                  />
                                </div>
                              )}
                              <EnhancedReceiptCard
                                receipt={{
                                  id: receipt.id,
                                  storeName: receipt.storeName || 'Unknown Store',
                                  total: parseFloat(receipt.total),
                                  date: typeof receipt.date === 'string' ? receipt.date : receipt.date.toISOString(),
                                  category: receipt.category || 'other',
                                  notes: receipt.notes,
                                  reportLabel: receipt.reportLabel,
                                  confidenceScore: receipt.confidenceScore,
                                  source: receipt.source,
                                  isPotentialDuplicate: receipt.isPotentialDuplicate
                                }}
                                onClick={() => {
                                  if (bulkMode) {
                                    const newSelected = new Set(selectedReceipts);
                                    if (selectedReceipts.has(receipt.id)) {
                                      newSelected.delete(receipt.id);
                                    } else {
                                      newSelected.add(receipt.id);
                                    }
                                    setSelectedReceipts(newSelected);
                                  } else {
                                    sessionStorage.setItem('home_scroll_position', window.scrollY.toString());
                                    sessionStorage.setItem('home_active_tab', activeTab);
                                    sessionStorage.setItem('home_category_filter', categoryFilter);
                                    sessionStorage.setItem('home_show_smart_filters', showSmartFilters.toString());
                                    if (dateFrom) sessionStorage.setItem('home_date_from', dateFrom.toISOString());
                                    if (dateTo) sessionStorage.setItem('home_date_to', dateTo.toISOString());
                                    sessionStorage.setItem('home_amount_min', amountMin);
                                    sessionStorage.setItem('home_amount_max', amountMax);
                                    sessionStorage.setItem('home_vendor_filter', vendorFilter);
                                    window.location.href = `/receipt/${receipt.id}`;
                                  }
                                }}
                                onLongPress={() => {
                                  if (!bulkMode) {
                                    setBulkMode(true);
                                    setSelectedReceipts(new Set([receipt.id]));
                                  }
                                }}
                                className={bulkMode && selectedReceipts.has(receipt.id) ? 'bg-blue-50 border-blue-200' : ''}
                              />
                            </div>
                          </Swipeable>
                        </motion.div>
                      );
                    })}
                  </SpacingContainer>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
      {/* Enhanced Mobile Scan Receipt Button - Hidden in bulk mode */}
      {isMobile && !bulkMode && (
        <motion.div 
          className="fixed bottom-[72px] left-0 right-0 z-10 px-4 py-3 bg-white border-t border-gray-200"
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <Link href="/upload" className="block w-full">
            <EnhancedButton 
              variant="primary"
              size="lg"
              className="w-full shadow-lg shadow-primary/30 hover:shadow-primary/40 rounded-none font-semibold"
              aria-label="Scan a new receipt"
              style={{ minHeight: '48px' }}
            >
              <Plus className="h-5 w-5 mr-2" />
              Scan Receipt
            </EnhancedButton>
          </Link>
        </motion.div>
      )}
      
      {/* Bulk Select Action Bar - Mobile */}
      {isMobile && bulkMode && (
        <motion.div 
          className="fixed bottom-[72px] left-0 right-0 z-20 px-3 py-2 bg-white border-t border-gray-200 shadow-lg"
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button 
                variant="ghost" 
                className="h-11 px-3 min-w-[44px]"
                onClick={() => {
                  setBulkMode(false);
                  setSelectedReceipts(new Set());
                }}
                data-testid="button-cancel-selection"
              >
                <X className="h-5 w-5" />
              </Button>
              <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                {selectedReceipts.size}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="h-11 px-3 text-xs min-w-[44px]"
                onClick={selectAllReceipts}
                data-testid="button-select-all"
              >
                All
              </Button>
              <Button 
                variant="outline"
                className="h-11 px-4 min-w-[44px]"
                onClick={() => setShowCategoryDialog(true)}
                disabled={selectedReceipts.size === 0 || bulkCategorizeMutation.isPending}
                data-testid="button-bulk-categorize-mobile"
              >
                {bulkCategorizeMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Tag className="h-5 w-5" />
                )}
              </Button>
              <Button 
                variant="destructive"
                className="h-11 px-4 min-w-[44px]"
                onClick={() => bulkDeleteMutation.mutate(Array.from(selectedReceipts))}
                disabled={selectedReceipts.size === 0 || bulkDeleteMutation.isPending}
                data-testid="button-delete-selected"
              >
                {bulkDeleteMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Trash2 className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
      
      {/* Mobile Navigation */}
      {isMobile && <MobileBottomNav />}
      
      {/* Tax Information Bot - Hidden in bulk mode */}
      {!bulkMode && (
        <TaxAIAssistant 
          isOpen={isTaxAIOpen} 
          onToggle={setIsTaxAIOpen} 
        />
      )}

      {/* Bulk Categorise Dialog */}
      <AlertDialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Categorise Selected Receipts</AlertDialogTitle>
            <AlertDialogDescription>
              Choose a category for {selectedReceipts.size} receipt(s):
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Select value={bulkCategory} onValueChange={setBulkCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ')}
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
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBulkCategorize}
              disabled={!bulkCategory || bulkCategorizeMutation.isPending}
            >
              {bulkCategorizeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Categorising...
                </>
              ) : (
                `Categorise ${selectedReceipts.size} Receipt(s)`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default HomePage;