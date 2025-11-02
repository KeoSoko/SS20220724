import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  Calculator, 
  AlertTriangle, 
  Calendar,
  FileText,
  DollarSign,
  Target,
  Edit,
  Zap,
  Brain,
  PieChart,
  ArrowLeft,
  Download,
  Heart
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TaxDashboardData {
  ytdDeductible: number;
  projectedAnnual: number;
  estimatedSavings: number;
  quarterlyEstimate: number;
  currentQuarter: number;
  deductibleReceipts: number;
  totalReceipts: number;
  categoryBreakdown: Array<{
    category: string;
    amount: number;
    count: number;
  }>;
  thresholdProgress: Array<{
    name: string;
    threshold: number;
    current: number;
    percentage: number;
  }>;
  alerts: Array<{
    type: 'warning' | 'info' | 'success';
    message: string;
    action?: string;
  }>;
  yearEndOpportunities: Array<{
    description: string;
    potentialSavings: number;
    deadline: string;
  }>;
  currentTaxYear: number;
  taxYearStart: Date;
  taxYearEnd: Date;
  daysRemaining: number;
  progressPercentage: number;
}

interface TaxSettings {
  taxBracket: number;
  estimatedIncome: number;
  filingStatus: string;
}

export default function TaxDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [taxSettings, setTaxSettings] = useState<TaxSettings>({
    taxBracket: 18,
    estimatedIncome: 0,
    filingStatus: 'single'
  });

  const { data: taxData, isLoading } = useQuery<TaxDashboardData>({
    queryKey: ['/api/tax/dashboard'],
    enabled: true
  });

  const { data: userSettings } = useQuery<TaxSettings>({
    queryKey: ['/api/tax/settings'],
    enabled: true
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (settings: TaxSettings) => {
      const response = await fetch('/api/tax/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (!response.ok) throw new Error('Failed to update settings');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tax/dashboard'] });
      toast({ title: 'Tax settings updated successfully' });
    }
  });

  const generateAuditKitMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/tax/audit-kit', {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to generate audit kit');
      return response.blob();
    },
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tax-audit-kit-${new Date().getFullYear()}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: 'Audit kit downloaded successfully' });
    }
  });

  useEffect(() => {
    if (userSettings) {
      setTaxSettings(userSettings);
    }
  }, [userSettings]);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const quarterNames = ['Q1', 'Q2', 'Q3', 'Q4'];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center space-x-4">
              <Link href="/tax-pros">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Tax Pros
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Tax Dashboard {taxData?.currentTaxYear || currentYear}
                </h1>
                <p className="text-gray-600">
                  {taxData ? (
                    <>
                      <span className="text-green-600 font-medium">Tax Season Active</span> - File {taxData.currentTaxYear - 1} return by Oct 31. 
                      <br />SA Tax Year: March {taxData.currentTaxYear - 1} - February {taxData.currentTaxYear} ({taxData.daysRemaining} days remaining)
                    </>
                  ) : (
                    'Comprehensive tax planning and optimization'
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                onClick={() => generateAuditKitMutation.mutate()}
                disabled={generateAuditKitMutation.isPending}
                variant="outline"
              >
                <Download className="h-4 w-4 mr-2" />
                {generateAuditKitMutation.isPending ? 'Generating...' : 'Audit Kit'}
              </Button>
              <Link href="/tax-pros">
                <Button>
                  <FileText className="h-4 w-4 mr-2" />
                  Tax Reports
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="planning" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="planning">Tax Planning</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="planning" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">YTD Deductible</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-green-600">
                      R {taxData?.ytdDeductible?.toLocaleString() || '0'}
                    </span>
                    <TrendingUp className="h-5 w-5 text-green-600" />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {taxData?.deductibleReceipts || 0} receipts
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">Total Receipts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-blue-600">
                      {taxData?.totalReceipts || 0}
                    </span>
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Current tax year
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">Medical Expenses</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-purple-600">
                      R {taxData?.categoryBreakdown?.find(c => c.category === 'Medical')?.amount?.toLocaleString() || '0'}
                    </span>
                    <Heart className="h-5 w-5 text-purple-600" />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Tax deductible amount
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600">Tax Readiness</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-orange-600">
                      {taxData?.totalReceipts ? 
                        Math.round((taxData.deductibleReceipts / taxData.totalReceipts) * 100) : 0}%
                    </span>
                    <Target className="h-5 w-5 text-orange-600" />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Receipts categorized
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Tax Year Progress */}
            {taxData && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
                    <Calendar className="h-4 w-4 mr-2" />
                    Tax Year Progress
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">
                        {taxData.progressPercentage}% Complete
                      </span>
                      <span className="text-sm text-gray-500">
                        {taxData.daysRemaining} days remaining
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${taxData.progressPercentage}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500">
                      March {taxData.currentTaxYear - 1} - February {taxData.currentTaxYear}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Smart Alerts */}
            {taxData?.alerts && taxData.alerts.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Zap className="h-5 w-5 mr-2 text-yellow-500" />
                  Smart Tax Alerts
                </h3>
                {taxData.alerts.map((alert, index) => (
                  <Alert key={index} className={`border-l-4 ${
                    alert.type === 'warning' ? 'border-yellow-500 bg-yellow-50' :
                    alert.type === 'success' ? 'border-green-500 bg-green-50' :
                    'border-blue-500 bg-blue-50'
                  }`}>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="flex items-center justify-between">
                      <span>{alert.message}</span>
                      {alert.action && (
                        <Button size="sm" variant="outline">
                          {alert.action}
                        </Button>
                      )}
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            )}

            {/* Threshold Progress */}
            {taxData?.thresholdProgress && taxData.thresholdProgress.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Target className="h-5 w-5 mr-2" />
                    Deduction Thresholds
                  </CardTitle>
                  <CardDescription>
                    Track your progress toward common deduction limits
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {taxData.thresholdProgress.map((threshold, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{threshold.name}</span>
                        <span className="text-gray-600">
                          R {threshold.current.toLocaleString()} / R {threshold.threshold.toLocaleString()}
                        </span>
                      </div>
                      <Progress value={threshold.percentage} className="h-2" />
                      <p className="text-xs text-gray-500">
                        R {(threshold.threshold - threshold.current).toLocaleString()} remaining
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Category Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <PieChart className="h-5 w-5 mr-2" />
                    Deductible Categories
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {taxData?.categoryBreakdown?.map((category, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <div>
                          <p className="font-medium">{category.category}</p>
                          <p className="text-sm text-gray-600">{category.count} receipts</p>
                        </div>
                        <span className="font-semibold text-green-600">
                          R {category.amount.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Calendar className="h-5 w-5 mr-2" />
                    Year-End Opportunities
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {taxData?.yearEndOpportunities?.map((opportunity, index) => (
                      <div key={index} className="p-3 border border-gray-200 rounded">
                        <p className="font-medium text-sm">{opportunity.description}</p>
                        <div className="flex justify-between items-center mt-2">
                          <span className="text-sm text-gray-600">
                            Deadline: {opportunity.deadline}
                          </span>
                          <span className="text-sm font-semibold text-green-600">
                            Save R {opportunity.potentialSavings.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="planning" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Calendar className="h-5 w-5 mr-2" />
                  Tax Planning & Optimization
                </CardTitle>
                <CardDescription>
                  Maximize your deductions and plan for tax season
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Quick Actions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Link href="/receipts?filter=uncategorized">
                    <Button variant="outline" className="w-full justify-start">
                      <Edit className="h-4 w-4 mr-2" />
                      Review Uncategorized Receipts
                    </Button>
                  </Link>
                  <Link href="/smart-search">
                    <Button variant="outline" className="w-full justify-start">
                      <Brain className="h-4 w-4 mr-2" />
                      Smart Expense Search
                    </Button>
                  </Link>
                </div>
                
                {/* Annual Tax Planning */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Annual Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Current Tax Year:</span>
                        <span className="font-semibold">March 2024 - February 2025</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Total Deductible:</span>
                        <span className="font-semibold text-green-600">R{(taxData?.ytdDeductible || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Estimated Savings:</span>
                        <span className="font-semibold text-blue-600">R{(taxData?.estimatedSavings || 0).toLocaleString()}</span>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Personal Tax Categories</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-sm text-gray-600 space-y-2">
                        <div className="flex items-center">
                          <div className="w-3 h-3 bg-green-500 rounded-sm mr-2"></div>
                          <span>Medical expenses</span>
                        </div>
                        <div className="flex items-center">
                          <div className="w-3 h-3 bg-blue-500 rounded-sm mr-2"></div>
                          <span>Retirement contributions</span>
                        </div>
                        <div className="flex items-center">
                          <div className="w-3 h-3 bg-purple-500 rounded-sm mr-2"></div>
                          <span>Educational expenses</span>
                        </div>
                        <div className="flex items-center">
                          <div className="w-3 h-3 bg-orange-500 rounded-sm mr-2"></div>
                          <span>Charitable donations</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                
                <Alert className="border-blue-200 bg-blue-50">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Tax Season Reminder:</strong> You have 
                    {' ' + Math.max(0, 31 - new Date().getDate())} days left to maximize {currentYear} deductions.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Tax Settings</CardTitle>
                <CardDescription>
                  Configure your tax information for accurate calculations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="taxBracket">Tax Bracket (%)</Label>
                    <Select
                      value={taxSettings.taxBracket.toString()}
                      onValueChange={(value) => 
                        setTaxSettings(prev => ({ ...prev, taxBracket: parseInt(value) }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="18">18% (R0 - R205,900)</SelectItem>
                        <SelectItem value="26">26% (R205,901 - R321,600)</SelectItem>
                        <SelectItem value="31">31% (R321,601 - R445,100)</SelectItem>
                        <SelectItem value="36">36% (R445,101 - R584,200)</SelectItem>
                        <SelectItem value="39">39% (R584,201 - R744,800)</SelectItem>
                        <SelectItem value="41">41% (R744,801 - R1,577,300)</SelectItem>
                        <SelectItem value="45">45% (R1,577,301+)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="filingStatus">Filing Status</Label>
                    <Select
                      value={taxSettings.filingStatus}
                      onValueChange={(value) => 
                        setTaxSettings(prev => ({ ...prev, filingStatus: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Single</SelectItem>
                        <SelectItem value="married">Married</SelectItem>
                        <SelectItem value="head_of_household">Head of Household</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="estimatedIncome">Estimated Annual Income (R)</Label>
                    <Input
                      id="estimatedIncome"
                      type="number"
                      value={taxSettings.estimatedIncome}
                      onChange={(e) => 
                        setTaxSettings(prev => ({ ...prev, estimatedIncome: parseInt(e.target.value) || 0 }))
                      }
                      placeholder="0"
                    />
                  </div>


                </div>

                <Button 
                  onClick={() => updateSettingsMutation.mutate(taxSettings)}
                  disabled={updateSettingsMutation.isPending}
                  className="w-full"
                >
                  {updateSettingsMutation.isPending ? 'Saving...' : 'Save Settings'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}