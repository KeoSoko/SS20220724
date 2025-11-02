import React from 'react';
import { BudgetManager } from '@/components/budget-manager';
import { PageLayout } from '@/components/page-layout';
import { PiggyBank } from 'lucide-react';

export default function BudgetsPage() {
  const headerActions = (
    <div className="flex items-center space-x-2">
      <PiggyBank className="h-6 w-6 text-green-600" />
    </div>
  );

  return (
    <PageLayout 
      title="Budget Management"
      subtitle="Track your spending and stay on budget"
      showBackButton={true}
      headerActions={headerActions}
    >
      <BudgetManager />
    </PageLayout>
  );
}