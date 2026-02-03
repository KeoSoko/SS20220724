import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Download, FileText, Receipt, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { dispatchVerificationRequiredEvent } from '@/lib/queryClient';

export function ExportMenu() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportType, setExportType] = useState<string>('');
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleExport = async (type: 'csv' | 'pdf' | 'backup' | 'tax-report') => {
    setIsExporting(true);
    setExportType(type);

    try {
      if (type !== 'backup') {
        setLocation('/exports');
        toast({
          title: "Choose a date range",
          description: "Reports now require a date range and optional filters. Please use the exports page.",
        });
        return;
      }

      const url = '/api/backup';
      const filename = 'receipt-backup.json';

      // Get the token from localStorage with the correct key
      const token = localStorage.getItem('auth_token');
      
      if (!token) {
        throw new Error('No authentication token found');
      }

      // Use authenticated fetch
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
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
        throw new Error('Export failed');
      }

      // Create blob and download
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      toast({
        title: "Export successful",
        description: `Your ${type} file has been downloaded.`,
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
      type: 'csv' as const,
      title: 'CSV Export',
      description: 'Choose a date range on the Exports page',
      icon: Download,
      color: 'text-green-600',
    },
    {
      type: 'pdf' as const,
      title: 'PDF Report',
      description: 'Choose a date range on the Exports page',
      icon: FileText,
      color: 'text-red-600',
    },
    {
      type: 'backup' as const,
      title: 'Full Backup',
      description: 'Complete data export (JSON)',
      icon: Receipt,
      color: 'text-blue-600',
    },
    {
      type: 'tax-report' as const,
      title: 'Tax Report',
      description: 'Choose a date range on the Exports page',
      icon: Calendar,
      color: 'text-purple-600',
    },
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          Export Data
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export Your Data</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {exportOptions.map((option) => (
            <Card key={option.type} className="cursor-pointer hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <option.icon className={`h-5 w-5 ${option.color}`} />
                  {option.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {option.description}
                </p>
                <Button 
                  onClick={() => handleExport(option.type)}
                  disabled={isExporting}
                  className="w-full"
                >
                  {isExporting && exportType === option.type ? (
                    <>
                      <div className="animate-spin h-4 w-4 mr-2 rounded-none border-2 border-white border-t-transparent" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
