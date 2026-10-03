import type { RequestContext } from "../router.js";

/** Säkerhetsheaders för alla HTML-svar från Workern. (Statiska filer får sina via public/_headers.) */
export function securityHeaders(nonce: string): Record<string, string> {
  const csp = [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src 'self' https://challenges.cloudflare.com",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
  return {
    "Content-Security-Policy": csp,
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
}

export function htmlResponse(c: RequestContext, body: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(c.req.method === "HEAD" ? null : body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Sidor renderas från databasen vid varje anrop så att ändringar i adminpanelen syns direkt.
      "Cache-Control": "no-cache",
      ...securityHeaders(c.nonce),
      ...extra,
    },
  });
}

export function redirect(location: string, status: 301 | 302 | 303 = 302): Response {
  return new Response(null, { status, headers: { Location: location } });
}

export function textResponse(body: string, contentType: string, cache = "public, max-age=3600"): Response {
  return new Response(body, {
    headers: { "Content-Type": contentType, "Cache-Control": cache, "X-Content-Type-Options": "nosniff" },
  });
}

export function randomToken(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
