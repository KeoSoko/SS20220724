import React, { useState, useRef, useCallback } from 'react';
import { Download, FileText, Receipt, Calendar, CalendarRange, Archive, Eye } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { EXPENSE_CATEGORIES } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageLayout } from '@/components/page-layout';
import { Section } from '@/components/design-system';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { dispatchVerificationRequiredEvent } from '@/lib/queryClient';

const formatCategoryLabel = (slug: string) =>
  slug.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

export default function ExportsPage() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportType, setExportType] = useState<string>('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewType, setPreviewType] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const prevBlobUrlRef = useRef<string | null>(null);

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

  const { data: customCategories = [] } = useQuery<{ id: number; name: string; displayName?: string }[]>({
    queryKey: ['/api/custom-categories'],
  });

  const closePreview = useCallback(() => {
    setIsPreviewOpen(false);
    if (prevBlobUrlRef.current) {
      URL.revokeObjectURL(prevBlobUrlRef.current);
      prevBlobUrlRef.current = null;
    }
    setPreviewUrl(null);
    setPreviewBlob(null);
    setPreviewTitle('');
  }, []);

  const buildPdfParams = (type: 'pdf' | 'tax-report') => {
    const params = new URLSearchParams({
      ...(type === 'pdf' && { includeImages: includeImages.toString() }),
      ...(type === 'pdf' && { includeSummary: includeSummary.toString() }),
      ...(type === 'pdf' && { groupBy: groupByCategory ? 'category' : 'date' }),
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      ...(category && category !== 'all' && { category }),
    });
    const url = type === 'tax-report'
      ? `/api/export/tax-report/${new Date().getFullYear()}?${params.toString()}`
      : `/api/export/pdf?${params.toString()}`;
    return url;
  };

  const validateDateRange = () => {
    if (!startDate && !endDate && !allowAllTimeExport) {
      toast({
        title: "Select a date range",
        description: "Please choose a start date, end date, or enable all-time export.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const fetchPdf = async (url: string): Promise<Blob | null> => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      toast({ title: "Authentication required", description: "Please log in again.", variant: "destructive" });
      return null;
    }
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) {
      if (response.status === 403) {
        try {
          const errorData = await response.json();
          if (errorData.error === 'email_verification_required') {
            dispatchVerificationRequiredEvent(errorData.userEmail);
            return null;
          }
        } catch {}
      }
      const errorText = await response.text();
      throw new Error(`Request failed: ${response.status} - ${errorText}`);
    }
    return response.blob();
  };

  const handlePreview = async (type: 'pdf' | 'tax-report') => {
    if (!validateDateRange()) return;

    setIsPreviewing(true);
    setPreviewType(type);

    try {
      const url = buildPdfParams(type);
      const blob = await fetchPdf(url);
      if (!blob) return;

      if (prevBlobUrlRef.current) {
        URL.revokeObjectURL(prevBlobUrlRef.current);
      }
      const blobUrl = URL.createObjectURL(blob);
      prevBlobUrlRef.current = blobUrl;

      setPreviewBlob(blob);
      setPreviewUrl(blobUrl);
      setPreviewTitle(type === 'tax-report' ? `Tax Report ${new Date().getFullYear()}` : 'Receipts Report');
      setIsPreviewOpen(true);
    } catch (error) {
      toast({
        title: "Preview failed",
        description: "There was an error generating the preview. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsPreviewing(false);
      setPreviewType('');
    }
  };

  const handleDownloadFromPreview = () => {
    if (!previewBlob) return;
    const dateRange = startDate && endDate ? `${startDate}-to-${endDate}` :
                     startDate ? `from-${startDate}` :
                     endDate ? `until-${endDate}` : 'all-dates';
    const filename = previewTitle.toLowerCase().includes('tax')
      ? `tax-report-${dateRange}.pdf`
      : `receipts-${dateRange}.pdf`;
    const link = document.createElement('a');
    link.href = prevBlobUrlRef.current!;
    link.download = filename;
    link.click();
  };

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
        headers: { 'Authorization': `Bearer ${token}` },
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
        if (response.status === 403) {
          try {
            const errorData = await response.json();
            if (errorData.error === 'email_verification_required') {
              dispatchVerificationRequiredEvent(errorData.userEmail);
              return;
            }
          } catch {}
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
    if (!validateDateRange()) return;

    setIsExporting(true);
    setExportType(type === 'csv' ? 'date-range-csv' : type === 'tax-report' ? 'date-range-tax' : 'date-range-pdf');

    try {
      const dateRange = startDate && endDate ? `${startDate}-to-${endDate}` :
                       startDate ? `from-${startDate}` :
                       endDate ? `until-${endDate}` : 'all-dates';

      let url: string;
      let filename: string;

      if (type === 'csv') {
        const params = new URLSearchParams({
          ...(startDate && { startDate }),
          ...(endDate && { endDate }),
          ...(category && category !== 'all' && { category }),
        });
        url = `/api/export/csv?${params.toString()}`;
        filename = `receipts-${dateRange}.csv`;
      } else {
        url = buildPdfParams(type);
        filename = type === 'tax-report' ? `tax-report-${dateRange}.pdf` : `receipts-${dateRange}.pdf`;
      }

      const blob = await fetchPdf(url);
      if (!blob) return;

      const link = document.createElement('a');
      const objUrl = window.URL.createObjectURL(blob);
      link.href = objUrl;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(objUrl);

      toast({
        title: "Export Successful",
        description: `Your ${type.replace('-', ' ')} report has been downloaded.`,
      });
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
      icon: Archive,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
  ];

  const busy = isExporting || isPreviewing;

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
                        {formatCategoryLabel(cat)}
                      </SelectItem>
                    ))}
                    {Array.isArray(customCategories) && customCategories.length > 0 && (
                      <>
                        {customCategories.map((customCat: any) => (
                          <SelectItem key={`custom-${customCat.id}`} value={customCat.displayName}>
                            {customCat.displayName}
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

              {/* PDF Report row */}
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Receipts PDF</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handlePreview('pdf')}
                    disabled={busy}
                    size={isMobile ? "lg" : "default"}
                    className="flex-1"
                  >
                    {isPreviewing && previewType === 'pdf' ? (
                      <>
                        <div className="animate-spin h-4 w-4 mr-2 rounded-none border-2 border-gray-500 border-t-transparent" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <Eye className="h-4 w-4 mr-2" />
                        Preview
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => handleDateRangeExport('pdf')}
                    disabled={busy}
                    size={isMobile ? "lg" : "default"}
                    className="flex-1"
                  >
                    {isExporting && exportType === 'date-range-pdf' ? (
                      <>
                        <div className="animate-spin h-4 w-4 mr-2 rounded-none border-2 border-white border-t-transparent" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4 mr-2" />
                        Download PDF
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Tax Report row */}
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Tax Report</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handlePreview('tax-report')}
                    disabled={busy}
                    size={isMobile ? "lg" : "default"}
                    className="flex-1"
                  >
                    {isPreviewing && previewType === 'tax-report' ? (
                      <>
                        <div className="animate-spin h-4 w-4 mr-2 rounded-none border-2 border-gray-500 border-t-transparent" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <Eye className="h-4 w-4 mr-2" />
                        Preview
                      </>
                    )}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleDateRangeExport('tax-report')}
                    disabled={busy}
                    size={isMobile ? "lg" : "default"}
                    className="flex-1"
                  >
                    {isExporting && exportType === 'date-range-tax' ? (
                      <>
                        <div className="animate-spin h-4 w-4 mr-2 rounded-none border-2 border-white border-t-transparent" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Calendar className="h-4 w-4 mr-2" />
                        Download Tax PDF
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* CSV row */}
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">CSV Spreadsheet</p>
                <Button
                  variant="outline"
                  onClick={() => handleDateRangeExport('csv')}
                  disabled={busy}
                  size={isMobile ? "lg" : "default"}
                  className="w-full"
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
                  disabled={busy}
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

      {/* PDF Preview Modal */}
      <Dialog open={isPreviewOpen} onOpenChange={(open) => { if (!open) closePreview(); }}>
        <DialogContent className="max-w-5xl w-full h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="flex flex-row items-center justify-between px-6 py-4 border-b shrink-0">
            <DialogTitle>{previewTitle}</DialogTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadFromPreview}
              className="ml-auto mr-8"
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {previewUrl && (
              <iframe
                src={previewUrl}
                className="w-full h-full border-0"
                title={previewTitle}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
