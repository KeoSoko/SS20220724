import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { PageLayout } from "@/components/page-layout";
import { BackButton } from "@/components/back-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Edit, Trash2, Tag, Palette } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { EXPENSE_CATEGORIES, EXPENSE_SUBCATEGORIES } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";

// Form schema for creating/editing custom categories
const customCategorySchema = z.object({
  name: z.string()
    .min(1, "Category name is required")
    .max(50, "Category name must be less than 50 characters")
    .regex(/^[a-zA-Z0-9_\s]+$/, "Category name can only contain letters, numbers, underscores, and spaces"),
  displayName: z.string()
    .min(1, "Display name is required")
    .max(50, "Display name must be less than 50 characters"),
  description: z.string().max(200, "Description must be less than 200 characters").optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, "Color must be a valid hex color").default("#6B7280"),
  icon: z.string().max(50, "Icon name must be less than 50 characters").optional(),
});

type CustomCategoryForm = z.infer<typeof customCategorySchema>;

// Color palette for category selection
const CATEGORY_COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#84CC16", "#22C55E", "#10B981",
  "#06B6D4", "#3B82F6", "#6366F1", "#8B5CF6", "#A855F7", "#EC4899",
  "#F43F5E", "#6B7280", "#374151", "#1F2937"
];

const ContentCard = ({ className, children }: { className?: string, children: React.ReactNode }) => {
  return (
    <Card className={cn("w-full", className)}>
      {children}
    </Card>
  );
};

export default function CategoriesPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Form setup
  const form = useForm<CustomCategoryForm>({
    resolver: zodResolver(customCategorySchema),
    defaultValues: {
      name: "",
      displayName: "",
      description: "",
      color: "#6B7280",
      icon: "",
    },
  });

  // Query for custom categories
  const { data: customCategories = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/custom-categories"],
  });

  // Create category mutation
  const createCategoryMutation = useMutation({
    mutationFn: async (data: CustomCategoryForm) => {
      return await apiRequest("POST", "/api/custom-categories", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-categories"] });
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: "Category created successfully",
        description: "Your custom category has been added to your account",
      });
      
      // Check if user came from upload page with saved state
      const hasSavedUploadState = sessionStorage.getItem('upload_receipt_form_state');
      if (hasSavedUploadState) {
        // Show success and suggest returning to upload
        setTimeout(() => {
          toast({
            title: "Return to upload?",
            description: "Your receipt is still waiting. Navigate back to continue uploading.",
          });
        }, 1500);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create category",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update category mutation
  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<CustomCategoryForm> }) => {
      return await apiRequest("PATCH", `/api/custom-categories/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-categories"] });
      setIsDialogOpen(false);
      setEditingCategory(null);
      form.reset();
      toast({
        title: "Category updated successfully",
        description: "Your custom category has been updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update category",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete category mutation
  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/custom-categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-categories"] });
      toast({
        title: "Category deleted successfully",
        description: "Your custom category has been removed",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete category",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: CustomCategoryForm) => {
    if (editingCategory) {
      updateCategoryMutation.mutate({ id: editingCategory.id, data });
    } else {
      createCategoryMutation.mutate(data);
    }
  };

  const handleEdit = (category: any) => {
    setEditingCategory(category);
    form.reset({
      name: category.name,
      displayName: category.displayName,
      description: category.description || "",
      color: category.color || "#6B7280",
      icon: category.icon || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this category? This action cannot be undone.")) {
      deleteCategoryMutation.mutate(id);
    }
  };

  const resetDialog = () => {
    setIsDialogOpen(false);
    setEditingCategory(null);
    form.reset();
  };

  if (isLoading) {
    return (
      <PageLayout title="Expense Categories">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Expense Categories">
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <BackButton fallbackPath="/profile" />
              <div className="ml-2">
                <h1 className="text-3xl font-bold">Expense Categories</h1>
                <p className="text-gray-500">Manage your expense categories and create custom ones</p>
                {/* Show return to upload link if user has saved receipt state */}
                {typeof window !== 'undefined' && sessionStorage.getItem('upload_receipt_form_state') && (
                  <div className="mt-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => window.location.href = '/upload'}
                      className="text-blue-600 border-blue-600 hover:bg-blue-50"
                    >
                      ← Back to Upload Receipt
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <Button 
              onClick={() => setIsDialogOpen(true)} 
              className="bg-[#0073AA] hover:bg-[#005d87]"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Category
            </Button>
            
            <Dialog open={isDialogOpen} onOpenChange={resetDialog}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {editingCategory ? "Edit Category" : "Create Custom Category"}
                  </DialogTitle>
                  <DialogDescription>
                    {editingCategory 
                      ? "Update your custom expense category details"
                      : "Create a new custom expense category for your receipts"
                    }
                  </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="displayName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Display Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Pet Expenses" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Internal Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., pet_expenses" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description (Optional)</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Brief description of this category..."
                              className="resize-none"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="color"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Color</FormLabel>
                          <FormControl>
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-2">
                                {CATEGORY_COLORS.map((color) => (
                                  <button
                                    key={color}
                                    type="button"
                                    className={`w-8 h-8 rounded-none border-2 ${
                                      field.value === color ? "border-gray-900" : "border-gray-300"
                                    }`}
                                    style={{ backgroundColor: color }}
                                    onClick={() => field.onChange(color)}
                                  />
                                ))}
                              </div>
                              <Input 
                                placeholder="#6B7280" 
                                {...field}
                                className="font-mono text-sm"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={resetDialog}>
                        Cancel
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={createCategoryMutation.isPending || updateCategoryMutation.isPending}
                        className="bg-[#0073AA] hover:bg-[#005d87]"
                      >
                        {editingCategory ? "Update Category" : "Create Category"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-8">
            {/* Default Categories */}
            <ContentCard className="p-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">Default Categories</h2>
                  <p className="text-gray-600 text-sm">
                    These are the built-in expense categories optimized for South African businesses and services.
                  </p>
                </div>
                <div className={cn(
                  "grid gap-3",
                  isMobile ? "grid-cols-1" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                )}>
                  {EXPENSE_CATEGORIES.map((category) => (
                    <div key={category} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-none">
                      <Tag className="h-4 w-4 text-gray-500 flex-shrink-0" />
                      <span className="capitalize text-sm font-medium">
                        {category.replace(/_/g, " ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </ContentCard>

            {/* Custom Categories */}
            <ContentCard className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <h2 className="text-xl font-semibold">Your Custom Categories</h2>
                    <p className="text-gray-600 text-sm">
                      Create custom categories for expenses that don't fit into the default categories.
                    </p>
                  </div>

                </div>

                {customCategories.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Tag className="h-12 w-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No custom categories yet</h3>
                      <p className="text-gray-500 text-center mb-4">
                        Create your first custom category to organize expenses that don't fit the default categories.
                      </p>
                      <Button onClick={() => setIsDialogOpen(true)} className="bg-[#0073AA] hover:bg-[#005d87]">
                        <Plus className="h-4 w-4 mr-2" />
                        Create First Category
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {customCategories.map((category: any) => (
                      <Card key={category.id} className="relative">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <div 
                                className="w-4 h-4 rounded-none border flex-shrink-0"
                                style={{ backgroundColor: category.color }}
                              />
                              <CardTitle className="text-lg">{category.displayName}</CardTitle>
                            </div>
                            <div className="flex space-x-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(category)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(category.id)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <Badge variant="secondary" className="mb-2">
                            {category.name}
                          </Badge>
                          {category.description && (
                            <CardDescription className="text-sm">
                              {category.description}
                            </CardDescription>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </ContentCard>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}