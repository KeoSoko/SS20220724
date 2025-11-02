import { useAuth } from "@/hooks/use-auth";
import { Redirect, Route } from "wouter";
import React, { useState, useEffect, useMemo } from "react";
import { LoadingScreen } from "@/components/loading-screen";

export function ProtectedRoute({
  path,
  component: Component,
}: {
  path: string;
  component: React.ComponentType;
}) {
  const { user, isLoading, token } = useAuth();
  
  // Get the token expiration check function
  const isTokenExpired = useAuth().isTokenExpired;
  
  // Memoize authentication checks to prevent unnecessary re-renders
  const hasValidToken = useMemo(() => !!token && !isTokenExpired(), [token, isTokenExpired]);
  const isAuthenticated = useMemo(() => hasValidToken || !!user, [hasValidToken, user]);
  const shouldShowLoading = useMemo(() => isLoading && !hasValidToken, [isLoading, hasValidToken]);
  
  console.log(`ProtectedRoute[${path}]: user=${!!user}, token=${!!token}, expired=${isTokenExpired()}, isLoading=${isLoading}`);

  // If we have a valid token, NEVER show loading screen - go straight to component
  if (hasValidToken) {
    return (
      <Route path={path}>
        <Component />
      </Route>
    );
  }

  return (
    <Route path={path}>
      {shouldShowLoading ? (
        <LoadingScreen message="Verifying your account..." />
      ) : !isAuthenticated ? (
        <Redirect to="/auth" />
      ) : (
        <Component />
      )}
    </Route>
  );
}
