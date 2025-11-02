import React from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { 
  Plus, 
  FileSearch, 
  Utensils, 
  ShoppingBag, 
  Receipt as ReceiptIcon,
  Car,
  Home as HomeIcon,
  Briefcase,
  Pill,
  GraduationCap,
  CheckCircle,
  AlertTriangle,
  HelpCircle
} from "lucide-react";

// Enhanced Button with proper feedback states
interface EnhancedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  className?: string;
  isPrimary?: boolean;
}

export const EnhancedButton = React.forwardRef<HTMLButtonElement, EnhancedButtonProps>(
  ({ variant = 'default', size = 'md', children, className, isPrimary = false, ...props }, ref) => {
    const baseClasses = "transition-all duration-200 active:scale-95 focus:ring-2 focus:ring-offset-2 font-medium rounded-sm inline-flex items-center justify-center";
    
    const variants = {
      default: "bg-background border border-input hover:bg-accent focus:ring-primary/50",
      primary: "bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/40 hover:bg-primary/90 focus:ring-primary/50",
      success: "bg-green-600 text-white hover:bg-green-700 focus:ring-green-500/50",
      warning: "bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-500/50",
      danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500/50"
    };

    const sizes = {
      sm: "h-8 px-3 text-sm min-w-[32px]",
      md: "h-10 px-4 text-sm min-w-[40px]",
      lg: "h-12 px-6 text-base min-w-[48px]"
    };

    return (
      <button
        ref={ref}
        className={cn(
          baseClasses,
          variants[variant],
          sizes[size],
          isPrimary && variants.primary,
          className
        )}
        style={{ minHeight: '48px', minWidth: '48px' }}
        {...props}
      >
        {children}
      </button>
    );
  }
);

EnhancedButton.displayName = "EnhancedButton";

// Category icon mapping with consistent styling
const getCategoryIcon = (category: string) => {
  const iconClass = "h-5 w-5";
  
  switch(category.toLowerCase()) {
    case 'food':
    case 'dining':
    case 'groceries':
      return <Utensils className={cn(iconClass, "text-green-600")} />;
    case 'shopping':
    case 'retail':
      return <ShoppingBag className={cn(iconClass, "text-blue-600")} />;
    case 'transport':
    case 'fuel':
      return <Car className={cn(iconClass, "text-red-600")} />;
    case 'home':
    case 'utilities':
      return <HomeIcon className={cn(iconClass, "text-amber-600")} />;
    case 'business':
    case 'office':
      return <Briefcase className={cn(iconClass, "text-purple-600")} />;
    case 'health':
    case 'medical':
      return <Pill className={cn(iconClass, "text-pink-600")} />;
    case 'education':
      return <GraduationCap className={cn(iconClass, "text-indigo-600")} />;
    default:
      return <ReceiptIcon className={cn(iconClass, "text-gray-600")} />;
  }
};

// Confidence level helper
const getConfidenceLevel = (score?: string | null): { level: 'high' | 'medium' | 'low' | null; label: string; icon: React.ReactNode; color: string } => {
  if (!score) return { level: null, label: '', icon: null, color: '' };
  
  const numericScore = parseFloat(score);
  
  if (numericScore >= 0.8) {
    return {
      level: 'high',
      label: 'High Confidence',
      icon: <CheckCircle className="h-3 w-3" />,
      color: 'bg-green-100 text-green-800 border-green-200'
    };
  } else if (numericScore >= 0.6) {
    return {
      level: 'medium',
      label: 'Medium Confidence',
      icon: <AlertTriangle className="h-3 w-3" />,
      color: 'bg-amber-100 text-amber-800 border-amber-200'
    };
  } else {
    return {
      level: 'low',
      label: 'Needs Review',
      icon: <HelpCircle className="h-3 w-3" />,
      color: 'bg-red-100 text-red-800 border-red-200'
    };
  }
};

