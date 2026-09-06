export interface VerificationRequiredResponse {
  userEmail?: string;
}

/**
 * Identifies the verification gate's structured error response without
 * treating other authorization or server errors as verification failures.
 */
export function getVerificationRequiredResponse(
  status: number,
  responseBody: unknown,
): VerificationRequiredResponse | null {
  if (status !== 403 || typeof responseBody !== "object" || responseBody === null || Array.isArray(responseBody)) {
    return null;
  }

  const errorData = responseBody as Record<string, unknown>;
  if (errorData.error !== "email_verification_required") return null;

  return {
    userEmail: typeof errorData.userEmail === "string" ? errorData.userEmail : undefined,
  };
}