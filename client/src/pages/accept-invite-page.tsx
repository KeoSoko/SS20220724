import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, Users, Shield, Eye, Edit, AlertTriangle, Receipt, UserCheck, FileText, FileSpreadsheet, CreditCard } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ExistingData {
  receipts: number;
  clients: number;
  quotations: number;
  invoices: number;
}

interface ActiveSubscription {
  status: string;
  planName: string;
  trialDaysRemaining: number;
}

interface InviteDetails {
  email: string;
  role: string;
  workspaceName: string;
  invitedBy: string;
  expiresAt: string;
  existingData: ExistingData | null;
  activeSubscription: ActiveSubscription | null;
}

export default function AcceptInvitePage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const [token, setToken] = useState<string | null>(null);
  const [inviteDetails, setInviteDetails] = useState<InviteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [migrateData, setMigrateData] = useState(true);
  const [migratedCounts, setMigratedCounts] = useState<ExistingData | null>(null);
  const [subscriptionCancelled, setSubscriptionCancelled] = useState(false);

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
      const res = await apiRequest("POST", "/api/workspace/accept-invite", { token, migrateData });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "login_required") {
          setLocation(`/auth?redirect=${encodeURIComponent(`/accept-invite?token=${token}`)}`);
          return;
        }
        setError(data.error || "Failed to accept invitation.");
        return;
      }

      if (data.migratedCounts) {
        setMigratedCounts(data.migratedCounts);
      }
      if (data.subscriptionCancelled) {
        setSubscriptionCancelled(true);
      }
      setSuccess(true);
      setTimeout(() => {
        window.location.href = "/home";
      }, 3000);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setAccepting(false);
    }
  };

  const roleIcon = inviteDetails?.role === "editor" ? <Edit className="h-4 w-4" /> : <Eye className="h-4 w-4" />;
  const roleLabel = inviteDetails?.role === "editor" ? "Editor" : "Viewer";
  const hasExistingData = inviteDetails?.existingData && (
    inviteDetails.existingData.receipts > 0 ||
    inviteDetails.existingData.clients > 0 ||
    inviteDetails.existingData.quotations > 0 ||
    inviteDetails.existingData.invoices > 0
  );

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
              {migratedCounts && (
                <div className="bg-green-50 border border-green-200 p-3 rounded-none w-full">
                  <p className="text-xs text-green-800 font-medium mb-1">Data migrated successfully:</p>
                  <div className="grid grid-cols-2 gap-1 text-xs text-green-700">
                    {migratedCounts.receipts > 0 && <span>{migratedCounts.receipts} receipt{migratedCounts.receipts !== 1 ? "s" : ""}</span>}
                    {migratedCounts.clients > 0 && <span>{migratedCounts.clients} client{migratedCounts.clients !== 1 ? "s" : ""}</span>}
                    {migratedCounts.quotations > 0 && <span>{migratedCounts.quotations} quotation{migratedCounts.quotations !== 1 ? "s" : ""}</span>}
                    {migratedCounts.invoices > 0 && <span>{migratedCounts.invoices} invoice{migratedCounts.invoices !== 1 ? "s" : ""}</span>}
                  </div>
                </div>
              )}
              {subscriptionCancelled && (
                <div className="bg-blue-50 border border-blue-200 p-3 rounded-none w-full">
                  <p className="text-xs text-blue-800">Your previous subscription has been cancelled. Billing is now managed by the workspace owner.</p>
                </div>
              )}
              <p className="text-xs text-gray-500">Redirecting to your dashboard...</p>
            </div>
          )}

          {!loading && !success && inviteDetails && (
            <div className="space-y-5">
              <div className="bg-gray-50 border p-4 rounded-none space-y-3">
                <div className="flex justify-between items-start gap-4">
                  <span className="text-xs text-gray-500 uppercase tracking-wide flex-shrink-0 pt-0.5">Workspace</span>
                  <span className="text-sm font-medium text-right break-words min-w-0">{inviteDetails.workspaceName}</span>
                </div>
                <div className="flex justify-between items-start gap-4">
                  <span className="text-xs text-gray-500 uppercase tracking-wide flex-shrink-0 pt-0.5">Invited by</span>
                  <span className="text-sm font-medium text-right break-words min-w-0">{inviteDetails.invitedBy}</span>
                </div>
                <div className="flex justify-between items-center gap-4">
                  <span className="text-xs text-gray-500 uppercase tracking-wide flex-shrink-0">Your role</span>
                  <div className="flex items-center gap-1.5">
                    {roleIcon}
                    <span className="text-sm font-medium">{roleLabel}</span>
                  </div>
                </div>
                <div className="flex justify-between items-start gap-4">
                  <span className="text-xs text-gray-500 uppercase tracking-wide flex-shrink-0 pt-0.5">Invite for</span>
                  <span className="text-sm font-medium text-right break-all min-w-0">{inviteDetails.email}</span>
                </div>
              </div>

              {user && hasExistingData && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-none space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-amber-800 font-medium">You have existing data in your current workspace</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {inviteDetails.existingData!.receipts > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-700">
                        <Receipt className="h-3.5 w-3.5" />
                        <span>{inviteDetails.existingData!.receipts} receipt{inviteDetails.existingData!.receipts !== 1 ? "s" : ""}</span>
                      </div>
                    )}
                    {inviteDetails.existingData!.clients > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-700">
                        <UserCheck className="h-3.5 w-3.5" />
                        <span>{inviteDetails.existingData!.clients} client{inviteDetails.existingData!.clients !== 1 ? "s" : ""}</span>
                      </div>
                    )}
                    {inviteDetails.existingData!.quotations > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-700">
                        <FileText className="h-3.5 w-3.5" />
                        <span>{inviteDetails.existingData!.quotations} quotation{inviteDetails.existingData!.quotations !== 1 ? "s" : ""}</span>
                      </div>
                    )}
                    {inviteDetails.existingData!.invoices > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-700">
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        <span>{inviteDetails.existingData!.invoices} invoice{inviteDetails.existingData!.invoices !== 1 ? "s" : ""}</span>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-amber-200 pt-3 space-y-2">
                    <label
                      className="flex items-start gap-2.5 cursor-pointer"
                      onClick={() => setMigrateData(true)}
                    >
                      <div className={`mt-0.5 h-4 w-4 border-2 rounded-none flex items-center justify-center flex-shrink-0 ${migrateData ? "bg-[#0073AA] border-[#0073AA]" : "border-gray-400"}`}>
                        {migrateData && <CheckCircle className="h-3 w-3 text-white" />}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-amber-900">Bring my data along</span>
                        <p className="text-xs text-amber-700">Your receipts, clients, quotations and invoices will be moved to the new workspace where your team can see them.</p>
                      </div>
                    </label>

                    <label
                      className="flex items-start gap-2.5 cursor-pointer"
                      onClick={() => setMigrateData(false)}
                    >
                      <div className={`mt-0.5 h-4 w-4 border-2 rounded-none flex items-center justify-center flex-shrink-0 ${!migrateData ? "bg-[#0073AA] border-[#0073AA]" : "border-gray-400"}`}>
                        {!migrateData && <CheckCircle className="h-3 w-3 text-white" />}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-amber-900">Leave my data behind</span>
                        <p className="text-xs text-amber-700">Your existing data will remain in your old workspace. You'll start fresh in the new workspace.</p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {user && inviteDetails.activeSubscription && (
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-none space-y-2">
                  <div className="flex items-start gap-2">
                    <CreditCard className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-blue-900 font-medium">Your subscription will be cancelled</p>
                      <p className="text-xs text-blue-700 mt-1">
                        {inviteDetails.activeSubscription.status === 'trial'
                          ? `You have ${inviteDetails.activeSubscription.trialDaysRemaining} day${inviteDetails.activeSubscription.trialDaysRemaining !== 1 ? "s" : ""} remaining on your free trial. `
                          : `You have an active ${inviteDetails.activeSubscription.planName} subscription. `}
                        It will be automatically cancelled when you join this workspace, since billing is managed by the workspace owner. You won't be charged going forward.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 p-3 rounded-none">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {!user && (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-none">
                  <p className="text-sm text-amber-800">
                    You need to log in or sign up first before accepting this invitation.
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