// Enhanced Receipt Card with improved visual hierarchy
interface EnhancedReceiptCardProps {
  receipt: {
    id: number;
    storeName: string;
    total: number;
    date: string;
    category: string;
    confidenceScore?: string | null;
  };
  onClick?: () => void;
  className?: string;
}

export function EnhancedReceiptCard({ receipt, onClick, className }: EnhancedReceiptCardProps) {
  const confidence = getConfidenceLevel(receipt.confidenceScore);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -2 }}
    >
      <Card 
        className={cn(
          "p-5 border border-gray-200 hover:border-primary/30 hover:shadow-lg transition-all duration-300 cursor-pointer group",
          "bg-white rounded-none shadow-sm hover:shadow-md",
          className
        )}
        onClick={onClick}
      >
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-primary/10 to-primary/5 rounded-none flex items-center justify-center group-hover:from-primary/20 group-hover:to-primary/10 transition-colors">
            {getCategoryIcon(receipt.category)}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 text-lg truncate group-hover:text-primary transition-colors">
                {receipt.storeName}
              </h3>
              {confidence.level && (
                <Badge 
                  variant="outline" 
                  className={cn("text-[10px] px-1.5 py-0 h-5 flex items-center gap-1", confidence.color)}
                >
                  {confidence.icon}
                  <span className="hidden sm:inline">{confidence.level === 'low' ? 'Review' : confidence.level}</span>
                </Badge>
              )}
            </div>
            <p className="text-sm text-gray-500 truncate mt-1">
              {format(parseISO(receipt.date), 'MMM dd, yyyy')}
            </p>
          </div>
          
          <div className="text-right">
            <div className="font-bold text-xl text-gray-900 whitespace-nowrap">
              R{parseFloat(receipt.total.toString()).toFixed(2)}
            </div>
            <Badge variant="secondary" className="text-xs mt-1 bg-primary/10 text-primary border-primary/20">
              {receipt.category}
            </Badge>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

// Enhanced Empty State component
interface EnhancedEmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  searchQuery?: string;
}

export function EnhancedEmptyState({ 
  icon = <FileSearch className="mx-auto h-12 w-12 text-muted-foreground" />,
  title,
  description,
  actionLabel,
  onAction,
  searchQuery
}: EnhancedEmptyStateProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="text-center py-12 px-4"
    >
      <div className="mb-4">
        {icon}
      </div>
      
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        {title}
      </h3>
      
      <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
        {description}
      </p>
      
      {actionLabel && onAction && (
        <EnhancedButton
          variant="primary"
          onClick={onAction}
          className="mx-auto"
        >
          <Plus className="mr-2 h-4 w-4" />
          {actionLabel}
        </EnhancedButton>
      )}
    </motion.div>
  );
}

// Enhanced Loading State with consistent spacing
export function EnhancedLoadingState() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="animate-pulse">
          <div className="bg-gray-200 rounded-none h-20 mb-4"></div>
        </div>
      ))}
    </div>
  );
}

// Enhanced Success/Error Toast States
interface ToastStateProps {
  type: 'success' | 'error' | 'warning';
  title: string;
  description?: string;
}

export function ToastState({ type, title, description }: ToastStateProps) {
  const styles = {
    success: "border-green-200 bg-green-50 text-green-800",
    error: "border-red-200 bg-red-50 text-red-800", 
    warning: "border-amber-200 bg-amber-50 text-amber-800"
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 100 }}
      className={cn("p-4 rounded-none border", styles[type])}
    >
      <h4 className="font-medium">{title}</h4>
      {description && (
        <p className="text-sm mt-1 opacity-90">{description}</p>
      )}
    </motion.div>
  );
}

// Enhanced spacing system component
export function SpacingContainer({ children, size = 'md' }: { 
  children: React.ReactNode; 
  size?: 'sm' | 'md' | 'lg' 
}) {
  const spacing = {
    sm: 'space-y-2',
    md: 'space-y-4', 
    lg: 'space-y-6'
  };

  return (
    <div className={spacing[size]}>
      {children}
    </div>
  );
}