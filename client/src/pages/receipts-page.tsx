import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Receipt, Search, Filter, Plus, ArrowLeft, AlertCircle, CheckSquare, Square, Trash2, Tag, Calendar, DollarSign, Store, ChevronDown, ChevronUp, X } from 'lucide-react';
import { PageLayout } from '@/components/page-layout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { EnhancedReceiptCard, SpacingContainer, EnhancedEmptyState } from '@/components/ui/enhanced-components';
import { resolveCategory } from '@/utils/category-resolution';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
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

const EXPENSE_CATEGORIES = [
  'food', 'groceries', 'dining', 'transportation', 'entertainment', 
  'utilities', 'rent', 'travel', 'healthcare', 'education', 'shopping', 
  'office_supplies', 'personal_care', 'gifts', 'other'
];

type ReceiptListItem = {
  id: number;
  storeName: string;
  total: number | string;
  date: string | Date;
  category?: string | null;
  description?: string | null;
  confidence?: number | null;
  confidenceScore?: string | null;
  source?: string | null;
  isPotentialDuplicate?: boolean | null;
  notes?: string | null;
  reportLabel?: string | null;
};

export default function ReceiptsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Parse URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const initialFilter = urlParams.get('filter') || 'all';
  
  // State management
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(initialFilter);
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showNeedsReview, setShowNeedsReview] = useState(false);
  
  // Smart Filters state
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [vendorFilter, setVendorFilter] = useState('all');
  
  // Bulk selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<Set<number>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('');

  // Fetch receipts
  const { data: receipts = [], isLoading, error } = useQuery<ReceiptListItem[]>({
    queryKey: ['/api/receipts', { limit: 100, offset: 0 }],
  });

  // Get unique vendors from receipts for dropdown
  const uniqueVendors = useMemo(() => {
    const vendors = receipts
      .map((r) => r.storeName)
      .filter((name: string) => name && name.trim() !== '')
      .map((name: string) => name.trim());
    return Array.from(new Set(vendors)).sort((a, b) => a.localeCompare(b));
  }, [receipts]);

  const scrollStorageKey = 'receipts_scroll_position';
  const scrollRestoreKey = 'receipts_should_restore_scroll';

  // Restore scroll position when returning from receipt detail page
  useEffect(() => {
    const shouldRestore = sessionStorage.getItem(scrollRestoreKey) === 'true';
    const savedPosition = sessionStorage.getItem(scrollStorageKey);
    if (shouldRestore && savedPosition && !isLoading && receipts.length > 0) {
      const scrollY = parseInt(savedPosition, 10);
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollY);
        sessionStorage.removeItem(scrollStorageKey);
        sessionStorage.removeItem(scrollRestoreKey);
      });
    }
  }, [isLoading, receipts.length]);

  // Check if any smart filters are active
  const hasActiveSmartFilters = dateFrom || dateTo || amountMin || amountMax || vendorFilter !== 'all';

  // Clear all smart filters
  const clearAllSmartFilters = () => {
    setDateFrom('');
    setDateTo('');
    setAmountMin('');
    setAmountMax('');
    setVendorFilter('all');
  };

  // Clear all filters including search and category
  const clearAllFilters = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setShowNeedsReview(false);
    clearAllSmartFilters();
  };

  // Filter receipts based on URL parameters and filters
  const filteredReceipts = useMemo(() => receipts.filter((receipt) => {
    // Search filter
    const matchesSearch = !searchQuery || 
      receipt.storeName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      receipt.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Category filter
    let matchesCategory = true;
    const resolvedCategory = resolveCategory(receipt.category, receipt.reportLabel);
    const normalizedFilter = categoryFilter.toLowerCase().replace(/_/g, ' ');
    if (categoryFilter === 'uncategorized') {
      matchesCategory = !receipt.reportLabel && (!receipt.category || receipt.category === 'other');
    } else if (categoryFilter !== 'all') {
      matchesCategory = resolvedCategory.toLowerCase().replace(/_/g, ' ') === normalizedFilter;
    }
    
    // Needs Review filter (confidence < 80%)
    const matchesNeedsReview = !showNeedsReview || 
      (receipt.confidence !== undefined && receipt.confidence !== null && receipt.confidence < 80);
    
    // Date range filter
    let matchesDateRange = true;
    if (dateFrom) {
      const receiptDate = new Date(receipt.date);
      const fromDate = new Date(dateFrom);
      matchesDateRange = receiptDate >= fromDate;
    }
    if (dateTo && matchesDateRange) {
      const receiptDate = new Date(receipt.date);
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      matchesDateRange = receiptDate <= toDate;
    }
    
    // Amount range filter
    let matchesAmountRange = true;
    const receiptAmount = Number(receipt.total) || 0;
    if (amountMin) {
      matchesAmountRange = receiptAmount >= parseFloat(amountMin);
    }
    if (amountMax && matchesAmountRange) {
      matchesAmountRange = receiptAmount <= parseFloat(amountMax);
    }
    
    // Vendor filter
    const matchesVendor = vendorFilter === 'all' || 
      receipt.storeName?.toLowerCase() === vendorFilter.toLowerCase();
    
    return matchesSearch && matchesCategory && matchesNeedsReview && matchesDateRange && matchesAmountRange && matchesVendor;
  }), [receipts, searchQuery, categoryFilter, showNeedsReview, dateFrom, dateTo, amountMin, amountMax, vendorFilter]);

  // Sort receipts
  const sortedReceipts = useMemo(() => [...filteredReceipts].sort((a, b) => {
    let aValue, bValue;
    
    switch (sortBy) {
      case 'date':
        aValue = new Date(a.date).getTime();
        bValue = new Date(b.date).getTime();
        break;
      case 'amount':
        aValue = Number(a.total);
        bValue = Number(b.total);
        break;
      case 'store': {
        const aStore = a.storeName?.toLowerCase() || '';
        const bStore = b.storeName?.toLowerCase() || '';
        return sortOrder === 'desc' ? bStore.localeCompare(aStore) : aStore.localeCompare(bStore);
      }
      default:
        aValue = new Date(a.date).getTime();
        bValue = new Date(b.date).getTime();
    }
    
    return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
  }), [filteredReceipts, sortBy, sortOrder]);

  // Update page title based on filter
  const getPageTitle = () => {
    switch (categoryFilter) {
      case 'uncategorized':
        return 'Uncategorized Receipts';
      case 'all':
        return 'All Receipts';
      default:
        return `${categoryFilter.charAt(0).toUpperCase() + categoryFilter.slice(1)} Receipts`;
    }
  };

  const getPageSubtitle = () => {
    const count = sortedReceipts.length;
    const total = sortedReceipts.reduce((sum, receipt) => sum + Number(receipt.total), 0);
    
    if (categoryFilter === 'uncategorized') {
      return `${count} receipts need categorization • R${total.toFixed(2)} total`;
    }
    return `${count} receipts • R${total.toFixed(2)} total`;
  };

  // Handle receipt click
  const handleReceiptClick = (receiptId: number) => {
    if (selectionMode) {
      toggleReceiptSelection(receiptId);
    } else {
      sessionStorage.setItem(scrollStorageKey, window.scrollY.toString());
      sessionStorage.setItem(scrollRestoreKey, 'true');
      setLocation(`/receipt/${receiptId}`);
    }
  };

  // Bulk selection handlers
  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelectedReceiptIds(new Set());
  };

  const toggleReceiptSelection = (receiptId: number) => {
    const newSelection = new Set(selectedReceiptIds);
    if (newSelection.has(receiptId)) {
      newSelection.delete(receiptId);
    } else {
      newSelection.add(receiptId);
    }
    setSelectedReceiptIds(newSelection);
  };

  const selectAll = () => {
    const allIds = new Set(sortedReceipts.map((r) => r.id));
    setSelectedReceiptIds(allIds);
  };

  const clearSelection = () => {
    setSelectedReceiptIds(new Set());
  };

  // Bulk delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (receiptIds: number[]) => {
      await Promise.all(
        receiptIds.map(id => apiRequest('DELETE', `/api/receipts/${id}`))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/receipts'] });
      toast({
        title: "Receipts deleted",
        description: `Successfully deleted ${selectedReceiptIds.size} receipt(s)`,
      });
      setSelectedReceiptIds(new Set());
      setShowDeleteDialog(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete receipts. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Bulk categorize mutation
  const categorizeMutation = useMutation({
    mutationFn: async ({ receiptIds, category }: { receiptIds: number[], category: string }) => {
      await Promise.all(
        receiptIds.map(id => 
          apiRequest('PATCH', `/api/receipts/${id}`, { category })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/receipts'] });
      toast({
        title: "Receipts updated",
        description: `Successfully categorized ${selectedReceiptIds.size} receipt(s) as ${bulkCategory}`,
      });
      setSelectedReceiptIds(new Set());
      setShowCategoryDialog(false);
      setBulkCategory('');
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update receipts. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleBulkDelete = () => {
    deleteMutation.mutate(Array.from(selectedReceiptIds));
  };

  const handleBulkCategorize = () => {
    if (!bulkCategory) return;
    categorizeMutation.mutate({ 
      receiptIds: Array.from(selectedReceiptIds), 
      category: bulkCategory 
    });
  };

  // Header actions
  const headerActions = (
    <div className="flex items-center gap-2">
      {!selectionMode && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleSelectionMode}
            className="flex items-center gap-2"
            data-testid="button-select-mode"
          >
            <CheckSquare className="h-4 w-4" />
            Select
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation('/upload')}
            className="flex items-center gap-2"
            data-testid="button-add-receipt"
          >
            <Plus className="h-4 w-4" />
            Add Receipt
          </Button>
        </>
      )}
      {selectionMode && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleSelectionMode}
            data-testid="button-cancel-selection"
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={selectAll}
            disabled={selectedReceiptIds.size === sortedReceipts.length}
            data-testid="button-select-all"
          >
            Select All ({sortedReceipts.length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clearSelection}
            disabled={selectedReceiptIds.size === 0}
            data-testid="button-clear-selection"
          >
            Clear
          </Button>
        </>
      )}
    </div>
  );

  if (error) {
    return (
      <PageLayout 
        title="Error" 
        subtitle="Failed to load receipts"
        showBackButton={true}
      >
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-red-600 mb-4">Failed to load receipts. Please try again.</p>
            <Button onClick={() => window.location.reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout 
      title={getPageTitle()}
      subtitle={getPageSubtitle()}
      showBackButton={true}
      headerActions={headerActions}
    >
      <SpacingContainer>
        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            {/* Quick Filter Button */}
            <div className="mb-4">
              <Button
                variant={showNeedsReview ? "default" : "outline"}
                size="sm"
                onClick={() => setShowNeedsReview(!showNeedsReview)}
                className="flex items-center gap-2"
                data-testid="button-needs-review-filter"
              >
                <AlertCircle className="h-4 w-4" />
                {showNeedsReview ? 'Showing Needs Review' : 'Show Needs Review'}
                {showNeedsReview && (
                  <Badge variant="secondary" className="ml-1">
                    {filteredReceipts.length}
                  </Badge>
                )}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Search */}
              <div className="space-y-2">
                <Label htmlFor="search">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    type="text"
                    placeholder="Search receipts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-receipts"
                  />
                </div>
              </div>
              
              {/* Category Filter */}
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger data-testid="select-category-filter">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    <SelectItem value="uncategorized">Uncategorized</SelectItem>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Sort Options */}
              <div className="space-y-2">
                <Label>Sort by</Label>
                <div className="flex gap-2">
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger data-testid="select-sort-by">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="amount">Amount</SelectItem>
                      <SelectItem value="store">Store</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    data-testid="button-sort-order"
                  >
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Advanced Filters - Collapsible */}
            <Collapsible open={showAdvancedFilters} onOpenChange={setShowAdvancedFilters} className="mt-4">
              <div className="flex items-center justify-between">
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="flex items-center gap-2 p-0 h-auto hover:bg-transparent"
                    data-testid="button-toggle-advanced-filters"
                  >
                    <Filter className="h-4 w-4" />
                    <span className="font-medium">Smart Filters</span>
                    {hasActiveSmartFilters && (
                      <Badge variant="secondary" className="ml-1">Active</Badge>
                    )}
                    {showAdvancedFilters ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                {hasActiveSmartFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllSmartFilters}
                    className="text-muted-foreground hover:text-foreground"
                    data-testid="button-clear-smart-filters"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
              
              <CollapsibleContent className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
                  {/* Date Range */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Date From
                    </Label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      data-testid="input-date-from"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Date To
                    </Label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      data-testid="input-date-to"
                    />
                  </div>
                  
                  {/* Amount Range */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Min Amount (R)
                    </Label>
                    <Input
                      type="number"
                      placeholder="0"
                      min="0"
                      step="0.01"
                      value={amountMin}
                      onChange={(e) => setAmountMin(e.target.value)}
                      data-testid="input-amount-min"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Max Amount (R)
                    </Label>
                    <Input
                      type="number"
                      placeholder="No limit"
                      min="0"
                      step="0.01"
                      value={amountMax}
                      onChange={(e) => setAmountMax(e.target.value)}
                      data-testid="input-amount-max"
                    />
                  </div>
                  
                  {/* Vendor Filter */}
                  <div className="space-y-2 md:col-span-2 lg:col-span-4">
                    <Label className="flex items-center gap-2">
                      <Store className="h-4 w-4" />
                      Vendor / Store
                    </Label>
                    <Select value={vendorFilter} onValueChange={setVendorFilter}>
                      <SelectTrigger data-testid="select-vendor-filter">
                        <SelectValue placeholder="All vendors" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All vendors</SelectItem>
                        {uniqueVendors.map((vendor: string) => (
                          <SelectItem key={vendor} value={vendor}>
                            {vendor}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        {/* Active Filters */}
        {(categoryFilter !== 'all' || searchQuery || showNeedsReview || hasActiveSmartFilters) && (
          <div className="flex flex-wrap gap-2 items-center">
            {showNeedsReview && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Needs Review (Confidence &lt; 80%)
                <button
                  onClick={() => setShowNeedsReview(false)}
                  className="ml-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full p-0.5"
                  data-testid="button-clear-needs-review"
                >
                  ×
                </button>
              </Badge>
            )}
            {categoryFilter !== 'all' && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Filter className="h-3 w-3" />
                {categoryFilter === 'uncategorized' ? 'Uncategorized' : categoryFilter}
                <button
                  onClick={() => setCategoryFilter('all')}
                  className="ml-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full p-0.5"
                >
                  ×
                </button>
              </Badge>
            )}
            {searchQuery && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Search className="h-3 w-3" />
                "{searchQuery}"
                <button
                  onClick={() => setSearchQuery('')}
                  className="ml-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full p-0.5"
                >
                  ×
                </button>
              </Badge>
            )}
            {/* Smart Filter Badges */}
            {dateFrom && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                From: {format(new Date(dateFrom), 'dd MMM yyyy')}
                <button
                  onClick={() => setDateFrom('')}
                  className="ml-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full p-0.5"
                  data-testid="button-clear-date-from"
                >
                  ×
                </button>
              </Badge>
            )}
            {dateTo && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                To: {format(new Date(dateTo), 'dd MMM yyyy')}
                <button
                  onClick={() => setDateTo('')}
                  className="ml-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full p-0.5"
                  data-testid="button-clear-date-to"
                >
                  ×
                </button>
              </Badge>
            )}
            {amountMin && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                Min: R{amountMin}
                <button
                  onClick={() => setAmountMin('')}
                  className="ml-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full p-0.5"
                  data-testid="button-clear-amount-min"
                >
                  ×
                </button>
              </Badge>
            )}
            {amountMax && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                Max: R{amountMax}
                <button
                  onClick={() => setAmountMax('')}
                  className="ml-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full p-0.5"
                  data-testid="button-clear-amount-max"
                >
                  ×
                </button>
              </Badge>
            )}
            {vendorFilter !== 'all' && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Store className="h-3 w-3" />
                {vendorFilter}
                <button
                  onClick={() => setVendorFilter('all')}
                  className="ml-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full p-0.5"
                  data-testid="button-clear-vendor"
                >
                  ×
                </button>
              </Badge>
            )}
            {/* Clear All Filters Button */}
            {(categoryFilter !== 'all' || searchQuery || showNeedsReview || hasActiveSmartFilters) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="text-muted-foreground hover:text-foreground ml-2"
                data-testid="button-clear-all-filters"
              >
                Clear all
              </Button>
            )}
          </div>
        )}

        {/* Bulk Action Bar */}
        {selectionMode && selectedReceiptIds.size > 0 && (
          <Card className="bg-primary/5 border-primary">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Badge variant="default">{selectedReceiptIds.size} selected</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCategoryDialog(true)}
                    className="flex items-center gap-2"
                    data-testid="button-bulk-categorize"
                  >
                    <Tag className="h-4 w-4" />
                    Categorize
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDeleteDialog(true)}
                    className="flex items-center gap-2"
                    data-testid="button-bulk-delete"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Receipts List */}
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-20 bg-gray-200 rounded-lg"></div>
              </div>
            ))}
          </div>
        ) : sortedReceipts.length === 0 ? (
          <EnhancedEmptyState
            icon={<Search className="w-12 h-12 text-muted-foreground" />}
            title={
              categoryFilter === 'uncategorized' 
                ? "No uncategorized receipts" 
                : "No receipts found"
            }
            description={
              categoryFilter === 'uncategorized'
                ? "All your receipts are properly categorized!"
                : "Try adjusting your search filters or add some receipts"
            }
            onAction={() => setLocation('/upload')}
            actionLabel="Add Receipt"
          />
        ) : (
          <div className="space-y-4">
            {sortedReceipts.map((receipt) => (
              <motion.div
                key={receipt.id}
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center gap-3" data-testid={`receipt-${receipt.id}`}>
                  {selectionMode && (
                    <Checkbox
                      checked={selectedReceiptIds.has(receipt.id)}
                      onCheckedChange={() => toggleReceiptSelection(receipt.id)}
                      className="mt-1"
                      data-testid={`checkbox-receipt-${receipt.id}`}
                    />
                  )}
                  <div className="flex-1">
                    <EnhancedReceiptCard
                      receipt={{
                        id: receipt.id,
                        storeName: receipt.storeName || 'Unknown Store',
                        total: Number(receipt.total),
                        date: typeof receipt.date === 'string' ? receipt.date : receipt.date.toISOString(),
                        category: receipt.category || 'other',
                        notes: receipt.notes,
                        reportLabel: receipt.reportLabel,
                        confidenceScore: receipt.confidenceScore,
                        source: receipt.source,
                        isPotentialDuplicate: receipt.isPotentialDuplicate
                      }}
                      onClick={() => handleReceiptClick(receipt.id)}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Selected Receipts?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete {selectedReceiptIds.size} receipt(s)? 
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleBulkDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                Delete {selectedReceiptIds.size} Receipt(s)
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Categorize Dialog */}
        <AlertDialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Categorize Selected Receipts</AlertDialogTitle>
              <AlertDialogDescription>
                Choose a category for {selectedReceiptIds.size} receipt(s):
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <Select value={bulkCategory} onValueChange={setBulkCategory}>
                <SelectTrigger data-testid="select-bulk-category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-categorize">Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleBulkCategorize}
                disabled={!bulkCategory}
                data-testid="button-confirm-categorize"
              >
                Categorize {selectedReceiptIds.size} Receipt(s)
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SpacingContainer>
    </PageLayout>
  );
}
