import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";
import { MobileInstallBanner } from "@/components/mobile-install-banner";
import { initializeErrorMonitoring } from "@/lib/monitoring";
import { useEffect } from "react";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
// Consolidated auth pages into a single auth-page
import HomePage from "@/pages/home-page";
import UploadReceipt from "@/pages/upload-receipt";
import ReceiptDetail from "@/pages/receipt/[id]";
import AnalyticsPage from "@/pages/analytics-page";
import ProfilePage from "@/pages/profile-page";
import SplashScreen from "@/pages/splash-screen";
import TaxProsPage from "@/pages/tax-pros-page";
import SmartFeaturesPage from "@/pages/smart-features-page";
import BudgetsPage from "@/pages/budgets-page";
import SearchPage from "@/pages/search-page";
import ExportsPage from "@/pages/exports-page";
import CategoriesPage from "@/pages/categories-page";
import StorageDashboard from "@/pages/storage-dashboard";
import TaxDashboard from "@/pages/tax-dashboard";
import ReceiptsPage from "@/pages/receipts-page";
import ScreenshotHelperPage from "@/pages/screenshot-helper-page";
import RecurringExpensesPage from "@/pages/recurring-expenses";
import { VerifyEmailPage } from "@/pages/verify-email-page";
import ResetPasswordPage from "@/pages/reset-password-page";
import MobilePage from "@/pages/MobilePage";
import { SubscriptionPage } from "@/pages/subscription-page";

function Router() {
  return (
    <Switch>
      <Route path="/" component={SplashScreen} />
      <Route path="/splash" component={SplashScreen} />
      <ProtectedRoute path="/home" component={HomePage} />
      <ProtectedRoute path="/upload" component={UploadReceipt} />
      <ProtectedRoute path="/receipt/:id" component={ReceiptDetail} />
      <ProtectedRoute path="/receipts" component={ReceiptsPage} />
      <ProtectedRoute path="/analytics" component={AnalyticsPage} />
      <ProtectedRoute path="/smart" component={SmartFeaturesPage} />
      <ProtectedRoute path="/budgets" component={BudgetsPage} />
      <ProtectedRoute path="/search" component={SearchPage} />
      <ProtectedRoute path="/smart-search" component={SearchPage} />
      <ProtectedRoute path="/exports" component={ExportsPage} />
      <ProtectedRoute path="/categories" component={CategoriesPage} />
      <ProtectedRoute path="/storage" component={StorageDashboard} />
      <ProtectedRoute path="/tax-pros" component={TaxProsPage} />
      <ProtectedRoute path="/tax-dashboard" component={TaxDashboard} />
      <ProtectedRoute path="/recurring-expenses" component={RecurringExpensesPage} />
      <ProtectedRoute path="/subscription" component={SubscriptionPage} />
      <ProtectedRoute path="/profile" component={() => <ProfilePage />} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/verify-email" component={VerifyEmailPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/mobile" component={MobilePage} />
      <Route path="/screenshots" component={ScreenshotHelperPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

import { ErrorBoundary } from './components/error-boundary';

function App() {
  useEffect(() => {
    // Initialize error monitoring on app startup
    initializeErrorMonitoring();
  }, []);

  // Add debug logging for app rendering
  console.log("[App] App component is rendering");

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Router />
          <Toaster />
          <MobileInstallBanner />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;