import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  TrendingUp, 
  Banknote,
  Receipt,
  Calendar,
  PieChart,
  BarChart3
} from "lucide-react";
import { PageLayout } from "@/components/page-layout";
import { ContentCard, Section } from "@/components/design-system";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, parseISO } from 'date-fns';
import { ChartSkeleton } from "@/components/ui/skeleton-loaders";
import { QueryErrorFallback } from "@/components/ui/error-boundaries";
import { 
  EnhancedButton,
  SpacingContainer,
  EnhancedEmptyState
} from "@/components/ui/enhanced-components";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
// Note: Using CSS-based pie chart visualization for better compatibility

// Helper functions
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR'
  }).format(amount);
};

const formatCategory = (category: string) => {
  return category.charAt(0).toUpperCase() + category.slice(1).replaceAll('_', ' ');
};

// Colors for pie chart segments
const CHART_COLORS = [
  '#0073AA', // Primary blue
  '#4F93D8', // Light blue
  '#8BB5E3', // Lighter blue
  '#C7D7EE', // Very light blue
  '#E5F1FA', // Pale blue
  '#FF6B35', // Orange accent
  '#FF8F65', // Light orange
  '#FFB396', // Lighter orange
  '#95A5A6', // Gray
  '#BDC3C7'  // Light gray
];

interface CategoryItem { 
  category: string;
  count: number;
  total: number;
}

interface MonthlyItem {
  month: string;
  total: number;
}

interface Receipt {
  id: number;
  storeName: string;
  total: number;
  category: string;
  date: string;
}

