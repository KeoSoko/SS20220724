import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface CrashScreenProps {
  error: Error;
  resetError?: () => void;
}

export default function CrashScreen({ error, resetError }: CrashScreenProps) {
  const handleReload = () => {
    window.location.reload();
  };

  const handleHome = () => {
    window.location.href = '/home';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-red-100 rounded-none flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </div>
          
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Something went wrong
          </h1>
          
          <p className="text-gray-600 mb-6">
            We're sorry, but something unexpected happened. The error has been logged and we'll look into it.
          </p>

          {/* Error details - only show in development */}
          {process.env.NODE_ENV === 'development' && (
            <details className="mb-6 text-left">
              <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                Technical details
              </summary>
              <pre className="mt-2 text-xs bg-gray-100 p-3 rounded border overflow-auto max-h-32">
                {error.message}
                {error.stack && '\n\n' + error.stack}
              </pre>
            </details>
          )}

          <div className="space-y-3">
            {resetError && (
              <Button 
                onClick={resetError}
                className="w-full bg-primary hover:bg-primary/90"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            )}
            
            <Button 
              onClick={handleHome}
              variant="outline"
              className="w-full"
            >
              <Home className="h-4 w-4 mr-2" />
              Go to Home
            </Button>
            
            <Button 
              onClick={handleReload}
              variant="ghost"
              className="w-full text-gray-500"
              size="sm"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reload App
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}