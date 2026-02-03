import React, { useState, useCallback, useEffect } from 'react';
import { Search, Filter, Download, Brain, Sparkles, RefreshCw } from 'lucide-react';
import { useLocation } from 'wouter';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { getReceiptCategoryLabel } from '@/utils/receipt-category';
import { 
  EnhancedButton,
  SpacingContainer,
  EnhancedEmptyState
} from '@/components/ui/enhanced-components';
import { RecurringExpensesWidget } from '@/components/ui/recurring-expenses-widget';
import { motion } from 'framer-motion';

interface SearchResult {
  receipts: any[];
  totalCount: number;
  facets: {
    categories: { name: string; count: number }[];
    stores: { name: string; count: number }[];
    paymentMethods: { name: string; count: number }[];
    priceRanges: { range: string; count: number }[];
  };
}

export function SmartSearch() {
  // Initialize query from URL parameters immediately
  const [query, setQuery] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('q') || '';
  });
  const [activeFilters, setActiveFilters] = useState<any>({});
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [, setLocation] = useLocation();

  // Debug logging
  useEffect(() => {
    console.log(`[SmartSearch] Query state: "${query}"`);
  }, [query]);

  // Smart search query - disabled by default to prevent empty searches
  const { data: searchResults, isLoading, refetch } = useQuery<SearchResult>({
    queryKey: ['/api/search', { q: query, ...activeFilters }],
    enabled: false, // Manually control when to search
  });

  // Manual search trigger when query changes
  useEffect(() => {
    console.log(`[SmartSearch] Query changed to: "${query}", enabled: ${query.length > 0}`);
    console.log(`[SmartSearch] Query key: `, ['/api/search', { q: query, ...activeFilters }]);
    if (query.length > 0) {
      console.log(`[SmartSearch] Triggering search for: "${query}"`);
      refetch();
    }
  }, [query, refetch, activeFilters]);

  // Search suggestions
  const { data: suggestions } = useQuery<string[]>({
    queryKey: ['/api/search/suggestions', { q: query }],
    enabled: query.length > 2,
  });

  
  const handleSearch = useCallback((searchQuery: string) => {
    setQuery(searchQuery);
    if (searchQuery.length > 0) {
      refetch();
    }
  }, [refetch]);

  const exportResults = async (format: 'csv' | 'pdf') => {
    try {
      const params = new URLSearchParams({
        ...activeFilters,
        ...(query && { q: query })
      });
      
      const response = await fetch(`/api/export/${format}?${params}`);
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipts.${format}`;
      a.click();
      
      toast({
        title: "Export successful",
        description: `Your receipts have been exported to ${format.toUpperCase()}`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Please try again",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6 px-2 mt-[16px] mb-[16px]">
      {/* Smart Search Header */}
      <Card>
        <CardHeader className={isMobile ? 'pb-4' : ''}>
          <CardTitle className="font-semibold tracking-tight flex items-center gap-2 text-lg ml-[16px] mr-[16px]">
            <Brain className={`${isMobile ? 'w-5 h-5' : 'w-5 h-5'} text-blue-500`} />
            {isMobile ? 'Smart Search' : 'Smart Receipt Search'}
          </CardTitle>
        </CardHeader>
        <CardContent className={isMobile ? 'pt-0' : ''}>
          <div className={`${isMobile ? 'flex flex-col gap-3' : 'flex gap-2'}`}>
            <div className="relative flex-1">
              <Search className={`absolute left-3 ${isMobile ? 'top-4' : 'top-3'} h-4 w-4 text-muted-foreground`} />
              <Input
                placeholder={isMobile ? "Search receipts..." : "Try 'coffee this month' or 'grocery stores under R100'..."}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch(query)}
                className={`pl-10 ${isMobile ? 'h-12 text-base' : ''}`}
              />
            </div>
            <Button 
              onClick={() => handleSearch(query)} 
              disabled={isLoading}
              className={isMobile ? 'h-12 text-base' : ''}
            >
              {isLoading ? 'Searching...' : 'Search'}
            </Button>
          </div>
          
          {/* Navigation to Smart AI Features */}
          <div className="mt-4 flex justify-center">
            <Button 
              variant="outline" 
              onClick={() => setLocation('/smart')}
              className="flex items-center gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Smart AI Features
            </Button>
          </div>

          {/* Search Suggestions */}
          {suggestions && suggestions.length > 0 && (
            <div className={`${isMobile ? 'mt-4' : 'mt-3'} flex flex-wrap gap-2`}>
              <span className={`${isMobile ? 'text-base' : 'text-sm'} text-muted-foreground`}>Suggestions:</span>
              {suggestions.slice(0, 5).map((suggestion, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className={`cursor-pointer hover:bg-blue-50 ${isMobile ? 'text-sm py-1 px-2' : ''}`}
                  onClick={() => handleSearch(suggestion)}
                >
                  {suggestion}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {/* Results and Export */}
      <Tabs defaultValue="results" className="w-full">
        <TabsList className={`grid w-full grid-cols-2 ${isMobile ? 'h-12' : ''}`}>
          <TabsTrigger value="results" className={isMobile ? 'text-xs px-1' : ''}>
            {isMobile ? 'Results' : `Search Results ${searchResults ? `(${searchResults.totalCount})` : ''}`}
          </TabsTrigger>
          <TabsTrigger value="export" className={isMobile ? 'text-xs px-1' : ''}>
            <Download className={`${isMobile ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-2'}`} />
            {isMobile ? 'Export' : 'Export & Reports'}
          </TabsTrigger>
        </TabsList>

        {/* Search Results Tab */}
        <TabsContent value="results" className="space-y-4">

          {/* Recurring Expenses Section */}
          <RecurringExpensesWidget />
          
          {/* Loading state */}
          {isLoading && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-sm text-gray-600">Searching...</p>
            </div>
          )}
          
          {/* Results when we have them */}
          {!isLoading && searchResults && searchResults.receipts.length > 0 && (
            <>
              {/* Filter Facets */}
              <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-4'}`}>
                {/* Categories */}
                <Card>
                  <CardHeader className={`${isMobile ? 'pb-3' : 'pb-2'}`}>
                    <CardTitle className={`${isMobile ? 'text-base' : 'text-sm'}`}>Categories</CardTitle>
                  </CardHeader>
                  <CardContent className={`space-y-1 ${isMobile ? 'space-y-2' : ''}`}>
                    {searchResults.facets.categories.slice(0, 5).map(facet => (
                      <div key={facet.name} className={`flex justify-between ${isMobile ? 'text-base py-1' : 'text-sm'}`}>
                        <span className="cursor-pointer hover:text-blue-600">
                          {facet.name}
                        </span>
                        <Badge variant="secondary" className={`${isMobile ? 'text-sm' : 'text-xs'}`}>
                          {facet.count}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Stores */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Stores</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {searchResults.facets.stores.slice(0, 5).map(facet => (
                      <div key={facet.name} className="flex justify-between text-sm">
                        <span className="cursor-pointer hover:text-blue-600 truncate">
                          {facet.name}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {facet.count}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Price Ranges */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Price Ranges</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {searchResults.facets.priceRanges.map(facet => (
                      <div key={facet.range} className="flex justify-between text-sm">
                        <span className="cursor-pointer hover:text-blue-600">
                          {facet.range}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {facet.count}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Payment Methods */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Payment Methods</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {searchResults.facets.paymentMethods.slice(0, 5).map(facet => (
                      <div key={facet.name} className="flex justify-between text-sm">
                        <span className="cursor-pointer hover:text-blue-600">
                          {facet.name}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {facet.count}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              {/* Results List */}
              <div className="space-y-4">
                {searchResults.receipts.map(receipt => (
                  <Card key={receipt.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-semibold">{receipt.storeName}</h3>
                          <p className="text-sm text-muted-foreground">
                            {new Date(receipt.date).toLocaleDateString()}
                          </p>
                          <div className="flex gap-2 mt-2">
                            <Badge variant="outline">{getReceiptCategoryLabel(receipt.category, receipt.notes)}</Badge>
                            {receipt.paymentMethod && (
                              <Badge variant="outline">{receipt.paymentMethod}</Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold">R {receipt.total}</div>
                          <div className="text-sm text-muted-foreground">
                            {receipt.items.length} items
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
          
          {/* Empty state when no results */}
          {!isLoading && searchResults && searchResults.receipts.length === 0 && (
            <EnhancedEmptyState
              title="No receipts found"
              description={`No results for "${query}". Try adjusting your search terms.`}
              actionLabel="Clear Search"
              onAction={() => setQuery('')}
            />
          )}
          
          {/* Initial state when no search performed */}
          {!isLoading && !searchResults && !query && (
            <EnhancedEmptyState
              title="Ready to search"
              description="Type in the search box above to find your receipts using natural language."
              actionLabel="View All Receipts"
              onAction={() => window.location.href = '/home'}
            />
          )}
        </TabsContent>

        {/* Export Tab */}
        <TabsContent value="export" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="flex flex-col space-y-1.5 p-6 mt-[20px] mb-[20px]">
                <CardTitle>CSV Export</CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-[0px] pb-[0px] pl-[50px] pr-[50px] mt-[20px] mb-[20px]">
                <p className="text-sm text-muted-foreground mb-4">
                  Export your receipts to a spreadsheet format for analysis
                </p>
                <Button onClick={() => exportResults('csv')} className="w-full">
                  <Download className="w-4 h-4 mr-2" />
                  Download CSV
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col space-y-1.5 p-6 mt-[20px] mb-[20px]">
                <CardTitle>PDF Report</CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-[0px] pb-[0px] pl-[50px] pr-[50px] mt-[20px] mb-[20px]">
                <p className="text-sm text-muted-foreground mb-4">
                  Generate a formatted PDF report with summaries
                </p>
                <Button onClick={() => exportResults('pdf')} className="w-full">
                  <Download className="w-4 h-4 mr-2" />
                  Download PDF
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col space-y-1.5 p-6 mt-[20px] mb-[20px]">
                <CardTitle>Tax Report</CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-[0px] pb-[0px] pl-[50px] pr-[50px] mt-[20px] mb-[20px]">
                <p className="text-sm text-muted-foreground mb-4">
                  Generate tax-deductible expenses report for 2025
                </p>
                <Button 
                  onClick={async () => {
                    try {
                      const token = localStorage.getItem('auth_token');
                      if (!token) {
                        toast({
                          title: "Authentication Error",
                          description: "Please log in again to download the tax report.",
                          variant: "destructive",
                        });
                        return;
                      }
                      
                      const response = await fetch('/api/export/tax-report/2025?format=pdf', {
                        headers: {
                          'Authorization': `Bearer ${token}`,
                        },
                      });
                      
                      if (response.ok) {
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `tax-report-2025.pdf`;
                        link.click();
                        window.URL.revokeObjectURL(url);
                        
                        toast({
                          title: "Tax Report Downloaded",
                          description: "Your 2025 tax report has been successfully downloaded.",
                        });
                      } else {
                        const errorText = await response.text();
                        throw new Error(`Export failed: ${response.status} - ${errorText}`);
                      }
                    } catch (error) {
                      console.error('Tax report download failed:', error);
                      toast({
                        title: "Export Failed",
                        description: "Unable to generate tax report. Please try again.",
                        variant: "destructive",
                      });
                    }
                  }}
                  className="w-full"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Tax Report
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
