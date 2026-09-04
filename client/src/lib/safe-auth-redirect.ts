export function getSafeAuthRedirect(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/home";
  }
  try {
    const parsed = new URL(value, "https://simpleslips.invalid");
    if (parsed.origin !== "https://simpleslips.invalid" || parsed.pathname === "/auth") {
      return "/home";
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/home";
  }
}