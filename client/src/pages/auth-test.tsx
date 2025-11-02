import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AuthTest() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  async function handleLogin() {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Login failed");
      }
      
      setResult(data);
      
      // Save token to localStorage
      if (data.token) {
        localStorage.setItem("auth_token", data.token);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during login");
    } finally {
      setLoading(false);
    }
  }
  
  function handleFetchUser() {
    setLoading(true);
    setError(null);
    
    // Get the token from localStorage
    const token = localStorage.getItem("auth_token");
    
    fetch("/api/user", {
      headers: {
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      },
      credentials: "include",
    })
      .then(res => {
        if (!res.ok) {
          if (res.status === 401) {
            throw new Error("Unauthorized - Please log in");
          }
          throw new Error("Failed to fetch user data");
        }
        return res.json();
      })
      .then(data => {
        setResult(data);
      })
      .catch(err => {
        setError(err.message || "An error occurred");
      })
      .finally(() => {
        setLoading(false);
      });
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Auth Test Page</h1>
      
      <div className="grid gap-4 mb-8 max-w-md">
        <div>
          <label className="block mb-1">Username</label>
          <Input 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
            placeholder="Enter username"
          />
        </div>
        
        <div>
          <label className="block mb-1">Password</label>
          <Input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            placeholder="Enter password"
          />
        </div>
        
        <div className="flex gap-2">
          <Button onClick={handleLogin} disabled={loading}>
            {loading ? "Loading..." : "Test Login"}
          </Button>
          
          <Button variant="outline" onClick={handleFetchUser} disabled={loading}>
            Test Fetch User
          </Button>
        </div>
        
        {error && (
          <div className="text-red-500 p-2 border border-red-200 bg-red-50 rounded">
            {error}
          </div>
        )}
        
        {result && (
          <div className="mt-4">
            <h2 className="text-lg font-semibold mb-2">Result:</h2>
            <pre className="bg-gray-100 p-4 rounded overflow-auto max-h-96">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}