import React, { useState } from 'react';
import { Download, FileText, Receipt, Calendar, CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageLayout } from '@/components/page-layout';
import { Section } from '@/components/design-system';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { dispatchVerificationRequiredEvent } from '@/lib/queryClient';
import { useQuery } from '@tanstack/react-query';
import { EXPENSE_CATEGORIES } from '@shared/schema';

export default function ExportsPage() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportType, setExportType] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeImages, setIncludeImages] = useState(true);
  const [showDateRangeExport, setShowDateRangeExport] = useState(false);
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [allowAllTimeExport, setAllowAllTimeExport] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // Fetch user's custom categories
  const { data: customCategories = [] } = useQuery<any[]>({
    queryKey: ['/api/custom-categories'],
  });

  const handleExport = async (type: 'backup') => {
    setIsExporting(true);
    setExportType(type);

    try {
      const url = '/api/backup';
      const filename = 'receipt-backup.json';

      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('Authentication required. Please log in again.');
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        window.URL.revokeObjectURL(link.href);
        
        toast({
          title: "Export Successful",
          description: `Your ${type.replace('-', ' ')} has been downloaded.`,
        });
      } else {
        // Check for email verification required error (403)
        if (response.status === 403) {
          try {
            const errorData = await response.json();
            if (errorData.error === 'email_verification_required') {
              // Dispatch event to show verification dialog, don't show toast
              dispatchVerificationRequiredEvent(errorData.userEmail);
              return;
            }
          } catch {
            // If JSON parsing fails, fall through to generic error
          }
        }
        const errorText = await response.text();
        throw new Error(`Export failed: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      toast({
        title: "Export failed",
        description: "There was an error exporting your data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
      setExportType('');
    }
  };

  const handleDateRangeExport = async (type: 'csv' | 'pdf' | 'tax-report') => {
    if (!startDate && !endDate && !allowAllTimeExport) {
      toast({
        title: "Select a date range",
        description: "Please choose a start date, end date, or enable all-time export.",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);
    setExportType(type === 'csv' ? 'date-range-csv' : type === 'tax-report' ? 'date-range-tax' : 'date-range-pdf');

    try {
      const params = new URLSearchParams({
        ...(type === 'pdf' && { includeImages: includeImages.toString() }),
        ...(type === 'pdf' && { includeSummary: includeSummary.toString() }),
        ...(type === 'pdf' && { groupBy: groupByCategory ? 'category' : 'date' }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(category && category !== 'all' && { category })
      });

      const dateRange = startDate && endDate ? `${startDate}-to-${endDate}` : 
                       startDate ? `from-${startDate}` :
                       endDate ? `until-${endDate}` : 'all-dates';
      const url = type === 'csv'
        ? `/api/export/csv?${params.toString()}`
        : type === 'tax-report'
          ? `/api/export/tax-report/${new Date().getFullYear()}?${params.toString()}`
          : `/api/export/pdf?${params.toString()}`;
      const filename = type === 'csv'
        ? `receipts-${dateRange}.csv`
        : type === 'tax-report'
          ? `tax-report-${dateRange}.pdf`
          : `receipts-${dateRange}.pdf`;

      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('Authentication required. Please log in again.');
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        window.URL.revokeObjectURL(link.href);
        
        toast({
          title: "Export Successful",
          description: `Your ${type.replace('-', ' ')} report has been downloaded.`,
        });
      } else {
        // Check for email verification required error (403)
        if (response.status === 403) {
          try {
            const errorData = await response.json();
            if (errorData.error === 'email_verification_required') {
              // Dispatch event to show verification dialog, don't show toast
              dispatchVerificationRequiredEvent(errorData.userEmail);
              return;
            }
          } catch {
            // If JSON parsing fails, fall through to generic error
          }
        }
        const errorText = await response.text();
        throw new Error(`Export failed: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      toast({
        title: "Export failed",
        description: "There was an error exporting your data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
      setExportType('');
    }
  };

  const exportOptions = [
    {
      type: 'backup' as const,
      title: 'Full Backup',
      description: 'Complete data export in JSON format',
      icon: Receipt,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
  ];

  return (
    <PageLayout 
      title="Export & Reports"
      subtitle="Download your receipt data in various formats"
      showBackButton={true}
    >
      <Section>
        {/* Date Range Export Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 rounded-none bg-indigo-50">
                <CalendarRange className="h-6 w-6 text-indigo-600" />
              </div>
              Custom Reports (Date Range)
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowDateRangeExport(!showDateRangeExport)}
                className="ml-auto"
              >
                {showDateRangeExport ? 'Hide' : 'Show'}
              </Button>
            </CardTitle>
          </CardHeader>
          {showDateRangeExport && (
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Choose a date range or enable all-time export, then optionally filter by category.
              </p>
              <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
                <div>
                  <Label htmlFor="start-date">Start Date</Label>
                  <Input 
                    id="start-date"
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="end-date">End Date</Label>
                  <Input 
                    id="end-date"
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="category-filter">Category Filter (Optional)</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="category-filter">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                    {Array.isArray(customCategories) && customCategories.length > 0 && (
                      <>
                        {customCategories.map((customCat: any) => (
                          <SelectItem key={`custom-${customCat.id}`} value={customCat.name}>
                            {customCat.displayName || customCat.name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="include-summary"
                    checked={includeSummary}
                    onCheckedChange={(checked) => setIncludeSummary(checked === true)}
                  />
                  <Label htmlFor="include-summary">Include summary and totals (PDF only)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="include-images"
                    checked={includeImages}
                    onCheckedChange={(checked) => setIncludeImages(checked === true)}
                  />
                  <Label htmlFor="include-images">Include receipt images (PDF only)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="group-by-category"
                    checked={groupByCategory}
                    onCheckedChange={(checked) => setGroupByCategory(checked === true)}
                  />
                  <Label htmlFor="group-by-category">Group receipts by category (PDF only)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="allow-all-time"
                    checked={allowAllTimeExport}
                    onCheckedChange={(checked) => setAllowAllTimeExport(checked === true)}
                  />
                  <Label htmlFor="allow-all-time">Allow all-time export (no date range)</Label>
                </div>
              </div>

              <div className={`grid gap-3 ${isMobile ? 'grid-cols-1' : 'grid-cols-3'}`}>
                <Button 
                  onClick={() => handleDateRangeExport('pdf')}
                  disabled={isExporting}
                  size={isMobile ? "lg" : "default"}
                >
                  {isExporting && exportType === 'date-range-pdf' ? (
                    <>
                      <div className="animate-spin h-4 w-4 mr-2 rounded-none border-2 border-white border-t-transparent" />
                      Generating PDF...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4 mr-2" />
                      Download PDF
                    </>
                  )}
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => handleDateRangeExport('csv')}
                  disabled={isExporting}
                  size={isMobile ? "lg" : "default"}
                >
                  {isExporting && exportType === 'date-range-csv' ? (
                    <>
                      <div className="animate-spin h-4 w-4 mr-2 rounded-none border-2 border-gray-500 border-t-transparent" />
                      Generating CSV...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Download CSV
                    </>
                  )}
                </Button>
                <Button 
                  variant="secondary"
                  onClick={() => handleDateRangeExport('tax-report')}
                  disabled={isExporting}
                  size={isMobile ? "lg" : "default"}
                >
                  {isExporting && exportType === 'date-range-tax' ? (
                    <>
                      <div className="animate-spin h-4 w-4 mr-2 rounded-none border-2 border-white border-t-transparent" />
                      Generating Tax...
                    </>
                  ) : (
                    <>
                      <Calendar className="h-4 w-4 mr-2" />
                      Download Tax PDF
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          )}
        </Card>

        <div className={`grid gap-6 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {exportOptions.map((option) => (
            <Card key={option.type} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <div className={`p-2 rounded-none ${option.bgColor}`}>
                    <option.icon className={`h-6 w-6 ${option.color}`} />
                  </div>
                  {option.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {option.description}
                </p>
                <Button 
                  onClick={() => handleExport(option.type)}
                  disabled={isExporting}
                  className="w-full"
                  size={isMobile ? "lg" : "default"}
                >
                  {isExporting && exportType === option.type ? (
                    <>
                      <div className="animate-spin h-4 w-4 mr-2 rounded-none border-2 border-white border-t-transparent" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Download {option.title}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>
    </PageLayout>
  );
}
