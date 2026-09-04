export type AuthMode = "login" | "register";

export const RETURNING_USER_KEY = "simpleslips_returning_user";

export function getAuthModeFromLocation(value: string, isReturningUser: boolean): AuthMode {
  const params = new URLSearchParams(value.split("?")[1] || "");
  const explicitMode = params.get("mode");
  const legacyTab = params.get("tab");

  if (explicitMode === "signin") return "login";
  if (explicitMode === "register") return "register";
  if (legacyTab === "login") return "login";
  if (legacyTab === "register") return "register";
  return isReturningUser ? "login" : "register";
}

export function getCanonicalAuthLocation(value: string): string | null {
  const [pathAndQuery, hash = ""] = value.split("#", 2);
  const [pathname, query = ""] = pathAndQuery.split("?", 2);
  const params = new URLSearchParams(query);
  const legacyTab = params.get("tab");

  if (legacyTab !== "login" && legacyTab !== "register") return null;

  const explicitMode = params.get("mode");
  if (explicitMode !== "signin" && explicitMode !== "register") {
    params.set("mode", legacyTab === "login" ? "signin" : "register");
  }
  params.delete("tab");

  const canonicalQuery = params.toString();
  return `${pathname || "/auth"}${canonicalQuery ? `?${canonicalQuery}` : ""}${hash ? `#${hash}` : ""}`;
}

export function readReturningUserMarker(storage: Pick<Storage, "getItem">): boolean {
  return storage.getItem(RETURNING_USER_KEY) === "true";
}

export function writeReturningUserMarker(storage: Pick<Storage, "setItem">): void {
  storage.setItem(RETURNING_USER_KEY, "true");
}