import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageLayout } from '@/components/page-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Receipt, 
  FileText, 
  Download,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ProfitLossData {
  period: string;
  startDate: string;
  endDate: string;
  revenue: {
    total: number;
    count: number;
    byMonth: Array<{
      month: string;
      amount: number;
      invoiceCount: number;
    }>;
    topClients: Array<{
      clientId: number;
      clientName: string;
      amount: number;
      invoiceCount: number;
    }>;
  };
  expenses: {
    total: number;
    count: number;
    byMonth: Array<{
      month: string;
      amount: number;
      receiptCount: number;
    }>;
    byCategory: Array<{
      category: string;
      amount: number;
      receiptCount: number;
      percentage: number;
    }>;
  };
  profit: {
    netProfit: number;
    profitMargin: number;
    byMonth: Array<{
      month: string;
      revenue: number;
      expenses: number;
      profit: number;
      margin: number;
    }>;
  };
  comparison?: {
    previousPeriod: {
      revenue: number;
      expenses: number;
      profit: number;
    };
    percentageChange: {
      revenue: number;
      expenses: number;
      profit: number;
    };
  };
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatPercentage = (value: number) => {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
};

export default function ProfitLossPage() {
  const { toast } = useToast();
  const [period, setPeriod] = useState<string>('monthly');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(new Date().getMonth());
  const [quarter, setQuarter] = useState<number>(Math.floor(new Date().getMonth() / 3));

  // Fetch P&L data
  const { data: plData, isLoading } = useQuery<ProfitLossData>({
    queryKey: ['/api/profit-loss', { period, year, month, quarter }],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Not authenticated');

      const params = new URLSearchParams({ period, year: year.toString() });
      if (period === 'monthly') params.append('month', month.toString());
      if (period === 'quarterly') params.append('quarter', quarter.toString());

      const response = await fetch(`/api/profit-loss?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to fetch P&L data');
      return response.json();
    }
  });

  const handleExportPDF = async () => {
    try {
      if (!plData) return;

      toast({
        title: "Generating PDF",
        description: "Your Profit & Loss report is being prepared...",
      });
      
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Header
      doc.setFontSize(20);
      doc.setTextColor(0, 115, 170); // Simple Slips blue
      doc.text('Simple Slips', pageWidth / 2, 20, { align: 'center' });
      
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text('Profit & Loss Statement', pageWidth / 2, 30, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Period: ${plData.period}`, pageWidth / 2, 38, { align: 'center' });
      doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy')}`, pageWidth / 2, 44, { align: 'center' });
      
      let yPosition = 55;
      
      // Summary Section
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text('Financial Summary', 14, yPosition);
      yPosition += 10;
      
      const summaryData = [
        ['Total Revenue', formatCurrency(plData.revenue.total), plData.revenue.count + ' invoices'],
        ['Total Expenses', formatCurrency(plData.expenses.total), plData.expenses.count + ' receipts'],
        ['Net Profit', formatCurrency(plData.profit.netProfit), plData.profit.profitMargin.toFixed(2) + '% margin']
      ];
      
      autoTable(doc, {
        startY: yPosition,
        head: [['Category', 'Amount', 'Details']],
        body: summaryData,
        theme: 'grid',
        headStyles: { fillColor: [0, 115, 170] },
        styles: { fontSize: 10 }
      });
      
      yPosition = (doc as any).lastAutoTable.finalY + 15;
      
      // Monthly Breakdown
      if (plData.profit.byMonth.length > 0) {
        doc.setFontSize(14);
        doc.text('Monthly Breakdown', 14, yPosition);
        yPosition += 10;
        
        const monthlyData = plData.profit.byMonth.map(m => [
          m.month,
          formatCurrency(m.revenue),
          formatCurrency(m.expenses),
          formatCurrency(m.profit),
          m.margin.toFixed(1) + '%'
        ]);
        
        autoTable(doc, {
          startY: yPosition,
          head: [['Month', 'Revenue', 'Expenses', 'Profit', 'Margin']],
          body: monthlyData,
          theme: 'striped',
          headStyles: { fillColor: [0, 115, 170] },
          styles: { fontSize: 9 }
        });
        
        yPosition = (doc as any).lastAutoTable.finalY + 15;
      }
      
      // Expense Breakdown by Category
      if (plData.expenses.byCategory.length > 0 && yPosition < 250) {
        doc.setFontSize(14);
        doc.text('Expense Categories', 14, yPosition);
        yPosition += 10;
        
        const categoryData = plData.expenses.byCategory.slice(0, 10).map(c => [
          c.category,
          formatCurrency(c.amount),
          c.receiptCount.toString(),
          c.percentage.toFixed(1) + '%'
        ]);
        
        autoTable(doc, {
          startY: yPosition,
          head: [['Category', 'Amount', 'Receipts', '% of Total']],
          body: categoryData,
          theme: 'grid',
          headStyles: { fillColor: [0, 115, 170] },
          styles: { fontSize: 9 }
        });
      }
      
      // Footer
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Page ${i} of ${pageCount}`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        );
      }
      
      // Download
      const filename = `profit-loss-${period}-${year}${period === 'monthly' ? '-' + (month + 1) : ''}.pdf`;
      doc.save(filename);
      
      toast({
        title: "Export Complete",
        description: "Your P&L report has been downloaded.",
      });
    } catch (error) {
      console.error('PDF export error:', error);
      toast({
        title: "Export Failed",
        description: "Unable to generate PDF report. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleExportCSV = async () => {
    try {
      if (!plData) return;

      // Create CSV content
      const csvRows = [
        ['Simple Slips - Profit & Loss Statement'],
        [`Period: ${plData.period}`],
        [''],
        ['REVENUE'],
        ['Total Revenue', formatCurrency(plData.revenue.total)],
        ['Number of Invoices', plData.revenue.count.toString()],
        [''],
        ['EXPENSES'],
        ['Total Expenses', formatCurrency(plData.expenses.total)],
        ['Number of Receipts', plData.expenses.count.toString()],
        [''],
        ['PROFIT'],
        ['Net Profit', formatCurrency(plData.profit.netProfit)],
        ['Profit Margin', `${plData.profit.profitMargin.toFixed(2)}%`],
      ];

      const csvContent = csvRows.map(row => row.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `profit-loss-${period}-${year}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Export Complete",
        description: "Your P&L report has been downloaded.",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Unable to generate CSV report. Please try again.",
        variant: "destructive",
      });
    }
  };

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];

  if (isLoading) {
    return (
      <PageLayout
        title="Profit & Loss Statement"
        subtitle="Loading financial data..."
        showBackButton={true}
      >
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
      </PageLayout>
    );
  }

  if (!plData) {
    return (
      <PageLayout
        title="Profit & Loss Statement"
        subtitle="No data available"
        showBackButton={true}
      >
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Unable to load financial data</p>
          </CardContent>
        </Card>
      </PageLayout>
    );
  }

  const profitIsPositive = plData.profit.netProfit >= 0;

  return (
    <PageLayout
      title="Profit & Loss Statement"
      subtitle={plData.period}
      showBackButton={true}
    >
      <div className="space-y-6">
        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Report Period</CardTitle>
            <CardDescription>Select the time period for your P&L statement</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Period Type</label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger data-testid="select-period-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Year</label>
                <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
                  <SelectTrigger data-testid="select-year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map(y => (
                      <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {period === 'monthly' && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Month</label>
                  <Select value={month.toString()} onValueChange={(v) => setMonth(parseInt(v))}>
                    <SelectTrigger data-testid="select-month">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((m, i) => (
                        <SelectItem key={i} value={i.toString()}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {period === 'quarterly' && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Quarter</label>
                  <Select value={quarter.toString()} onValueChange={(v) => setQuarter(parseInt(v))}>
                    <SelectTrigger data-testid="select-quarter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {quarters.map((q, i) => (
                        <SelectItem key={i} value={i.toString()}>{q}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={handleExportCSV}
                  className="flex-1"
                  data-testid="button-export-csv"
                >
                  <Download className="h-4 w-4 mr-2" />
                  CSV
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleExportPDF}
                  className="flex-1"
                  data-testid="button-export-pdf"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card data-testid="card-revenue">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(plData.revenue.total)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {plData.revenue.count} invoice{plData.revenue.count !== 1 ? 's' : ''}
              </p>
              {plData.comparison && (
                <div className="flex items-center mt-2 text-xs">
                  {plData.comparison.percentageChange.revenue >= 0 ? (
                    <ArrowUpRight className="h-3 w-3 text-green-600 mr-1" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 text-red-600 mr-1" />
                  )}
                  <span className={plData.comparison.percentageChange.revenue >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {formatPercentage(plData.comparison.percentageChange.revenue)} vs previous period
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-expenses">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
              <Receipt className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {formatCurrency(plData.expenses.total)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {plData.expenses.count} receipt{plData.expenses.count !== 1 ? 's' : ''}
              </p>
              {plData.comparison && (
                <div className="flex items-center mt-2 text-xs">
                  {plData.comparison.percentageChange.expenses >= 0 ? (
                    <ArrowUpRight className="h-3 w-3 text-orange-600 mr-1" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 text-green-600 mr-1" />
                  )}
                  <span className={plData.comparison.percentageChange.expenses >= 0 ? 'text-orange-600' : 'text-green-600'}>
                    {formatPercentage(plData.comparison.percentageChange.expenses)} vs previous period
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-profit">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
              {profitIsPositive ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${profitIsPositive ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(plData.profit.netProfit)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {plData.profit.profitMargin.toFixed(1)}% profit margin
              </p>
              {plData.comparison && (
                <div className="flex items-center mt-2 text-xs">
                  {plData.comparison.percentageChange.profit >= 0 ? (
                    <ArrowUpRight className="h-3 w-3 text-green-600 mr-1" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 text-red-600 mr-1" />
                  )}
                  <span className={plData.comparison.percentageChange.profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {formatPercentage(plData.comparison.percentageChange.profit)} vs previous period
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Monthly Breakdown */}
        {period !== 'monthly' && plData.profit.byMonth.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Monthly Breakdown</CardTitle>
              <CardDescription>Revenue, expenses, and profit by month</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-4">Month</th>
                      <th className="text-right py-2 px-4">Revenue</th>
                      <th className="text-right py-2 px-4">Expenses</th>
                      <th className="text-right py-2 px-4">Profit</th>
                      <th className="text-right py-2 px-4">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plData.profit.byMonth.map((monthData, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-4">{format(new Date(monthData.month + '-01'), 'MMMM yyyy')}</td>
                        <td className="text-right py-2 px-4 text-green-600">{formatCurrency(monthData.revenue)}</td>
                        <td className="text-right py-2 px-4 text-orange-600">{formatCurrency(monthData.expenses)}</td>
                        <td className={`text-right py-2 px-4 font-medium ${monthData.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(monthData.profit)}
                        </td>
                        <td className="text-right py-2 px-4">{monthData.margin.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top Clients & Expense Categories */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Clients by Revenue</CardTitle>
              <CardDescription>Your highest-earning client relationships</CardDescription>
            </CardHeader>
            <CardContent>
              {plData.revenue.topClients && plData.revenue.topClients.length > 0 ? (
                <div className="space-y-3">
                  {plData.revenue.topClients.slice(0, 5).map((client, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                      <div>
                        <p className="font-medium">{client.clientName}</p>
                        <p className="text-xs text-muted-foreground">
                          {client.invoiceCount} invoice{client.invoiceCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-600">{formatCurrency(client.amount)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No client revenue data available for this period
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Expenses by Category</CardTitle>
              <CardDescription>Your spending breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              {plData.expenses.byCategory.length > 0 ? (
                <div className="space-y-3">
                  {plData.expenses.byCategory.slice(0, 5).map((category, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                      <div>
                        <p className="font-medium capitalize">{category.category}</p>
                        <p className="text-xs text-muted-foreground">
                          {category.receiptCount} receipt{category.receiptCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-orange-600">{formatCurrency(category.amount)}</p>
                        <p className="text-xs text-muted-foreground">{category.percentage.toFixed(1)}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No expense data available for this period
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageLayout>
  );
}
