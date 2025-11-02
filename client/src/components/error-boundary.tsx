
import React from 'react';
import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary';
import CrashScreen from './crash-screen';
import { logError } from '@/lib/monitoring';

function ErrorPage({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  // Log the error to monitoring system
  React.useEffect(() => {
    logError(error, 'boundary');
  }, [error]);

  return <CrashScreen error={error} resetError={resetErrorBoundary} />;
}

export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ReactErrorBoundary 
      FallbackComponent={ErrorPage}
      onError={(error, errorInfo) => {
        console.error('Error caught by boundary:', error, errorInfo);
        logError(error, 'boundary', errorInfo.componentStack?.split('\n')[1]?.trim());
      }}
    >
      {children}
    </ReactErrorBoundary>
  );
}
