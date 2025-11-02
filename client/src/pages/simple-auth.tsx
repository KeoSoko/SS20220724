import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { XIcon, UserIcon, LockIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function SimpleAuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [username, setUsername] = useState("testuser");
  const [password, setPassword] = useState("password123");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      setLocation("/home");
    }
  }, [user, setLocation]);
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !password) {
      toast({
        title: "Missing fields",
        description: "Please enter your username and password",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoggingIn(true);
    
    try {
      console.log("Attempting login with:", username);
      
      // Add debug information to help diagnose login issues
      console.log("LOGIN DEBUG: Using credentials", {
        username,
        passwordLength: password.length,
        timestamp: new Date().toISOString()
      });
      
      // Simple direct fetch for login
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Debug-Info": "1" // Add debug header
        },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      });
      
      const responseText = await response.text();
      console.log("Login response:", response.status, responseText);
      
      // Test if the endpoint is working
      if (!response.ok) {
        // Create a more detailed error message
        const errorDetails = `Status: ${response.status}, Response: ${responseText}`;
        console.error("Login error details:", errorDetails);
        
        // Show specific error message for different types of failures
        if (response.status === 401) {
          throw new Error("Invalid username or password. Please try again.");
        } else if (response.status === 500) {
          throw new Error("Server error during login. Please try again later.");
        } else {
          throw new Error(`Login failed: ${response.status} ${response.statusText}\n${responseText}`);
        }
      }
      
      // Try to parse the response
      let data;
      try {
        data = JSON.parse(responseText);
        console.log("Parsed login response data:", JSON.stringify(data));
      } catch (e) {
        console.error("Failed to parse JSON response:", e, "Raw response:", responseText);
        throw new Error("Invalid response from server");
      }
      
      console.log("Login successful!", data);
      
      // Store auth token
      if (data.token) {
        localStorage.setItem("auth_token", data.token);
        console.log("Stored auth token (length):", data.token.length);
        
        if (data.expiresIn) {
          const expiresAt = Date.now() + (data.expiresIn * 1000);
          localStorage.setItem("token_expires_at", expiresAt.toString());
          console.log("Token expires at:", new Date(expiresAt).toISOString());
        }
      } else {
        console.warn("No token received in login response");
      }
      
      // Store user info
      if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
        console.log("Stored user data:", data.user.id, data.user.username);
      } else {
        console.warn("No user data received in login response");
      }
      
      toast({
        title: "Login successful!",
        description: "Redirecting you to the dashboard...",
      });
      
      // Try to manually fetch user data to confirm login worked
      try {
        const userCheckResponse = await fetch("/api/user", {
          credentials: "include",
          headers: {
            "Authorization": data.token ? `Bearer ${data.token}` : ""
          }
        });
        console.log("User check response:", userCheckResponse.status, await userCheckResponse.text());
      } catch (checkError) {
        console.warn("User validation check failed:", checkError);
      }
      
      // Redirect to home dashboard after a short delay
      setTimeout(() => {
        setLocation("/home");
      }, 1000);
      
    } catch (error) {
      console.error("Login error:", error);
      
      toast({
        title: "Login failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
      
      setIsLoggingIn(false);
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#E6E7E8] p-4">
      <Card className="w-full max-w-md bg-white rounded-none p-6 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold text-center flex-1">DIRECT LOGIN</h1>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setLocation("/welcome")}
            className="rounded-none h-8 w-8"
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </div>
        
        <CardContent className="p-0">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <div className="flex items-center mb-2">
                <UserIcon className="h-4 w-4 mr-2 text-gray-400" />
                <span className="text-sm text-gray-600">Username</span>
              </div>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="USERNAME"
                className="bg-gray-50 border-0"
              />
            </div>
            
            <div>
              <div className="flex items-center mb-2">
                <LockIcon className="h-4 w-4 mr-2 text-gray-400" />
                <span className="text-sm text-gray-600">Password</span>
              </div>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="PASSWORD"
                className="bg-gray-50 border-0"
              />
            </div>
            
            <Button 
              type="submit" 
              className="w-full rounded-none bg-[#0073AA] hover:bg-[#005d87] text-white py-6 font-semibold text-base"
              disabled={isLoggingIn}
            >
              {isLoggingIn ? "LOGGING IN..." : "LOGIN WITH TEST ACCOUNT"}
            </Button>
            
            <div className="text-center mt-4 space-y-2">
              <p className="text-sm text-gray-500">
                Test accounts (auto-filled):
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => {
                    setUsername("testuser");
                    setPassword("password123");
                  }}
                  className="text-xs py-1"
                >
                  testuser
                </Button>
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => {
                    setUsername("KeoSoko");
                    setPassword("password123");
                  }}
                  className="text-xs py-1"
                >
                  KeoSoko
                </Button>
              </div>
              
              <p className="text-xs text-gray-400 mt-2">
                Note: This is a simplified login page for development and testing only.
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}