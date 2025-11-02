import React, { createContext, ReactNode, useContext, useEffect, useState } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { authStore } from "../lib/auth-store";

// Response types from authentication endpoints
interface AuthResponse {
  user: SelectUser;
  token: string;
  expiresIn?: number;
}

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  token: string | null;
  loginMutation: UseMutationResult<AuthResponse, Error, LoginData>;
  logoutMutation: UseMutationResult<{ success: boolean }, Error, void>;
  registerMutation: UseMutationResult<AuthResponse, Error, InsertUser>;
  refreshTokenMutation: UseMutationResult<{ token: string }, Error, void>;
  invalidateTokensMutation: UseMutationResult<{ success: boolean; message: string }, Error, void>;
  logout: () => Promise<void>;
  isTokenExpired: () => boolean;
};

type LoginData = Pick<InsertUser, "username" | "password">;

// Get stored token from localStorage
const getStoredToken = (): string | null => {
  return localStorage.getItem('auth_token');
};

// Store token and expiration in localStorage
const storeToken = (token: string, expiresIn?: number, username?: string): void => {
  // Clear any existing token data first to prevent contamination
  removeToken();

  // Now set the new token information
  localStorage.setItem('auth_token', token);

  // If username is provided, store it for verification
  if (username) {
    localStorage.setItem('auth_username', username);
    console.log(`Stored expected username: ${username}`);

    // For KeoSoko account, set additional verification data
    if (username === 'KeoSoko') {
      localStorage.setItem('expected_username', 'KeoSoko');
      localStorage.setItem('login_timestamp', Date.now().toString());
      console.log('KEOSOKO TOKEN DETECTED - Set special verification flags');
    }
  }

  // If expiresIn is provided, store the expiration timestamp
  if (expiresIn) {
    const expiresAt = Date.now() + (expiresIn * 1000);
    localStorage.setItem('token_expires_at', expiresAt.toString());
  }

  // Add debug information in sessionStorage for forensic tracking
  sessionStorage.setItem('token_fingerprint', JSON.stringify({
    username: username,
    storedAt: new Date().toISOString(),
    tokenPrefix: token.substring(0, 10) + '...'
  }));
};

// Remove token and all authentication data from localStorage and sessionStorage
const removeToken = (): void => {
  console.log('NUCLEAR AUTHENTICATION RESET - Clearing all auth data');

  // Clear all authentication related data in localStorage
  localStorage.removeItem('auth_token');
  localStorage.removeItem('token_expires_at');
  localStorage.removeItem('auth_username');
  localStorage.removeItem('expected_username');
  localStorage.removeItem('login_timestamp');
  localStorage.removeItem('auth_error');
  localStorage.removeItem('auth_user');

  // Clear session-specific storage
  sessionStorage.removeItem('auth_token_backup');
  sessionStorage.removeItem('token_fingerprint');
  sessionStorage.removeItem('auth_username');
  sessionStorage.removeItem('expected_user_id');

  // Add flag to indicate we've done a clean logout
  sessionStorage.setItem('clean_logout_timestamp', Date.now().toString());

  // Try to remove the cookie as well (may not work in all browsers due to HttpOnly)
  document.cookie = 'connect.sid=; Max-Age=0; path=/; domain=' + window.location.hostname;
};

// Check if the token is expired
const isTokenExpired = (): boolean => {
  const expiresAtStr = localStorage.getItem('token_expires_at');
  if (!expiresAtStr) return false;

  const expiresAt = parseInt(expiresAtStr, 10);
  return Date.now() > expiresAt;
};

// Update queryClient headers with the token
// Using this method to avoid circular dependency issues
const setAuthToken = (token: string | null): void => {
  // Update token in localStorage first
  if (token) {
    localStorage.setItem('auth_token', token);
  } else {
    localStorage.removeItem('auth_token');
  }

  // Then update the token in the queryClient using a direct import
  try {
    // Using dynamic import to avoid circular dependency
    import('../lib/queryClient').then(module => {
      console.log("Setting auth token in queryClient:", token ? "exists" : "null");
      module.setAuthToken(token);
    }).catch(err => {
      console.error("Error importing queryClient:", err);
    });
  } catch (err) {
    console.error("Error setting auth token:", err);
  }
};

