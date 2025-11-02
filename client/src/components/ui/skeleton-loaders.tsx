import ContentLoader from "react-content-loader";
import { cn } from "@/lib/utils";

// Base skeleton component with consistent styling
const BaseSkeleton = ({ 
  className, 
  children, 
  ...props 
}: React.ComponentProps<typeof ContentLoader>) => (
  <ContentLoader
    speed={2}
    width="100%"
    height="100%"
    viewBox="0 0 400 160"
    backgroundColor="#f3f4f6"
    foregroundColor="#e5e7eb"
    className={cn("animate-pulse", className)}
    {...props}
  >
    {children}
  </ContentLoader>
);

// Receipt card skeleton for home page and lists
export const ReceiptCardSkeleton = ({ className }: { className?: string }) => (
  <div className={cn("rounded-none border bg-card p-4 space-y-3", className)}>
    <BaseSkeleton viewBox="0 0 400 120">
      <rect x="0" y="0" rx="4" ry="4" width="100" height="16" />
      <rect x="0" y="25" rx="3" ry="3" width="200" height="12" />
      <rect x="0" y="45" rx="3" ry="3" width="150" height="12" />
      <rect x="0" y="70" rx="6" ry="6" width="80" height="24" />
      <rect x="320" y="0" rx="4" ry="4" width="80" height="20" />
      <rect x="320" y="30" rx="3" ry="3" width="60" height="14" />
    </BaseSkeleton>
  </div>
);

// Analytics chart skeleton
export const ChartSkeleton = ({ className }: { className?: string }) => (
  <div className={cn("rounded-none border bg-card p-6", className)}>
    <BaseSkeleton viewBox="0 0 400 250">
      <rect x="0" y="0" rx="4" ry="4" width="120" height="16" />
      <circle cx="200" cy="140" r="80" />
      <rect x="10" y="230" rx="3" ry="3" width="60" height="12" />
      <rect x="80" y="230" rx="3" ry="3" width="60" height="12" />
      <rect x="150" y="230" rx="3" ry="3" width="60" height="12" />
    </BaseSkeleton>
  </div>
);

// Profile section skeleton
export const ProfileSkeleton = ({ className }: { className?: string }) => (
  <div className={cn("rounded-none border bg-card p-6 space-y-4", className)}>
    <BaseSkeleton viewBox="0 0 400 100">
      <circle cx="40" cy="40" r="30" />
      <rect x="85" y="20" rx="4" ry="4" width="150" height="16" />
      <rect x="85" y="45" rx="3" ry="3" width="100" height="12" />
    </BaseSkeleton>
  </div>
);

// Upload form skeleton
export const UploadFormSkeleton = ({ className }: { className?: string }) => (
  <div className={cn("rounded-none border bg-card p-6 space-y-6", className)}>
    <BaseSkeleton viewBox="0 0 400 200">
      <rect x="0" y="0" rx="4" ry="4" width="100" height="16" />
      <rect x="0" y="30" rx="8" ry="8" width="400" height="80" />
      <rect x="0" y="130" rx="4" ry="4" width="200" height="40" />
      <rect x="220" y="130" rx="4" ry="4" width="180" height="40" />
    </BaseSkeleton>
  </div>
);

// Search results skeleton
export const SearchResultsSkeleton = ({ count = 3, className }: { count?: number; className?: string }) => (
  <div className={cn("space-y-4", className)}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="rounded-none border bg-card p-4">
        <BaseSkeleton viewBox="0 0 400 80">
          <rect x="0" y="0" rx="4" ry="4" width="300" height="16" />
          <rect x="0" y="25" rx="3" ry="3" width="200" height="12" />
          <rect x="0" y="45" rx="3" ry="3" width="120" height="12" />
          <rect x="320" y="0" rx="4" ry="4" width="80" height="16" />
        </BaseSkeleton>
      </div>
    ))}
  </div>
);

// Budget analytics skeleton
export const BudgetSkeleton = ({ className }: { className?: string }) => (
  <div className={cn("rounded-none border bg-card p-6 space-y-4", className)}>
    <BaseSkeleton viewBox="0 0 400 150">
      <rect x="0" y="0" rx="4" ry="4" width="120" height="16" />
      <rect x="0" y="30" rx="8" ry="8" width="400" height="12" />
      <rect x="0" y="50" rx="3" ry="3" width="100" height="12" />
      <rect x="0" y="70" rx="3" ry="3" width="150" height="12" />
      <rect x="0" y="90" rx="3" ry="3" width="80" height="12" />
      <rect x="300" y="30" rx="4" ry="4" width="100" height="20" />
    </BaseSkeleton>
  </div>
);

// Mobile-optimized receipt list skeleton
export const MobileReceiptListSkeleton = ({ count = 5 }: { count?: number }) => (
  <div className="space-y-3 px-4">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="rounded-none border bg-card p-3">
        <BaseSkeleton viewBox="0 0 350 60">
          <rect x="0" y="0" rx="3" ry="3" width="100" height="12" />
          <rect x="0" y="18" rx="3" ry="3" width="150" height="10" />
          <rect x="0" y="35" rx="3" ry="3" width="80" height="10" />
          <rect x="280" y="0" rx="3" ry="3" width="70" height="14" />
          <rect x="280" y="20" rx="3" ry="3" width="50" height="10" />
        </BaseSkeleton>
      </div>
    ))}
  </div>
);

// Category selector skeleton
export const CategorySkeleton = ({ className }: { className?: string }) => (
  <div className={cn("flex flex-wrap gap-2", className)}>
    {Array.from({ length: 6 }).map((_, i) => (
      <BaseSkeleton key={i} viewBox="0 0 80 30" className="w-20 h-8">
        <rect x="0" y="0" rx="15" ry="15" width="80" height="30" />
      </BaseSkeleton>
    ))}
  </div>
);