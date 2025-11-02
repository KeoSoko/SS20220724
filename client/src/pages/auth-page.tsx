import React, { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Eye, EyeOff, Receipt, ArrowLeft, CheckCircle, XCircle, AlertCircle, Loader2, Mail, KeyRound, User } from "lucide-react";
// import { useToast } from "@/hooks/use-toast"; // REMOVED - using enhanced error dialogs only
import { useIsMobile } from "@/hooks/use-mobile";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export default function AuthPage() {
  const [location, setLocation] = useLocation();
  const { user, loginMutation, registerMutation } = useAuth();
  // const { toast } = useToast(); // REMOVED - using enhanced error dialogs only

  // Check for verification success message
  React.useEffect(() => {
    const params = new URLSearchParams(location.split('?')[1] || '');
    const verified = params.get('verified');
    const message = params.get('message');

    if (verified === 'true' && message) {
      // Show success with dialog instead of toast
      setErrorDetails({
        title: "Email Verified Successfully!",
        message: decodeURIComponent(message),
        type: 'general'
      });
      setShowErrorDialog(true);
      // Clean up URL parameters
      setLocation('/auth');
    }
  }, [location, setLocation]);
  const isMobile = useIsMobile();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [emailValidation, setEmailValidation] = useState<{
    status: 'idle' | 'checking' | 'available' | 'taken' | 'invalid';
    message?: string;
  }>({ status: 'idle' });
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorDetails, setErrorDetails] = useState<{
    title: string;
    message: string;
    type: 'email' | 'username' | 'general' | 'success';
  } | null>(null);
  const [activeTab, setActiveTab] = useState("login");
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotUsernameEmail, setForgotUsernameEmail] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showForgotUsername, setShowForgotUsername] = useState(false);
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState("");
  const [forgotUsernameMessage, setForgotUsernameMessage] = useState("");
  const [isSubmittingForgot, setIsSubmittingForgot] = useState(false);

  // Email validation mutation
  const emailCheckMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await fetch("/api/check-email", {
        method: "POST",
        body: JSON.stringify({ email }),
        headers: { "Content-Type": "application/json" }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to check email');
      return data;
    },
    onSuccess: (data: any) => {
      setEmailValidation({
        status: data.available ? 'available' : 'taken',
        message: data.message
      });
    },
    onError: (error: any) => {
      setEmailValidation({
        status: 'invalid',
        message: error.message || 'Error checking email'
      });
    }
  });

  // Debounced email validation
  const debouncedEmailCheck = useCallback(
    (() => {
      let timeoutId: NodeJS.Timeout;
      return (email: string) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          if (email && email.includes('@')) {
            setEmailValidation({ status: 'checking' });
            emailCheckMutation.mutate(email);
          } else {
            setEmailValidation({ status: 'idle' });
          }
        }, 500);
      };
    })(),
    [emailCheckMutation]
  );

  // Login form schema
  const loginSchema = z.object({
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required"),
  });

  // Register form schema
  const registerSchema = z.object({
    username: z.string().min(3, "Username must be at least 3 characters"),
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
    promoCode: z.string().optional(),
  }).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

  // Forms
  const loginForm = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const registerForm = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      promoCode: "",
    },
  });

  // Redirect if already logged in
  if (user) {
    setTimeout(() => setLocation("/home"), 0);
    return null;
  }

  // Handle login
  const onLoginSubmit = async (data: z.infer<typeof loginSchema>) => {
    try {
      await loginMutation.mutateAsync(data);
      // Success! Redirect to home without toast to avoid any conflicts
      setLocation("/home");
    } catch (error: any) {
      // Enhanced error handling with better user experience
      console.error("🚨 AUTH PAGE CAUGHT ERROR:", error);
      console.error("🚨 Error message:", error.message);
      console.error("🚨 Error status:", error.status);
      console.error("🚨 Error errorType:", error.errorType);
      console.error("🚨 Error originalMessage:", error.originalMessage);
      console.error("🚨 Error responseData:", error.responseData);
      console.error("🚨 Full error object:", JSON.stringify(error, null, 2));
      console.error("🚨 Error constructor:", error.constructor.name);
      console.error("🚨 Error keys:", Object.keys(error));

      // Authentication system is now production-ready

      // Check for email verification error
      if (error.needsEmailVerification) {
        setErrorDetails({
          title: "Email Verification Required",
          message: "Please verify your email address before signing in. We've sent a verification link to your email. Click the link to activate your account, then return here to sign in.",
          type: 'email'
        });
        setShowErrorDialog(true);
        return;
      }

      // Check for account locked error (must be first check to override other patterns)
      // Server sends: {"error":"Account locked","message":"Too many failed login attempts. Account is locked for X more minutes."}
      if (error.errorType === "Account locked" || 
          error.responseData?.error === "Account locked" ||
          error.message?.includes("Account locked") || 
          error.message?.includes("account is locked") || 
          error.message?.includes("too many failed") ||
          error.message?.includes("Account is locked") ||
          error.originalMessage?.includes("Too many failed") ||
          error.originalMessage?.includes("Account is locked")) {
        console.log("🔒 ACCOUNT LOCKED ERROR DETECTED:", { 
          message: error.message, 
          errorType: error.errorType, 
          responseData: error.responseData,
          originalMessage: error.originalMessage 
        });
        setErrorDetails({
          title: "Account Temporarily Locked",
          message: error.originalMessage || error.message || "Your account has been temporarily locked due to multiple failed login attempts. Please wait 15 minutes before trying again, or use 'Forgot Password' to reset your password.",
          type: 'general'
        });
        setShowErrorDialog(true);
        return;
      }

      // Check for invalid credentials (comprehensive patterns) - but NOT if it's an account lock
      if (!error.errorType?.includes("Account locked") && 
          !error.responseData?.error?.includes("Account locked") &&
          !error.message?.includes("Account locked") &&
          (error.message?.includes("Invalid credentials") || 
           error.message?.includes("invalid username or password") || 
           error.message?.includes("Invalid username or password") ||
           error.message?.includes("Login failed: 401") ||
           error.errorType === "Invalid username or password" ||
           error.status === 401)) {
        console.log("🔑 INVALID CREDENTIALS ERROR DETECTED:", { 
          message: error.message, 
          errorType: error.errorType, 
          status: error.status 
        });
        setErrorDetails({
          title: "Invalid Login Credentials", 
          message: "The username or password you entered is incorrect. Please double-check your credentials and try again. If you forgot your password, use the 'Reset Password' link below.",
          type: 'general'
        });
        setShowErrorDialog(true);
        return;
      }

      // Check for user not found
      if (error.message?.includes("User not found") || error.message?.includes("does not exist")) {
        setErrorDetails({
          title: "Username Not Found",
          message: "No account was found with this username. Please check your username or create a new account by switching to the 'Register' tab.",
          type: 'username'
        });
        setShowErrorDialog(true);
        return;
      }

      // Generic fallback error with helpful guidance
      setErrorDetails({
        title: "Sign In Problem",
        message: "We're having trouble signing you in right now. Please check your internet connection and try again. If the problem continues, contact support.",
        type: 'general'
      });
      setShowErrorDialog(true);
    }
  };

  // Handle registration
  const onRegisterSubmit = async (data: z.infer<typeof registerSchema>) => {
    if (!agreedToTerms) {
      setErrorDetails({
        title: "Terms Required",
        message: "Please agree to the terms and conditions before creating your account.",
        type: 'general'
      });
      setShowErrorDialog(true);
      return;
    }

    // Check email validation status
    if (emailValidation.status === 'taken') {
      setErrorDetails({
        title: "Cannot create account",
        message: "This email is already in use. Please sign in to your existing account or use a different email address.",
        type: 'email'
      });
      setShowErrorDialog(true);
      return;
    }

    try {
      const { confirmPassword, ...userData } = data;
      await registerMutation.mutateAsync(userData);
      setErrorDetails({
        title: "Account Created Successfully!",
        message: "Please check the email we have sent to you to verify your account. Once verified, you can sign in with your new credentials.",
        type: 'success'
      });
      setShowErrorDialog(true);
      // Stay on auth page so user can sign in after verification
      setLocation("/auth");
    } catch (error: any) {
      // Handle specific error cases
      if (error.field === 'email' && error.action === 'redirect_to_login') {
        setErrorDetails({
          title: "Cannot create account",
          message: "Email already in use",
          type: 'email'
        });
        setShowErrorDialog(true);
      } else if (error.field === 'username') {
        setErrorDetails({
          title: "Cannot create account",
          message: "This username is already taken. Please choose a different username.",
          type: 'username'
        });
        setShowErrorDialog(true);
        registerForm.setError("username", { message: "This username is already taken" });
      } else {
        setErrorDetails({
          title: "Registration failed",
          message: error.message || "Something went wrong. Please try again or contact support.",
          type: 'general'
        });
        setShowErrorDialog(true);
      }
    }
  };

  // Forgot password handler
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingForgot(true);

    try {
      const response = await fetch("/api/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: forgotPasswordEmail }),
      });

      const data = await response.json();

      setForgotPasswordMessage(data.message);
      setForgotPasswordEmail("");
    } catch (error: any) {
      setForgotPasswordMessage(error.message || "Failed to send reset email. Please try again.");
    } finally {
      setIsSubmittingForgot(false);
    }
  };

  // Forgot username handler
  const handleForgotUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingForgot(true);

    try {
      const response = await fetch("/api/forgot-username", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: forgotUsernameEmail }),
      });

      const data = await response.json();

      setForgotUsernameMessage(data.message);
      setForgotUsernameEmail("");
    } catch (error: any) {
      setForgotUsernameMessage(error.message || "Failed to send username reminder. Please try again.");
    } finally {
      setIsSubmittingForgot(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Premium gradient background matching splash screen */}
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

      {/* Subtle overlay pattern for texture */}
      <div 
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, #0073AA 1px, transparent 0)`,
          backgroundSize: '20px 20px'
        }}
      />

      <div className="relative z-10 w-full max-w-md">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-6">
            <img 
              src="/attached_assets/SIMPLE-slips.svg" 
              alt="SIMPLE SLIPS" 
              className="h-16"
            />
          </div>
          <p className="text-gray-600">Where receipts go to live their best life.</p>
        </div>

        {/* Back button */}
        <Button
          variant="ghost"
          onClick={() => setLocation("/")}
          className="mb-4 hover:bg-white/50"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {/* Auth Card */}
        <Card className="shadow-xl border-0 bg-white/90 backdrop-blur-sm">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl text-center text-gray-900">
              Get Started
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="register">Sign Up</TabsTrigger>
              </TabsList>

              {/* Login Tab */}
              <TabsContent value="login" className="space-y-4">
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                    <FormField
                      control={loginForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username or Email</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter your username or email"
                              className="bg-white border-gray-200"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="Enter your password"
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

                    <Button
                      type="submit"
                      className="w-full text-white py-6 bg-primary hover:bg-primary/90"
                      disabled={loginMutation.isPending}
                    >
                      {loginMutation.isPending ? "Signing in..." : "Sign In"}
                    </Button>
                  </form>
                </Form>



                {/* Forgot Password/Username Links */}
                <div className="flex justify-between text-sm mt-4">
                  <Button
                    variant="link"
                    className="p-0 h-auto text-primary"
                    onClick={() => setShowForgotPassword(true)}
                  >
                    Forgot Password?
                  </Button>
                  <Button
                    variant="link"
                    className="p-0 h-auto text-primary"
                    onClick={() => setShowForgotUsername(true)}
                  >
                    Forgot Username?
                  </Button>
                </div>

                {/* Email Verification Link */}
                <div className="mt-4 pt-4 border-t border-gray-200 text-center">
                  <p className="text-sm text-gray-600 mb-2">Need to verify your email?</p>
                  <Button
                    variant="link"
                    size="sm"
                    className="text-primary hover:text-primary/80"
                    onClick={() => setLocation("/verify-email")}
                  >
                    Verify Email Address
                  </Button>
                </div>
              </TabsContent>

              {/* Register Tab */}
              <TabsContent value="register" className="space-y-4">
                <Form {...registerForm}>
                  <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
                    <FormField
                      control={registerForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Choose a username"
                              className="bg-white border-gray-200"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={registerForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type="email"
                                placeholder="Enter your email"
                                className={`bg-white border-gray-200 pr-10 ${
                                  emailValidation.status === 'available' ? 'border-green-500' :
                                  emailValidation.status === 'taken' ? 'border-red-500' :
                                  emailValidation.status === 'invalid' ? 'border-red-500' : ''
                                }`}
                                {...field}
                                onChange={(e) => {
                                  field.onChange(e);
                                  debouncedEmailCheck(e.target.value);
                                }}
                              />
                              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                                {emailValidation.status === 'checking' && (
                                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                                )}
                                {emailValidation.status === 'available' && (
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                )}
                                {emailValidation.status === 'taken' && (
                                  <XCircle className="h-4 w-4 text-red-500" />
                                )}
                                {emailValidation.status === 'invalid' && (
                                  <AlertCircle className="h-4 w-4 text-red-500" />
                                )}
                              </div>
                            </div>
                          </FormControl>
                          <FormMessage />
                          {emailValidation.message && emailValidation.status !== 'idle' && (
                            <p className={`text-xs mt-1 ${
                              emailValidation.status === 'available' ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {emailValidation.message}
                              {emailValidation.status === 'taken' && (
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="h-auto p-0 ml-2 text-xs text-primary underline"
                                  onClick={() => setActiveTab("login")}
                                >
                                  Sign in instead
                                </Button>
                              )}
                            </p>
                          )}
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={registerForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="Create a password"
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
                      control={registerForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showConfirmPassword ? "text" : "password"}
                                placeholder="Confirm your password"
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

                    <FormField
                      control={registerForm.control}
                      name="promoCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-700">
                            Promo Code <span className="text-gray-400 text-xs">(Optional)</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter promo code for extended trial"
                              className="bg-white border-gray-200"
                              {...field}
                            />
                          </FormControl>
                          <p className="text-xs text-gray-500">
                            Have a promo code? Enter it to extend your trial period.
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="terms"
                        checked={agreedToTerms}
                        onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                      />
                      <label
                        htmlFor="terms"
                        className="text-sm text-gray-600 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        I agree to the{" "}
                        <a
                          href="https://simpleslips.co.za/terms"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary/80 underline"
                        >
                          terms and conditions
                        </a>
                      </label>
                    </div>

                    <Button
                      type="submit"
                      className="w-full text-white py-6 bg-primary hover:bg-primary/90"
                      disabled={registerMutation.isPending}
                    >
                      {registerMutation.isPending ? "Creating account..." : "Create Account"}
                    </Button>
                  </form>
                </Form>

                {/* Already have an account section */}
                <div className="mt-6 pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-600 mb-3 text-center">Already have an account?</p>
                  <div className="flex justify-between text-sm mb-3">
                    <Button
                      variant="link"
                      className="p-0 h-auto text-primary"
                      onClick={() => setShowForgotPassword(true)}
                    >
                      Forgot Password?
                    </Button>
                    <Button
                      variant="link"
                      className="p-0 h-auto text-primary"
                      onClick={() => setShowForgotUsername(true)}
                    >
                      Forgot Username?
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-primary border-primary/20 hover:bg-primary/5"
                    onClick={() => setActiveTab("login")}
                  >
                    Sign In Instead
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-gray-500">
          Secure receipt management with AI-powered insights
        </div>
      </div>
      </div>

      {/* Enhanced Error Dialog */}
      <Dialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-start gap-4 mb-4">
              <div className="flex-shrink-0 mt-1">
                {errorDetails?.type === 'email' ? (
                  <Mail className="h-8 w-8 text-orange-500" />
                ) : errorDetails?.type === 'username' ? (
                  <User className="h-8 w-8 text-blue-500" />
                ) : errorDetails?.type === 'success' ? (
                  <CheckCircle className="h-8 w-8 text-green-500" />
                ) : (
                  <AlertCircle className="h-8 w-8 text-red-500" />
                )}
              </div>
              <div className="flex-1">
                <DialogTitle className="text-lg font-semibold text-gray-900 mb-2">
                  {errorDetails?.title}
                </DialogTitle>
                <DialogDescription className="text-sm text-gray-600 leading-relaxed">
                  {errorDetails?.message}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3">
            {/* Action buttons based on error type */}
            {errorDetails?.type === 'email' && (
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => {
                    setShowErrorDialog(false);
                    // Could implement resend verification here
                  }}
                  className="w-full"
                  variant="default"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Resend Verification Email
                </Button>
                <Button
                  onClick={() => setShowErrorDialog(false)}
                  className="w-full"
                  variant="outline"
                >
                  I'll Check My Email
                </Button>
              </div>
            )}

            {errorDetails?.type === 'username' && (
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => {
                    setShowErrorDialog(false);
                    setActiveTab("register");
                  }}
                  className="w-full"
                  variant="default"
                >
                  <User className="h-4 w-4 mr-2" />
                  Create New Account
                </Button>
                <Button
                  onClick={() => {
                    setShowErrorDialog(false);
                    setShowForgotUsername(true);
                  }}
                  className="w-full"
                  variant="outline"
                >
                  Find My Username
                </Button>
                <Button
                  onClick={() => setShowErrorDialog(false)}
                  className="w-full"
                  variant="ghost"
                >
                  Try Again
                </Button>
              </div>
            )}

            {errorDetails?.type === 'success' && (
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => {
                    setShowErrorDialog(false);
                    setActiveTab("login");
                  }}
                  className="w-full"
                  variant="default"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Sign In Now
                </Button>
                <Button
                  onClick={() => setShowErrorDialog(false)}
                  className="w-full"
                  variant="outline"
                >
                  I'll Check My Email First
                </Button>
              </div>
            )}

            {errorDetails?.type === 'general' && (
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => {
                    setShowErrorDialog(false);
                    setShowForgotPassword(true);
                  }}
                  className="w-full"
                  variant="default"
                >
                  <KeyRound className="h-4 w-4 mr-2" />
                  Reset Password
                </Button>
                <Button
                  onClick={() => setShowErrorDialog(false)}
                  className="w-full"
                  variant="outline"
                >
                  Try Again
                </Button>
              </div>
            )}

            {/* Help link */}
            <div className="pt-2 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center">
                Still having trouble? Contact{" "}
                <a 
                  href="mailto:support@simpleslips.co.za" 
                  className="text-primary hover:text-primary/80 underline"
                >
                  support
                </a>{" "}
                for help.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Forgot Password Dialog */}
      <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Reset Password
            </DialogTitle>
            <DialogDescription>
              Enter your email address and we'll send you a link to reset your password.
            </DialogDescription>
          </DialogHeader>

          {forgotPasswordMessage ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">{forgotPasswordMessage}</p>
              <Button
                onClick={() => {
                  setShowForgotPassword(false);
                  setForgotPasswordMessage("");
                }}
                className="mt-3 w-full"
              >
                Close
              </Button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label htmlFor="forgot-password-email" className="block text-sm font-medium mb-2">
                  Email Address
                </label>
                <Input
                  id="forgot-password-email"
                  type="email"
                  placeholder="Enter your email address"
                  value={forgotPasswordEmail}
                  onChange={(e) => setForgotPasswordEmail(e.target.value)}
                  required
                  className="w-full"
                />
              </div>

              <DialogFooter className="flex gap-2 sm:gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForgotPassword(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmittingForgot}
                  className="flex-1"
                >
                  {isSubmittingForgot ? "Sending..." : "Send Reset Link"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Forgot Username Dialog */}
      <Dialog open={showForgotUsername} onOpenChange={setShowForgotUsername}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Retrieve Username
            </DialogTitle>
            <DialogDescription>
              Enter your email address and we'll send you your username.
            </DialogDescription>
          </DialogHeader>

          {forgotUsernameMessage ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">{forgotUsernameMessage}</p>
              <Button
                onClick={() => {
                  setShowForgotUsername(false);
                  setForgotUsernameMessage("");
                }}
                className="mt-3 w-full"
              >
                Close
              </Button>
            </div>
          ) : (
            <form onSubmit={handleForgotUsername} className="space-y-4">
              <div>
                <label htmlFor="forgot-username-email" className="block text-sm font-medium mb-2">
                  Email Address
                </label>
                <Input
                  id="forgot-username-email"
                  type="email"
                  placeholder="Enter your email address"
                  value={forgotUsernameEmail}
                  onChange={(e) => setForgotUsernameEmail(e.target.value)}
                  required
                  className="w-full"
                />
              </div>

              <DialogFooter className="flex gap-2 sm:gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForgotUsername(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmittingForgot}
                  className="flex-1"
                >
                  {isSubmittingForgot ? "Sending..." : "Send Username"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}