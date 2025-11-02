import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, Calendar, DollarSign, CheckCircle, X, AlertTriangle } from 'lucide-react';
import { useRecurringAnalysis } from '@/hooks/use-recurring-analysis';

interface RecurringExpenseDetectorProps {
  receiptId: number;
}

export function RecurringExpenseDetector({ receiptId }: RecurringExpenseDetectorProps) {
  const [selectedFrequency, setSelectedFrequency] = useState<string>('');
  const { 
    analysisResult, 
    showRecurringDialog, 
    isMarkingRecurring,
    dismissRecurringDialog,
    confirmRecurring,
    analyzeNewReceipt
  } = useRecurringAnalysis();

  // Analyze the receipt when component mounts
  useEffect(() => {
    if (receiptId) {
      analyzeNewReceipt(receiptId);
    }
  }, [receiptId]); // Fixed: use useEffect instead of useState

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR'
    }).format(amount);
  };

  const getFrequencyColor = (frequency: string) => {
    switch (frequency) {
      case 'weekly': return 'bg-blue-100 text-blue-800';
      case 'monthly': return 'bg-green-100 text-green-800';
      case 'quarterly': return 'bg-yellow-100 text-yellow-800';
      case 'yearly': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 0.9) return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (confidence >= 0.7) return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    return <X className="h-4 w-4 text-red-600" />;
  };

  const handleConfirmRecurring = () => {
    if (selectedFrequency && receiptId) {
      confirmRecurring(receiptId, selectedFrequency);
    }
  };

  return (
    <Dialog open={showRecurringDialog} onOpenChange={dismissRecurringDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            Recurring Expense Detected
          </DialogTitle>
        </DialogHeader>
        
        {analysisResult && (
          <div className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This receipt looks similar to previous transactions. Would you like to mark it as a recurring expense?
              </AlertDescription>
            </Alert>

            <Card>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Store:</span>
                    <span className="text-sm">{analysisResult.pattern?.storeName}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Average Amount:</span>
                    <span className="text-sm font-semibold">
                      {analysisResult.pattern?.averageAmount ? formatCurrency(analysisResult.pattern.averageAmount) : 'N/A'}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Suggested Frequency:</span>
                    <Badge className={getFrequencyColor(analysisResult.suggestedFrequency || 'monthly')}>
                      {analysisResult.suggestedFrequency || 'Monthly'}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Confidence:</span>
                    <div className="flex items-center gap-1">
                      {getConfidenceIcon(analysisResult.confidence)}
                      <span className="text-sm">{Math.round(analysisResult.confidence * 100)}%</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Similar Receipts:</span>
                    <span className="text-sm">{analysisResult.similarReceipts?.length || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <label className="text-sm font-medium">Select Frequency:</label>
              <Select value={selectedFrequency} onValueChange={setSelectedFrequency}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleConfirmRecurring}
                disabled={!selectedFrequency || isMarkingRecurring}
                className="flex-1"
              >
                {isMarkingRecurring ? 'Marking...' : 'Mark as Recurring'}
              </Button>
              <Button
                variant="outline"
                onClick={dismissRecurringDialog}
                className="flex-1"
              >
                Not Recurring
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}