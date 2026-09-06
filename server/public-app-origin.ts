const PRODUCTION_PUBLIC_ORIGIN = "https://simpleslips.app";

export type PublicOriginEnvironment = {
  NODE_ENV?: string;
  APP_URL?: string;
  REPLIT_DEV_DOMAIN?: string;
  REPLIT_DOMAINS?: string;
};

function parseHttpOrigin(rawValue: string, variableName: string): string {
  const value = rawValue.trim();
  if (!value) {
    throw new Error(`${variableName} is empty`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    throw new Error(`${variableName} must be a valid HTTP(S) origin`);
  }

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${variableName} must be an HTTP(S) origin without credentials, path, query, or fragment`);
  }

  return parsed.origin;
}

function assertDevelopmentOrigin(origin: string, variableName: string): string {
  if (new URL(origin).hostname.toLowerCase() === "simpleslips.app") {
    throw new Error(`${variableName} cannot resolve development links to the production application`);
  }
  return origin;
}

/**
 * Resolve the externally reachable application origin used in outbound links.
 * Request headers are intentionally excluded: Host and X-Forwarded-* are
 * untrusted input and must never control authentication links.
 */
export function resolvePublicAppOrigin(
  env?: PublicOriginEnvironment,
): string {
  const source = env ?? process.env;

  if (source.NODE_ENV === "production") {
    return PRODUCTION_PUBLIC_ORIGIN;
  }

  if (source.REPLIT_DEV_DOMAIN?.trim()) {
    const origin = parseHttpOrigin(source.REPLIT_DEV_DOMAIN, "REPLIT_DEV_DOMAIN");
    return assertDevelopmentOrigin(origin, "REPLIT_DEV_DOMAIN");
  }

  const firstReplitDomain = source.REPLIT_DOMAINS
    ?.split(",")
    .map((domain) => domain.trim())
    .find(Boolean);
  if (firstReplitDomain) {
    const origin = parseHttpOrigin(firstReplitDomain, "REPLIT_DOMAINS");
    return assertDevelopmentOrigin(origin, "REPLIT_DOMAINS");
  }

  if (source.APP_URL?.trim()) {
    const origin = parseHttpOrigin(source.APP_URL, "APP_URL");
    return assertDevelopmentOrigin(origin, "APP_URL");
  }

  throw new Error(
    "No public application origin is configured for development; set REPLIT_DEV_DOMAIN or APP_URL",
  );
}

export function buildPublicAppUrl(
  path: string,
  env?: PublicOriginEnvironment,
): string {
  if (!path.startsWith("/")) {
    throw new Error("Public application URL paths must begin with /");
  }
  return new URL(path, `${resolvePublicAppOrigin(env)}/`).toString();
}

export { PRODUCTION_PUBLIC_ORIGIN };