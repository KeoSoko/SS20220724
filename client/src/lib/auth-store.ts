import { User as SelectUser } from "@shared/schema";

// Synchronous persistent auth store - initialize immediately from localStorage
let currentUser: SelectUser | null = null;

// Try to restore user from localStorage on module load (synchronous)
try {
  const stored = localStorage.getItem('persistent_auth_user');
  if (stored) {
    currentUser = JSON.parse(stored);
    console.log('Auth store initialized with stored user:', currentUser?.username);
  }
} catch (error) {
  console.warn('Failed to restore user from localStorage:', error);
  currentUser = null;
}

let subscribers: Array<(user: SelectUser | null) => void> = [];

export const authStore = {
  getCurrentUser: (): SelectUser | null => {
    console.log('Store getCurrentUser called, returning:', currentUser?.username || 'null');
    return currentUser;
  },
  
  setCurrentUser: (user: SelectUser | null): void => {
    console.log('Store setCurrentUser called with:', user?.username || 'null');
    currentUser = user;
    
    // Immediately persist to localStorage (synchronous)
    try {
      if (user) {
        localStorage.setItem('persistent_auth_user', JSON.stringify(user));
      } else {
        localStorage.removeItem('persistent_auth_user');
      }
    } catch (error) {
      console.warn('Failed to persist user to localStorage:', error);
    }
    
    // Notify all subscribers of the change
    subscribers.forEach(callback => {
      try {
        callback(user);
      } catch (error) {
        console.warn('Error in auth store subscriber:', error);
      }
    });
  },
  
  subscribe: (callback: (user: SelectUser | null) => void): (() => void) => {
    subscribers.push(callback);
    console.log('New auth store subscription, total subscribers:', subscribers.length);
    // Return unsubscribe function
    return () => {
      subscribers = subscribers.filter(cb => cb !== callback);
      console.log('Auth store unsubscribed, remaining subscribers:', subscribers.length);
    };
  },
  
  // Clear all data (for logout)
  clear: (): void => {
    console.log('Auth store clearing all data');
    currentUser = null;
    localStorage.removeItem('persistent_auth_user');
    subscribers.forEach(callback => {
      try {
        callback(null);
      } catch (error) {
        console.warn('Error in auth store clear callback:', error);
      }
    });
  }
};