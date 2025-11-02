import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Calendar, Clock, AlertTriangle, CheckCircle, ArrowRight } from 'lucide-react';
import { useLocation } from 'wouter';
import { format } from 'date-fns';

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

export function RecurringExpensesWidget() {
  const [, setLocation] = useLocation();

  // Fetch recurring patterns
  const { data: patterns = [] } = useQuery<RecurringPattern[]>({
    queryKey: ['/api/recurring-patterns'],
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  // Fetch upcoming expenses
  const { data: upcomingExpenses = [] } = useQuery<UpcomingExpense[]>({
    queryKey: ['/api/recurring-expenses/upcoming'],
    refetchInterval: 300000,
  });

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

  const getDaysUntilDueColor = (daysUntilDue: number, isOverdue: boolean) => {
    if (isOverdue) return 'text-red-600';
    if (daysUntilDue <= 3) return 'text-orange-600';
    if (daysUntilDue <= 7) return 'text-yellow-600';
    return 'text-green-600';
  };

  const totalMonthlyRecurring = patterns
    .filter((p: RecurringPattern) => p.frequency === 'monthly')
    .reduce((sum: number, p: RecurringPattern) => sum + p.averageAmount, 0);

  const upcomingThisWeek = upcomingExpenses.filter((e: UpcomingExpense) => 
    e.daysUntilDue <= 7 && e.daysUntilDue >= 0
  );

  const overdueExpenses = upcomingExpenses.filter((e: UpcomingExpense) => e.isOverdue);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            <span>Recurring Expenses</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation('/recurring-expenses')}
            className="flex items-center gap-1"
          >
            View All
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {patterns.length === 0 ? (
          <div className="text-center py-6">
            <Calendar className="mx-auto h-8 w-8 text-gray-400 mb-2" />
            <p className="text-sm text-gray-600 mb-3">No recurring patterns detected yet</p>
            <p className="text-xs text-gray-500">Upload more receipts to identify recurring expenses</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">Monthly Total</span>
                </div>
                <div className="text-lg font-bold text-blue-900">
                  {formatCurrency(totalMonthlyRecurring)}
                </div>
              </div>
              
              <div className="bg-green-50 p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-900">Active Patterns</span>
                </div>
                <div className="text-lg font-bold text-green-900">
                  {patterns.length}
                </div>
              </div>
            </div>

            {/* Overdue Expenses Alert */}
            {overdueExpenses.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-medium text-red-900">Overdue Expenses</span>
                </div>
                <div className="space-y-1">
                  {overdueExpenses.slice(0, 2).map((expense: UpcomingExpense, index: number) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <span className="text-red-700">{expense.pattern.storeName}</span>
                      <span className="text-red-600 font-medium">
                        {Math.abs(expense.daysUntilDue)} days late
                      </span>
                    </div>
                  ))}
                  {overdueExpenses.length > 2 && (
                    <div className="text-xs text-red-600">
                      +{overdueExpenses.length - 2} more overdue
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Upcoming This Week */}
            {upcomingThisWeek.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-900">Due This Week</span>
                </div>
                <div className="space-y-1">
                  {upcomingThisWeek.slice(0, 3).map((expense: UpcomingExpense, index: number) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <span className="text-yellow-700">{expense.pattern.storeName}</span>
                      <span className={`font-medium ${getDaysUntilDueColor(expense.daysUntilDue, expense.isOverdue)}`}>
                        {expense.daysUntilDue === 0 ? 'Today' : `${expense.daysUntilDue} days`}
                      </span>
                    </div>
                  ))}
                  {upcomingThisWeek.length > 3 && (
                    <div className="text-xs text-yellow-600">
                      +{upcomingThisWeek.length - 3} more this week
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Top Patterns */}
            <div>
              <h4 className="text-sm font-medium mb-2">Top Recurring Patterns</h4>
              <div className="space-y-2">
                {patterns
                  .sort((a: RecurringPattern, b: RecurringPattern) => b.averageAmount - a.averageAmount)
                  .slice(0, 3)
                  .map((pattern: RecurringPattern, index: number) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="text-sm font-medium">{pattern.storeName}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-1">
                            <Badge className={`${getFrequencyColor(pattern.frequency)} text-xs`}>
                              {pattern.frequency}
                            </Badge>
                            <span>{pattern.occurrences} times</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">
                          {formatCurrency(pattern.averageAmount)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {Math.round(pattern.confidence * 100)}% confidence
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}