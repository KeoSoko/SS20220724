import { useAuth } from "@/hooks/use-auth";
import { Redirect, Route } from "wouter";
import { useMemo } from "react";
import { LoadingScreen } from "@/components/loading-screen";

export function AdminRoute({
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
  const isAdmin = useMemo(() => user?.isAdmin === true, [user]);
  
  console.log(`AdminRoute[${path}]: user=${!!user}, isAdmin=${isAdmin}, token=${!!token}, expired=${isTokenExpired()}, isLoading=${isLoading}`);

  // If we have a valid token and admin status, go straight to component
  if (hasValidToken && isAdmin) {
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
      ) : !isAdmin ? (
        <Redirect to="/" />
      ) : (
        <Component />
      )}
    </Route>
  );
}
