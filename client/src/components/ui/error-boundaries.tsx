import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";
import { AlertTriangle, RefreshCw, Home, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Generic error fallback component
function ErrorFallback({ 
  error, 
  resetErrorBoundary 
}: { 
  error: Error; 
  resetErrorBoundary: () => void;
}) {
  const isDevelopment = import.meta.env.MODE === 'development';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-red-50 to-orange-50">
      <Card className="w-full max-w-md mx-auto shadow-lg">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-none flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <CardTitle className="text-xl text-red-800">Something went wrong</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            We encountered an unexpected error. Please try refreshing the page or contact support if the problem persists.
          </p>
          
          {isDevelopment && (
            <details className="bg-red-50 p-3 rounded-none border border-red-200">
              <summary className="cursor-pointer text-sm font-medium text-red-800 flex items-center gap-2">
                <Bug className="w-4 h-4" />
                Technical Details
              </summary>
              <pre className="mt-2 text-xs text-red-700 whitespace-pre-wrap break-words">
                {error.message}
              </pre>
            </details>
          )}
          
          <div className="flex flex-col gap-2">
            <Button onClick={resetErrorBoundary} className="w-full">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            <Button 
              variant="outline" 
              onClick={() => window.location.href = '/'}
              className="w-full"
            >
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Receipt upload specific error fallback
function UploadErrorFallback({ 
  error, 
  resetErrorBoundary 
}: { 
  error: Error; 
  resetErrorBoundary: () => void;
}) {
  return (
    <div className="w-full max-w-md mx-auto p-4">
      <Card className="border-red-200 bg-red-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-red-800 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Upload Failed
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-red-700">
            There was a problem processing your receipt. This could be due to:
          </p>
          <ul className="text-sm text-red-600 space-y-1 list-disc list-inside">
            <li>Poor image quality or blur</li>
            <li>Unsupported file format</li>
            <li>Network connection issues</li>
            <li>File size too large</li>
          </ul>
          <div className="flex gap-2">
            <Button onClick={resetErrorBoundary} size="sm" className="flex-1">
              Try Again
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Network error component
export function NetworkErrorFallback({ 
  onRetry, 
  message = "Unable to connect to server" 
}: { 
  onRetry: () => void; 
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="w-16 h-16 bg-orange-100 rounded-none flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-orange-600" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Connection Error</h3>
      <p className="text-sm text-gray-600 mb-4 max-w-sm">{message}</p>
      <Button onClick={onRetry} size="sm">
        <RefreshCw className="w-4 h-4 mr-2" />
        Retry
      </Button>
    </div>
  );
}

// Main error boundary wrapper
export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ReactErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, errorInfo) => {
        // Log error to monitoring service in production
        console.error('Application Error:', error, errorInfo);
      }}
      onReset={() => {
        // Clear any error states, reload page if needed
        window.location.reload();
      }}
    >
      {children}
    </ReactErrorBoundary>
  );
}

// Upload specific error boundary
export function UploadErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ReactErrorBoundary
      FallbackComponent={UploadErrorFallback}
      onError={(error) => {
        console.error('Upload Error:', error);
      }}
    >
      {children}
    </ReactErrorBoundary>
  );
}

// Query error component for React Query errors
export function QueryErrorFallback({ 
  error, 
  refetch 
}: { 
  error: Error; 
  refetch: () => void;
}) {
  const isNetworkError = error.message.includes('fetch') || error.message.includes('network');
  
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center">
      <div className="w-12 h-12 bg-red-100 rounded-none flex items-center justify-center mb-3">
        <AlertTriangle className="w-6 h-6 text-red-600" />
      </div>
      <h3 className="text-base font-medium text-gray-900 mb-2">
        {isNetworkError ? 'Connection Problem' : 'Data Error'}
      </h3>
      <p className="text-sm text-gray-600 mb-4 max-w-xs">
        {isNetworkError 
          ? 'Check your internet connection and try again'
          : 'There was a problem loading your data'
        }
      </p>
      <Button onClick={refetch} size="sm" variant="outline">
        <RefreshCw className="w-4 h-4 mr-2" />
        Try Again
      </Button>
    </div>
  );
}