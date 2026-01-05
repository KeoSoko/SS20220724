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
  HelpCircle,
  Zap,
  Building2,
  Users,
  Wrench,
  Bus,
  Fuel,
  Smartphone,
  Tv,
  Shield,
  Plane,
  Shirt,
  Sparkles,
  Gift,
  Heart,
  Users2,
  BatteryCharging,
  MoreHorizontal,
  Mail
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

// Category icon mapping with consistent styling - South African expense categories
const getCategoryIcon = (category: string) => {
  const iconClass = "h-5 w-5";
  const cat = category.toLowerCase();
  
  // Groceries & Food
  if (cat === 'groceries') {
    return <ShoppingBag className={cn(iconClass, "text-green-600")} />;
  }
  if (cat === 'dining_takeaways' || cat === 'dining' || cat === 'food') {
    return <Utensils className={cn(iconClass, "text-orange-600")} />;
  }
  
  // Utilities & Home
  if (cat === 'electricity_water') {
    return <Zap className={cn(iconClass, "text-yellow-600")} />;
  }
  if (cat === 'municipal_rates_taxes') {
    return <Building2 className={cn(iconClass, "text-slate-600")} />;
  }
  if (cat === 'rent_bond') {
    return <HomeIcon className={cn(iconClass, "text-amber-600")} />;
  }
  if (cat === 'domestic_help_home_services') {
    return <Users className={cn(iconClass, "text-teal-600")} />;
  }
  if (cat === 'home_maintenance') {
    return <Wrench className={cn(iconClass, "text-gray-600")} />;
  }
  
  // Transport
  if (cat === 'transport_public_taxi' || cat === 'transport') {
    return <Bus className={cn(iconClass, "text-blue-600")} />;
  }
  if (cat === 'fuel') {
    return <Fuel className={cn(iconClass, "text-red-600")} />;
  }
  if (cat === 'vehicle_maintenance_licensing') {
    return <Car className={cn(iconClass, "text-red-500")} />;
  }
  
  // Communications & Subscriptions
  if (cat === 'airtime_data_internet' || cat === 'telecommunications') {
    return <Smartphone className={cn(iconClass, "text-cyan-600")} />;
  }
  if (cat === 'subscriptions') {
    return <Tv className={cn(iconClass, "text-purple-600")} />;
  }
  
  // Insurance & Health
  if (cat === 'insurance') {
    return <Shield className={cn(iconClass, "text-blue-700")} />;
  }
  if (cat === 'pharmacy_medication' || cat === 'medical' || cat === 'health' || cat === 'healthcare') {
    return <Pill className={cn(iconClass, "text-pink-600")} />;
  }
  
  // Education
  if (cat === 'education_courses' || cat === 'education') {
    return <GraduationCap className={cn(iconClass, "text-indigo-600")} />;
  }
  
  // Entertainment & Travel
  if (cat === 'entertainment') {
    return <Sparkles className={cn(iconClass, "text-pink-500")} />;
  }
  if (cat === 'travel_accommodation' || cat === 'travel') {
    return <Plane className={cn(iconClass, "text-sky-600")} />;
  }
  
  // Shopping & Personal
  if (cat === 'clothing_shopping' || cat === 'shopping' || cat === 'retail') {
    return <Shirt className={cn(iconClass, "text-violet-600")} />;
  }
  if (cat === 'personal_care_beauty' || cat === 'personal_care') {
    return <Sparkles className={cn(iconClass, "text-rose-500")} />;
  }
  
  // Gifts & Donations
  if (cat === 'gifts_celebrations' || cat === 'gifts') {
    return <Gift className={cn(iconClass, "text-red-500")} />;
  }
  if (cat === 'donations_tithes' || cat === 'donations') {
    return <Heart className={cn(iconClass, "text-rose-600")} />;
  }
  
  // Family & Support
  if (cat === 'family_support_remittances') {
    return <Users2 className={cn(iconClass, "text-emerald-600")} />;
  }
  
  // Load shedding (SA specific)
  if (cat === 'load_shedding_costs') {
    return <BatteryCharging className={cn(iconClass, "text-yellow-500")} />;
  }
  
  // Business
  if (cat === 'business' || cat === 'office') {
    return <Briefcase className={cn(iconClass, "text-purple-600")} />;
  }
  
  // Other/Default
  if (cat === 'other') {
    return <MoreHorizontal className={cn(iconClass, "text-gray-500")} />;
  }
  
  // Fallback for custom categories
  return <ReceiptIcon className={cn(iconClass, "text-gray-600")} />;
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
    source?: string | null;
  };
  onClick?: () => void;
  onLongPress?: () => void;
  className?: string;
}

export function EnhancedReceiptCard({ receipt, onClick, onLongPress, className, showCategory = true }: EnhancedReceiptCardProps & { showCategory?: boolean }) {
  const confidence = getConfidenceLevel(receipt.confidenceScore);
  const longPressTimer = React.useRef<NodeJS.Timeout | null>(null);
  const isLongPress = React.useRef(false);
  
  const handleTouchStart = () => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      if (onLongPress) {
        onLongPress();
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }
    }, 500);
  };
  
  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };
  
  const handleClick = (e: React.MouseEvent) => {
    if (isLongPress.current) {
      e.preventDefault();
      return;
    }
    if (onClick) {
      onClick();
    }
  };
  
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
          "p-4 border border-gray-200 hover:border-primary/30 hover:shadow-lg transition-all duration-300 cursor-pointer group",
          "bg-white rounded-none shadow-sm hover:shadow-md",
          className
        )}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onMouseDown={handleTouchStart}
        onMouseUp={handleTouchEnd}
        onMouseLeave={handleTouchEnd}
        data-testid={`receipt-card-${receipt.id}`}
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-primary/10 to-primary/5 rounded-none flex items-center justify-center group-hover:from-primary/20 group-hover:to-primary/10 transition-colors">
            {getCategoryIcon(receipt.category)}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 text-base leading-tight group-hover:text-primary transition-colors" data-testid={`receipt-storename-${receipt.id}`}>
                  {receipt.storeName || 'Unknown Store'}
                </h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <p className="text-sm text-gray-500" data-testid={`receipt-date-${receipt.id}`}>
                    {format(parseISO(receipt.date), 'MMM dd, yyyy')}
                  </p>
                  {receipt.source === 'email' && (
                    <Badge 
                      variant="outline" 
                      className="text-[10px] px-1.5 py-0 h-4 flex items-center gap-0.5 bg-blue-50 text-blue-700 border-blue-200"
                      data-testid={`receipt-source-email-${receipt.id}`}
                    >
                      <Mail className="h-2.5 w-2.5" />
                      <span className="hidden sm:inline">via Email</span>
                    </Badge>
                  )}
                  {confidence.level && (
                    <Badge 
                      variant="outline" 
                      className={cn("text-[10px] px-1.5 py-0 h-4 flex items-center gap-0.5", confidence.color)}
                    >
                      {confidence.icon}
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="text-right flex-shrink-0 flex flex-col items-end">
                <div className="font-bold text-lg text-primary whitespace-nowrap" data-testid={`receipt-amount-${receipt.id}`}>
                  R{parseFloat(receipt.total.toString()).toFixed(2)}
                </div>
                {showCategory && (
                  <Badge variant="secondary" className="text-[10px] bg-gray-100 text-gray-600 border-gray-200 mt-1 font-normal" data-testid={`receipt-category-${receipt.id}`}>
                    {receipt.category.replace(/_/g, ' ')}
                  </Badge>
                )}
              </div>
            </div>
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