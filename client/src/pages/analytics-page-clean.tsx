import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  BarChart, 
  TrendingUp, 
  Wallet,
  Tag,
  Calendar,
  Download,
  Receipt
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageLayout } from "@/components/page-layout";
import { Section } from "@/components/design-system";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

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

export default function AnalyticsPage() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [timeRange, setTimeRange] = useState("month");
  const [activeTab, setActiveTab] = useState("overview");

  // Check URL parameters for tab selection
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, []);

  // Fetch analytics data
  const { data: categoryData, isLoading: categoryLoading } = useQuery({
    queryKey: ["/api/analytics/categories", timeRange],
  });

  const { data: monthlyData, isLoading: monthlyLoading } = useQuery({
    queryKey: ["/api/analytics/monthly", timeRange],
  });

  const { data: receipts, isLoading: receiptsLoading } = useQuery({
    queryKey: ["/api/receipts"],
  });

  const headerActions = (
    <div className="flex items-center space-x-2">
      <BarChart className="h-6 w-6 text-primary" />
      <TrendingUp className="h-5 w-5 text-green-500" />
    </div>
  );

  if (categoryLoading || monthlyLoading || receiptsLoading) {
    return (
      <PageLayout 
        title="Expense Reports"
        subtitle="Track and analyze your financial patterns and spending habits"
        showBackButton={true}
        headerActions={headerActions}
      >
        <Section>
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </Section>
      </PageLayout>
    );
  }

  const categories = Array.isArray(categoryData) ? categoryData : [];
  const monthly = Array.isArray(monthlyData) ? monthlyData : [];
  const receiptsList = Array.isArray(receipts) ? receipts : [];

  // Calculate totals
  const totalSpent = categories.reduce((sum: number, cat: any) => sum + (cat.total || 0), 0);
  const totalReceipts = receiptsList.length;
  const avgPerReceipt = totalReceipts > 0 ? totalSpent / totalReceipts : 0;
  const topCategory = categories.length > 0 ? 
    [...categories].sort((a: any, b: any) => (b.total || 0) - (a.total || 0))[0] : 
    null;

  return (
    <PageLayout 
      title="Expense Reports"
      subtitle="Track and analyze your financial patterns and spending habits"
      showBackButton={true}
      headerActions={headerActions}
    >
      <Section>
        <div className="flex justify-end mb-6">
          <Select
            value={timeRange}
            onValueChange={(value: string) => setTimeRange(value)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Last 30 Days</SelectItem>
              <SelectItem value="quarter">Last 3 Months</SelectItem>
              <SelectItem value="year">Last 12 Months</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs 
          value={activeTab} 
          onValueChange={setActiveTab}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(totalSpent)}</div>
                  <p className="text-xs text-muted-foreground">
                    Across {totalReceipts} receipts
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Top Category</CardTitle>
                  <Tag className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {topCategory ? formatCategory(topCategory.category) : 'N/A'}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {topCategory ? formatCurrency(topCategory.total) : '$0.00'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Recent Month</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {monthly.length > 0 ? monthly[0].month : 'N/A'}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {monthly.length > 0 ? formatCurrency(monthly[0].total) : '$0.00'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Average Receipt</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(avgPerReceipt)}</div>
                  <p className="text-xs text-muted-foreground">
                    Per transaction
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Category Breakdown</CardTitle>
                  <CardDescription>Spending by category</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {categories.slice(0, 5).map((category: any, index: number) => (
                      <div key={category.category} className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div 
                            className="w-3 h-3 rounded-none"
                            style={{ backgroundColor: `hsl(${index * 60}, 70%, 50%)` }}
                          />
                          <span className="text-sm font-medium">
                            {formatCategory(category.category)}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold">
                            {formatCurrency(category.total)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {category.count} receipts
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Monthly Overview</CardTitle>
                  <CardDescription>Recent spending patterns</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {monthly.slice(0, 6).map((month: any, index: number) => (
                      <div key={month.month} className="flex items-center justify-between">
                        <span className="text-sm font-medium">{month.month}</span>
                        <div className="text-right">
                          <div className="text-sm font-semibold">
                            {formatCurrency(month.total)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="categories" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>All Categories</CardTitle>
                <CardDescription>Complete breakdown of spending by category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {categories.map((category: any, index: number) => (
                    <div key={category.category} className="border rounded-none p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-lg">
                          {formatCategory(category.category)}
                        </h3>
                        <Badge variant="secondary">
                          {category.count} receipts
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-2xl font-bold text-primary">
                          {formatCurrency(category.total)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Avg: {formatCurrency(category.count > 0 ? category.total / category.count : 0)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trends" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Monthly Trends</CardTitle>
                <CardDescription>Historical spending data</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {monthly.map((month: any, index: number) => {
                    const prevMonth = monthly[index + 1];
                    const change = prevMonth ? 
                      ((month.total - prevMonth.total) / prevMonth.total * 100) : 0;
                    
                    return (
                      <div key={month.month} className="border rounded-none p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold">{month.month}</h3>
                            <div className="text-2xl font-bold text-primary">
                              {formatCurrency(month.total)}
                            </div>
                          </div>
                          {prevMonth && (
                            <div className="text-right">
                              <div className={`text-sm font-medium ${
                                change > 0 ? 'text-red-600' : 'text-green-600'
                              }`}>
                                {change > 0 ? '+' : ''}{change.toFixed(1)}%
                              </div>
                              <div className="text-xs text-muted-foreground">
                                vs previous month
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Export Reports</CardTitle>
                <CardDescription>Download your expense data</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button variant="outline" className="flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Export CSV
                  </Button>
                  <Button variant="outline" className="flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Export PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Section>
    </PageLayout>
  );
}