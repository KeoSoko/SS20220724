import { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/ui/button";
import { LogOut, Loader2, Brain, BarChart3, Users, FileText, Home } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";

interface PageLayoutProps {
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  showDesktopNav?: boolean;
  children: ReactNode;
  headerActions?: ReactNode;
}

export function PageLayout({ 
  title, 
  subtitle, 
  showBackButton = false, 
  showDesktopNav = true,
  children, 
  headerActions 
}: PageLayoutProps) {
  const { user, logout } = useAuth();
  const isMobile = useIsMobile();
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className={`${isMobile ? 'p-4 pb-24' : 'p-4 md:p-8 pb-8'}`}>
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className={`flex flex-col md:flex-row md:justify-between md:items-start gap-4 ${isMobile ? 'mb-6' : 'mb-8'}`}>
            <div className="flex-1">
              {showBackButton && <BackButton />}
              
              <div className={showBackButton ? "mt-4" : ""}>
                <h1 className={`font-bold text-gray-900 mb-2 ${isMobile ? 'text-2xl' : 'text-3xl'}`}>{title}</h1>
                {subtitle && (
                  <p className={`text-gray-600 ${isMobile ? 'text-base' : 'text-lg'}`}>{subtitle}</p>
                )}
              </div>
            </div>

            {/* Mobile Logout Button */}
            {isMobile && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => logout()}
                className="self-start"
                aria-label="Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            )}

            {/* Desktop Navigation & Actions - Only show on truly large screens */}
            {!isMobile && showDesktopNav && (
              <div className="flex items-center gap-3">
                <Link href="/home">
                  <Button variant="outline">
                    <Home className="h-4 w-4 mr-2" />
                    Home
                  </Button>
                </Link>
                <Link href="/smart">
                  <Button variant="outline">
                    <Brain className="h-4 w-4 mr-2" />
                    Smart AI
                  </Button>
                </Link>
                <Link href="/analytics">
                  <Button variant="outline">
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Reports
                  </Button>
                </Link>
                <Link href="/tax-pros">
                  <Button variant="outline">
                    <Users className="h-4 w-4 mr-2" />
                    Tax Pros
                  </Button>
                </Link>
                <Link href="/profile">
                  <Button variant="outline">
                    <FileText className="h-4 w-4 mr-2" />
                    Profile
                  </Button>
                </Link>
                
                {headerActions}
                
                <Button 
                  variant="outline" 
                  onClick={() => logout()}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </Button>
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="bg-white rounded-none shadow-sm border border-gray-200">
            {children}
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isMobile && <MobileBottomNav />}
    </div>
  );
}