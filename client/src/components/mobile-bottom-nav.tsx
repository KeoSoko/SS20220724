import { Home, TrendingUp, Users, User, Brain } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

const navItems = [
  { 
    name: "Home", 
    path: "/home", 
    icon: Home 
  },
  { 
    name: "Smart AI", 
    path: "/smart", 
    icon: Brain 
  },
  { 
    name: "Reports", 
    path: "/analytics", 
    icon: TrendingUp 
  },
  { 
    name: "Tax Pros", 
    path: "/tax-pros", 
    icon: Users 
  },
  { 
    name: "Profile", 
    path: "/profile", 
    icon: User 
  }
];

export function MobileBottomNav() {
  const [location, setLocation] = useLocation();
  
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-2 px-4 flex justify-around items-center shadow-lg lg:hidden z-30">
      {navItems.map((item) => {
        const isActive = location === item.path;
        
        return (
          <button
            key={item.path}
            onClick={() => setLocation(item.path)}
            className={cn(
              "flex flex-col items-center justify-center",
              "w-16 py-1 rounded-none transition-colors",
              isActive 
                ? "text-[#0073AA]"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            <item.icon size={isActive ? 24 : 22} className={isActive ? "stroke-[#0073AA]" : ""} />
            <span className={cn(
              "text-xs mt-1",
              isActive ? "font-medium" : ""
            )}>
              {item.name}
            </span>
          </button>
        );
      })}
    </nav>
  );
}