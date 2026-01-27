import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { VerificationRequiredDialog } from "@/components/verification-required-dialog";
import { EMAIL_VERIFICATION_REQUIRED_EVENT } from "@/lib/queryClient";

interface VerificationContextType {
  showVerificationDialog: (userEmail?: string) => void;
  hideVerificationDialog: () => void;
  isDialogOpen: boolean;
}

const VerificationContext = createContext<VerificationContextType | null>(null);

export function useVerificationRequired() {
  const context = useContext(VerificationContext);
  if (!context) {
    throw new Error("useVerificationRequired must be used within VerificationProvider");
  }
  return context;
}

interface VerificationProviderProps {
  children: ReactNode;
}

export function VerificationProvider({ children }: VerificationProviderProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | undefined>();

  const showVerificationDialog = useCallback((email?: string) => {
    setUserEmail(email);
    setIsDialogOpen(true);
  }, []);

  const hideVerificationDialog = useCallback(() => {
    setIsDialogOpen(false);
    setUserEmail(undefined);
  }, []);

  // Listen for global email verification required events from queryClient
  useEffect(() => {
    const handleVerificationRequired = (event: CustomEvent<{ userEmail?: string }>) => {
      showVerificationDialog(event.detail?.userEmail);
    };

    window.addEventListener(
      EMAIL_VERIFICATION_REQUIRED_EVENT,
      handleVerificationRequired as EventListener
    );

    return () => {
      window.removeEventListener(
        EMAIL_VERIFICATION_REQUIRED_EVENT,
        handleVerificationRequired as EventListener
      );
    };
  }, [showVerificationDialog]);

  return (
    <VerificationContext.Provider
      value={{
        showVerificationDialog,
        hideVerificationDialog,
        isDialogOpen,
      }}
    >
      {children}
      <VerificationRequiredDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        userEmail={userEmail}
      />
    </VerificationContext.Provider>
  );
}

/**
 * Helper function to check if an error is an email verification required error.
 * Use this in mutation onError handlers or global error handling.
 */
export function isEmailVerificationError(error: any): boolean {
  const responseData = error?.responseData;
  return responseData?.error === "email_verification_required";
}

/**
 * Get user email from verification error if available.
 */
export function getEmailFromVerificationError(error: any): string | undefined {
  return error?.responseData?.userEmail;
}
