import { useState, useCallback, useEffect, useRef } from "react";
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Eye, EyeOff, Receipt, ArrowLeft, CheckCircle, XCircle, AlertCircle, Loader2, Mail, KeyRound, User } from "lucide-react";
// import { useToast } from "@/hooks/use-toast"; // REMOVED - using enhanced error dialogs only
import { useIsMobile } from "@/hooks/use-mobile";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { createClientLogger } from "@/lib/logger";
import { strongPasswordSchema } from "@shared/schema";

const logger = createClientLogger("auth-page");
export default function AuthPage() {
  const [location, setLocation] = useLocation();
  const { user, loginMutation, registerMutation } = useAuth();
  // const { toast } = useToast(); // REMOVED - using enhanced error dialogs only

  // Check for verification success message
  useEffect(() => {
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
      // Clean up only verification parameters; preserve redirect and mode.
      params.delete('verified');
      params.delete('message');
      const query = params.toString();
      setLocation(`/auth${query ? `?${query}` : ''}`);
    }
  }, [location, setLocation]);
  const isMobile = useIsMobile();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToTaxDisclaimer, setAgreedToTaxDisclaimer] = useState(false);
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
  const getModeFromLocation = (value: string) => {
    const params = new URLSearchParams(value.split("?")[1] || "");
    return params.get("mode") === "signin" || params.get("tab") === "login"
      ? "login"
      : "register";
  };
  const getBrowserLocation = () => `${window.location.pathname}${window.location.search}`;
  const [activeTab, setActiveTabState] = useState(() => getModeFromLocation(getBrowserLocation()));
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotUsernameEmail, setForgotUsernameEmail] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showForgotUsername, setShowForgotUsername] = useState(false);
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState("");
  const [forgotUsernameMessage, setForgotUsernameMessage] = useState("");
  const [isSubmittingForgot, setIsSubmittingForgot] = useState(false);
  const [registerStep, setRegisterStep] = useState(1);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const registrationSubmitStarted = useRef(false);

  // The URL is the source of truth for the focused flow, so refresh and
  // browser back/forward preserve the user's place without a modal or delay.
  useEffect(() => {
    setActiveTabState(getModeFromLocation(getBrowserLocation()));
  }, [location]);

  useEffect(() => {
    const syncModeFromBrowserHistory = () => {
      setActiveTabState(getModeFromLocation(`${window.location.pathname}${window.location.search}`));
    };
    window.addEventListener("popstate", syncModeFromBrowserHistory);
    return () => window.removeEventListener("popstate", syncModeFromBrowserHistory);
  }, []);

  const setAuthMode = (mode: "login" | "register") => {
    const pathname = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    params.delete("tab");
    if (mode === "login") {
      params.set("mode", "signin");
    } else {
      params.delete("mode");
    }
    const query = params.toString();
    setActiveTabState(mode);
    setLocation(`${pathname || "/auth"}${query ? `?${query}` : ""}`);
  };

  // Kept as a small compatibility seam for secondary recovery actions below.
  const setActiveTab = (mode: "login" | "register") => setAuthMode(mode);

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
    username: z.string().trim().min(3, "Username must be at least 3 characters"),
    email: z.string().trim().toLowerCase().email("Please enter a valid email address"),
    password: strongPasswordSchema,
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

  const getRedirectUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get("redirect") || "/home";
  };

  useEffect(() => {
    if (user) {
      setLocation(getRedirectUrl());
    }
  }, [user, setLocation]);

  const logAuthError = (context: string, error: any, username: string) => {
    const errorDetails = {
      context,
      username,
      message: error?.message,
      status: error?.status,
      errorType: error?.errorType,
      originalMessage: error?.originalMessage,
      userMessage: error?.userMessage,
      responseData: error?.responseData,
      constructorName: error?.constructor?.name,
      isNetworkError: error instanceof TypeError,
      online: navigator.onLine,
      timestamp: new Date().toISOString()
    };
    logger.error(`[AUTH] ${context}:`, errorDetails);
    try {
      fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'auth_error',
          component: 'auth-page',
          ...errorDetails
        })
      }).catch(() => {});
    } catch {}
  };

  const onLoginSubmit = async (data: z.infer<typeof loginSchema>) => {
    let lastError: any = null;
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await loginMutation.mutateAsync(data);
        setLocation(getRedirectUrl());
        return;
      } catch (error: any) {
        lastError = error;
        const isNetworkError = error instanceof TypeError || 
          error.message?.includes('Failed to fetch') ||
          error.message?.includes('NetworkError') ||
          !navigator.onLine;

        if (isNetworkError && attempt < maxAttempts) {
          logAuthError(`Network error on attempt ${attempt}, retrying`, error, data.username);
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        break;
      }
    }

    const error = lastError;
    logAuthError('Login failed', error, data.username);

    if (error.needsEmailVerification) {
      setErrorDetails({
        title: "Email Verification Required",
        message: "Please verify your email address before signing in. We've sent a verification link to your email. Click the link to activate your account, then return here to sign in.",
        type: 'email'
      });
      setShowErrorDialog(true);
      return;
    }

    const isAccountLocked = 
        error.errorType === "Account locked" || 
        error.errorType === "Account temporarily locked" ||
        error.responseData?.error === "Account locked" ||
        error.responseData?.error === "Account temporarily locked" ||
        error.message?.toLowerCase().includes("account locked") || 
        error.message?.toLowerCase().includes("account is locked") || 
        error.message?.toLowerCase().includes("temporarily locked") ||
        error.message?.toLowerCase().includes("too many failed") ||
        error.originalMessage?.toLowerCase().includes("too many failed") ||
        error.originalMessage?.toLowerCase().includes("temporarily locked") ||
        error.userMessage?.toLowerCase().includes("account locked");
        
    if (isAccountLocked) {
      const serverMessage = error.userMessage || error.originalMessage || error.message || "";
      const timeMatch = serverMessage.match(/(\d+)\s*minute/i);
      const minutesRemaining = timeMatch ? parseInt(timeMatch[1]) : 15;
      
      setErrorDetails({
        title: "Account Temporarily Locked",
        message: `For your security, we've temporarily locked your account after multiple failed login attempts.\n\nPlease wait ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''} before trying again.\n\nAlternatively, you can use 'Forgot Password' below to reset your password and unlock your account immediately.`,
        type: 'general'
      });
      setShowErrorDialog(true);
      return;
    }

    if (!isAccountLocked && (error.status === 401 ||
        error.message?.includes("Invalid credentials") || 
        error.message?.includes("invalid username or password") || 
        error.message?.includes("Invalid username or password") ||
        error.message?.includes("Incorrect password") ||
        error.message?.includes("Incorrect username") ||
        error.message?.includes("Login failed") ||
        error.errorType === "Invalid username or password" ||
        error.errorType === "Login failed")) {
      setErrorDetails({
        title: "Invalid Login Credentials", 
        message: "The username or password you entered is incorrect. Please double-check your credentials and try again. If you forgot your password, use the 'Reset Password' link below.",
        type: 'general'
      });
      setShowErrorDialog(true);
      return;
    }

    if (error.message?.includes("User not found") || error.message?.includes("does not exist")) {
      setErrorDetails({
        title: "Username Not Found",
        message: "No account was found with this username. Please check your username or create a new account by switching to the 'Register' tab.",
        type: 'username'
      });
      setShowErrorDialog(true);
      return;
    }

    const isNetworkError = error instanceof TypeError || 
      error.message?.includes('Failed to fetch') ||
      error.message?.includes('NetworkError') ||
      !navigator.onLine;

    if (isNetworkError) {
      setErrorDetails({
        title: "Connection Problem",
        message: "We couldn't reach the server. Please check your internet connection and try again.",
        type: 'general'
      });
    } else {
      setErrorDetails({
        title: "Sign In Problem",
        message: "Something went wrong while signing you in. Please try again. If the problem continues, contact support.",
        type: 'general'
      });
    }
    setShowErrorDialog(true);
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

    if (!agreedToTaxDisclaimer) {
      setErrorDetails({
        title: "Tax Disclaimer Required",
        message: "Please acknowledge the tax information disclaimer before creating your account.",
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
      await registerMutation.mutateAsync({
        ...userData,
        agreedToTerms,
        agreedToTaxDisclaimer,
      });
      registrationSubmitStarted.current = false;
      setRegistrationSuccess(true);
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

  const passwordChecklist = [
    { label: "8–64 characters", valid: registerForm.watch("password").length >= 8 && registerForm.watch("password").length <= 64 },
    { label: "A lowercase letter", valid: /[a-z]/.test(registerForm.watch("password")) },
    { label: "An uppercase letter", valid: /[A-Z]/.test(registerForm.watch("password")) },
    { label: "A number", valid: /\d/.test(registerForm.watch("password")) },
    { label: "A special character", valid: /[^A-Za-z0-9]/.test(registerForm.watch("password")) },
  ];

  const handleRegisterStepSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (registerStep < 4) {
      const fields = registerStep === 1
        ? ["username" as const]
        : registerStep === 2
          ? ["email" as const]
          : ["password" as const, "confirmPassword" as const];
      const valid = await registerForm.trigger(fields);
      if (valid && !(registerStep === 2 && emailValidation.status === "taken")) {
        setRegisterStep((step) => step + 1);
      }
      return;
    }
    if (registrationSubmitStarted.current || registerMutation.isPending) return;
    registrationSubmitStarted.current = true;
    await registerForm.handleSubmit(onRegisterSubmit)(event);
    if (!registerMutation.isPending && !registrationSuccess) {
      registrationSubmitStarted.current = false;
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
          <p className="text-gray-600">Because admin should actually stay done.</p>
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
              {activeTab === "register" ? "Let’s get your slips organised" : "Welcome back"}
            </CardTitle>
          </CardHeader>
          <CardContent>
              {/* Login Tab */}
              {activeTab === "login" && <div className="space-y-4">
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
                               autoComplete="username"
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
                                 autoComplete="current-password"
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
                <div className="flex flex-col min-[360px]:flex-row min-[360px]:justify-between gap-2 text-sm mt-4">
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
                <p className="pt-4 text-center text-sm text-gray-600 border-t border-gray-200">
                  New to Simple Slips?{" "}
                  <Button type="button" variant="link" className="h-auto min-h-11 px-1 text-primary" onClick={() => setAuthMode("register")}>
                    Get started
                  </Button>
                </p>
              </div>}

              {/* Register Tab */}
              {activeTab === "register" && <div className="space-y-4">
                {registrationSuccess ? (
                  <div className="space-y-6 text-center py-5" aria-live="polite">
                    <CheckCircle className="mx-auto h-12 w-12 text-green-600" />
                    <div className="space-y-2">
                      <h2 className="text-2xl font-semibold text-gray-900">Welcome, {registerForm.getValues("username")}!</h2>
                      <p className="text-gray-700">Your 30-day Simple Slips trial is ready.</p>
                      <p className="text-sm text-gray-600">You can sign in now and start scanning. Please verify your email before subscribing or making a payment.</p>
                    </div>
                      <Button className="w-full min-h-11 text-white bg-primary hover:bg-primary/90" onClick={() => { setRegistrationSuccess(false); setRegisterStep(1); setAuthMode("login"); }}>
                      Continue to Sign In
                    </Button>
                  </div>
                ) : (
                  <Form {...registerForm}>
                    <form onSubmit={handleRegisterStepSubmit} className="space-y-5" noValidate>
                      <div className="space-y-3" aria-label="Registration progress">
                        <div className="flex items-center justify-between text-xs text-gray-600">
                          <span>Step {registerStep} of 4</span>
                          <span aria-hidden="true">{registerStep === 4 ? "Review" : "Account setup"}</span>
                        </div>
                        <div className="flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={registerStep} aria-label={`Step ${registerStep} of 4`}>
                          {[1, 2, 3, 4].map((step) => <div key={step} className={`h-1.5 flex-1 rounded-full ${step <= registerStep ? "bg-primary" : "bg-gray-200"}`} />)}
                        </div>
                      </div>

                      {registerStep === 1 && (
                        <section aria-labelledby="register-question">
                          <h2 id="register-question" className="text-xl font-semibold text-gray-900">What can I call you?</h2>
                          <p className="mt-1 text-sm text-gray-600">Let’s start with the name you’d like to see inside Simple Slips.</p>
                          <FormField control={registerForm.control} name="username" render={({ field }) => (
                            <FormItem className="mt-5"><FormLabel>Username</FormLabel><FormControl><Input autoFocus autoComplete="username" placeholder="Choose a username" className="min-h-11 bg-white border-gray-200" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <p className="mt-5 text-sm text-gray-600">Already have an account?{" "}<Button type="button" variant="link" className="h-auto min-h-11 px-1 text-primary" onClick={() => setAuthMode("login")}>Sign in</Button></p>
                        </section>
                      )}

                      {registerStep === 2 && (
                        <section aria-labelledby="register-question">
                          <h2 id="register-question" className="text-xl font-semibold text-gray-900">Hi, {registerForm.watch("username")}. Where can we reach you?</h2>
                          <p className="mt-1 text-sm text-gray-600">We’ll use this for important account and receipt updates.</p>
                          <FormField control={registerForm.control} name="email" render={({ field }) => (
                            <FormItem className="mt-5"><FormLabel>Email address</FormLabel><FormControl><div className="relative"><Input autoFocus autoComplete="email" type="email" placeholder="Enter your email" className={`min-h-11 bg-white border-gray-200 pr-10 ${emailValidation.status === "available" ? "border-green-500" : emailValidation.status === "taken" || emailValidation.status === "invalid" ? "border-red-500" : ""}`} {...field} onChange={(e) => { field.onChange(e); debouncedEmailCheck(e.target.value); }} /><div className="absolute right-3 top-1/2 -translate-y-1/2">{emailValidation.status === "checking" && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}{emailValidation.status === "available" && <CheckCircle className="h-4 w-4 text-green-500" />}{emailValidation.status === "taken" && <XCircle className="h-4 w-4 text-red-500" />}{emailValidation.status === "invalid" && <AlertCircle className="h-4 w-4 text-red-500" />}</div></div></FormControl><FormMessage />{emailValidation.message && <p aria-live="polite" className={`text-xs mt-1 ${emailValidation.status === "available" ? "text-green-600" : "text-red-600"}`}>{emailValidation.message}{emailValidation.status === "taken" && <Button type="button" variant="link" className="h-auto min-h-11 p-0 ml-2 text-xs text-primary underline" onClick={() => setAuthMode("login")}>Sign in instead</Button>}</p>}</FormItem>
                          )} />
                        </section>
                      )}

                      {registerStep === 3 && (
                        <section aria-labelledby="register-question">
                          <h2 id="register-question" className="text-xl font-semibold text-gray-900">Let’s secure your account</h2>
                          <p className="mt-1 text-sm text-gray-600">Create a strong password to keep your receipts and business information protected.</p>
                          <FormField control={registerForm.control} name="password" render={({ field }) => (
                            <FormItem className="mt-5"><FormLabel>Password</FormLabel><FormControl><div className="relative"><Input autoFocus autoComplete="new-password" type={showPassword ? "text" : "password"} placeholder="Create a password" className="min-h-11 bg-white border-gray-200 pr-10" {...field} /><Button type="button" variant="ghost" aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-0 top-0 h-full px-3" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}</Button></div></FormControl><FormMessage /></FormItem>
                          )} />
                          <ul className="mt-3 grid grid-cols-1 gap-1 text-xs text-gray-600" aria-live="polite">{passwordChecklist.map((item) => <li key={item.label} className={item.valid ? "text-green-600" : ""}>{item.valid ? "✓" : "○"} {item.label}</li>)}</ul>
                          <FormField control={registerForm.control} name="confirmPassword" render={({ field }) => (
                            <FormItem className="mt-4"><FormLabel>Confirm password</FormLabel><FormControl><div className="relative"><Input autoComplete="new-password" type={showConfirmPassword ? "text" : "password"} placeholder="Confirm your password" className="min-h-11 bg-white border-gray-200 pr-10" {...field} /><Button type="button" variant="ghost" aria-label={showConfirmPassword ? "Hide confirmed password" : "Show confirmed password"} className="absolute right-0 top-0 h-full px-3" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>{showConfirmPassword ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}</Button></div></FormControl><FormMessage /></FormItem>
                          )} />
                        </section>
                      )}

                      {registerStep === 4 && (
                        <section aria-labelledby="register-question">
                          <h2 id="register-question" className="text-xl font-semibold text-gray-900">One last thing</h2>
                          <p className="mt-1 text-sm text-gray-600">Please review these details before we create your 30-day trial.</p>
                          <div className="mt-5 rounded-md bg-gray-50 p-3 text-sm text-gray-700"><p><strong>Username:</strong> {registerForm.watch("username")}</p><p className="mt-1"><strong>Email:</strong> {registerForm.watch("email")}</p></div>
                          <FormField control={registerForm.control} name="promoCode" render={({ field }) => (
                            <FormItem className="mt-4"><FormLabel>Promo code <span className="text-gray-400 text-xs">(Optional)</span></FormLabel><FormControl><Input placeholder="Enter promo code for extended trial" className="min-h-11 bg-white border-gray-200" {...field} /></FormControl><p className="text-xs text-gray-500">Have a promo code? Enter it to extend your trial period.</p><FormMessage /></FormItem>
                          )} />
                          <div className="mt-5 space-y-3">
                            <div className="flex items-start gap-2"><Checkbox id="terms" checked={agreedToTerms} onCheckedChange={(checked) => setAgreedToTerms(checked === true)} className="mt-1" data-testid="checkbox-terms" /><label htmlFor="terms" className="text-sm text-gray-600 leading-tight">I agree to the{" "}<a href="https://simpleslips.co.za/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 underline">terms and conditions</a></label></div>
                            <div className="flex items-start gap-2"><Checkbox id="taxDisclaimer" checked={agreedToTaxDisclaimer} onCheckedChange={(checked) => setAgreedToTaxDisclaimer(checked === true)} className="mt-1" data-testid="checkbox-tax-disclaimer" /><label htmlFor="taxDisclaimer" className="text-sm text-gray-600 leading-tight">I understand that Simple Slips is not a registered tax practitioner and provides expense tracking tools and tax information only. This is NOT professional tax advice. I remain responsible for my tax filings and will consult a registered tax practitioner for official advice.</label></div>
                          </div>
                        </section>
                      )}
                      <div className="flex gap-3 pt-2"><Button type="button" variant="ghost" className={`min-h-11 ${registerStep === 1 ? "invisible" : ""}`} onClick={() => setRegisterStep((step) => Math.max(1, step - 1))}>Back</Button><Button type="submit" className="min-h-11 flex-1 text-white bg-primary hover:bg-primary/90" disabled={registerMutation.isPending}>{registerStep === 4 ? (registerMutation.isPending ? "Creating account..." : "Create My Account") : "Continue"}</Button></div>
                    </form>
                  </Form>
                )}
              </div>}
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
                    setAuthMode("register");
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
                    setAuthMode("login");
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