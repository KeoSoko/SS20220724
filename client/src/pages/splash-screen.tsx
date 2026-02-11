import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

/**
 * Logo component with premium design and enhanced visual effects
 * Using brand colors: #0073AA, #E5E6E7, #000000, #ffffff
 */
function SplashLogo() {
  return (
    <div className="relative w-56 h-56 mx-auto">
      {/* Outer glow effect */}
      <div 
        className="absolute inset-0 rounded-none animate-pulse"
        style={{ 
          background: `radial-gradient(circle, 
            rgba(0, 115, 170, 0.3) 0%, 
            rgba(0, 115, 170, 0.1) 40%, 
            transparent 70%)`,
          filter: 'blur(8px)'
        }}
      />
      
      {/* Main circle with gradient */}
      <div 
        className="absolute inset-4 rounded-none transform transition-transform duration-1000 hover:scale-105"
        style={{ 
          background: `linear-gradient(135deg, 
            #ffffff 0%, 
            #E5E6E7 50%, 
            #ffffff 100%)`,
          boxShadow: `
            0 8px 32px rgba(0, 115, 170, 0.3),
            0 4px 16px rgba(0, 0, 0, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.8),
            inset 0 -1px 0 rgba(0, 0, 0, 0.1)`
        }}
      />
      
      {/* Inner highlight ring */}
      <div 
        className="absolute inset-6 rounded-none"
        style={{ 
          background: `conic-gradient(from 0deg, 
            transparent 0deg, 
            rgba(0, 115, 170, 0.2) 90deg, 
            transparent 180deg, 
            rgba(0, 115, 170, 0.2) 270deg, 
            transparent 360deg)`,
          padding: '2px'
        }}
      >
        <div 
          className="w-full h-full rounded-none"
          style={{ backgroundColor: '#ffffff' }}
        />
      </div>
      
      {/* Logo with enhanced presentation */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative">
          <div className="w-40 h-40 z-10 drop-shadow-lg flex items-center justify-center bg-white rounded-lg">
            <img 
              src="/simple-slips-logo.png" 
              alt="Simple Slips" 
              className="w-32 h-32 object-contain"
              onLoad={(e) => {
                console.log('✅ Simple Slips logo loaded successfully from /simple-slips-logo.png');
                console.log('Logo dimensions:', e.currentTarget.naturalWidth, 'x', e.currentTarget.naturalHeight);
              }}
              onError={(e) => {
                console.error('❌ Simple Slips logo failed to load from /simple-slips-logo.png');
                console.error('Error event:', e);
                e.currentTarget.style.display = 'none';
                const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                if (fallback) {
                  console.log('🔄 Showing SS fallback logo');
                  fallback.style.display = 'flex';
                }
              }}
            />
            <div className="w-32 h-32 flex items-center justify-center bg-[#0073AA] text-white font-bold text-4xl rounded-lg" style={{display: 'none'}}>
              SS
            </div>
          </div>
        </div>
      </div>
      
      {/* Subtle rotating accent */}
      <div 
        className="absolute inset-0 rounded-none animate-spin"
        style={{ 
          background: `conic-gradient(from 0deg, 
            transparent 0deg, 
            rgba(0, 115, 170, 0.1) 30deg, 
            transparent 60deg)`,
          animationDuration: '8s'
        }}
      />
    </div>
  );
}

export default function SplashScreen() {
  const [, setLocation] = useLocation();
  const [showContent, setShowContent] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const { user, isLoading } = useAuth();
  
  console.log("[SplashScreen] Rendering with user:", !!user, "isLoading:", isLoading, "showContent:", showContent);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleMotionPreferenceChange = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    handleMotionPreferenceChange();
    mediaQuery.addEventListener("change", handleMotionPreferenceChange);

    return () => {
      mediaQuery.removeEventListener("change", handleMotionPreferenceChange);
    };
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      setShowContent(true);
      return;
    }

    const contentTimer = setTimeout(() => {
      setShowContent(true);
    }, 150);

    return () => {
      clearTimeout(contentTimer);
    };
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const destination = user ? "/home" : "/auth";
    const redirectDelay = prefersReducedMotion ? 0 : 75;

    const navigationTimer = setTimeout(() => {
      console.log(`[SplashScreen] Auth resolved, redirecting to ${destination}`);
      setLocation(destination);
    }, redirectDelay);

    return () => {
      clearTimeout(navigationTimer);
    };
  }, [isLoading, prefersReducedMotion, setLocation, user]);
  
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
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
      
      {/* Subtle overlay pattern for texture */}
      <div 
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, #0073AA 1px, transparent 0)`,
          backgroundSize: '20px 20px'
        }}
      />
      
      <div
        className={`transform relative z-10 ${prefersReducedMotion ? "transition-none" : "transition-all duration-1000"} ${showContent ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-10 opacity-0 scale-95'}`}
        style={{ visibility: showContent ? 'visible' : 'hidden' }}
      >
        <SplashLogo />
        
        <h1 className="text-center text-xl tracking-wide mt-8 font-medium text-gray-800">
          Receipts & admin, sorted.
        </h1>
      </div>
    </div>
  );
}
