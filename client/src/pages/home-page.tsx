import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ExpenseCategory, Receipt, EXPENSE_CATEGORIES } from "@shared/schema";
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
  Calendar, 
  Calculator,
  Download,
  FileText, 
  Filter, 
  Loader2, 
  Plus, 
  Receipt as ReceiptIcon,
  ShoppingBag,
  Tags,
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
  Briefcase
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PageLayout } from "@/components/page-layout";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import TaxAIAssistant from "@/components/TaxAIAssistant";


function HomePage() {
  console.log("[HomePage] Rendering HomePage component");
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showNeedsReview, setShowNeedsReview] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "amount" | "category">("date");
  const [activeTab, setActiveTab] = useState("analytics");
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedReceipts, setSelectedReceipts] = useState<Set<number>>(new Set());
  const [isTaxAIOpen, setIsTaxAIOpen] = useState(false);
  const isMobile = useIsMobile();
  const { isOnline, pendingUploads } = useOfflineSync();

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

  // Filter and sort receipts
  const filteredReceipts = receipts
    .filter((receipt) => {
      const matchesSearch = receipt.storeName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          receipt.notes?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === "all" || receipt.category === categoryFilter;
      
      // Filter by confidence score if "Needs Review" is enabled
      let matchesConfidence = true;
      if (showNeedsReview) {
        const confidenceScore = receipt.confidenceScore ? parseFloat(receipt.confidenceScore) : 1;
        matchesConfidence = confidenceScore < 0.8;
      }
      
      return matchesSearch && matchesCategory && matchesConfidence;
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

  const exportSelectedReceipts = async () => {
    try {
      const selectedData = filteredReceipts.filter(r => selectedReceipts.has(r.id));
      const csvContent = [
        ['Date', 'Store', 'Amount', 'Category', 'Notes'].join(','),
        ...selectedData.map(r => [
          format(new Date(r.date), 'yyyy-MM-dd'),
          r.storeName || '',
          r.total.toString(),
          r.category || '',
          r.notes || ''
        ].join(','))
      ].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipts-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Success",
        description: "Receipts exported successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export receipts.",
        variant: "destructive",
      });
    }
  };

  // Swipe actions helper function
  const getSwipeActions = (receipt: Receipt) => {
    return {
      leftActions: [
        {
          icon: <span className="text-sm">✏️</span>,
          onClick: () => window.location.href = `/receipt/${receipt.id}/edit`,
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
          {/* Bulk Operations Toolbar */}
          {bulkMode && (
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
                    onClick={exportSelectedReceipts}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
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
                                <Calendar className="w-5 h-5 text-orange-600" />
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
                        >
                          <Calculator className="w-5 h-5" />
                          <span className="font-medium text-[12px]">Tax AI Chat</span>
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
                

              </TabsContent>

              {/* Receipts Tab */}
              <TabsContent value="receipts" className="space-y-6">
                {/* Filters and Actions */}
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <Label htmlFor="search">Search receipts</Label>
                    <Input
                      id="search"
                      type="text"
                      placeholder="Search by store name or description..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div className="md:w-48">
                    <Label htmlFor="category">Category</Label>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter as any}>
                      <SelectTrigger>
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
                  <div className="md:w-32">
                    <Label htmlFor="sort">Sort by</Label>
                    <Select value={sortBy} onValueChange={setSortBy as any}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="date">Date</SelectItem>
                        <SelectItem value="amount">Amount</SelectItem>
                        <SelectItem value="category">Category</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end gap-2">
                    <Button
                      variant={showNeedsReview ? "default" : "outline"}
                      onClick={() => setShowNeedsReview(!showNeedsReview)}
                      className={showNeedsReview ? "bg-amber-600 hover:bg-amber-700" : ""}
                      data-testid="button-filter-needs-review"
                    >
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      {showNeedsReview ? "All Receipts" : "Needs Review"}
                    </Button>
                    <Button
                      variant={bulkMode ? "default" : "outline"}
                      onClick={() => setBulkMode(!bulkMode)}
                      data-testid="button-bulk-select"
                    >
                      <CheckSquare className="h-4 w-4 mr-2" />
                      {bulkMode ? "Exit Bulk" : "Bulk Select"}
                    </Button>
                  </div>
                </div>

                {/* Receipts List */}
                {filteredReceipts.length === 0 ? (
                  <EnhancedEmptyState
                    icon={<ReceiptIcon className="w-12 h-12" />}
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
                                  confidenceScore: receipt.confidenceScore
                                }}
                                onClick={() => !bulkMode && (window.location.href = `/receipt/${receipt.id}`)}
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
      {/* Enhanced Mobile Scan Receipt Button */}
      {isMobile && (
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
      {/* Mobile Navigation */}
      {isMobile && <MobileBottomNav />}
      
      {/* Tax AI Assistant - Updated positioning */}
      <TaxAIAssistant 
        isOpen={isTaxAIOpen} 
        onToggle={setIsTaxAIOpen} 
      />
    </div>
  );
}

export default HomePage;