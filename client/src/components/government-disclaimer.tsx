import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

interface GovernmentDisclaimerProps {
  variant?: 'default' | 'compact';
  className?: string;
}

export function GovernmentDisclaimer({ variant = 'default', className = '' }: GovernmentDisclaimerProps) {
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  if (variant === 'compact') {
    return (
      <div className={`${className}`}>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-auto py-1 px-2 border-orange-200 text-orange-700 hover:bg-orange-50"
          onClick={() => setShowDisclaimer(!showDisclaimer)}
        >
          <AlertTriangle className="h-3 w-3 mr-1" />
          {showDisclaimer ? 'Hide' : 'View'} Important Disclaimer
        </Button>
        {showDisclaimer && (
          <div className="mt-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <div className="text-xs text-orange-800">
              <p>⚠️ This app is not affiliated with SARS or any South African government entity.</p>
              <p className="mt-1">Information provided is for general guidance only. Source: <a href="https://www.sars.gov.za" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">www.sars.gov.za</a></p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <Button
        variant="outline"
        size="sm"
        className="text-xs h-auto py-1 px-2 border-orange-200 text-orange-700 hover:bg-orange-50"
        onClick={() => setShowDisclaimer(!showDisclaimer)}
      >
        <AlertTriangle className="h-3 w-3 mr-1" />
        {showDisclaimer ? 'Hide' : 'View'} Important Disclaimer
      </Button>
      {showDisclaimer && (
        <Alert className="mt-2 border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-sm text-orange-800">
            <strong>Important Disclaimer:</strong> Simple Slips is not affiliated with the South African Revenue Service (SARS) 
            or any South African government entity. The tax information provided by this app is for general 
            guidance only and is based on publicly available SARS documentation (Source: <a href="https://www.sars.gov.za" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">www.sars.gov.za</a>). 
            Please consult with a qualified tax professional or visit the official SARS website at <a href="https://www.sars.gov.za" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">www.sars.gov.za</a> 
            for authoritative tax advice and compliance requirements.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}