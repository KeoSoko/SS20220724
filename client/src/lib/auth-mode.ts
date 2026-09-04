export type AuthMode = "login" | "register";

export const RETURNING_USER_KEY = "simpleslips_returning_user";

export function getAuthModeFromLocation(value: string, isReturningUser: boolean): AuthMode {
  const params = new URLSearchParams(value.split("?")[1] || "");
  const explicitMode = params.get("mode");
  const legacyTab = params.get("tab");

  if (explicitMode === "signin" || legacyTab === "login") return "login";
  if (explicitMode === "register" || legacyTab === "register") return "register";
  return isReturningUser ? "login" : "register";
}

export function readReturningUserMarker(storage: Pick<Storage, "getItem">): boolean {
  return storage.getItem(RETURNING_USER_KEY) === "true";
}

export function writeReturningUserMarker(storage: Pick<Storage, "setItem">): void {
  storage.setItem(RETURNING_USER_KEY, "true");
}