export default function AnalyticsPage() {
  const isMobile = useIsMobile();
  const [, setLocation] = useLocation();
  
  // Fetch data with error handling
  const { 
    data: categoryData = [], 
    isLoading: isCategoryLoading, 
    error: categoryError,
    refetch: refetchCategory 
  } = useQuery<CategoryItem[]>({
    queryKey: ["/api/analytics/categories"]
  });
  
  const { 
    data: monthlyData = [], 
    isLoading: isMonthlyLoading, 
    error: monthlyError,
    refetch: refetchMonthly 
  } = useQuery<MonthlyItem[]>({
    queryKey: ["/api/analytics/monthly"]
  });
  
  const { 
    data: receipts = [], 
    isLoading: isReceiptsLoading, 
    error: receiptsError,
    refetch: refetchReceipts 
  } = useQuery<Receipt[]>({
    queryKey: ["/api/receipts"]
  });

  // Calculate analytics
  const totalSpending = categoryData.reduce((sum, cat) => sum + cat.total, 0);
  const totalReceipts = receipts.length;
  const averagePerReceipt = totalReceipts > 0 ? totalSpending / totalReceipts : 0;
  
  // Find top category
  const topCategory = categoryData.length > 0 ? 
    [...categoryData].sort((a, b) => b.total - a.total)[0] : null;
  
  // Find latest month
  const latestMonth = monthlyData.length > 0 ? 
    [...monthlyData].sort((a, b) => b.month.localeCompare(a.month))[0] : null;

  // Enhanced loading state with skeleton components
  if (isCategoryLoading || isMonthlyLoading || isReceiptsLoading) {
    return (
      <PageLayout title="Expense Insights" subtitle="Analyzing your financial data...">
        <div className="space-y-6">
          <div className={`grid gap-6 ${isMobile ? 'grid-cols-1' : 'grid-cols-3'}`}>
            {[1, 2, 3].map(i => (
              <ChartSkeleton key={i} className="h-32" />
            ))}
          </div>
          <ChartSkeleton className="h-96" />
          <div className={`grid gap-6 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <ChartSkeleton className="h-64" />
            <ChartSkeleton className="h-64" />
          </div>
        </div>
      </PageLayout>
    );
  }

  // Error handling with recovery options
  if (categoryError || monthlyError || receiptsError) {
    return (
      <PageLayout title="Expense Insights" subtitle="Unable to load analytics">
        <QueryErrorFallback 
          error={(categoryError || monthlyError || receiptsError) as Error} 
          refetch={() => {
            refetchCategory();
            refetchMonthly();
            refetchReceipts();
          }}
        />
      </PageLayout>
    );
  }

  const headerActions = (
    <div className="flex items-center space-x-2">
      <TrendingUp className="h-6 w-6 text-primary" />
    </div>
  );

  return (
    <PageLayout 
      title="Expense Insights"
      subtitle="Track and analyze your financial patterns and spending habits"
      showBackButton={true}
      headerActions={headerActions}
    >
      {/* Key Metrics Overview */}
      <Section title="Financial Overview" description="Your spending summary at a glance">
        <div className={`grid gap-6 ${isMobile ? 'grid-cols-1' : 'grid-cols-3'}`}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Spending</CardTitle>
              <Banknote className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalSpending)}</div>
              <p className="text-xs text-muted-foreground">
                Across {totalReceipts} receipts
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average per Receipt</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(averagePerReceipt)}</div>
              <p className="text-xs text-muted-foreground">
                Per transaction
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Top Category</CardTitle>
              <PieChart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {topCategory ? formatCategory(topCategory.category) : 'None'}
              </div>
              <p className="text-xs text-muted-foreground">
                {topCategory ? formatCurrency(topCategory.total) : 'No data'}
              </p>
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* Category Breakdown */}
      <Section title="Spending by Category" description="Where your money goes">
        <ContentCard>
          {categoryData.length > 0 ? (
            <div className={`${isMobile ? 'space-y-6' : 'grid grid-cols-2 gap-8'}`}>
              {/* CSS Pie Chart */}
              <div className="flex items-center justify-center h-80">
                <div className="relative w-64 h-64">
                  <svg width="256" height="256" viewBox="0 0 256 256" className="transform -rotate-90">
                    {(() => {
                      let cumulativePercentage = 0;
                      const radius = 100;
                      const centerX = 128;
                      const centerY = 128;
                      
                      return categoryData
                        .filter(cat => cat.total > 0)
                        .sort((a, b) => b.total - a.total)
                        .map((cat, index) => {
                          const percentage = totalSpending > 0 ? (cat.total / totalSpending) * 100 : 0;
                          const angle = (percentage / 100) * 360;
                          const startAngle = (cumulativePercentage / 100) * 360;
                          const endAngle = startAngle + angle;
                          
                          const startAngleRad = (startAngle * Math.PI) / 180;
                          const endAngleRad = (endAngle * Math.PI) / 180;
                          
                          const x1 = centerX + radius * Math.cos(startAngleRad);
                          const y1 = centerY + radius * Math.sin(startAngleRad);
                          const x2 = centerX + radius * Math.cos(endAngleRad);
                          const y2 = centerY + radius * Math.sin(endAngleRad);
                          
                          const largeArcFlag = angle > 180 ? 1 : 0;
                          
                          const pathData = [
                            `M ${centerX} ${centerY}`,
                            `L ${x1} ${y1}`,
                            `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                            'Z'
                          ].join(' ');
                          
                          cumulativePercentage += percentage;
                          
                          return (
                            <path
                              key={cat.category}
                              d={pathData}
                              fill={CHART_COLORS[index % CHART_COLORS.length]}
                              stroke="#ffffff"
                              strokeWidth="2"
                              className="hover:opacity-80 transition-opacity cursor-pointer"

                            />
                          );
                        });
                    })()}
                  </svg>
                  
                  {/* Center circle for donut effect */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-20 h-20 bg-white rounded-none flex items-center justify-center shadow-sm">
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground">Total</div>
                        <div className="text-sm font-semibold">{formatCurrency(totalSpending)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Category Details */}
              <div className="space-y-4">
                <h4 className="font-medium text-lg">Category Breakdown</h4>
                {categoryData
                  .filter(cat => cat.total > 0)
                  .sort((a, b) => b.total - a.total)
                  .map((cat, index) => {
                    const percentage = totalSpending > 0 ? (cat.total / totalSpending) * 100 : 0;
                    return (
                      <div key={cat.category} className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-4 h-4 rounded-none" 
                            style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                          />
                          <div>
                            <div className="font-medium">{formatCategory(cat.category)}</div>
                            <div className="text-sm text-muted-foreground">
                              {cat.count} transaction{cat.count !== 1 ? 's' : ''}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{formatCurrency(cat.total)}</div>
                          <div className="text-sm text-muted-foreground">
                            {percentage.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <PieChart className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No category data available</h3>
              <p className="text-muted-foreground">
                Upload some receipts to see your spending breakdown by category
              </p>
            </div>
          )}
        </ContentCard>
      </Section>

      {/* Monthly Trends */}
      <Section title="Monthly Spending Trends" description="Track your spending over the latest 6 months">
        <ContentCard>
          {monthlyData.length > 0 ? (
            <div className="space-y-4">
              <div className="grid gap-3">
                {monthlyData
                  .sort((a, b) => b.month.localeCompare(a.month))
                  .slice(0, 6)
                  .map((month) => {
                    const maxSpending = Math.max(...monthlyData.map(m => m.total));
                    const percentage = maxSpending > 0 ? (month.total / maxSpending) * 100 : 0;
                    
                    return (
                      <div key={month.month} className="flex items-center justify-between p-4 border rounded-none">
                        <div>
                          <div className="font-medium">
                            {format(parseISO(`${month.month}-01`), 'MMMM yyyy')}
                          </div>
                          <div className="w-32 bg-gray-200 rounded-none h-2 mt-2">
                            <div 
                              className="bg-green-600 h-2 rounded-none" 
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold">{formatCurrency(month.total)}</div>
                        </div>
                      </div>
                    );
                  })}
              </div>
              
              {latestMonth && (
                <div className="mt-6 p-4 bg-blue-50 rounded-none border border-blue-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-blue-900">Latest Month</span>
                  </div>
                  <div className="text-sm text-blue-700">
                    You spent <span className="font-semibold">{formatCurrency(latestMonth.total)}</span> in{' '}
                    {format(parseISO(`${latestMonth.month}-01`), 'MMMM yyyy')}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <Calendar className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No monthly data available</h3>
              <p className="text-muted-foreground">
                Add receipts from different months to see spending trends
              </p>
            </div>
          )}
        </ContentCard>
      </Section>

      {/* Recurring Expenses */}
      <Section title="Recurring Expenses" description="Track your subscription payments and recurring bills">
        <ContentCard>
          <div className="text-center py-8">
            <div className="flex items-center justify-center gap-4 mb-4">
              <TrendingUp className="h-8 w-8 text-blue-600" />
              <div>
                <h3 className="text-lg font-medium">Smart Recurring Detection</h3>
                <p className="text-sm text-gray-600">Automatically identify your recurring expenses</p>
              </div>
            </div>
            <Button 
              onClick={() => setLocation('/recurring-expenses')}
              className="gap-2"
            >
              <Calendar className="h-4 w-4" />
              View Recurring Expenses
            </Button>
          </div>
        </ContentCard>
      </Section>

      {/* Recent Activity */}
      <Section title="Recent Activity" description="Your latest transactions">
        <ContentCard>
          {receipts.length > 0 ? (
            <div className="space-y-3">
              {receipts
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .slice(0, 5)
                .map((receipt) => (
                  <div key={receipt.id} className="flex items-center justify-between p-3 border rounded-none">
                    <div>
                      <div className="font-medium">{receipt.storeName}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatCategory(receipt.category)} • {format(new Date(receipt.date), 'MMM dd, yyyy')}
                      </div>
                    </div>
                    <div className="font-semibold">{formatCurrency(receipt.total)}</div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Receipt className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No receipts found</h3>
              <p className="text-muted-foreground">
                Start uploading receipts to see your spending activity
              </p>
            </div>
          )}
        </ContentCard>
      </Section>
    </PageLayout>
  );
}