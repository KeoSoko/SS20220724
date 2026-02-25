import { format } from "date-fns";
import { Link } from "wouter";
import { Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Receipt } from "@shared/schema";

// Category icon mapping
const getCategoryIcon = (category: string) => {
  switch(category) {
    case 'food':
    case 'dining':
      return '🍽️';
    case 'groceries':
      return '🛒';
    default:
      return '🏷️';
  }
};

// Category color mapping
const getCategoryColor = (category: string): string => {
  const colorMap: Record<string, string> = {
    'food': 'bg-orange-100 text-orange-800',
    'groceries': 'bg-green-100 text-green-800',
    'dining': 'bg-red-100 text-red-800',
    'transportation': 'bg-blue-100 text-blue-800',
    'entertainment': 'bg-purple-100 text-purple-800',
    'utilities': 'bg-yellow-100 text-yellow-800',
    'healthcare': 'bg-pink-100 text-pink-800',
    'clothing': 'bg-cyan-100 text-cyan-800',
    'education': 'bg-indigo-100 text-indigo-800',
    'shopping': 'bg-fuchsia-100 text-fuchsia-800',
    'office_supplies': 'bg-teal-100 text-teal-800',
    'personal_care': 'bg-rose-100 text-rose-800',
    'gifts': 'bg-amber-100 text-amber-800',
  };
  
  return colorMap[category] || 'bg-gray-100 text-gray-800';
};

const formatCurrency = (amount: number) => {
  return 'R ' + amount.toFixed(2);
};

interface BulkReceiptCardProps {
  receipt: Receipt;
  bulkMode: boolean;
  isSelected: boolean;
  onToggleSelection: (receiptId: number) => void;
}

export function BulkReceiptCard({ receipt, bulkMode, isSelected, onToggleSelection }: BulkReceiptCardProps) {
  return (
    <div className="relative">
      {bulkMode && (
        <div className="absolute top-3 left-3 z-10">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelection(receipt.id)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      <Link href={`/receipt/${receipt.id}`}>
        <Card className={`cursor-pointer hover:bg-accent/30 transition-colors ${
          bulkMode && isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''
        }`}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div className={bulkMode ? "ml-8" : ""}>
                <CardTitle className="line-clamp-1">
                  {receipt.storeName}
                </CardTitle>
                <CardDescription className="flex items-center mt-1">
                  <Calendar className="h-3 w-3 mr-1" />
                  {format(new Date(receipt.date), "MMM d, yyyy")}
                </CardDescription>
              </div>
              <Badge 
                variant="secondary" 
                className={`${getCategoryColor(receipt.category)}`}
              >
                <span className="mr-1">{getCategoryIcon(receipt.category)}</span>
                <span>
                  {receipt.reportLabel?.trim()
                    ? receipt.reportLabel.trim()
                    : receipt.category.charAt(0).toUpperCase() + receipt.category.slice(1).replace('_', ' ')
                  }
                </span>
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between font-medium text-base">
                <span className="text-muted-foreground">Total:</span>
                <span>{formatCurrency(parseFloat(receipt.total))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items:</span>
                <span>{receipt.items.length}</span>
              </div>
              {receipt.notes && (
                <div className="text-muted-foreground text-xs italic mt-2 line-clamp-1">
                  {receipt.notes}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}