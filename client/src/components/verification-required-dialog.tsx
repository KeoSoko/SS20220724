import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mail, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";

interface VerificationRequiredDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userEmail?: string;
}

export function VerificationRequiredDialog({
  open,
  onOpenChange,
  userEmail,
}: VerificationRequiredDialogProps) {
  const { user } = useAuth();
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  const email = userEmail || user?.email;

  const resendMutation = useMutation({
    mutationFn: async () => {
      if (!email) throw new Error("No email address available");
      const response = await apiRequest("POST", "/api/resend-verification", { email });
      return response.json();
    },
    onSuccess: () => {
      setResendSuccess(true);
      setResendError(null);
    },
    onError: (error: Error) => {
      setResendError(error.message || "Failed to resend verification email");
      setResendSuccess(false);
    },
  });

  const handleResend = () => {
    setResendSuccess(false);
    setResendError(null);
    resendMutation.mutate();
  };

  const handleClose = () => {
    setResendSuccess(false);
    setResendError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">
            Verify Your Email
          </DialogTitle>
          <DialogDescription className="text-center">
            This feature requires email verification to protect your account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg bg-muted/50 p-4 text-sm">
            <p className="text-muted-foreground">
              We sent a verification link to:
            </p>
            <p className="mt-1 font-medium text-foreground">
              {email || "your registered email"}
            </p>
          </div>

          {resendSuccess && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              <span>Verification email sent! Check your inbox.</span>
            </div>
          )}

          {resendError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{resendError}</span>
            </div>
          )}

          <p className="text-center text-sm text-muted-foreground">
            Click the link in the email to verify your account and unlock all features including exports, billing, and tax reports.
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={handleResend}
            disabled={resendMutation.isPending}
            className="w-full"
          >
            {resendMutation.isPending ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Resend Verification Email
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleClose}
            className="w-full"
          >
            Continue Browsing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
