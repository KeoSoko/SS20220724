import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, Banknote, Clock, TrendingUp, AlertTriangle, CheckCircle, ArrowLeft, Plus, Edit3 } from 'lucide-react';
import { useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { format, isAfter, isBefore } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

interface UpcomingExpense {
  pattern: RecurringPattern;
  daysUntilDue: number;
  isOverdue: boolean;
}

export default function RecurringExpensesPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPattern, setSelectedPattern] = useState<RecurringPattern | null>(null);
  const [newReceiptData, setNewReceiptData] = useState({
    storeName: '',
    amount: '',
    category: 'other',
    frequency: 'monthly'
  });

  // Fetch recurring patterns
  const { data: patterns = [], isLoading: patternsLoading } = useQuery<RecurringPattern[]>({
    queryKey: ['/api/recurring-patterns'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch upcoming expenses
  const { data: upcomingExpenses = [], isLoading: upcomingLoading } = useQuery<UpcomingExpense[]>({
    queryKey: ['/api/recurring-expenses/upcoming'],
    refetchInterval: 30000,
  });

  // Create recurring receipt mutation
  const createRecurringReceiptMutation = useMutation({
    mutationFn: async (data: typeof newReceiptData) => {
      const receiptData = {
        storeName: data.storeName,
        total: data.amount,
        category: data.category,
        date: new Date().toISOString(),
        notes: `Recurring expense - ${data.frequency}`,
        items: [{ name: 'Recurring payment', price: data.amount }],
        isRecurring: true,
        frequency: data.frequency,
        isTaxDeductible: false,
        tags: []
      };
      
      return apiRequest('POST', '/api/receipts', receiptData);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Recurring expense created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/recurring-patterns'] });
      queryClient.invalidateQueries({ queryKey: ['/api/recurring-expenses/upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['/api/receipts'] });
      setNewReceiptData({ storeName: '', amount: '', category: 'other', frequency: 'monthly' });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create recurring expense",
        variant: "destructive",
      });
    }
  });

  const getFrequencyColor = (frequency: string) => {
    switch (frequency) {
      case 'weekly': return 'bg-blue-100 text-blue-800';
      case 'monthly': return 'bg-green-100 text-green-800';
      case 'quarterly': return 'bg-yellow-100 text-yellow-800';
      case 'yearly': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'bg-green-100 text-green-800';
    if (confidence >= 0.7) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getDaysUntilDueColor = (daysUntilDue: number, isOverdue: boolean) => {
    if (isOverdue) return 'text-red-600';
    if (daysUntilDue <= 3) return 'text-orange-600';
    if (daysUntilDue <= 7) return 'text-yellow-600';
    return 'text-green-600';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR'
    }).format(amount);
  };

  const totalMonthlyRecurring = patterns
    .filter((p: RecurringPattern) => p.frequency === 'monthly')
    .reduce((sum: number, p: RecurringPattern) => sum + p.averageAmount, 0);

  const totalAnnualRecurring = patterns.reduce((sum: number, p: RecurringPattern) => {
    const multiplier = p.frequency === 'weekly' ? 52 : 
                      p.frequency === 'monthly' ? 12 : 
                      p.frequency === 'quarterly' ? 4 : 1;
    return sum + (p.averageAmount * multiplier);
  }, 0);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation('/analytics')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Analytics
            </Button>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Recurring Expenses</h1>
              <p className="text-sm text-gray-600">Track and manage your recurring payments</p>
            </div>
            
            <Dialog>
              <DialogTrigger asChild>
                <Button className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Add Recurring Expense
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Recurring Expense</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="storeName">Store/Service Name</Label>
                  <Input
                    id="storeName"
                    value={newReceiptData.storeName}
                    onChange={(e) => setNewReceiptData(prev => ({ ...prev, storeName: e.target.value }))}
                    placeholder="e.g., Netflix, Spotify, Eskom"
                  />
                </div>
                <div>
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={newReceiptData.amount}
                    onChange={(e) => setNewReceiptData(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select value={newReceiptData.category} onValueChange={(value) => setNewReceiptData(prev => ({ ...prev, category: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="utilities">Utilities</SelectItem>
                      <SelectItem value="entertainment">Entertainment</SelectItem>
                      <SelectItem value="telecommunications">Telecommunications</SelectItem>
                      <SelectItem value="insurance">Insurance</SelectItem>
                      <SelectItem value="banking_fees">Banking Fees</SelectItem>
                      <SelectItem value="healthcare">Healthcare</SelectItem>
                      <SelectItem value="rent">Rent</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="frequency">Frequency</Label>
                  <Select value={newReceiptData.frequency} onValueChange={(value) => setNewReceiptData(prev => ({ ...prev, frequency: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  onClick={() => createRecurringReceiptMutation.mutate(newReceiptData)}
                  disabled={!newReceiptData.storeName || !newReceiptData.amount || createRecurringReceiptMutation.isPending}
                  className="w-full"
                >
                  {createRecurringReceiptMutation.isPending ? 'Creating...' : 'Create Recurring Expense'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Patterns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-600" />
                <span className="text-2xl font-bold">{patterns.length}</span>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Monthly Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Banknote className="h-5 w-5 text-green-600" />
                <span className="text-2xl font-bold">{formatCurrency(totalMonthlyRecurring)}</span>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Annual Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-purple-600" />
                <span className="text-2xl font-bold">{formatCurrency(totalAnnualRecurring)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Expenses */}
        {upcomingExpenses.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Upcoming Expenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {upcomingExpenses.map((expense: UpcomingExpense, index: number) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      {expense.isOverdue ? (
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                      ) : (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      )}
                      <div>
                        <p className="font-medium">{expense.pattern.storeName}</p>
                        <p className="text-sm text-gray-600">{expense.pattern.category}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(expense.pattern.averageAmount)}</p>
                      <p className={`text-sm ${getDaysUntilDueColor(expense.daysUntilDue, expense.isOverdue)}`}>
                        {expense.isOverdue 
                          ? `${Math.abs(expense.daysUntilDue)} days overdue`
                          : `Due in ${expense.daysUntilDue} days`
                        }
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {(patternsLoading || upcomingLoading) && (
          <Card>
            <CardContent className="p-8">
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-gray-600">Loading recurring patterns...</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recurring Patterns List */}
        {!patternsLoading && patterns.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Detected Recurring Patterns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {patterns.map((pattern: RecurringPattern, index: number) => (
                  <div key={index} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium text-lg">{pattern.storeName}</h3>
                        <Badge className={getFrequencyColor(pattern.frequency)}>
                          {pattern.frequency}
                        </Badge>
                        <Badge className={getConfidenceColor(pattern.confidence)}>
                          {Math.round(pattern.confidence * 100)}% confidence
                        </Badge>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-lg">{formatCurrency(pattern.averageAmount)}</p>
                        <p className="text-sm text-gray-600">{pattern.occurrences} occurrences</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3 text-sm text-gray-600">
                      <div>
                        <p><strong>Category:</strong> {pattern.category}</p>
                        <p><strong>Variance:</strong> {Math.round(pattern.variance * 100)}%</p>
                      </div>
                      <div>
                        <p><strong>Last Seen:</strong> {format(new Date(pattern.lastSeen), 'MMM d, yyyy')}</p>
                      </div>
                      <div>
                        {pattern.nextExpectedDate && (
                          <p><strong>Next Expected:</strong> {format(new Date(pattern.nextExpectedDate), 'MMM d, yyyy')}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!patternsLoading && patterns.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <TrendingUp className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Recurring Patterns Found</h3>
              <p className="text-gray-600 mb-4">
                Upload more receipts to help us identify your recurring expenses. 
                We need at least 3 similar receipts to detect a pattern.
              </p>
              <Button onClick={() => setLocation('/upload')} className="mt-2">
                Add Your First Receipt
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
