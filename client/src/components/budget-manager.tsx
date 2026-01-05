import React, { useState } from 'react';
import { PiggyBank, AlertTriangle, TrendingUp, Target, Plus, Trash2, Edit } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { 
  EnhancedButton,
  SpacingContainer,
  EnhancedEmptyState
} from '@/components/ui/enhanced-components';
import { motion } from 'framer-motion';

interface BudgetAnalytics {
  budgetId: number;
  budgetName: string;
  category: string;
  monthlyLimit: number;
  currentSpent: number;
  remainingBudget: number;
  percentageUsed: number;
  daysLeftInMonth: number;
  dailyAverageSpent: number;
  projectedMonthlySpend: number;
  onTrack: boolean;
  receiptsCount: number;
}

interface MerchantAnalytics {
  storeName: string;
  totalSpent: number;
  averageSpent: number;
  visitCount: number;
  category: string;
}

export function BudgetManager() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [budgetToDelete, setBudgetToDelete] = useState<{id: number, name: string} | null>(null);
  const [budgetToEdit, setBudgetToEdit] = useState<BudgetAnalytics | null>(null);
  const [newBudget, setNewBudget] = useState({
    name: '',
    category: '',
    monthlyLimit: '',
    alertThreshold: '80'
  });
  const [editBudget, setEditBudget] = useState({
    name: '',
    category: '',
    monthlyLimit: '',
    alertThreshold: '80'
  });
  const { toast } = useToast();

  // Get budget analytics
  const { data: budgets = [], isLoading } = useQuery<BudgetAnalytics[]>({
    queryKey: ['/api/budgets'],
  });

  // Get merchant analysis for spending insights
  const { data: merchants = [] } = useQuery<MerchantAnalytics[]>({
    queryKey: ['/api/analytics/merchants'],
  });

  const categories = [
    { value: 'groceries', label: 'Groceries' },
    { value: 'electricity_water', label: 'Electricity & Water' },
    { value: 'municipal_rates_taxes', label: 'Municipal Rates & Taxes' },
    { value: 'rent_bond', label: 'Rent / Bond' },
    { value: 'domestic_help_home_services', label: 'Domestic Help & Home Services' },
    { value: 'home_maintenance', label: 'Home Maintenance' },
    { value: 'transport_public_taxi', label: 'Transport (Public/Taxi)' },
    { value: 'fuel', label: 'Fuel' },
    { value: 'vehicle_maintenance_licensing', label: 'Vehicle Maintenance & Licensing' },
    { value: 'airtime_data_internet', label: 'Airtime, Data & Internet' },
    { value: 'subscriptions', label: 'Subscriptions' },
    { value: 'insurance', label: 'Insurance' },
    { value: 'pharmacy_medication', label: 'Pharmacy & Medication' },
    { value: 'education_courses', label: 'Education & Courses' },
    { value: 'dining_takeaways', label: 'Dining & Takeaways' },
    { value: 'entertainment', label: 'Entertainment' },
    { value: 'travel_accommodation', label: 'Travel & Accommodation' },
    { value: 'clothing_shopping', label: 'Clothing & Shopping' },
    { value: 'personal_care_beauty', label: 'Personal Care & Beauty' },
    { value: 'gifts_celebrations', label: 'Gifts & Celebrations' },
    { value: 'donations_tithes', label: 'Donations & Tithes' },
    { value: 'family_support_remittances', label: 'Family Support & Remittances' },
    { value: 'load_shedding_costs', label: 'Load Shedding Costs' },
    { value: 'other', label: 'Other' }
  ];

  const handleCreateBudget = async () => {
    if (!newBudget.name || !newBudget.category || !newBudget.monthlyLimit) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    try {
      // Use apiRequest which handles authentication automatically  
      const { apiRequest } = await import('@/lib/queryClient');
      
      const response = await apiRequest('POST', '/api/budgets', {
        name: newBudget.name,
        category: newBudget.category,
        monthlyLimit: parseFloat(newBudget.monthlyLimit),
        alertThreshold: parseInt(newBudget.alertThreshold)
      });

      toast({
        title: "Budget created!",
        description: `Your ${newBudget.category} budget has been set up successfully`,
      });
      
      setShowCreateDialog(false);
      setNewBudget({ name: '', category: '', monthlyLimit: '', alertThreshold: '80' });
      
      // Refresh the budgets list
      window.location.reload();
    } catch (error) {
      toast({
        title: "Failed to create budget",
        description: "Network error. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleDeleteBudget = async (budgetId: number, budgetName: string) => {
    setBudgetToDelete({ id: budgetId, name: budgetName });
    setShowDeleteDialog(true);
  };

  const handleEditBudget = (budget: BudgetAnalytics) => {
    setBudgetToEdit(budget);
    setEditBudget({
      name: budget.budgetName,
      category: budget.category,
      monthlyLimit: budget.monthlyLimit.toString(),
      alertThreshold: '80' // Default since we don't have this in the current budget data
    });
    setShowEditDialog(true);
  };

  const confirmEditBudget = async () => {
    if (!budgetToEdit || !editBudget.name || !editBudget.category || !editBudget.monthlyLimit) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    try {
      // Use apiRequest which handles authentication automatically
      const { apiRequest } = await import('@/lib/queryClient');
      
      const response = await apiRequest('PUT', `/api/budgets/${budgetToEdit.budgetId}`, {
        name: editBudget.name,
        category: editBudget.category,
        monthlyLimit: parseFloat(editBudget.monthlyLimit),
        alertThreshold: parseInt(editBudget.alertThreshold)
      });

      toast({
        title: "Budget updated!",
        description: `Your ${editBudget.category} budget has been updated successfully`,
      });
      
      setShowEditDialog(false);
      setBudgetToEdit(null);
      setEditBudget({ name: '', category: '', monthlyLimit: '', alertThreshold: '80' });
      
      // Refresh the budgets list
      window.location.reload();
    } catch (error: any) {
      console.error('Budget update error:', error);
      toast({
        title: "Failed to update budget",
        description: error.message || "Something went wrong",
        variant: "destructive"
      });
    }
  };

  const confirmDeleteBudget = async () => {
    if (!budgetToDelete) return;

    try {
      // Use apiRequest which handles authentication automatically
      const { apiRequest } = await import('@/lib/queryClient');
      
      const response = await apiRequest('DELETE', `/api/budgets/${budgetToDelete.id}`);

      toast({
        title: "Budget deleted",
        description: `Your "${budgetToDelete.name}" budget has been removed successfully`,
      });
      
      // Refresh the budgets list
      window.location.reload();
    } catch (error) {
      toast({
        title: "Failed to delete budget",
        description: "Network error. Please try again.",
        variant: "destructive"
      });
    } finally {
      setShowDeleteDialog(false);
      setBudgetToDelete(null);
    }
  };

  const getBudgetStatusColor = (percentage: number) => {
    if (percentage >= 100) return 'text-red-600';
    if (percentage >= 80) return 'text-orange-500';
    return 'text-green-600';
  };

  const getBudgetProgressColor = (percentage: number) => {
    if (percentage >= 100) return 'bg-red-500';
    if (percentage >= 80) return 'bg-orange-500';
    return 'bg-green-500';
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-48 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center pl-[24px] pr-[24px] pt-[18px] pb-[18px]">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <PiggyBank className="w-6 h-6 text-green-600" />
            Budget Management
          </h2>
          <p className="text-muted-foreground">Track your spending and stay on budget</p>
        </div>
        
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <EnhancedButton variant="primary" className="shadow-md">
              <Plus className="w-4 h-4 mr-2" />
              Create Budget
            </EnhancedButton>
          </DialogTrigger>
          <DialogContent className="pl-[70px] pr-[70px] pt-[40px] pb-[40px] text-[12px]" aria-describedby="budget-dialog-description">
            <DialogHeader>
              <DialogTitle>Create New Budget</DialogTitle>
            </DialogHeader>
            <p id="budget-dialog-description" className="text-sm text-muted-foreground mb-4">
              Set up a monthly spending limit for a specific category to track your expenses and receive alerts.
            </p>
            <div className="space-y-4">
              <div>
                <Label htmlFor="budget-name">Budget Name</Label>
                <Input
                  id="budget-name"
                  placeholder="e.g., Monthly Groceries"
                  value={newBudget.name}
                  onChange={(e) => setNewBudget({...newBudget, name: e.target.value})}
                />
              </div>
              
              <div>
                <Label htmlFor="budget-category">Category</Label>
                <Select value={newBudget.category} onValueChange={(value) => setNewBudget({...newBudget, category: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="budget-limit">Monthly Limit (R)</Label>
                <Input
                  id="budget-limit"
                  type="number"
                  placeholder="1000"
                  value={newBudget.monthlyLimit}
                  onChange={(e) => setNewBudget({...newBudget, monthlyLimit: e.target.value})}
                />
              </div>
              
              <div>
                <Label htmlFor="alert-threshold">Alert Threshold (%)</Label>
                <Input
                  id="alert-threshold"
                  type="number"
                  placeholder="80"
                  value={newBudget.alertThreshold}
                  onChange={(e) => setNewBudget({...newBudget, alertThreshold: e.target.value})}
                />
              </div>
              
              <Button onClick={handleCreateBudget} className="w-full">
                Create Budget
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Budget Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent aria-describedby="edit-budget-dialog-description">
            <DialogHeader>
              <DialogTitle>Edit Budget</DialogTitle>
            </DialogHeader>
            <p id="edit-budget-dialog-description" className="text-sm text-muted-foreground mb-4">
              Update your budget details including name, category, monthly limit, and alert threshold.
            </p>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-budget-name">Budget Name</Label>
                <Input
                  id="edit-budget-name"
                  placeholder="e.g., Monthly Groceries"
                  value={editBudget.name}
                  onChange={(e) => setEditBudget({...editBudget, name: e.target.value})}
                />
              </div>
              
              <div>
                <Label htmlFor="edit-budget-category">Category</Label>
                <Select value={editBudget.category} onValueChange={(value) => setEditBudget({...editBudget, category: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="edit-monthly-limit">Monthly Limit (R)</Label>
                <Input
                  id="edit-monthly-limit"
                  type="number"
                  placeholder="1000"
                  value={editBudget.monthlyLimit}
                  onChange={(e) => setEditBudget({...editBudget, monthlyLimit: e.target.value})}
                />
              </div>
              
              <div>
                <Label htmlFor="edit-alert-threshold">Alert Threshold (%)</Label>
                <Input
                  id="edit-alert-threshold"
                  type="number"
                  placeholder="80"
                  value={editBudget.alertThreshold}
                  onChange={(e) => setEditBudget({...editBudget, alertThreshold: e.target.value})}
                />
              </div>
              
              <Button onClick={confirmEditBudget} className="w-full">
                Update Budget
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {/* Budget Overview */}
      {budgets.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {budgets.map(budget => (
            <Card key={budget.budgetId} className="relative">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{budget.budgetName}</CardTitle>
                    <p className="text-sm text-muted-foreground capitalize">
                      {budget.category}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={budget.onTrack ? "default" : "destructive"}
                      className="text-xs"
                    >
                      {budget.onTrack ? "On Track" : "Over Budget"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditBudget(budget)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-blue-600"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteBudget(budget.budgetId, budget.budgetName)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Spent</span>
                    <span className={getBudgetStatusColor(budget.percentageUsed)}>
                      {budget.percentageUsed.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-none h-2">
                    <div
                      className={`h-2 rounded-none transition-all ${getBudgetProgressColor(budget.percentageUsed)}`}
                      style={{ width: `${Math.min(budget.percentageUsed, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Budget Details */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Spent</span>
                    <span className="font-medium">R {budget.currentSpent.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Budget</span>
                    <span className="font-medium">R {budget.monthlyLimit.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Remaining</span>
                    <span className={`font-medium ${budget.remainingBudget >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      R {budget.remainingBudget.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Insights */}
                <div className="pt-2 border-t space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Target className="w-3 h-3" />
                    {budget.receiptsCount} receipts this month
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <TrendingUp className="w-3 h-3" />
                    R {budget.dailyAverageSpent.toFixed(2)}/day average
                  </div>
                  {budget.percentageUsed >= 80 && (
                    <div className="flex items-center gap-2 text-xs text-orange-600">
                      <AlertTriangle className="w-3 h-3" />
                      Approaching budget limit
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* Empty State */
        (<Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <PiggyBank className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No budgets yet</h3>
            <p className="text-muted-foreground mb-6 text-center max-w-md">
              Create your first budget to start tracking your spending and get smart alerts when you're approaching your limits.
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Budget
            </Button>
          </CardContent>
        </Card>)
      )}
      {/* Spending Insights */}
      {merchants.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Spending Locations</CardTitle>
            <p className="text-sm text-muted-foreground">
              Your most frequent merchants this month
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {merchants.slice(0, 5).map((merchant: MerchantAnalytics, index: number) => (
                <div key={index} className="flex items-center justify-between p-3 rounded-none bg-gray-50">
                  <div className="flex-1">
                    <h4 className="font-medium">{merchant.storeName}</h4>
                    <p className="text-sm text-muted-foreground capitalize">
                      {merchant.category} • {merchant.visitCount} visits
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">R {merchant.totalSpent.toFixed(2)}</div>
                    <div className="text-sm text-muted-foreground">
                      R {merchant.averageSpent.toFixed(2)} avg
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Budget</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the "{budgetToDelete?.name}" budget? 
              This action cannot be undone and will permanently remove all budget data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowDeleteDialog(false);
              setBudgetToDelete(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteBudget}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete Budget
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}