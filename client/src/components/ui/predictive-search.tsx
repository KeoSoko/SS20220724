import React from "react";
import { Search, Calendar, Store, Banknote, Tag } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

interface SearchSuggestion {
  id: string;
  type: 'category' | 'store' | 'amount' | 'date' | 'tag';
  label: string;
  description?: string;
  action: () => void;
  icon: React.ReactNode;
}

interface PredictiveSearchProps {
  onSearch?: (query: string) => void;
  placeholder?: string;
  className?: string;
  localMode?: boolean; // If true, don't redirect to search page
}

export function PredictiveSearch({ 
  onSearch, 
  placeholder = "Search receipts...", 
  className,
  localMode = false
}: PredictiveSearchProps) {
  const [query, setQuery] = React.useState("");
  const [, setLocation] = useLocation();
  const [open, setOpen] = React.useState(false);
  const [isNavigating, setIsNavigating] = React.useState(false);

  // Smart suggestions based on common patterns
  const generateSuggestions = (searchQuery: string): SearchSuggestion[] => {
    const suggestions: SearchSuggestion[] = [];
    const lowerQuery = searchQuery.toLowerCase();

    // Natural language patterns
    const patterns = [
      {
        regex: /food|dining|restaurant|cafe/i,
        suggestions: [
          {
            id: 'food-this-week',
            type: 'category' as const,
            label: localMode ? 'Show food expenses' : 'Food expenses this week',
            description: localMode ? 'Filter current receipts' : 'All dining and food purchases',
            action: () => handleSearch(localMode ? 'food' : 'category:food date:this-week'),
            icon: <Tag className="h-4 w-4" />
          },
          {
            id: 'restaurants',
            type: 'category' as const,
            label: localMode ? 'Show restaurant visits' : 'Restaurant visits',
            description: localMode ? 'Filter dining receipts' : 'Dining out expenses',
            action: () => handleSearch(localMode ? 'restaurant' : 'category:dining'),
            icon: <Store className="h-4 w-4" />
          }
        ]
      },
      {
        regex: /under|less than|below/i,
        suggestions: [
          {
            id: 'under-100',
            type: 'amount' as const,
            label: 'Expenses under R100',
            description: 'Small purchases',
            action: () => handleSearch('amount:<100'),
            icon: <Banknote className="h-4 w-4" />
          },
          {
            id: 'under-50',
            type: 'amount' as const,
            label: 'Expenses under R50',
            description: 'Minor purchases',
            action: () => handleSearch('amount:<50'),
            icon: <Banknote className="h-4 w-4" />
          }
        ]
      },
      {
        regex: /last week|this week|yesterday/i,
        suggestions: [
          {
            id: 'last-week',
            type: 'date' as const,
            label: 'Last week\'s expenses',
            description: 'All receipts from last 7 days',
            action: () => handleSearch('date:last-week'),
            icon: <Calendar className="h-4 w-4" />
          },
          {
            id: 'this-month',
            type: 'date' as const,
            label: 'This month\'s expenses',
            description: 'Current month spending',
            action: () => handleSearch('date:this-month'),
            icon: <Calendar className="h-4 w-4" />
          }
        ]
      }
    ];

    // Add pattern-based suggestions
    patterns.forEach(pattern => {
      if (pattern.regex.test(lowerQuery)) {
        suggestions.push(...pattern.suggestions);
      }
    });

    // Common store names
    const commonStores = ['Checkers', 'Pick n Pay', 'Woolworths', 'Spar', 'Clicks'];
    commonStores.forEach(store => {
      if (store.toLowerCase().includes(lowerQuery) && lowerQuery.length > 1) {
        suggestions.push({
          id: `store-${store.toLowerCase()}`,
          type: 'store',
          label: `Receipts from ${store}`,
          description: `All purchases from ${store}`,
          action: () => handleSearch(`store:"${store}"`),
          icon: <Store className="h-4 w-4" />
        });
      }
    });

    // Default helpful suggestions when no query
    if (!lowerQuery) {
      suggestions.push(
        {
          id: 'recent',
          type: 'date',
          label: 'Recent receipts',
          description: 'Last 7 days',
          action: () => handleSearch('date:last-week'),
          icon: <Calendar className="h-4 w-4" />
        },
        {
          id: 'high-amount',
          type: 'amount',
          label: 'Large expenses',
          description: 'Over R500',
          action: () => handleSearch('amount:>500'),
          icon: <Banknote className="h-4 w-4" />
        },
        {
          id: 'food-category',
          type: 'category',
          label: 'Food & Dining',
          description: 'All food-related expenses',
          action: () => handleSearch('category:food,dining'),
          icon: <Tag className="h-4 w-4" />
        }
      );
    }

    return suggestions.slice(0, 6); // Limit to 6 suggestions
  };

  const handleSearch = (searchTerm: string) => {
    setQuery(searchTerm);
    onSearch?.(searchTerm);
    
    // Only redirect to search page if not in local mode
    if (!localMode) {
      setIsNavigating(true);
      // Navigate immediately for faster UX
      setLocation(`/search?q=${encodeURIComponent(searchTerm)}`);
    }
    
    setOpen(false);
  };

  const suggestions = generateSuggestions(query);

  return (
    <div className={cn("relative", className)}>
      {/* Navigation Loading Overlay */}
      {isNavigating && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-lg p-6 flex flex-col items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
            <p className="text-sm text-gray-600">Loading search results...</p>
          </div>
        </div>
      )}
      
      <Command className="rounded-none border shadow-md">
        <CommandInput
          placeholder={placeholder}
          value={query}
          onValueChange={setQuery}
          onFocus={() => setOpen(true)}
          className="text-sm"
        />
        
        {open && (
          <CommandList className="max-h-64">
            <CommandEmpty>
              <div className="py-6 text-center text-sm text-muted-foreground">
                <Search className="mx-auto h-6 w-6 mb-2 opacity-50" />
                No results found for "{query}"
              </div>
            </CommandEmpty>
            
            {suggestions.length > 0 && (
              <CommandGroup heading="Suggestions">
                {suggestions.map((suggestion) => (
                  <CommandItem
                    key={suggestion.id}
                    onSelect={() => suggestion.action()}
                    className="flex items-center gap-3 py-3 cursor-pointer"
                  >
                    <div className="flex-shrink-0 text-muted-foreground">
                      {suggestion.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{suggestion.label}</div>
                      {suggestion.description && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {suggestion.description}
                        </div>
                      )}
                    </div>
                    <Badge 
                      variant="secondary" 
                      className="text-xs capitalize"
                    >
                      {suggestion.type}
                    </Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            
            {query && (
              <CommandGroup heading="Actions">
                <CommandItem
                  onSelect={() => handleSearch(query)}
                  className="flex items-center gap-3 py-3 cursor-pointer font-medium"
                >
                  <Search className="h-4 w-4" />
                  Search for "{query}"
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        )}
      </Command>
      
      {/* Overlay to close when clicking outside */}
      {open && (
        <div 
          className="fixed inset-0 z-[-1]" 
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// Compact version for mobile
export function CompactSearch({ onSearch, className }: PredictiveSearchProps) {
  const [query, setQuery] = React.useState("");
  
  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search 'food under R100'..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onSearch?.(query);
            }
          }}
          className="w-full pl-10 pr-4 py-2 border rounded-none text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary"
        />
      </div>
    </div>
  );
}