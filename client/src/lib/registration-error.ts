export type RegistrationRequestError = Error & {
  status: number;
  field?: string;
  action?: string;
  suggestion?: string;
};

/** Parse only inside the try; throwing a structured error there would catch itself. */
export function registrationErrorFromResponse(
  status: number,
  statusText: string,
  body: string,
): RegistrationRequestError {
  let details: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      details = parsed as Record<string, unknown>;
    }
  } catch {
    // Non-JSON responses still carry an HTTP status, never an HTML error page.
  }
  const message = typeof details.message === "string" && details.message
    ? details.message
    : typeof details.error === "string" && details.error
      ? details.error
      : `Registration failed: ${status} ${statusText}`.trim();
  const error = new Error(message) as RegistrationRequestError;
  error.status = status;
  for (const key of ["field", "action", "suggestion"] as const) {
    if (typeof details[key] === "string") error[key] = details[key];
  }
  return error;
}
