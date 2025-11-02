import React from 'react';
import { Brain, Search, Sparkles, BarChart3, Settings, Upload, TrendingUp, Download, Zap, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
// Removed icon-badge import - using inline components instead
import { PageLayout } from '@/components/page-layout';
import { ContentCard, Section, PrimaryButton } from '@/components/design-system';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';

// Define the insights data structure
interface InsightsData {
  averageSpending: number;
  topStores: { name: string; amount: number; frequency: number }[];
  spendingTrend: 'increasing' | 'decreasing' | 'stable';
  recommendations: string[];
}

// AI Insights Component - shows personalized recommendations
function AIInsights() {
  const { data: insights, isLoading } = useQuery<InsightsData>({
    queryKey: ['/api/insights'],
  });

  if (isLoading) {
    return <div className="animate-pulse bg-gray-100 h-32 rounded" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-blue-600" />
        <h3 className="font-semibold">AI Insights</h3>
      </div>
      
      <div className="grid gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <p className="text-sm text-gray-700">
              Your average monthly spending is <span className="font-semibold">R{insights?.averageSpending?.toFixed(2) || '0.00'}</span>
            </p>
          </CardContent>
        </Card>
        
        {insights?.topStores && insights.topStores.length > 0 && (
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <p className="text-sm text-gray-700">
                Your most frequent store is <span className="font-semibold">{insights.topStores[0]?.name}</span>
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// Feature Card Component - redesigned for better navigation
function FeatureCard({ 
  icon: Icon, 
  title, 
  description, 
  status,
  onClick
}: {
  icon: any;
  title: string;
  description: string;
  status: 'available' | 'premium' | 'coming-soon';
  onClick: () => void;
}) {
  const isMobile = useIsMobile();
  
  return (
    <Card className="hover:shadow-md transition-all duration-200 cursor-pointer group" onClick={onClick}>
      <CardContent className="overflow-hidden p-6 pl-[40px] pr-[40px] pt-[40px] pb-[40px]">
        <div className="flex items-start justify-between mb-4">
          <div className="bg-blue-50 p-3 rounded-none">
            <Icon className="w-6 h-6 text-blue-600" />
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
        </div>
        <h3 className="font-semibold text-lg mb-2">{title}</h3>
        <p className="text-gray-600 text-sm mb-3">{description}</p>
        <div className="flex items-center justify-between">
          <span className={`text-xs px-2 py-1 rounded-none ${
            status === 'available' ? 'bg-green-100 text-green-800' :
            status === 'premium' ? 'bg-yellow-100 text-yellow-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {status === 'available' ? 'Available' : 
             status === 'premium' ? 'Premium' : 'Coming Soon'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SmartFeaturesPage() {
  const isMobile = useIsMobile();
  const [, setLocation] = useLocation();

  // Debug: Log when component mounts
  React.useEffect(() => {
    console.log('[SmartFeaturesPage] Component mounted successfully');
  }, []);

  const headerActions = (
    <div className="flex items-center space-x-2">
      <Brain className="h-6 w-6 text-purple-600" />
      <Sparkles className="h-5 w-5 text-yellow-500" />
    </div>
  );

  const handleNavigation = (path: string) => {
    console.log(`[SmartFeaturesPage] Navigating to: ${path}`);
    setLocation(path);
  };

  const smartFeatures = [
    {
      icon: Search,
      title: "Smart Search",
      description: "Find receipts using natural language queries and AI-powered filters",
      status: 'available' as const,
      onClick: () => handleNavigation('/search')
    },
    {
      icon: Upload,
      title: "Scan Receipt",
      description: "Upload receipts with automatic AI categorization and processing",
      status: 'available' as const,
      onClick: () => handleNavigation('/upload')
    },
    {
      icon: TrendingUp,
      title: "Budget Intelligence",
      description: "Smart budget tracking with predictive spending insights",
      status: 'available' as const,
      onClick: () => handleNavigation('/budgets')
    },
    {
      icon: BarChart3,
      title: "Analytics Dashboard", 
      description: "Advanced spending analytics and personalized insights",
      status: 'available' as const,
      onClick: () => handleNavigation('/analytics')
    },
    {
      icon: Download,
      title: "Smart Reports",
      description: "Export data with AI-generated insights and tax optimization",
      status: 'available' as const,
      onClick: () => handleNavigation('/exports')
    },
    {
      icon: Zap,
      title: "Expense Predictions",
      description: "Predict future spending patterns based on historical data",
      status: 'coming-soon' as const,
      onClick: () => {}
    }
  ];

  return (
    <PageLayout 
      title="Smart AI Features"
      subtitle="Powered by advanced artificial intelligence"
      showBackButton={true}
      headerActions={headerActions}
    >
      {/* AI Insights Overview */}
      <Section title="AI Insights" description="Personalized recommendations based on your spending">
        <ContentCard>
          <AIInsights />
        </ContentCard>
      </Section>

      {/* Smart Features Grid */}
      <Section title="AI-Powered Features" description="Access intelligent tools designed for your financial management">
        <div className={`grid gap-6 ${isMobile ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-3'}`}>
          {smartFeatures.map((feature, index) => (
            <FeatureCard
              key={index}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              status={feature.status}
              onClick={feature.onClick}
            />
          ))}
        </div>
      </Section>

      {/* AI Technology Overview */}
      <Section title="AI Technology" description="Powered by advanced machine learning">
        <ContentCard className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
          <div className="flex items-center gap-4 mb-6">
            <div className="bg-purple-100 p-3 rounded-none">
              <Brain className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Intelligent Receipt Processing</h3>
              <p className="text-gray-600">Advanced AI capabilities for smarter financial management</p>
            </div>
          </div>
          <div className={`grid ${isMobile ? 'grid-cols-1 gap-4' : 'grid-cols-3 gap-6'}`}>
            <Card className="p-4 border-l-4 border-l-blue-500">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-blue-100 rounded-none flex items-center justify-center">
                  <Search className="w-4 h-4 text-blue-600" />
                </div>
                <h4 className="font-semibold text-gray-900">Natural Language Search</h4>
              </div>
              <p className="text-sm text-gray-600">Find receipts by typing in plain English</p>
            </Card>
            <Card className="p-4 border-l-4 border-l-green-500">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-green-100 rounded-none flex items-center justify-center">
                  <Brain className="w-4 h-4 text-green-600" />
                </div>
                <h4 className="font-semibold text-gray-900">Smart Categorization</h4>
              </div>
              <p className="text-sm text-gray-600">Automatic expense categorization with 95% accuracy</p>
            </Card>
            <Card className="p-4 border-l-4 border-l-purple-500">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-purple-100 rounded-none flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-purple-600" />
                </div>
                <h4 className="font-semibold text-gray-900">Predictive Insights</h4>
              </div>
              <p className="text-sm text-gray-600">Spending patterns and budget predictions</p>
            </Card>
          </div>
        </ContentCard>
      </Section>
    </PageLayout>
  );
}