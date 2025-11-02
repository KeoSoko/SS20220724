import React, { useEffect, useState } from 'react';
import { SmartSearch } from '@/components/smart-search';
import { PageLayout } from '@/components/page-layout';
import { Search } from 'lucide-react';

export default function SearchPage() {
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Remove initial load state after component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialLoad(false);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const headerActions = (
    <div className="flex items-center space-x-2">
      <Search className="h-6 w-6 text-blue-600" />
    </div>
  );

  return (
    <div className={`transition-opacity duration-200 ${isInitialLoad ? 'opacity-0' : 'opacity-100'}`}>
      <PageLayout 
        title="Smart Search"
        subtitle="Find receipts using natural language"
        showBackButton={true}
        headerActions={headerActions}
      >
        <SmartSearch />
      </PageLayout>
    </div>
  );
}