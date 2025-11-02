import React from "react";
import { motion } from "framer-motion";
import { Plus, Camera, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

interface FloatingActionButtonProps {
  className?: string;
}

export function FloatingActionButton({ className }: FloatingActionButtonProps) {
  const [, setLocation] = useLocation();
  const [isExpanded, setIsExpanded] = React.useState(false);

  const handleQuickUpload = () => {
    setLocation("/upload");
  };

  const handleCameraCapture = () => {
    setLocation("/upload?mode=camera");
  };

  const actions = [
    {
      icon: <Camera className="h-5 w-5" />,
      label: "Scan Receipt",
      onClick: handleCameraCapture,
      color: "bg-blue-600 hover:bg-blue-700"
    },
    {
      icon: <Upload className="h-5 w-5" />,
      label: "Upload File",
      onClick: handleQuickUpload,
      color: "bg-green-600 hover:bg-green-700"
    }
  ];

  return (
    <div className={cn("fixed bottom-6 right-6 z-40 md:z-50", className)}>
      {/* Action Buttons */}
      <motion.div
        className="mb-4 space-y-3"
        animate={{
          opacity: isExpanded ? 1 : 0,
          scale: isExpanded ? 1 : 0.8,
          y: isExpanded ? 0 : 20
        }}
        transition={{ duration: 0.2, staggerChildren: 0.1 }}
      >
        {actions.map((action, index) => (
          <motion.div
            key={action.label}
            initial={{ opacity: 0, x: 50 }}
            animate={{
              opacity: isExpanded ? 1 : 0,
              x: isExpanded ? 0 : 50
            }}
            transition={{ delay: index * 0.1 }}
          >
            <Button
              onClick={action.onClick}
              className={cn(
                "h-12 w-12 rounded-md shadow-lg transition-all duration-200",
                action.color
              )}
              size="sm"
              aria-label={action.label}
            >
              {action.icon}
            </Button>
            <span className="absolute right-14 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-90">
              {action.label}
            </span>
          </motion.div>
        ))}
      </motion.div>

      {/* Main FAB */}
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            "h-14 w-14 rounded-sm shadow-xl transition-all duration-300",
            "bg-primary hover:bg-primary/90 text-primary-foreground",
            "focus:ring-4 focus:ring-primary/30"
          )}
          aria-label="Add receipt"
          aria-expanded={isExpanded}
        >
          <motion.div
            animate={{ rotate: isExpanded ? 45 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <Plus className="h-6 w-6" />
          </motion.div>
        </Button>
      </motion.div>
    </div>
  );
}

// Mini FAB for specific contexts
interface MiniFabProps {
  icon: React.ReactNode;
  onClick: () => void;
  label: string;
  variant?: "primary" | "secondary";
  className?: string;
}

export function MiniFab({ 
  icon, 
  onClick, 
  label, 
  variant = "primary", 
  className 
}: MiniFabProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={className}
    >
      <Button
        onClick={onClick}
        className={cn(
          "h-12 w-12 rounded-sm shadow-lg transition-all duration-200",
          variant === "primary" 
            ? "bg-primary hover:bg-primary/90 text-primary-foreground"
            : "bg-secondary hover:bg-secondary/90 text-secondary-foreground"
        )}
        size="sm"
        aria-label={label}
      >
        {icon}
      </Button>
    </motion.div>
  );
}