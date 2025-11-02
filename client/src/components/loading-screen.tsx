import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface LoadingScreenProps {
  message?: string;
  color?: string;
}

export function LoadingScreen({ 
  message = 'Loading your dashboard...', 
  color = '#0073AA' 
}: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  
  // Simulate progress
  useEffect(() => {
    const timer = setTimeout(() => {
      setProgress(10);
    }, 300);
    
    const timer2 = setTimeout(() => {
      setProgress(30);
    }, 800);
    
    const timer3 = setTimeout(() => {
      setProgress(50);
    }, 1400);
    
    const timer4 = setTimeout(() => {
      setProgress(70);
    }, 2000);
    
    const timer5 = setTimeout(() => {
      setProgress(90);
    }, 2600);
    
    const timer6 = setTimeout(() => {
      setProgress(100);
    }, 3000);
    
    return () => {
      clearTimeout(timer);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      clearTimeout(timer5);
      clearTimeout(timer6);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center space-y-6 z-50">
      <div className="flex flex-col items-center space-y-10">
        <div className="w-32 h-32 relative">
          <Loader2 
            className="w-32 h-32 animate-spin text-[#0073AA]" 
            style={{ color }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-white rounded-none w-24 h-24 flex items-center justify-center">
              <img 
                src="/simple-slips-logo.png" 
                alt="Simple Slips" 
                className="w-16 h-16 object-contain"
                onError={(e) => {
                  // Fallback to generic icon if logo fails to load
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">SIMPLE Slips</h2>
          <p className="text-gray-600">{message}</p>
        </div>
      </div>
      
      <div className="w-80 mt-8">
        <Progress value={progress} className="h-2" />
        <p className="text-sm text-right mt-1 text-gray-500">{progress}%</p>
      </div>
    </div>
  );
}