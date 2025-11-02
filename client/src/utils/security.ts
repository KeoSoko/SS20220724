import DOMPurify from 'dompurify';

// Input sanitization with DOMPurify
export function sanitizeHtml(input: string): string {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'span'],
    ALLOWED_ATTR: ['class']
  });
}

export function sanitizeText(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
}

// CSRF token management
export function generateCSRFToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function setCSRFToken(token: string) {
  document.cookie = `csrf-token=${token}; Secure; SameSite=Strict; Path=/`;
}

export function getCSRFToken(): string | null {
  const match = document.cookie.match(/csrf-token=([^;]+)/);
  return match ? match[1] : null;
}

// Secure API request wrapper
export async function secureApiRequest(
  url: string, 
  options: RequestInit = {}
): Promise<Response> {
  const csrfToken = getCSRFToken();
  
  const secureOptions: RequestInit = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
      ...options.headers
    },
    credentials: 'include' // Include httpOnly cookies
  };

  // Sanitize request body if it exists
  if (options.body && typeof options.body === 'string') {
    try {
      const parsed = JSON.parse(options.body);
      const sanitized = sanitizeRequestData(parsed);
      secureOptions.body = JSON.stringify(sanitized);
    } catch {
      // If not JSON, sanitize as text
      secureOptions.body = sanitizeText(options.body);
    }
  }

  return fetch(url, secureOptions);
}

function sanitizeRequestData(data: any): any {
  if (typeof data === 'string') {
    return sanitizeText(data);
  }
  
  if (Array.isArray(data)) {
    return data.map(sanitizeRequestData);
  }
  
  if (data && typeof data === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      sanitized[sanitizeText(key)] = sanitizeRequestData(value);
    }
    return sanitized;
  }
  
  return data;
}

// Content Security Policy helpers
export function initializeCSP() {
  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'", // Allow inline scripts for Vite
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://api.openai.com https://*.documents.azure.com",
    "font-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
  
  document.head.appendChild(meta);
}

// Rate limiting for client-side protection
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  
  isAllowed(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    
    // Remove expired requests
    const validRequests = requests.filter(time => now - time < windowMs);
    
    if (validRequests.length >= maxRequests) {
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(key, validRequests);
    return true;
  }
  
  reset(key: string) {
    this.requests.delete(key);
  }
}

export const rateLimiter = new RateLimiter();

// Secure file upload validation
export function validateFileUpload(file: File): { isValid: boolean; error?: string } {
  // File type validation
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return { isValid: false, error: 'Invalid file type' };
  }
  
  // File size validation (40MB max)
  const maxSize = 40 * 1024 * 1024;
  if (file.size > maxSize) {
    return { isValid: false, error: 'File too large' };
  }
  
  // File name validation
  const sanitizedName = sanitizeText(file.name);
  if (sanitizedName !== file.name) {
    return { isValid: false, error: 'Invalid file name' };
  }
  
  return { isValid: true };
}