/**
 * Unified Smart Search Component
 * AI-powered search that adapts to context and provides intelligent results across all features
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { 
  Search, 
  Brain, 
  Sparkles, 
  Receipt, 
  TrendingUp, 
  ShoppingBag, 
  Calendar,
  Banknote,
  Tag,
  Camera,
  BarChart3,
  Lightbulb,
  ChevronRight,
  Clock,
  Zap
} from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
  smartSearchIntegration, 
  SearchContext, 
  SearchIntent, 
  SmartSearchResult 
} from '@/services/smart-search-integration';
import { useAuth } from '@/hooks/use-auth';
// Simple inline debounce instead of importing hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface UnifiedSmartSearchProps {
  source: SearchContext['source'];
  onSearch?: (query: string) => void;
  onResult?: (result: SmartSearchResult) => void;
  placeholder?: string;
  className?: string;
  showSuggestions?: boolean;
  autoFocus?: boolean;
  currentData?: any[];
}

const iconMap = {
  receipt: Receipt,
  category: Tag,
  store: ShoppingBag,
  insight: Lightbulb,
  action: Zap,
  suggestion: Brain,
  camera: Camera,
  search: Search,
  'bar-chart': BarChart3,
  'plus-circle': Zap,
  'lightbulb': Lightbulb,
};

export function UnifiedSmartSearch({
  source,
  onSearch,
  onResult,
  placeholder = "Search with AI...",
  className,
  showSuggestions = true,
  autoFocus = false,
  currentData
}: UnifiedSmartSearchProps) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [searchId] = useState(() => `search-${Date.now()}`);
  const [isNavigating, setIsNavigating] = useState(false);
  const [, setLocation] = useLocation();
  const debouncedQuery = useDebounce(query, 300);
  const inputRef = useRef<HTMLInputElement>(null);

  // Search context
  const searchContext: SearchContext = {
    source,
    userId: user?.id || 0,
    currentData
  };

  // Smart search results
  const [searchResults, setSearchResults] = useState<SmartSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchIntent, setSearchIntent] = useState<SearchIntent | null>(null);

  // Get suggestions as user types
  const { data: suggestions = [] } = useQuery({
    queryKey: ['search-suggestions', debouncedQuery, source],
    queryFn: async () => {
      if (debouncedQuery.length < 2) return [];
      const result = await smartSearchIntegration.getSuggestions(debouncedQuery, searchContext);
      console.log(`[UnifiedSearch] Suggestions for "${debouncedQuery}":`, result);
      return result;
    },
    enabled: showSuggestions && debouncedQuery.length >= 2,
    staleTime: 30000
  });

  // Debug current state
  console.log(`[UnifiedSearch] Current state - query: "${query}", suggestions:`, suggestions, 'isOpen:', isOpen, 'searchResults:', searchResults.length);

  // Execute smart search
  const executeSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || !user) return;

    console.log(`[UnifiedSearch] Executing search for: "${searchQuery}"`);
    setIsSearching(true);
    try {
      // Parse the search intent
      const intent = await smartSearchIntegration.parseSearchIntent(searchQuery, searchContext);
      console.log(`[UnifiedSearch] Search intent:`, intent);
      setSearchIntent(intent);

      // Execute the search
      const results = await smartSearchIntegration.executeSmartSearch(intent, searchContext);
      console.log(`[UnifiedSearch] Search results:`, results);
      setSearchResults(results);

      // Track the search
      await smartSearchIntegration.trackSearchInteraction(searchId, 'view');

      // Notify parent component
      onSearch?.(searchQuery);
    } catch (error) {
      console.error('[UnifiedSearch] Search execution failed:', error);
    } finally {
      setIsSearching(false);
    }
  }, [searchContext, user, onSearch, searchId]);

  // Handle input changes
  const handleInputChange = useCallback((value: string) => {
    setQuery(value);
    // Only execute search for suggestions on non-home pages
    // Home page should only search on Enter/click, not auto-search
    if (source !== 'home' && value.length >= 3) {
      executeSearch(value);
    } else if (source === 'home') {
      // On home page, clear results but don't auto-search
      setSearchResults([]);
      setSearchIntent(null);
    } else {
      setSearchResults([]);
      setSearchIntent(null);
    }
  }, [executeSearch, source]);

  // Handle result selection
  const handleResultSelect = useCallback(async (result: SmartSearchResult) => {
    try {
      await smartSearchIntegration.trackSearchInteraction(searchId, 'click', result.id);
    } catch (error) {
      // Continue even if tracking fails
    }
    
    onResult?.(result);
    
    if (result.actionUrl) {
      setIsNavigating(true);
      setIsOpen(false);
      
      // Show loading for at least 800ms to be visible
      await new Promise(resolve => setTimeout(resolve, 800));
      
      try {
        if (result.actionUrl?.includes('?')) {
          setLocation(`${result.actionUrl}&loading=true`);
        } else {
          setLocation(`${result.actionUrl}?q=${encodeURIComponent(query)}`);
        }
      } catch (error) {
        console.error('Navigation failed:', error);
      } finally {
        // Always reset loading state
        setIsNavigating(false);
      }
    }
  }, [searchId, onResult, setLocation, query]);

  // Handle suggestion selection
  const handleSuggestionSelect = useCallback((suggestion: string) => {
    if (source === 'home') {
      // If from home page, navigate to search page with loading
      setIsNavigating(true);
      setIsOpen(false);
      
      // Show loading overlay for 800ms then navigate
      setTimeout(() => {
        setLocation(`/search?q=${encodeURIComponent(suggestion)}`);
        setIsNavigating(false);
      }, 800);
    } else {
      // If already on search page, just update query
      setQuery(suggestion);
      handleInputChange(suggestion);
      inputRef.current?.focus();
    }
  }, [handleInputChange, source, setLocation]);

  // Context-aware placeholder
  const getContextPlaceholder = () => {
    return "";
  };

  // Auto-focus on mount if specified
  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className={cn("relative w-full", className)}>
      {/* Navigation Loading Overlay */}
      {isNavigating && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 bg-white/80 backdrop-blur-sm flex items-center justify-center"
        >
          <div className="flex items-center gap-3 bg-white p-6 rounded-lg shadow-lg border">
            <div className="h-6 w-6 animate-spin rounded-none border-2 border-blue-600 border-t-transparent"></div>
            <div className="text-sm text-gray-700">Loading search results...</div>
          </div>
        </motion.div>
      )}
      
      <Command className="rounded-none border shadow-sm">
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 text-gray-500" />
          <CommandInput
            ref={inputRef}
            placeholder={getContextPlaceholder()}
            value={query}
            onValueChange={handleInputChange}
            onFocus={() => setIsOpen(true)}
            onBlur={() => setTimeout(() => setIsOpen(false), 200)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim() && source === 'home') {
                e.preventDefault();
                setIsNavigating(true);
                setIsOpen(false);
                
                // Show loading overlay for 800ms then navigate
                setTimeout(() => {
                  setLocation(`/search?q=${encodeURIComponent(query.trim())}`);
                  setIsNavigating(false);
                }, 800);
              }
            }}
            className="flex h-11 w-full rounded-none bg-transparent py-3 text-sm outline-none placeholder:text-gray-500 disabled:cursor-not-allowed disabled:opacity-50"
          />
          {(isSearching || isNavigating) && (
            <div className="mr-2">
              <div className="h-4 w-4 animate-spin rounded-none border-2 border-blue-600 border-t-transparent"></div>
            </div>
          )}
          
        </div>

        <AnimatePresence>
          {isOpen && (query.length > 0 || suggestions.length > 0) && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <CommandList className="max-h-96 overflow-y-auto">
                {/* Search Intent Display */}
                {searchIntent && (
                  <div className="px-3 py-2 border-b bg-blue-50">
                    <div className="flex items-center gap-2 text-sm">
                      <Sparkles className="h-4 w-4 text-blue-600" />
                      <span className="font-medium text-blue-900">
                        AI Understanding: {searchIntent.type} {searchIntent.target}
                        {searchIntent.timeframe && ` (${searchIntent.timeframe})`}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {Math.round(searchIntent.confidence * 100)}% confident
                      </Badge>
                    </div>
                  </div>
                )}

                {/* Smart Search Results */}
                {searchResults.length > 0 && (
                  <CommandGroup heading="Smart Results">
                    {searchResults.slice(0, 6).map((result) => {
                      const IconComponent = iconMap[result.icon as keyof typeof iconMap] || Receipt;
                      return (
                        <CommandItem
                          key={result.id}
                          onSelect={() => handleResultSelect(result)}
                          className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50"
                        >
                          <div className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-none",
                            result.type === 'receipt' && "bg-green-100 text-green-600",
                            result.type === 'insight' && "bg-blue-100 text-blue-600",
                            result.type === 'action' && "bg-purple-100 text-purple-600",
                            result.type === 'suggestion' && "bg-orange-100 text-orange-600"
                          )}>
                            <IconComponent className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{result.title}</div>
                            <div className="text-xs text-gray-500 truncate">{result.description}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {result.metadata?.matchType}
                            </Badge>
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}

                {/* Suggestions */}
                {suggestions.length > 0 && (
                  <CommandGroup heading={`Smart Suggestions (${suggestions.length})`}>
                    {suggestions.map((suggestion, index) => {
                      console.log(`[UnifiedSearch] Rendering suggestion ${index}:`, suggestion);
                      return (
                        <CommandItem
                          key={index}
                          onSelect={() => handleSuggestionSelect(suggestion)}
                          className="flex items-center gap-3 p-2 cursor-pointer hover:bg-gray-50"
                        >
                          <Search className="h-4 w-4 text-gray-500" />
                          <span className="text-sm">{suggestion}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}

                {/* Empty State - only show on search pages, not home page */}
                {source !== 'home' && query.length > 2 && searchResults.length === 0 && suggestions.length === 0 && !isSearching && (
                  <CommandEmpty>
                    <div className="py-6 text-center">
                      <Brain className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                      <p className="text-sm text-gray-500">No results found</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Try "food this month" or "expenses over R100"
                      </p>
                    </div>
                  </CommandEmpty>
                )}

                {/* Quick Actions */}
                {query.length === 0 && source === 'home' && (
                  <CommandGroup heading="Quick Actions">
                    <CommandItem onSelect={() => window.location.href = '/upload'}>
                      <Camera className="mr-2 h-4 w-4 text-blue-600" />
                      <span>Scan New Receipt</span>
                    </CommandItem>
                    <CommandItem onSelect={() => window.location.href = '/analytics'}>
                      <BarChart3 className="mr-2 h-4 w-4 text-green-600" />
                      <span>View Analytics</span>
                    </CommandItem>
                    <CommandItem onSelect={() => window.location.href = '/search'}>
                      <Search className="mr-2 h-4 w-4 text-purple-600" />
                      <span>Advanced Search</span>
                    </CommandItem>
                  </CommandGroup>
                )}
              </CommandList>
            </motion.div>
          )}
        </AnimatePresence>
      </Command>

      {/* Keyboard Shortcut Hint */}
      {!isOpen && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-1 text-xs text-gray-400">
          <kbd className="pointer-events-none h-5 select-none items-center gap-1 rounded-none border bg-gray-100 px-1.5 font-mono text-[10px] font-medium opacity-100">
            ⌘K
          </kbd>
        </div>
      )}
    </div>
  );
}

// Hook for easy integration
export function useUnifiedSmartSearch(source: SearchContext['source']) {
  const [isSearching, setIsSearching] = useState(false);
  const [lastQuery, setLastQuery] = useState('');
  const [lastResults, setLastResults] = useState<SmartSearchResult[]>([]);

  const handleSearch = useCallback((query: string) => {
    setIsSearching(true);
    setLastQuery(query);
  }, []);

  const handleResult = useCallback((result: SmartSearchResult) => {
    setLastResults(prev => [result, ...prev.slice(0, 4)]);
  }, []);

  return {
    isSearching,
    lastQuery,
    lastResults,
    handleSearch,
    handleResult,
    SearchComponent: (props: Omit<UnifiedSmartSearchProps, 'source' | 'onSearch' | 'onResult'>) => (
      <UnifiedSmartSearch
        {...props}
        source={source}
        onSearch={handleSearch}
        onResult={handleResult}
      />
    )
  };
}