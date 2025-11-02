import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface RecurringPattern {
  storeName: string;
  category: string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  averageAmount: number;
  confidence: number;
  lastSeen: Date;
  occurrences: number;
  nextExpectedDate?: Date;
  variance: number;
}

interface RecurringExpenseMatch {
  isRecurring: boolean;
  pattern?: RecurringPattern;
  confidence: number;
  suggestedFrequency?: string;
  similarReceipts: any[];
}

export function useRecurringAnalysis() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [analysisResult, setAnalysisResult] = useState<RecurringExpenseMatch | null>(null);
  const [showRecurringDialog, setShowRecurringDialog] = useState(false);

  // Analyze recurring pattern for a receipt
  const analyzeRecurringMutation = useMutation({
    mutationFn: async (receiptId: number) => {
      const response = await apiRequest('POST', `/api/receipts/${receiptId}/analyze-recurring`);
      return await response.json();
    },
    onSuccess: (data: RecurringExpenseMatch) => {
      setAnalysisResult(data);
      
      // If high confidence recurring pattern detected, show dialog
      if (data.isRecurring && data.confidence > 0.8) {
        setShowRecurringDialog(true);
        toast({
          title: "Recurring Pattern Detected",
          description: `This looks like a recurring ${data.pattern?.frequency} expense for ${data.pattern?.storeName}`,
        });
      }
    },
    onError: (error: any) => {
      console.error('Error analyzing recurring pattern:', error);
      // Don't show error toast for analysis failures - it's not critical
    }
  });

  // Mark receipt as recurring
  const markAsRecurringMutation = useMutation({
    mutationFn: async ({ receiptId, frequency }: { receiptId: number; frequency: string }) => {
      const response = await apiRequest('POST', `/api/receipts/${receiptId}/mark-recurring`, { frequency });
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Receipt marked as recurring successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/receipts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/recurring-patterns'] });
      setShowRecurringDialog(false);
      setAnalysisResult(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to mark receipt as recurring",
        variant: "destructive",
      });
    }
  });

  // Auto-analyze when receipt is created
  const analyzeNewReceipt = (receiptId: number) => {
    // Small delay to ensure receipt is saved before analysis
    setTimeout(() => {
      analyzeRecurringMutation.mutate(receiptId);
    }, 1000);
  };

  const dismissRecurringDialog = () => {
    setShowRecurringDialog(false);
    setAnalysisResult(null);
  };

  const confirmRecurring = (receiptId: number, frequency: string) => {
    markAsRecurringMutation.mutate({ receiptId, frequency });
  };

  return {
    analysisResult,
    showRecurringDialog,
    isAnalyzing: analyzeRecurringMutation.isPending,
    isMarkingRecurring: markAsRecurringMutation.isPending,
    analyzeNewReceipt,
    dismissRecurringDialog,
    confirmRecurring,
  };
}