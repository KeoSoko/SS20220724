import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { VerificationRequiredDialog } from "@/components/verification-required-dialog";

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
