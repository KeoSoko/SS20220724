import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Receipt, Search, Filter, Plus, ArrowLeft } from 'lucide-react';
import { PageLayout } from '@/components/page-layout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EnhancedReceiptCard, SpacingContainer, EnhancedEmptyState } from '@/components/ui/enhanced-components';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

const EXPENSE_CATEGORIES = [
  'food', 'groceries', 'dining', 'transportation', 'entertainment', 
  'utilities', 'rent', 'travel', 'healthcare', 'education', 'shopping', 
  'office_supplies', 'personal_care', 'gifts', 'other'
];

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

  // Fetch receipts
  const { data: receipts = [], isLoading, error } = useQuery({
    queryKey: ['/api/receipts', { limit: 100, offset: 0 }],
  });

  // Filter receipts based on URL parameters and filters
  const filteredReceipts = receipts.filter((receipt: any) => {
    // Search filter
    const matchesSearch = !searchQuery || 
      receipt.storeName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      receipt.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Category filter
    let matchesCategory = true;
    if (categoryFilter === 'uncategorized') {
      matchesCategory = !receipt.category || receipt.category === 'other' || receipt.category === '';
    } else if (categoryFilter !== 'all') {
      matchesCategory = receipt.category === categoryFilter;
    }
    
    return matchesSearch && matchesCategory;
  });

  // Sort receipts
  const sortedReceipts = [...filteredReceipts].sort((a, b) => {
    let aValue, bValue;
    
    switch (sortBy) {
      case 'date':
        aValue = new Date(a.date).getTime();
        bValue = new Date(b.date).getTime();
        break;
      case 'amount':
        aValue = parseFloat(a.total);
        bValue = parseFloat(b.total);
        break;
      case 'store':
        aValue = a.storeName?.toLowerCase() || '';
        bValue = b.storeName?.toLowerCase() || '';
        break;
      default:
        aValue = new Date(a.date).getTime();
        bValue = new Date(b.date).getTime();
    }
    
    return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
  });

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
    const total = sortedReceipts.reduce((sum, receipt) => sum + parseFloat(receipt.total), 0);
    
    if (categoryFilter === 'uncategorized') {
      return `${count} receipts need categorization • R${total.toFixed(2)} total`;
    }
    return `${count} receipts • R${total.toFixed(2)} total`;
  };

  // Handle receipt click
  const handleReceiptClick = (receiptId: number) => {
    setLocation(`/receipt/${receiptId}`);
  };

  // Header actions
  const headerActions = (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setLocation('/upload')}
        className="flex items-center gap-2"
      >
        <Plus className="h-4 w-4" />
        Add Receipt
      </Button>
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
                  />
                </div>
              </div>
              
              {/* Category Filter */}
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger>
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
                    <SelectTrigger>
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
                  >
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active Filters */}
        {(categoryFilter !== 'all' || searchQuery) && (
          <div className="flex flex-wrap gap-2">
            {categoryFilter !== 'all' && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Filter className="h-3 w-3" />
                {categoryFilter === 'uncategorized' ? 'Uncategorized' : categoryFilter}
                <button
                  onClick={() => setCategoryFilter('all')}
                  className="ml-1 hover:bg-gray-200 rounded-full p-0.5"
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
                  className="ml-1 hover:bg-gray-200 rounded-full p-0.5"
                >
                  ×
                </button>
              </Badge>
            )}
          </div>
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
            icon={<Receipt className="w-12 h-12" />}
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
            {sortedReceipts.map((receipt: any) => (
              <motion.div
                key={receipt.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <EnhancedReceiptCard
                  receipt={{
                    id: receipt.id,
                    storeName: receipt.storeName || 'Unknown Store',
                    total: parseFloat(receipt.total),
                    date: typeof receipt.date === 'string' ? receipt.date : receipt.date.toISOString(),
                    category: receipt.category || 'other'
                  }}
                  onClick={() => handleReceiptClick(receipt.id)}
                  showCategory={categoryFilter === 'all'}
                />
              </motion.div>
            ))}
          </div>
        )}
      </SpacingContainer>
    </PageLayout>
  );
}