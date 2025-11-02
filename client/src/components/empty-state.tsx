import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Card className="border-dashed border-2 border-gray-300">
      <CardContent className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <div className="w-16 h-16 flex items-center justify-center bg-gray-100 rounded-2xl mb-4 text-gray-400">
          {icon}
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        {description && (
          <p className="text-sm text-gray-600 mb-6 max-w-sm">{description}</p>
        )}
        {action}
      </CardContent>
    </Card>
  );
}

export function ReceiptIllustration() {
  return (
    <svg 
      width="32" 
      height="32" 
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className="text-gray-400"
    >
      <path 
        d="M9 2V4H15V2H17V4H19C20.1 4 21 4.9 21 6V20C21 21.1 20.1 22 19 22H5C3.9 22 3 21.1 3 20V6C3 4.9 3.9 4 5 4H7V2H9ZM19 8H5V20H19V8ZM7 10H17V12H7V10ZM7 14H17V16H7V14Z" 
        fill="currentColor"
      />
    </svg>
  );
}