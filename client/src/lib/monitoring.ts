/**
 * Client-side error monitoring and logging
 */

interface ErrorLogEntry {
  message: string;
  stack?: string;
  url: string;
  userAgent: string;
  timestamp: string;
  userId?: number;
  username?: string;
  component?: string;
  type: 'error' | 'unhandledRejection' | 'boundary';
}

let userId: number | undefined;
let username: string | undefined;

export function setUserContext(user: { id: number; username: string } | null) {
  userId = user?.id;
  username = user?.username;
}

export function logError(error: Error | string, type: 'error' | 'unhandledRejection' | 'boundary' = 'error', component?: string) {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorStack = typeof error === 'string' ? undefined : error.stack;

  const logEntry: ErrorLogEntry = {
    message: errorMessage,
    stack: errorStack,
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    userId,
    username,
    component,
    type
  };

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error('[Error Monitor]', logEntry);
  }

  // Send to server (fail silently if it doesn't work)
  fetch('/api/log-error', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
    },
    body: JSON.stringify(logEntry)
  }).catch(() => {
    // Fail silently to avoid infinite error loops
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Error Monitor] Failed to send error to server');
    }
  });
}

export function logPerformance(metric: string, value: number, context?: Record<string, any>) {
  const performanceEntry = {
    metric,
    value,
    context,
    url: window.location.href,
    timestamp: new Date().toISOString(),
    userId,
    username
  };

  if (process.env.NODE_ENV === 'development') {
    console.log('[Performance Monitor]', performanceEntry);
  }

  fetch('/api/log-performance', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
    },
    body: JSON.stringify(performanceEntry)
  }).catch(() => {
    // Fail silently
  });
}

/**
 * Initialize global error handlers
 */
export function initializeErrorMonitoring() {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    logError(event.reason?.message || 'Unhandled promise rejection', 'unhandledRejection');
  });

  // Handle uncaught errors
  window.addEventListener('error', (event) => {
    logError(event.error || event.message, 'error');
  });

  // Performance monitoring
  if ('performance' in window && 'PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'navigation') {
            const navEntry = entry as PerformanceNavigationTiming;
            logPerformance('page_load_time', navEntry.loadEventEnd - navEntry.fetchStart);
          }
          
          if (entry.entryType === 'largest-contentful-paint') {
            logPerformance('largest_contentful_paint', entry.startTime);
          }
        });
      });
      
      observer.observe({ entryTypes: ['navigation', 'largest-contentful-paint'] });
    } catch (e) {
      // Performance observer not supported, continue silently
    }
  }

  console.log('[Monitoring] Error monitoring initialized');
}