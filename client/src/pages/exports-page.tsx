import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Download, FileText, Receipt, Calendar, CalendarRange, Archive, Eye, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
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

interface BackgroundExportJob {
  id: string;
  type: 'csv' | 'pdf' | 'tax-report';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  fileName?: string | null;
  errorMessage?: string | null;
  resultSummary?: { imagesUnavailable?: number } | null;
  expiresAt?: string | null;
  createdAt: string;
}

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
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [allowAllTimeExport, setAllowAllTimeExport] = useState(false);
  const [highlightCsv, setHighlightCsv] = useState(false);
  const csvSectionRef = useRef<HTMLButtonElement | null>(null);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // Pick up context (date range/category) and a focus target passed in from
  // other entry points (e.g. the legacy Export Data dialog) so users land
  // directly on the right controls instead of starting from a blank form.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qsStartDate = params.get('startDate');
    const qsEndDate = params.get('endDate');
    const qsCategory = params.get('category');
    const focus = params.get('focus');

    if (qsStartDate) setStartDate(qsStartDate);
    if (qsEndDate) setEndDate(qsEndDate);
    if (qsCategory) setCategory(qsCategory);

    if (focus === 'csv') {
      setHighlightCsv(true);
      requestAnimationFrame(() => {
        csvSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      const timer = setTimeout(() => setHighlightCsv(false), 2500);
      return () => clearTimeout(timer);
    }
  }, []);

  const { data: customCategories = [] } = useQuery<{ id: number; name: string; displayName?: string }[]>({
    queryKey: ['/api/custom-categories'],
  });
  const { data: backgroundExports = [] } = useQuery<BackgroundExportJob[]>({
    queryKey: ['/api/export/jobs'],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/export/jobs', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error('Unable to load export jobs');
      return (await response.json()).jobs;
    },
    refetchInterval: 5000,
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

  const fetchPdf = async (url: string): Promise<{ blob: Blob; imagesUnavailable: number } | null> => {
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
    const imagesUnavailable = Number.parseInt(response.headers.get('X-Export-Images-Unavailable') || '0', 10);
    return {
      blob: await response.blob(),
      imagesUnavailable: Number.isFinite(imagesUnavailable) ? imagesUnavailable : 0,
    };
  };

  const notifyUnavailableImages = (imagesUnavailable: number) => {
    if (imagesUnavailable <= 0) return;
    toast({
      title: "Report created with placeholders",
      description: `${imagesUnavailable} ${imagesUnavailable === 1 ? 'receipt image was' : 'receipt images were'} unavailable. The rest of the report was included.`,
    });
  };

  const handlePreview = async (type: 'pdf' | 'tax-report') => {
    if (!validateDateRange()) return;

    setIsPreviewing(true);
    setPreviewType(type);

    try {
      const url = buildPdfParams(type);
      const result = await fetchPdf(url);
      if (!result) return;
      const { blob, imagesUnavailable } = result;

      if (prevBlobUrlRef.current) {
        URL.revokeObjectURL(prevBlobUrlRef.current);
      }
      const blobUrl = URL.createObjectURL(blob);
      prevBlobUrlRef.current = blobUrl;

      setPreviewBlob(blob);
      setPreviewUrl(blobUrl);
      setPreviewTitle(type === 'tax-report' ? `Tax Report ${new Date().getFullYear()}` : 'Receipts Report');
      setIsPreviewOpen(true);
      notifyUnavailableImages(imagesUnavailable);
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
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Authentication required');
      const response = await fetch('/api/export/jobs', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          ...(startDate && { startDate }),
          ...(endDate && { endDate }),
          ...(category && category !== 'all' && { category }),
          ...(type === 'pdf' && {
            includeSummary,
            includeImages,
            groupBy: groupByCategory ? 'category' : 'date',
          }),
          ...(type === 'tax-report' && { taxYear: new Date().getFullYear() }),
        }),
      });
      if (!response.ok) throw new Error(`Unable to queue export (${response.status})`);
      toast({
        title: "Export queued",
        description: "You can leave this page while we prepare it. The finished file will appear under Recent exports.",
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

  const downloadBackgroundExport = async (job: BackgroundExportJob) => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Authentication required');
      const response = await fetch(`/api/export/jobs/${job.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = job.fileName || `simple-slips-export.${job.type === 'csv' ? 'csv' : 'pdf'}`;
      link.click();
      URL.revokeObjectURL(objectUrl);
      notifyUnavailableImages(job.resultSummary?.imagesUnavailable || 0);
    } catch {
      toast({ title: "Download failed", description: "Please refresh and try again.", variant: "destructive" });
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
            </CardTitle>
          </CardHeader>
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
                <div className="flex flex-col gap-2 sm:flex-row">
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
                        Queueing...
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4 mr-2" />
                        Create PDF
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Tax Report row */}
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Tax Report</p>
                <div className="flex flex-col gap-2 sm:flex-row">
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
                        Queueing...
                      </>
                    ) : (
                      <>
                        <Calendar className="h-4 w-4 mr-2" />
                        Create Tax PDF
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* CSV row */}
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-2">Excel / CSV</p>
                <Button
                  ref={csvSectionRef}
                  variant="outline"
                  onClick={() => handleDateRangeExport('csv')}
                  disabled={busy}
                  size={isMobile ? "lg" : "default"}
                  className={`w-full transition-shadow ${highlightCsv ? 'ring-2 ring-indigo-400' : ''}`}
                >
                  {isExporting && exportType === 'date-range-csv' ? (
                    <>
                      <div className="animate-spin h-4 w-4 mr-2 rounded-none border-2 border-gray-500 border-t-transparent" />
                      Queueing...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Create Excel file (CSV)
                    </>
                  )}
                </Button>
              </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Recent exports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {backgroundExports.length === 0 ? (
              <p className="text-sm text-muted-foreground">Created reports will appear here.</p>
            ) : backgroundExports.map((job) => (
              <div key={job.id} className="flex flex-col gap-2 border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  {job.status === 'completed' ? <CheckCircle2 className="h-5 w-5 text-green-600" /> :
                   job.status === 'failed' ? <AlertCircle className="h-5 w-5 text-red-600" /> :
                   <Clock className="h-5 w-5 text-amber-600" />}
                  <div>
                    <p className="font-medium">{job.fileName || `${job.type.replace('-', ' ')} export`}</p>
                    <p className="text-xs text-muted-foreground">
                      {job.status === 'queued' ? 'Waiting to start' :
                       job.status === 'processing' ? 'Preparing your file' :
                       job.status === 'failed' ? (job.errorMessage || 'Could not create this export') :
                       `Ready to download${job.expiresAt ? ` until ${new Date(job.expiresAt).toLocaleDateString()}` : ''}`}
                    </p>
                  </div>
                </div>
                {job.status === 'completed' && (
                  <Button size="sm" onClick={() => downloadBackgroundExport(job)}>
                    <Download className="mr-2 h-4 w-4" /> Download
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
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
              <embed
                src={previewUrl}
                type="application/pdf"
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
