import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, Users, Shield, Eye, Edit } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useIsMobile } from "@/hooks/use-mobile";

interface InviteDetails {
  email: string;
  role: string;
  workspaceName: string;
  invitedBy: string;
  expiresAt: string;
}

export default function AcceptInvitePage() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [token, setToken] = useState<string | null>(null);
  const [inviteDetails, setInviteDetails] = useState<InviteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    setToken(t);

    if (!t) {
      setError("No invitation token found. Please check the link in your email.");
      setLoading(false);
      return;
    }

    fetch(`/api/workspace/invite-details/${t}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to load invitation.");
        } else {
          setInviteDetails(data);
        }
      })
      .catch(() => {
        setError("Failed to load invitation details. Please try again.");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    setError(null);

    try {
      const res = await apiRequest("POST", "/api/workspace/accept-invite", { token });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "login_required") {
          setLocation(`/auth?redirect=${encodeURIComponent(`/accept-invite?token=${token}`)}`);
          return;
        }
        setError(data.error || "Failed to accept invitation.");
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        window.location.href = "/home";
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setAccepting(false);
    }
  };

  const roleIcon = inviteDetails?.role === "editor" ? <Edit className="h-4 w-4" /> : <Eye className="h-4 w-4" />;
  const roleLabel = inviteDetails?.role === "editor" ? "Editor" : "Viewer";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md rounded-none border shadow-sm">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-3 h-12 w-12 bg-[#0073AA]/10 flex items-center justify-center rounded-none">
            <Users className="h-6 w-6 text-[#0073AA]" />
          </div>
          <CardTitle className="text-xl font-semibold">
            {success ? "You're In!" : loading ? "Loading Invitation..." : error && !inviteDetails ? "Invitation Error" : "Workspace Invitation"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-[#0073AA]" />
              <p className="text-sm text-gray-500">Checking your invitation...</p>
            </div>
          )}

          {!loading && error && !inviteDetails && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="h-12 w-12 bg-red-100 flex items-center justify-center rounded-none">
                <XCircle className="h-6 w-6 text-red-600" />
              </div>
              <p className="text-sm text-center text-gray-700">{error}</p>
              <Button
                variant="outline"
                className="rounded-none"
                onClick={() => setLocation(user ? "/home" : "/auth")}
              >
                {user ? "Go to Dashboard" : "Go to Login"}
              </Button>
            </div>
          )}

          {!loading && success && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="h-12 w-12 bg-green-100 flex items-center justify-center rounded-none">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <p className="text-sm text-center text-gray-700">
                You've successfully joined <strong>{inviteDetails?.workspaceName}</strong> as {roleLabel === "Editor" ? "an" : "a"} {roleLabel}.
              </p>
              <p className="text-xs text-gray-500">Redirecting to your dashboard...</p>
            </div>
          )}

          {!loading && !success && inviteDetails && (
            <div className="space-y-5">
              <div className="bg-gray-50 border p-4 rounded-none space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Workspace</span>
                  <span className="text-sm font-medium">{inviteDetails.workspaceName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Invited by</span>
                  <span className="text-sm font-medium">{inviteDetails.invitedBy}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Your role</span>
                  <div className="flex items-center gap-1.5">
                    {roleIcon}
                    <span className="text-sm font-medium">{roleLabel}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Invite for</span>
                  <span className="text-sm font-medium">{inviteDetails.email}</span>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 p-3 rounded-none">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {!user && (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-none">
                  <p className="text-sm text-amber-800">
                    You need to log in or sign up first before accepting this invitation. Make sure you use the email address: <strong>{inviteDetails.email}</strong>
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 rounded-none"
                  onClick={() => setLocation(user ? "/home" : "/auth")}
                  disabled={accepting}
                >
                  {user ? "Decline" : "Cancel"}
                </Button>
                {user ? (
                  <Button
                    className="flex-1 rounded-none bg-[#0073AA] hover:bg-[#005580]"
                    onClick={handleAccept}
                    disabled={accepting}
                  >
                    {accepting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Joining...
                      </>
                    ) : (
                      <>
                        <Shield className="h-4 w-4 mr-2" />
                        Accept & Join
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    className="flex-1 rounded-none bg-[#0073AA] hover:bg-[#005580]"
                    onClick={() => setLocation(`/auth?redirect=${encodeURIComponent(`/accept-invite?token=${token}`)}`)}
                  >
                    Log In to Accept
                  </Button>
                )}
              </div>

              <p className="text-xs text-center text-gray-400">
                By accepting, you'll join this workspace and your data will be shared with team members.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}