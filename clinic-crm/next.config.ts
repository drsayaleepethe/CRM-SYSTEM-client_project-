/**
 * next.config.ts
 *
 * BUG: buildCsp() had a third branch — when called with no nonce argument
 * (as in the old static-headers path) it emitted `script-src 'self'
 * 'unsafe-inline'`. That branch is now unreachable (all CSP is set by
 * middleware), but its presence caused confusion and was a latent footgun.
 *
 * FIX: When no nonce is supplied, emit `script-src 'self' 'strict-dynamic'`
 * — strict but safe. There is NO fallback to unsafe-inline anywhere.
 *
 * NOTE: The Content-Security-Policy header is intentionally NOT set here.
 * next.config.ts `headers()` runs once at build time and cannot know the
 * per-request nonce. CSP is set dynamically in src/middleware.ts which runs
 * on every request and stamps the correct nonce each time.
 */

import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

export function buildCsp(nonce?: string): string {
  // Dev: allow eval for HMR. Prod: nonce + strict-dynamic always.
  const scriptSrc = isDev
    ? `script-src 'self' 'unsafe-eval' 'unsafe-inline'`
    : nonce
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : `script-src 'self' 'strict-dynamic'`;   // no nonce → strict but no unsafe-inline

  // Only include the app's own origin in connect-src when the env var is set.
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
  const connectSrc = appOrigin
    ? `connect-src 'self' ${appOrigin}`
    : `connect-src 'self' https://o4511466611671040.ingest.us.sentry.io'`;

  return [
    `default-src 'self'`,
    scriptSrc,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src 'self' data: blob:`,
    `font-src 'self' https://fonts.gstatic.com'`,
    connectSrc,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

// Static security headers — everything except CSP (CSP lives in middleware)
const staticSecurityHeaders = [
  { key: "Strict-Transport-Security",  value: "max-age=31536000; includeSubDomains; preload" },
  { key: "X-Frame-Options",            value: "DENY" },
  { key: "X-Content-Type-Options",     value: "nosniff" },
  { key: "Referrer-Policy",            value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control",     value: "on" },
  { key: "Permissions-Policy",         value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: staticSecurityHeaders,
      },
    ];
  },
};

export default nextConfig;
