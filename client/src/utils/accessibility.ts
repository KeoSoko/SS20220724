// WCAG 2.1 AA compliance utilities

export function announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite') {
  const announcement = document.createElement('div');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;
  
  document.body.appendChild(announcement);
  
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

export function checkColorContrast(foreground: string, background: string): boolean {
  // Convert hex to RGB
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };

  const getLuminance = (r: number, g: number, b: number) => {
    const [rs, gs, bs] = [r, g, b].map(c => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);
  
  if (!fg || !bg) return false;

  const fgLum = getLuminance(fg.r, fg.g, fg.b);
  const bgLum = getLuminance(bg.r, bg.g, bg.b);
  
  const ratio = (Math.max(fgLum, bgLum) + 0.05) / (Math.min(fgLum, bgLum) + 0.05);
  
  return ratio >= 4.5; // WCAG AA standard
}

export function trapFocus(element: HTMLElement) {
  const focusableElements = element.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  
  const firstElement = focusableElements[0] as HTMLElement;
  const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

  const handleTabKey = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    }
    
    if (e.key === 'Escape') {
      element.focus();
    }
  };

  element.addEventListener('keydown', handleTabKey);
  return () => element.removeEventListener('keydown', handleTabKey);
}

export function enhanceFormAccessibility(form: HTMLFormElement) {
  const inputs = form.querySelectorAll('input, select, textarea');
  
  inputs.forEach(input => {
    const label = form.querySelector(`label[for="${input.id}"]`);
    
    if (!label && !input.getAttribute('aria-label')) {
      console.warn(`Input ${input.id} missing accessible label`);
    }
    
    // Add required indicator for screen readers
    if (input.hasAttribute('required')) {
      input.setAttribute('aria-required', 'true');
    }
    
    // Enhanced error messaging
    input.addEventListener('invalid', () => {
      const errorId = `${input.id}-error`;
      let errorElement = document.getElementById(errorId);
      
      if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.id = errorId;
        errorElement.className = 'text-red-600 text-sm mt-1';
        errorElement.setAttribute('role', 'alert');
        input.parentNode?.insertBefore(errorElement, input.nextSibling);
      }
      
      errorElement.textContent = (input as HTMLInputElement).validationMessage;
      input.setAttribute('aria-describedby', errorId);
      input.setAttribute('aria-invalid', 'true');
    });
    
    input.addEventListener('input', () => {
      if ((input as HTMLInputElement).checkValidity()) {
        input.removeAttribute('aria-invalid');
        const errorElement = document.getElementById(`${input.id}-error`);
        if (errorElement) {
          errorElement.remove();
          input.removeAttribute('aria-describedby');
        }
      }
    });
  });
}

// Skip link component for keyboard navigation
export function createSkipLink() {
  const skipLink = document.createElement('a');
  skipLink.href = '#main-content';
  skipLink.textContent = 'Skip to main content';
  skipLink.className = 'sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 bg-blue-600 text-white p-2 z-50';
  
  document.body.insertBefore(skipLink, document.body.firstChild);
  
  return skipLink;
}