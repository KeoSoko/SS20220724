import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, ArrowLeft, CheckCircle, XCircle, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function ResetPasswordPage() {
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [tokenExpired, setTokenExpired] = useState(false);

  // Extract token from URL query parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const resetToken = urlParams.get('token');
    if (resetToken) {
      setToken(resetToken);
    } else {
      toast({
        title: "Invalid Reset Link",
        description: "This password reset link is invalid or you arrived here without a proper reset token. Please request a new password reset from the sign-in page.",
        variant: "destructive",
        duration: 8000
      });
      setTimeout(() => setLocation("/auth"), 4000);
    }
  }, [toast, setLocation]);

  // Password reset form schema
  const resetSchema = z.object({
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  }).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

  const resetForm = useForm({
    resolver: zodResolver(resetSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  // Handle password reset
  const onResetSubmit = async (data: z.infer<typeof resetSchema>) => {
    if (!token) return;
    
    setIsSubmitting(true);
    
    try {
      const response = await fetch("/api/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          newPassword: data.password
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        
        // Use the detailed error message from server
        const errorMessage = errorData.message || errorData.error || "Failed to reset password";
        const userAction = errorData.userAction || "Please try again or contact support if the problem persists.";
        
        throw new Error(`${errorMessage} ${userAction}`);
      }

      const result = await response.json();
      
      setIsSuccess(true);
      toast({
        title: "Password Reset Successful",
        description: "Your password has been updated. You can now sign in with your new password.",
      });
      
      // Redirect to login after 3 seconds
      setTimeout(() => setLocation("/auth"), 3000);
    } catch (error: any) {
      const errorMessage = error.message || "Failed to reset password. The link may be expired.";
      
      // Check if error indicates expired/invalid token
      if (errorMessage.includes("expired") || errorMessage.includes("invalid") || errorMessage.includes("Reset link")) {
        setTokenExpired(true);
      }
      
      toast({
        title: "Password Reset Failed",
        description: errorMessage,
        variant: "destructive",
        duration: 7000  // Show longer for detailed error messages
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        {/* Premium gradient background */}
        <div 
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, 
              #ffffff 0%, 
              #f8f9fa 25%, 
              #e8f4f8 50%, 
              #d1e7dd 75%, 
              #E5E6E7 100%)`
          }}
        />
        
        <div className="relative z-10 w-full max-w-md">
          <Card className="shadow-xl border-0 bg-white/90 backdrop-blur-sm">
            <CardContent className="pt-8 text-center">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Password Reset Successful</h2>
              <p className="text-gray-600 mb-6">
                Your password has been updated successfully. You will be redirected to the sign-in page.
              </p>
              <Button
                onClick={() => setLocation("/auth")}
                className="w-full bg-primary hover:bg-primary/90"
              >
                Go to Sign In
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Premium gradient background */}
      <div 
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, 
            #ffffff 0%, 
            #f8f9fa 25%, 
            #e8f4f8 50%, 
            #d1e7dd 75%, 
            #E5E6E7 100%)`
        }}
      />
      
      <div className="relative z-10 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-6">
            <img 
              src="/attached_assets/SIMPLE-slips.svg" 
              alt="SIMPLE SLIPS" 
              className="h-16"
            />
          </div>
          <p className="text-gray-600">Reset your password to continue.</p>
        </div>

        {/* Back button */}
        <Button
          variant="ghost"
          onClick={() => setLocation("/auth")}
          className="mb-4 hover:bg-white/50"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Sign In
        </Button>

        {/* Reset Password Card */}
        <Card className="shadow-xl border-0 bg-white/90 backdrop-blur-sm">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl text-center text-gray-900 flex items-center justify-center gap-2">
              <KeyRound className="h-6 w-6 text-primary" />
              Reset Password
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...resetForm}>
              <form onSubmit={resetForm.handleSubmit(onResetSubmit)} className="space-y-4">
                <FormField
                  control={resetForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter your new password"
                            className="bg-white border-gray-200 pr-10"
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4 text-gray-400" />
                            ) : (
                              <Eye className="h-4 w-4 text-gray-400" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={resetForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm New Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="Confirm your new password"
                            className="bg-white border-gray-200 pr-10"
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-4 w-4 text-gray-400" />
                            ) : (
                              <Eye className="h-4 w-4 text-gray-400" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full text-white py-6 bg-primary hover:bg-primary/90"
                  disabled={isSubmitting || tokenExpired}
                >
                  {isSubmitting ? "Resetting Password..." : "Reset Password"}
                </Button>
                
                {tokenExpired && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 text-red-800 mb-2">
                      <XCircle className="h-5 w-5" />
                      <span className="font-medium">Reset Link Expired</span>
                    </div>
                    <p className="text-red-700 text-sm mb-3">
                      This password reset link has expired or is no longer valid. You'll need to request a new one.
                    </p>
                    <Button
                      onClick={() => setLocation("/auth")}
                      variant="outline"
                      className="w-full border-red-300 text-red-700 hover:bg-red-50"
                    >
                      Request New Reset Link
                    </Button>
                  </div>
                )}
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-gray-500">
          Your new password must be at least 6 characters long
        </div>
      </div>
    </div>
  );
}