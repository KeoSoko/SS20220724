import React from "react";
import { motion, PanInfo, useMotionValue, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

interface SwipeAction {
  icon: React.ReactNode;
  onClick: () => void;
  color: string;
  label: string;
}

interface SwipeableProps {
  children: React.ReactNode;
  leftActions?: SwipeAction[];
  rightActions?: SwipeAction[];
  threshold?: number;
  className?: string;
  disabled?: boolean;
}

export function Swipeable({
  children,
  leftActions = [],
  rightActions = [],
  threshold = 80,
  className,
  disabled = false
}: SwipeableProps) {
  const [isRevealed, setIsRevealed] = React.useState<'left' | 'right' | null>(null);
  const x = useMotionValue(0);
  const background = useTransform(
    x,
    [-threshold, 0, threshold],
    ['rgba(239, 68, 68, 0.1)', 'rgba(255, 255, 255, 0)', 'rgba(34, 197, 94, 0.1)']
  );

  const handleDragEnd = (event: any, info: PanInfo) => {
    if (disabled) return;

    const offset = info.offset.x;
    const velocity = info.velocity.x;

    // Determine if swipe threshold was met
    if (Math.abs(offset) > threshold || Math.abs(velocity) > 500) {
      if (offset > 0 && rightActions.length > 0) {
        setIsRevealed('right');
      } else if (offset < 0 && leftActions.length > 0) {
        setIsRevealed('left');
      } else {
        x.set(0);
      }
    } else {
      x.set(0);
    }
  };

  const handleActionClick = (action: SwipeAction) => {
    action.onClick();
    setIsRevealed(null);
    x.set(0);
  };

  const reset = () => {
    setIsRevealed(null);
    x.set(0);
  };

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* Background Actions */}
      {isRevealed === 'left' && leftActions.length > 0 && (
        <motion.div
          className="absolute inset-y-0 left-0 flex items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {leftActions.map((action, index) => (
            <button
              key={index}
              onClick={() => handleActionClick(action)}
              className="h-full px-4 flex items-center justify-center text-white font-medium"
              style={{ backgroundColor: action.color }}
              aria-label={action.label}
            >
              {action.icon}
            </button>
          ))}
        </motion.div>
      )}

      {isRevealed === 'right' && rightActions.length > 0 && (
        <motion.div
          className="absolute inset-y-0 right-0 flex items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {rightActions.map((action, index) => (
            <button
              key={index}
              onClick={() => handleActionClick(action)}
              className="h-full px-4 flex items-center justify-center text-white font-medium"
              style={{ backgroundColor: action.color }}
              aria-label={action.label}
            >
              {action.icon}
            </button>
          ))}
        </motion.div>
      )}

      {/* Main Content */}
      <motion.div
        drag={disabled ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        style={{ 
          x: isRevealed ? (isRevealed === 'left' ? leftActions.length * 80 : -rightActions.length * 80) : x,
          background 
        }}
        className="relative z-10 bg-background"
        whileTap={{ scale: 0.98 }}
      >
        {children}
      </motion.div>

      {/* Overlay to close when clicking outside */}
      {isRevealed && (
        <div 
          className="fixed inset-0 z-0 bg-black/10" 
          onClick={reset}
        />
      )}
    </div>
  );
}

// Quick swipe actions for receipts
export const useReceiptSwipeActions = (
  receiptId: number,
  onEdit: (id: number) => void,
  onDelete: (id: number) => void,
  onTag: (id: number) => void
) => {
  return {
    leftActions: [
      {
        icon: <span className="text-sm">✏️</span>,
        onClick: () => onEdit(receiptId),
        color: '#3b82f6',
        label: 'Edit receipt'
      }
    ],
    rightActions: [
      {
        icon: <span className="text-sm">🏷️</span>,
        onClick: () => onTag(receiptId),
        color: '#8b5cf6',
        label: 'Add tags'
      },
      {
        icon: <span className="text-sm">🗑️</span>,
        onClick: () => onDelete(receiptId),
        color: '#ef4444',
        label: 'Delete receipt'
      }
    ]
  };
};