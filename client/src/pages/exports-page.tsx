import React, { useState } from 'react';
import { Download, FileText, Receipt, Calendar, TrendingUp, BarChart3, CalendarRange } from 'lucide-react';
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
import { apiRequest, dispatchVerificationRequiredEvent } from '@/lib/queryClient';

export default function ExportsPage() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportType, setExportType] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeImages, setIncludeImages] = useState(true);
  const [showDateRangeExport, setShowDateRangeExport] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const handleExport = async (type: 'csv' | 'pdf' | 'backup' | 'tax-report') => {
    setIsExporting(true);
    setExportType(type);

    try {
      let url = '';
      let filename = '';
      
      switch (type) {
        case 'csv':
          url = '/api/export/csv';
          filename = 'receipts.csv';
          break;
        case 'pdf':
          url = '/api/export/pdf?includeImages=true&includeSummary=true';
          filename = 'receipts-with-images.pdf';
          break;
        case 'backup':
          url = '/api/backup';
          filename = 'receipt-backup.json';
          break;
        case 'tax-report':
          url = `/api/export/tax-report/${new Date().getFullYear()}`;
          filename = `tax-report-${new Date().getFullYear()}.pdf`;
          break;
      }

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

  const handleDateRangeExport = async () => {
    setIsExporting(true);
    setExportType('date-range-pdf');

    try {
      const params = new URLSearchParams({
        includeImages: includeImages.toString(),
        includeSummary: includeSummary.toString(),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(category && category !== 'all' && { category })
      });

      const url = `/api/export/pdf?${params.toString()}`;
      const dateRange = startDate && endDate ? `${startDate}-to-${endDate}` : 
                       startDate ? `from-${startDate}` :
                       endDate ? `until-${endDate}` : 'all-dates';
      const filename = `receipts-${dateRange}.pdf`;

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
          description: `Your custom PDF report has been downloaded.`,
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
      type: 'csv' as const,
      title: 'CSV Export',
      description: 'Spreadsheet format for analysis in Excel or Google Sheets',
      icon: Download,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      type: 'pdf' as const,
      title: 'PDF Report',
      description: 'Formatted document with summaries and charts',
      icon: FileText,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    {
      type: 'backup' as const,
      title: 'Full Backup',
      description: 'Complete data export in JSON format',
      icon: Receipt,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      type: 'tax-report' as const,
      title: 'Tax Report',
      description: `${new Date().getFullYear()} tax-deductible expenses summary`,
      icon: Calendar,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
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
              Custom Date Range Export
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
                    <SelectItem value="groceries">Groceries</SelectItem>
                    <SelectItem value="fuel">Fuel</SelectItem>
                    <SelectItem value="clothing">Clothing</SelectItem>
                    <SelectItem value="dining">Dining</SelectItem>
                    <SelectItem value="medical">Medical</SelectItem>
                    <SelectItem value="office_supplies">Office Supplies</SelectItem>
                    <SelectItem value="entertainment">Entertainment</SelectItem>
                    <SelectItem value="travel">Travel</SelectItem>
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
                  <Label htmlFor="include-summary">Include summary and totals</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="include-images"
                    checked={includeImages}
                    onCheckedChange={(checked) => setIncludeImages(checked === true)}
                  />
                  <Label htmlFor="include-images">Include receipt images</Label>
                </div>
              </div>

              <Button 
                onClick={handleDateRangeExport}
                disabled={isExporting}
                className="w-full"
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
                    Generate Custom PDF Report
                  </>
                )}
              </Button>
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