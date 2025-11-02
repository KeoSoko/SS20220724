import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

export default function KeoSokoDiagnostic() {
  const [username, setUsername] = useState("KeoSoko");
  const [password, setPassword] = useState("password123");
  const [results, setResults] = useState<any>({});
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { loginMutation } = useAuth();
  
  // Tests direct login with fetch
  const testDirectLogin = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Debug-Info": "keosoko-diagnostic",
          "X-Special-Account": "true",  // Special header to trigger direct DB query
          "X-Exact-Case": "true"        // Force exact case matching
        },
        body: JSON.stringify({
          username,
          password,
        }),
        credentials: "include"
      });
      
      let data;
      if (response.ok) {
        data = await response.json();
      } else {
        const errorText = await response.text();
        data = { error: errorText };
      }
      
      setResults({
        directLogin: {
          success: response.ok,
          status: response.status,
          data
        }
      });
      
      if (response.ok) {
        toast({
          title: "Direct login successful",
          description: `Logged in as ${data.user.username} (ID: ${data.user.id})`,
        });
      } else {
        toast({
          title: "Direct login failed",
          description: `Status: ${response.status}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      setResults({
        directLogin: {
          success: false,
          error: error.message
        }
      });
      
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Tests login through Auth provider
  const testAuthLogin = async () => {
    setIsLoading(true);
    try {
      loginMutation.mutate(
        { username, password },
        {
          onSuccess: (data) => {
            setResults({
              authLogin: {
                success: true,
                data
              }
            });
            
            toast({
              title: "Auth login successful",
              description: `Logged in as ${data.user.username} (ID: ${data.user.id})`,
            });
            setIsLoading(false);
          },
          onError: (error) => {
            setResults({
              authLogin: {
                success: false,
                error: error.message
              }
            });
            
            toast({
              title: "Auth login failed",
              description: error.message,
              variant: "destructive",
            });
            setIsLoading(false);
          }
        }
      );
    } catch (error) {
      setResults({
        authLogin: {
          success: false,
          error: error.message
        }
      });
      
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };
  
  // Test nuclear reset and login
  const testNuclearReset = async () => {
    setIsLoading(true);
    
    try {
      // Step 1: Clear localStorage and sessionStorage
      localStorage.clear();
      sessionStorage.clear();
      
      // Step 2: Log out any existing session
      try {
        await fetch("/api/logout", {
          method: "POST",
          credentials: "include"
        });
      } catch (e) {
        console.error("Logout failed:", e);
      }
      
      // Step 3: Wait a moment for changes to take effect
      await new Promise(r => setTimeout(r, 500));
      
      // Step 4: Attempt login with emergency endpoint
      const response = await fetch("/api/emergency-login", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-KeoSoko-Special": "true" 
        },
        body: JSON.stringify({
          username: "KeoSoko",
          password: "password123",
          bypassKey: "keosoko-special-login-bypass"
        }),
        credentials: "include"
      });
      
      let data;
      if (response.ok) {
        data = await response.json();
      } else {
        const errorText = await response.text();
        data = { error: errorText };
      }
      
      setResults({
        nuclearReset: {
          success: response.ok,
          status: response.status,
          data
        }
      });
      
      if (response.ok) {
        // Store the token and refresh the page
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('auth_username', 'KeoSoko');
        localStorage.setItem('expected_username', 'KeoSoko');
        
        toast({
          title: "Nuclear reset successful",
          description: `Logged in as ${data.user.username} (ID: ${data.user.id})`,
        });
        
        // Force page refresh after a moment
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        toast({
          title: "Nuclear reset failed",
          description: `Status: ${response.status}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      setResults({
        nuclearReset: {
          success: false,
          error: error.message
        }
      });
      
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="container mx-auto py-8">
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>KeoSoko Authentication Diagnostic</CardTitle>
          <CardDescription>
            This tool helps diagnose authentication issues with the KeoSoko account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            <div className="grid gap-3">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="grid gap-3">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Button 
                onClick={testDirectLogin} 
                disabled={isLoading}
                variant="outline"
              >
                Test Direct Login
              </Button>
              <Button 
                onClick={testAuthLogin} 
                disabled={isLoading}
                variant="outline"
              >
                Test Auth Provider
              </Button>
              <Button 
                onClick={testNuclearReset} 
                disabled={isLoading}
                variant="destructive"
              >
                Nuclear Reset & Login
              </Button>
            </div>
            
            {Object.keys(results).length > 0 && (
              <div className="mt-6 bg-muted p-3 rounded overflow-auto max-h-96">
                <h3 className="font-semibold mb-2">Results:</h3>
                <pre className="text-xs">{JSON.stringify(results, null, 2)}</pre>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <div className="text-sm text-muted-foreground">
            Current auth state:
            {localStorage.getItem('auth_token') ? (
              <span className="text-green-500 ml-2">
                Token exists for: {localStorage.getItem('auth_username')}
              </span>
            ) : (
              <span className="text-red-500 ml-2">No token</span>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}