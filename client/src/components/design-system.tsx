import { ReactNode, forwardRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

// Unified color palette
export const colors = {
  primary: "#0073AA",
  primaryHover: "#005d87",
  secondary: "#6b7280",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
  background: "#f9fafb",
  surface: "#ffffff",
  border: "#e5e7eb",
  text: {
    primary: "#111827",
    secondary: "#6b7280",
    muted: "#9ca3af"
  }
};

// Typography system
export const typography = {
  heading1: "text-3xl font-bold text-gray-900",
  heading2: "text-2xl font-semibold text-gray-900", 
  heading3: "text-xl font-semibold text-gray-900",
  body: "text-base text-gray-700",
  bodySmall: "text-sm text-gray-600",
  caption: "text-xs text-gray-500",
  label: "text-sm font-medium text-gray-700"
};

// Spacing system
export const spacing = {
  xs: "0.25rem", // 4px
  sm: "0.5rem",  // 8px
  md: "1rem",    // 16px
  lg: "1.5rem",  // 24px
  xl: "2rem",    // 32px
  xxl: "3rem"    // 48px
};

// Standard page header component
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  showBackButton?: boolean;
}

export function PageHeader({ title, subtitle, actions, showBackButton }: PageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-8">
      <div className="flex-1">
        <h1 className={typography.heading1}>{title}</h1>
        {subtitle && (
          <p className={cn(typography.body, "mt-2")}>{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}

// Standard card wrapper
interface ContentCardProps {
  children: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
}

export function ContentCard({ children, className, padding = "md" }: ContentCardProps) {
  const isMobile = useIsMobile();
  const paddingClasses = {
    none: "",
    sm: isMobile ? "p-3" : "p-4",
    md: isMobile ? "p-4" : "p-6", 
    lg: isMobile ? "p-6" : "p-8"
  };

  return (
    <Card className={cn("bg-white shadow-sm border border-gray-200", className)}>
      <div className={cn(paddingClasses[padding], "break-words")}>
        {children}
      </div>
    </Card>
  );
}

// Standard section component
interface SectionProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function Section({ title, description, children, className }: SectionProps) {
  const isMobile = useIsMobile();
  
  return (
    <div className={cn(
      "space-y-6",
      isMobile ? 'px-3 py-4' : 'px-6 py-8',
      className
    )}>
      {(title || description) && (
        <div className="space-y-2">
          {title && (
            <h2 className={cn(
              "font-semibold text-gray-900",
              isMobile ? 'text-lg' : 'text-2xl'
            )}>
              {title}
            </h2>
          )}
          {description && (
            <p className={cn(
              typography.bodySmall,
              "text-muted-foreground",
              isMobile ? "text-sm" : ""
            )}>
              {description}
            </p>
          )}
        </div>
      )}
      <div className={cn("space-y-4", isMobile && "space-y-3")}>
        {children}
      </div>
    </div>
  );
}

// Standard action button styles
export const PrimaryButton = forwardRef<HTMLButtonElement, any>(({ children, className, ...props }, ref) => {
  const isMobile = useIsMobile();
  
  return (
    <Button 
      ref={ref}
      className={cn(
        "bg-[#0073AA] hover:bg-[#005d87] text-white font-semibold",
        isMobile ? "min-w-0 px-3 text-sm" : "min-w-[120px]",
        className
      )}
      {...props}
    >
      {children}
    </Button>
  );
});

PrimaryButton.displayName = "PrimaryButton";

// Standard status badge
interface StatusBadgeProps {
  status: "success" | "warning" | "error" | "neutral";
  children: ReactNode;
}

export function StatusBadge({ status, children }: StatusBadgeProps) {
  const statusStyles = {
    success: "bg-green-100 text-green-800",
    warning: "bg-yellow-100 text-yellow-800", 
    error: "bg-red-100 text-red-800",
    neutral: "bg-gray-100 text-gray-800"
  };

  return (
    <Badge variant="secondary" className={statusStyles[status]}>
      {children}
    </Badge>
  );
}

// Standard grid layouts
export function GridLayout({ children, cols = 3 }: { children: ReactNode; cols?: number }) {
  const gridClasses = {
    1: "grid-cols-1",
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
  };

  return (
    <div className={cn("grid gap-8 md:gap-6", gridClasses[cols as keyof typeof gridClasses])}>
      {children}
    </div>
  );
}

// Standard empty state
interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-6">
      <div className="text-gray-400">
        {icon}
      </div>
      <div className="space-y-3">
        <h3 className={cn(typography.heading3)}>{title}</h3>
        <p className={cn(typography.bodySmall, "max-w-md text-muted-foreground")}>{description}</p>
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}