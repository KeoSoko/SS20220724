import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';
import { 
  Calendar, 
  FileText, 
  AlertTriangle,
  Edit,
  Brain,
  Download
} from 'lucide-react';
import TaxAIAssistant from '@/components/TaxAIAssistant';
import { PageLayout } from '@/components/page-layout';
import { GovernmentDisclaimer } from '@/components/government-disclaimer';
import { useToast } from '@/hooks/use-toast';

interface TaxDashboardData {
  ytdDeductible: number;
  projectedAnnual: number;
  estimatedSavings: number;
  quarterlyEstimate: number;
  currentQuarter: number;
  deductibleReceipts: number;
  totalReceipts: number;
  categoryBreakdown: Array<{
    category: string;
    amount: number;
    count: number;
  }>;
  thresholdProgress: Array<{
    name: string;
    threshold: number;
    current: number;
    percentage: number;
  }>;
  alerts: Array<{
    type: 'warning' | 'info' | 'success';
    message: string;
    action?: string;
  }>;
  yearEndOpportunities: Array<{
    description: string;
    potentialSavings: number;
    deadline: string;
  }>;
  currentTaxYear: number;
  taxYearStart: Date;
  taxYearEnd: Date;
  daysRemaining: number;
  progressPercentage: number;
}

export default function TaxDashboard() {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  // Fetch tax dashboard data
  const { data: taxData, isLoading: isLoadingTax } = useQuery<TaxDashboardData>({
    queryKey: ['/api/tax/dashboard'],
    enabled: true
  });

  // Use tax year from server data, with fallback calculation
  const currentTaxYear = taxData?.currentTaxYear || (() => {
    const currentDate = new Date();
    const currentCalendarYear = currentDate.getFullYear();
    return currentDate.getMonth() >= 2 ? currentCalendarYear + 1 : currentCalendarYear;
  })();

  const handleExportReport = async () => {
    setIsExporting(true);
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
      
      const response = await fetch(`/api/export/tax-report/${currentTaxYear}?format=pdf`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `tax-report-${currentTaxYear}.pdf`;
        link.click();
        window.URL.revokeObjectURL(url);
        
        toast({
          title: "Tax Report Downloaded",
          description: `Your ${currentTaxYear} tax report has been successfully downloaded.`,
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
    } finally {
      setIsExporting(false);
    }
  };



  if (isLoadingTax) {
    return (
      <PageLayout 
        title="Tax Dashboard" 
        subtitle={`Manage your tax deductions and planning for ${currentTaxYear}`}
        showBackButton={true}
      >
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-4"></div>
          <div className="h-32 bg-gray-200 rounded mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="h-24 bg-gray-200 rounded"></div>
            <div className="h-24 bg-gray-200 rounded"></div>
            <div className="h-24 bg-gray-200 rounded"></div>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout 
      title="Tax Dashboard" 
      subtitle={`Manage your tax deductions and planning for ${currentTaxYear}`}
      showBackButton={true}
      headerActions={
        <div className="flex items-center space-x-4">
          <Badge variant="outline" className="px-3 py-1">
            Tax Year: March {currentTaxYear - 1} - February {currentTaxYear}
          </Badge>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleExportReport}
            disabled={isExporting}
          >
            {isExporting ? (
              <>
                <div className="animate-spin h-4 w-4 mr-2 rounded-none border-2 border-gray-600 border-t-transparent" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Export Report
              </>
            )}
          </Button>
        </div>
      }
    >
      <GovernmentDisclaimer className="mb-6" />
      <div className="space-y-6">

          <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Calendar className="h-5 w-5 mr-2" />
                  Tax Planning & Optimization
                </CardTitle>
                <CardDescription>
                  Maximize your deductions and plan for tax season
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Quick Actions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Link href="/receipts?filter=uncategorized">
                    <Button variant="outline" className="w-full justify-start">
                      <Edit className="h-4 w-4 mr-2" />
                      Review Uncategorized Receipts
                    </Button>
                  </Link>
                  <Link href="/smart-search">
                    <Button variant="outline" className="w-full justify-start">
                      <Brain className="h-4 w-4 mr-2" />
                      Smart Expense Search
                    </Button>
                  </Link>
                </div>
                
                {/* Annual Tax Planning */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Annual Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Current Tax Year:</span>
                        <span className="font-semibold">March 2025 - February 2026</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Total Deductible:</span>
                        <span className="font-semibold text-green-600">R{(taxData?.ytdDeductible || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Deductible Receipts:</span>
                        <span className="font-semibold text-blue-600">{taxData?.deductibleReceipts || 0}</span>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Personal Tax Categories</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-sm text-gray-600 space-y-2">
                        <div className="flex items-center">
                          <div className="w-3 h-3 bg-green-500 rounded-sm mr-2"></div>
                          <span>Medical expenses</span>
                        </div>
                        <div className="flex items-center">
                          <div className="w-3 h-3 bg-blue-500 rounded-sm mr-2"></div>
                          <span>Retirement contributions</span>
                        </div>
                        <div className="flex items-center">
                          <div className="w-3 h-3 bg-purple-500 rounded-sm mr-2"></div>
                          <span>Educational expenses</span>
                        </div>
                        <div className="flex items-center">
                          <div className="w-3 h-3 bg-orange-500 rounded-sm mr-2"></div>
                          <span>Charitable donations</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                
                <Alert className="border-blue-200 bg-blue-50">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {(() => {
                      const now = new Date();
                      const currentYear = now.getFullYear();
                      
                      // SARS tax submission season: 21 July to 20 October
                      const taxSeasonStart = new Date(currentYear, 6, 21); // July 21
                      const taxSeasonEnd = new Date(currentYear, 9, 20); // October 20
                      
                      // If we're past October 20, check next year's season
                      if (now > taxSeasonEnd) {
                        taxSeasonStart.setFullYear(currentYear + 1);
                        taxSeasonEnd.setFullYear(currentYear + 1);
                      }
                      
                      const priorTaxYear = currentTaxYear - 1;
                      
                      if (now >= taxSeasonStart && now <= taxSeasonEnd) {
                        // During tax season - remind about submission deadline
                        const diffTime = taxSeasonEnd.getTime() - now.getTime();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        return (
                          <span>
                            <strong>Tax Submission Deadline:</strong> You have {diffDays} days left to submit your {priorTaxYear} tax return (due October 20).
                          </span>
                        );
                      } else if (now < taxSeasonStart) {
                        // Before tax season - remind about upcoming deadline
                        const diffTime = taxSeasonStart.getTime() - now.getTime();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        return (
                          <span>
                            <strong>Tax Season Approaching:</strong> Tax submission opens in {diffDays} days (July 21) for {priorTaxYear} returns.
                          </span>
                        );
                      } else {
                        // After tax season - remind about next year
                        const diffTime = taxSeasonStart.getTime() - now.getTime();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        return (
                          <span>
                            <strong>Next Tax Season:</strong> Tax submission for {currentTaxYear} returns opens in {diffDays} days (July 21, {taxSeasonStart.getFullYear()}).
                          </span>
                        );
                      }
                    })()}
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
      </div>
      

    </PageLayout>
  );
}