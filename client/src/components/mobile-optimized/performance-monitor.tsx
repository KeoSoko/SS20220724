import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { 
  Smartphone, 
  Wifi, 
  Battery, 
  Clock, 
  Database,
  AlertTriangle,
  CheckCircle
} from "lucide-react";

interface PerformanceMetrics {
  connectionType: string;
  effectiveType: string;
  downloadSpeed: number;
  uploadSpeed: number;
  latency: number;
  batteryLevel?: number;
  isCharging?: boolean;
  memoryUsage: number;
  loadTime: number;
  fps: number;
}

export function usePerformanceMonitor() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    connectionType: 'unknown',
    effectiveType: 'unknown',
    downloadSpeed: 0,
    uploadSpeed: 0,
    latency: 0,
    memoryUsage: 0,
    loadTime: 0,
    fps: 60
  });

  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    if (!isMonitoring) return;

    const updateMetrics = async () => {
      const newMetrics: Partial<PerformanceMetrics> = {};

      // Network Information API
      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        newMetrics.connectionType = connection.type || 'unknown';
        newMetrics.effectiveType = connection.effectiveType || 'unknown';
        newMetrics.downloadSpeed = connection.downlink || 0;
        newMetrics.latency = connection.rtt || 0;
      }

      // Battery API
      if ('getBattery' in navigator) {
        try {
          const battery = await (navigator as any).getBattery();
          newMetrics.batteryLevel = Math.round(battery.level * 100);
          newMetrics.isCharging = battery.charging;
        } catch (e) {
          // Battery API not supported
        }
      }

      // Memory usage
      if ('memory' in performance) {
        const memInfo = (performance as any).memory;
        newMetrics.memoryUsage = Math.round(
          (memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit) * 100
        );
      }

      // Performance timing
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navigation) {
        newMetrics.loadTime = Math.round(navigation.loadEventEnd - navigation.fetchStart);
      }

      setMetrics(prev => ({ ...prev, ...newMetrics }));
    };

    updateMetrics();
    const interval = setInterval(updateMetrics, 5000);

    return () => clearInterval(interval);
  }, [isMonitoring]);

  const startMonitoring = () => setIsMonitoring(true);
  const stopMonitoring = () => setIsMonitoring(false);

  return { metrics, isMonitoring, startMonitoring, stopMonitoring };
}

// Performance dashboard component
export function PerformanceDashboard() {
  const { metrics, isMonitoring, startMonitoring, stopMonitoring } = usePerformanceMonitor();

  const getConnectionQuality = () => {
    if (metrics.effectiveType === '4g') return { label: 'Excellent', color: 'green' };
    if (metrics.effectiveType === '3g') return { label: 'Good', color: 'yellow' };
    if (metrics.effectiveType === '2g') return { label: 'Poor', color: 'red' };
    return { label: 'Unknown', color: 'gray' };
  };

  const getBatteryStatus = () => {
    if (metrics.batteryLevel === undefined) return null;
    
    const level = metrics.batteryLevel;
    let color = 'green';
    if (level < 20) color = 'red';
    else if (level < 50) color = 'yellow';

    return { level, color, charging: metrics.isCharging };
  };

  const connectionQuality = getConnectionQuality();
  const batteryStatus = getBatteryStatus();

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="w-5 h-5" />
          Performance Monitor
        </CardTitle>
        <div className="flex gap-2">
          <Button 
            size="sm" 
            onClick={isMonitoring ? stopMonitoring : startMonitoring}
            variant={isMonitoring ? "destructive" : "default"}
          >
            {isMonitoring ? 'Stop' : 'Start'} Monitoring
          </Button>
        </div>
      </CardHeader>
      
      {isMonitoring && (
        <CardContent className="space-y-4">
          {/* Network Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wifi className="w-4 h-4" />
              <span className="text-sm font-medium">Connection</span>
            </div>
            <Badge variant={connectionQuality.color === 'green' ? 'default' : 'secondary'}>
              {connectionQuality.label} ({metrics.effectiveType})
            </Badge>
          </div>

          {/* Download Speed */}
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>Download Speed</span>
              <span>{metrics.downloadSpeed} Mbps</span>
            </div>
            <Progress value={Math.min((metrics.downloadSpeed / 10) * 100, 100)} />
          </div>

          {/* Latency */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span className="text-sm">Latency</span>
            </div>
            <span className="text-sm">{metrics.latency}ms</span>
          </div>

          {/* Battery Status */}
          {batteryStatus && (
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Battery className="w-4 h-4" />
                  <span>Battery</span>
                </div>
                <span>
                  {batteryStatus.level}% 
                  {batteryStatus.charging && ' (Charging)'}
                </span>
              </div>
              <Progress 
                value={batteryStatus.level} 
                className={`h-2 ${batteryStatus.color === 'red' ? 'bg-red-100' : ''}`}
              />
            </div>
          )}

          {/* Memory Usage */}
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4" />
                <span>Memory Usage</span>
              </div>
              <span>{metrics.memoryUsage}%</span>
            </div>
            <Progress 
              value={metrics.memoryUsage} 
              className={metrics.memoryUsage > 80 ? 'bg-red-100' : ''}
            />
          </div>

          {/* Load Time */}
          <div className="flex items-center justify-between">
            <span className="text-sm">Page Load Time</span>
            <div className="flex items-center gap-1">
              {metrics.loadTime < 2000 ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-yellow-500" />
              )}
              <span className="text-sm">{metrics.loadTime}ms</span>
            </div>
          </div>

          {/* Performance Recommendations */}
          {(metrics.memoryUsage > 80 || metrics.loadTime > 3000 || metrics.latency > 500) && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-none">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-800">Performance Tips</span>
              </div>
              <ul className="text-xs text-yellow-700 space-y-1">
                {metrics.memoryUsage > 80 && (
                  <li>• Close other browser tabs to free up memory</li>
                )}
                {metrics.loadTime > 3000 && (
                  <li>• Consider using a faster internet connection</li>
                )}
                {metrics.latency > 500 && (
                  <li>• Check your network connection quality</li>
                )}
              </ul>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}