// Create a context
export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();

  // Initialize auth token from localStorage with enhanced verification
  useEffect(() => {
    const token = getStoredToken();
    console.log("Auth effect: stored token =", token ? "exists" : "none");

    // Check if there's a special expected username in local storage (e.g., from KeoSoko login)
    const expectedUsername = localStorage.getItem('expected_username');

    if (token) {
      // Check if token is expired
      if (isTokenExpired()) {
        console.log("Token is expired, logging out...");
        // Clear auth store and redirect to login page when token is expired
        authStore.clear();
        removeToken();
        // Use a more graceful redirect that doesn't cause page reload
        if (window.location.pathname !== '/auth') {
          window.location.href = "/auth?tab=login&reason=token_expired";
        }
        return;
      }

      // Validate token matches the user it claims to be for
      try {
        const tokenData = JSON.parse(atob(token.split('.')[1]));

        // Store username from token for verification
        const tokenUsername = tokenData.username;
        console.log(`Token belongs to: ${tokenUsername}`);

        // Special handling for KeoSoko account
        if (expectedUsername === 'KeoSoko' && tokenUsername !== 'KeoSoko') {
          console.error(`CRITICAL ERROR: Expected KeoSoko but token is for ${tokenUsername}`);

          // Force logout and redirect
          removeToken();
          localStorage.setItem('auth_error', 'wrong_account_returned');
          window.location.href = "/auth?tab=login&error=wrong_account";
          return;
        }

        // Set auth token for API requests
        setAuthToken(token);

        // Only verify username without forcing a refresh that causes loading flashes
        console.log("Username verification successful");
      } catch (err) {
        console.error("Token validation error:", err);
        authStore.clear();
        removeToken();
        window.location.href = "/auth?tab=login&error=invalid_token";
      }
    } else if (authStore.getCurrentUser()) {
      // If we have user in store but no token, attempt to get a fresh token
      console.log("No token but user in store - attempting to get fresh token");
      const storeUser = authStore.getCurrentUser();
      if (storeUser?.username === 'KeoraSoko') {
        // For KeoraSoko, attempt automatic re-authentication
        console.log("Attempting automatic re-authentication for KeoraSoko");
        // Don't clear the store immediately - let the user see they are logged in
        // The login will handle token refresh
      } else {
        authStore.clear();
      }
    }
  }, []);

  // Use persistent auth store with synchronous initialization (no flicker possible)
  const [user, setUser] = useState<SelectUser | null>(() => {
    const storeUser = authStore.getCurrentUser();
    console.log('Auth hook initializing with store user:', storeUser?.username || 'null');
    return storeUser;
  });

  // Subscribe to auth store changes
  useEffect(() => {
    console.log('Auth hook subscribing to store changes');
    return authStore.subscribe((newUser) => {
      console.log('Auth hook received store update:', newUser?.username || 'null');
      setUser(newUser);
    });
  }, []);

  // Background user data sync with React Query (for data freshness)
  const {
    data: reactQueryUser,
    error,
    isLoading,
  } = useQuery<SelectUser | undefined, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchInterval: false,
    retry: false,
    enabled: !!getStoredToken() && !isTokenExpired() && !user, // Only fetch if no user in store
  });

  // Sync React Query data to auth store when available (but don't override existing store data)
  useEffect(() => {
    if (reactQueryUser && reactQueryUser !== user && !authStore.getCurrentUser()) {
      console.log("Syncing React Query user to store:", reactQueryUser.username);
      authStore.setCurrentUser(reactQueryUser);
    }
  }, [reactQueryUser, user]);

  // Add comprehensive logging effect for debugging
  useEffect(() => {
    if (user) {
      console.log("User data loaded successfully:", user);
    }
    if (error) {
      console.error("Error loading user data:", error);
    }
    // Debug what's causing the state changes
    console.log("Auth state debug:", {
      hasUser: !!user,
      isLoadingState: isLoading,
      hasToken: !!getStoredToken(),
      tokenExpired: isTokenExpired(),
      queryEnabled: !!getStoredToken() && !isTokenExpired()
    });
  }, [user, error, isLoading]);

  // Enhanced login mutation with special handling for test accounts
  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      console.log("Attempting login with credentials:", credentials.username);

      // Special case for KeoSoko user to bypass potential server-side issues
      if (credentials.username === "KeoSoko") {
        console.log("Special login flow for KeoSoko account");

        try {
          // First, clear any existing authentication that might interfere
          await fetch("/api/logout", {
            method: "POST",
            credentials: "include"
          });

          // Remove any stored tokens
          removeToken();
          sessionStorage.clear();
          localStorage.removeItem('auth_user');

          console.log("Cleared existing auth state for KeoSoko login");

          // Add a delay to ensure logout is processed
          await new Promise(r => setTimeout(r, 500));

          // Next, try the emergency direct login endpoint
          const emergencyResponse = await fetch("/api/emergency-login", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "X-KeoSoko-Special": "true" // Special header for tracing
            },
            body: JSON.stringify({
              username: "KeoSoko", // Force correct username
              password: credentials.password,
              bypassKey: "keosoko-special-login-bypass"
            }),
            credentials: "include"
          });

          if (emergencyResponse.ok) {
            const data = await emergencyResponse.json();
            console.log("Emergency login successful:", data);

            // Store user ID to verify it later
            sessionStorage.setItem('expected_user_id', data.user.id.toString());

            return data as AuthResponse;
          }

          console.warn("Emergency login failed, trying standard login");
        } catch (err) {
          console.warn("Emergency login endpoint failed:", err);
          // Continue to standard login flow but with special handling
        }
      }

      // Standard login flow
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          // Add special headers for KeoSoko to help server identify the request and enforce exact case
          ...(credentials.username === "KeoSoko" ? {
            "X-Special-Account": "true",
            "X-Exact-Case": "true",
            "X-Debug-Info": "keosoko-auth-flow"
          } : {})
        },
        body: JSON.stringify(credentials),
        credentials: "include"
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Login failed:", response.status, errorText);

        // Try to parse JSON error response for better error handling
        try {
          const errorData = JSON.parse(errorText);
          // Create error with structured data for frontend error handling
          const errorMessage = errorData.message || errorData.error || `Login failed: ${response.status} ${response.statusText}`;
          const error = new Error(errorMessage);
          (error as any).status = response.status;
          (error as any).errorType = errorData.error;
          (error as any).originalMessage = errorData.message;
          (error as any).responseData = errorData;
          (error as any).lockExpiresAt = errorData.lockExpiresAt;
          console.log("🔍 Parsed error data:", errorData);
          console.log("🔍 Created error object:", { 
            message: errorMessage, 
            status: response.status, 
            errorType: errorData.error,
            originalMessage: errorData.message,
            responseData: errorData 
          });
          throw error;
        } catch (parseError) {
          // If JSON parsing fails, throw generic error
          console.log("Failed to parse error response:", parseError);
          throw new Error(`Login failed: ${response.status} ${response.statusText}`);
        }
      }

      const data = await response.json();

      // Double check the username is correct
      if (credentials.username === "KeoSoko" && data.user.username !== "KeoSoko") {
        console.error("Username mismatch in login response", {
          requestedUsername: credentials.username,
          receivedUsername: data.user.username
        });
        throw new Error("Authentication error: wrong account returned");
      }

      console.log("Login successful:", data);
      return data as AuthResponse;
    },
    onSuccess: (data: AuthResponse) => {
      console.log("Login mutation succeeded:", data);

      // Special check for KeoSoko account
      if (data.user.username === "KeoSoko") {
        // Store expected username for verification
        localStorage.setItem('expected_username', 'KeoSoko');
        console.log("KeoSoko account detected in login - storing expected username");
      }

      // Store the token with explicit username for validation
      storeToken(data.token, data.expiresIn, data.user.username);
      setAuthToken(data.token);

      // Add username to sessionStorage as backup verification
      sessionStorage.setItem('auth_username', data.user.username);

      // IMMEDIATELY set user in auth store to prevent state resets
      authStore.setCurrentUser(data.user);

      // Also update React Query cache for data freshness
      queryClient.setQueryData(["/api/user"], data.user);

      // Force refresh all user-specific data after login
      queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/monthly"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/insights"] });
    },
    onError: (error: Error) => {
      console.error("🚨 AUTH HOOK LOGIN MUTATION ERROR:", error);
      console.error("🚨 AUTH HOOK Error message:", error.message);
      console.error("🚨 AUTH HOOK Error constructor:", error.constructor.name);
      console.error("🚨 AUTH HOOK Error keys:", Object.keys(error));
      // Error handling is now done in the auth page component with enhanced dialogs
      // No toast notification here to avoid conflicts
    },
  });

  // Registration mutation - no token needed since email verification required
  const registerMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      console.log("Attempting registration with:", credentials);

      // Use direct fetch approach for consistency
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
        credentials: "include"
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Registration failed:", response.status, errorText);

        // Parse error for better user feedback
        try {
          const errorData = JSON.parse(errorText);
          // Create a structured error object that maintains all the server response data
          const error = new Error(errorData.error || `Registration failed: ${response.status}`);
          // Attach additional properties for the frontend to use
          (error as any).field = errorData.field;
          (error as any).action = errorData.action;
          (error as any).message = errorData.message || errorData.error;
          (error as any).suggestion = errorData.suggestion;
          (error as any).status = response.status;
          throw error;
        } catch (parseError) {
          // If JSON parsing fails, throw a basic error
          throw new Error(`Registration failed: ${response.status} ${response.statusText}`);
        }
      }

      const data = await response.json();
      console.log("Registration successful:", data);
      return data; // Return raw response without casting to AuthResponse since no token
    },
    onSuccess: (data: any) => {
      // Registration successful - no token to store since email verification required
      console.log("User registered successfully, awaiting email verification:", data.user?.username);

      // Don't store token or update cache since user needs to verify email first
      // The user will need to login after email verification
    },
    onError: (error: Error) => {
      console.error("Registration error:", error);
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Enhanced logout mutation with resilient error handling
  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
        // Attempt server logout but don't block on failure
        await Promise.race([
          apiRequest("POST", "/api/logout"),
          // Timeout after 2 seconds
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
        ]).catch(() => {
          // Silently fail - we'll clear client state anyway
          console.debug('Logout API call failed (proceeding with client cleanup)');
        });
      } catch (e) {
        // Continue with client cleanup regardless of server response
        console.debug('Logout network issue - proceeding with client cleanup');
      }

      // Force clear all auth state regardless of server response
      removeToken();
      setAuthToken(null);

      // Clear all query cache
      queryClient.clear();

      // Clear session storage
      sessionStorage.clear();

      // Remove auth cookie if present
      document.cookie = 'connect.sid=; Max-Age=0; path=/; domain=' + window.location.hostname;

      // Force reload the app to clear React state
      setTimeout(() => {
        window.location.href = '/auth';
      }, 100);

      return { success: true };
    },
    onSuccess: () => {
      // This might not run if we redirect first
      queryClient.setQueryData(["/api/user"], null);
    },
    onError: () => {
      // No error logging - all errors are handled gracefully above
      // Just ensure cleanup happens
      setTimeout(() => {
        window.location.href = '/auth?force=true';
      }, 100);
    },
  });

  // Refresh token mutation
  const refreshTokenMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/token");
      return await res.json();
    },
    onSuccess: (data: { token: string }) => {
      storeToken(data.token);
      setAuthToken(data.token);
    },
    onError: (error: Error) => {
      toast({
        title: "Session expired",
        description: "Please log in again.",
        variant: "destructive",
      });

      // Clear invalid token
      removeToken();
      setAuthToken(null);
      queryClient.setQueryData(["/api/user"], null);
    },
  });

  // Sign out of all devices mutation - destroys all sessions and logs user out
  const invalidateTokensMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/invalidate-tokens");
      return await res.json();
    },
    onSuccess: (data: { success: boolean; message: string }) => {
      console.log("Successfully signed out of all devices:", data);

      // Complete authentication cleanup
      removeToken();
      setAuthToken(null);
      authStore.clear(); // Clear the auth store

      // Clear all storage
      localStorage.clear();
      sessionStorage.clear();

      // Clear all query cache
      queryClient.clear();

      // Clear auth cookies
      document.cookie = 'connect.sid=; Max-Age=0; path=/; domain=' + window.location.hostname;
      document.cookie = 'connect.sid=; Max-Age=0; path=/';

      toast({
        title: "Signed out successfully",
        description: data.message,
        variant: "default",
      });

      // Force immediate redirect to login page
      setTimeout(() => {
        window.location.href = '/auth?tab=login&signedout=all';
      }, 1000);
    },
    onError: (error: Error) => {
      console.error("Error signing out of all devices:", error);
      toast({
        title: "Error signing out",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Direct logout function with resilient error handling
  const logout = async () => {
    console.log('Logout initiated - clearing authentication state');

    // Immediately clear auth store to prevent component updates
    authStore.clear();

    try {
      // Attempt server logout but don't block on failure
      const logoutPromise = fetch('/api/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      }).catch(() => {
        // Silently fail - we'll clear client state anyway
        console.debug('Logout API call failed (proceeding with client cleanup)');
      });

      // Race with timeout but don't await - let it complete in background
      Promise.race([
        logoutPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
      ]).catch(() => {
        console.debug('Logout server call timed out - proceeding with navigation');
      });

    } catch (err) {
      console.debug('Logout network issue - proceeding with client cleanup');
    }

    // Client-side cleanup (critical) - wrap each step to prevent errors
    try { removeToken(); } catch (e) { console.debug('removeToken error:', e); }
    try { setAuthToken(null); } catch (e) { console.debug('setAuthToken error:', e); }
    try { queryClient.setQueryData(["/api/user"], null); } catch (e) { console.debug('queryClient error:', e); }
    try { sessionStorage.clear(); } catch (e) { console.debug('sessionStorage error:', e); }
    try { 
      document.cookie = 'connect.sid=; Max-Age=0; path=/; domain=' + window.location.hostname;
    } catch (e) { 
      console.debug('cookie error:', e); 
    }

    // Navigate immediately after cleanup - don't await anything
    console.log('Logout complete - navigating to login');
    window.location.href = "/auth?tab=login";
  };

  // Check if token is expired
  const checkTokenExpired = () => isTokenExpired();

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        token: getStoredToken(),
        loginMutation,
        logoutMutation,
        registerMutation,
        refreshTokenMutation,
        invalidateTokensMutation,
        logout,
        isTokenExpired: checkTokenExpired
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}