import { QueryClient, QueryFunction } from "@tanstack/react-query";

// JWT token - initialize from localStorage
let authToken: string | null = null;

// Initialize token from localStorage on load
if (typeof window !== 'undefined') {
  authToken = localStorage.getItem('auth_token');
}

// Set JWT token for authentication
export function setAuthToken(token: string | null): void {
  authToken = token;
  if (token && typeof window !== 'undefined') {
    localStorage.setItem('auth_token', token);
    console.log('Setting auth token in queryClient:', token ? 'exists' : 'null');
  } else if (typeof window !== 'undefined') {
    localStorage.removeItem('auth_token');
  }
}

// Get current JWT token
export function getAuthToken(): string | null {
  return authToken;
}

// Helper function to throw error for non-ok responses
async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    
    // Try to parse JSON error response for better error handling
    try {
      const errorData = JSON.parse(text);
      
      // Special handling for offline responses from service worker
      if (res.status === 202 && errorData.offline === true) {
        // Don't throw an error for offline responses - let the caller handle it
        return;
      }
      
      // Handle 503 service unavailable (offline) more gracefully
      if (res.status === 503 && errorData.offline === true) {
        const error = new Error(errorData.message || "You're currently offline");
        (error as any).status = res.status;
        (error as any).offline = true;
        (error as any).responseData = errorData;
        throw error;
      }
      
      // Create structured error object like our auth hook does
      const error = new Error(errorData.message || errorData.error || `${res.status}: ${res.statusText}`);
      (error as any).status = res.status;
      (error as any).errorType = errorData.error;
      (error as any).originalMessage = errorData.message || errorData.error;
      (error as any).responseData = errorData;
      throw error;
    } catch (parseError) {
      // If JSON parsing fails, throw generic error
      throw new Error(`${res.status}: ${text}`);
    }
  }
}

// Create default headers with or without auth token
function createHeaders(includeContentType: boolean = false): HeadersInit {
  const headers: Record<string, string> = {};
  
  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }
  
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  
  return headers;
}

// Make API requests with authentication
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const headers = {
    ...createHeaders(!!data),
    ...(extraHeaders || {})
  };
  
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include", // Include credentials for session-based auth fallback
    });

    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    // Handle network errors that happen before service worker can intercept
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      // This is a network error - check if we're offline
      if (!navigator.onLine) {
        // Create an offline response that looks like our service worker response
        const offlineResponse = new Response(
          JSON.stringify({ 
            offline: true,
            message: 'You are currently offline'
          }),
          {
            status: 202,
            statusText: 'Accepted',
            headers: { 'Content-Type': 'application/json' }
          }
        );
        return offlineResponse;
      }
    }
    
    // Re-throw other errors
    throw error;
  }
}

// Query function factory with token support
type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Build URL with query parameters
    let url = queryKey[0] as string;
    
    // If there are query parameters in queryKey[1], append them to the URL
    if (queryKey[1] && typeof queryKey[1] === 'object') {
      const params = new URLSearchParams();
      const queryParams = queryKey[1] as Record<string, any>;
      
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, String(value));
        }
      });
      
      if (params.toString()) {
        url += (url.includes('?') ? '&' : '?') + params.toString();
      }
    }
    
    console.log(`[QueryClient] Fetching URL: ${url}`);
    console.log(`[QueryClient] Auth token available: ${!!authToken}`);
    
    const headers = createHeaders();
    console.log(`[QueryClient] Request headers:`, Object.keys(headers));
    
    const res = await fetch(url, {
      headers,
      credentials: "include", // Include credentials for session-based auth fallback
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

// Global query client configuration
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
