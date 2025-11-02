import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { RefreshCw, HardDriveIcon, CloudIcon, AlertTriangle, FileIcon, Database } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { PageLayout } from '@/components/page-layout';

interface StorageMetrics {
  totalSizeBytes: number;
  totalSizeGB: number;
  fileCount: number;
  utilizationPercent: number;
  shouldFallbackToAzure: boolean;
  lastChecked: string;
}

export default function StorageDashboard() {
  const { toast } = useToast();

  const { data: metrics, isLoading, refetch } = useQuery<StorageMetrics>({
    queryKey: ['/api/storage/metrics'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const handleRefresh = async () => {
    try {
      await apiRequest('POST', '/api/storage/refresh');
      await refetch();
      toast({
        title: "Storage metrics updated",
        description: "Storage information has been refreshed successfully.",
      });
    } catch (error) {
      toast({
        title: "Failed to refresh metrics",
        description: "Could not update storage information. Please try again.",
        variant: "destructive",
      });
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStorageStatusColor = () => {
    if (!metrics) return 'text-gray-500';
    if (metrics.shouldFallbackToAzure) return 'text-red-600';
    if (metrics.utilizationPercent > 80) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getStorageStatusText = () => {
    if (!metrics) return 'Loading...';
    if (metrics.shouldFallbackToAzure) return 'Using Azure Storage (Capacity Reached)';
    return 'Using Local Storage';
  };

  return (
    <PageLayout 
      title="Storage Dashboard" 
      subtitle="Monitor your hybrid storage system usage and performance"
      showBackButton={true}
    >
      <div className="space-y-6">
        {/* Storage Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Storage Used</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics ? `${metrics.totalSizeGB.toFixed(2)} GB` : '---'}
              </div>
              <p className="text-xs text-muted-foreground">
                {metrics ? formatBytes(metrics.totalSizeBytes) : 'Loading...'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Files Stored</CardTitle>
              <FileIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics ? metrics.fileCount.toLocaleString() : '---'}
              </div>
              <p className="text-xs text-muted-foreground">
                Receipt images and profiles
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Storage Status</CardTitle>
              {metrics?.shouldFallbackToAzure ? (
                <CloudIcon className="h-4 w-4 text-blue-500" />
              ) : (
                <HardDriveIcon className="h-4 w-4 text-green-500" />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-lg font-semibold ${getStorageStatusColor()}`}>
                {metrics?.shouldFallbackToAzure ? 'Azure' : 'Local'}
              </div>
              <p className="text-xs text-muted-foreground">
                {getStorageStatusText()}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Storage Usage */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <HardDriveIcon className="h-5 w-5" />
                  Storage Usage Details
                </CardTitle>
              </div>
              <Button 
                onClick={handleRefresh} 
                variant="outline" 
                size="sm"
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-2 bg-gray-200 rounded"></div>
              </div>
            ) : metrics ? (
              <>
                {/* Progress Bar */}
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Local Storage Capacity</span>
                    <span className={getStorageStatusColor()}>
                      {metrics.utilizationPercent.toFixed(1)}% used
                    </span>
                  </div>
                  <Progress 
                    value={Math.min(metrics.utilizationPercent, 100)} 
                    className="h-3"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>{metrics.totalSizeGB.toFixed(2)} GB of 15 GB used</span>
                    <span>{(15 - metrics.totalSizeGB).toFixed(2)} GB remaining</span>
                  </div>
                </div>

                {/* Cost Savings Info */}
                <div className="bg-green-50 border border-green-200 rounded-none p-4">
                  <h3 className="font-medium text-green-800 mb-2">Cost Optimization Active</h3>
                  <p className="text-sm text-green-700">
                    Hybrid storage is saving you approximately 60-80% on external storage costs. 
                    Files are stored locally first, with automatic Azure fallback when needed.
                  </p>
                </div>

                {/* Threshold Warning */}
                {metrics.utilizationPercent > 80 && !metrics.shouldFallbackToAzure && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-none p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                      <div>
                        <h3 className="font-medium text-yellow-800">Storage Nearly Full</h3>
                        <p className="text-sm text-yellow-700 mt-1">
                          You're approaching the local storage limit. New uploads will automatically 
                          use Azure storage when local capacity is reached.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Azure Fallback Active */}
                {metrics.shouldFallbackToAzure && (
                  <div className="bg-blue-50 border border-blue-200 rounded-none p-4">
                    <div className="flex items-start gap-3">
                      <CloudIcon className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div>
                        <h3 className="font-medium text-blue-800">Azure Storage Active</h3>
                        <p className="text-sm text-blue-700 mt-1">
                          Local storage capacity reached. New uploads are using Azure storage. 
                          Existing files remain on local storage for optimal performance.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* System Information */}
                <div className="border-t pt-4">
                  <h3 className="font-medium mb-2">System Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Storage Type:</span>
                      <span className="ml-2 font-medium">
                        {metrics.shouldFallbackToAzure ? 'Hybrid (Azure Active)' : 'Local Primary'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Last Updated:</span>
                      <span className="ml-2 font-medium">
                        {new Date(metrics.lastChecked).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Monitoring:</span>
                      <span className="ml-2 font-medium">Active (24h intervals)</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Auto-scaling:</span>
                      <span className="ml-2 font-medium">Enabled</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <Database className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Unable to Load Storage Data</h3>
                <p className="text-gray-500 mb-4">There was an error retrieving storage metrics.</p>
                <Button onClick={handleRefresh} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}