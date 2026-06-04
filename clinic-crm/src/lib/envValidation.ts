/**
 * src/lib/envValidation.ts
 *
 * WHAT CHANGED:
 *   - SENTRY_DSN moved from optional → required in production.
 *     Previously it was optional with a console.warn, meaning production
 *     server errors were silently dropped if the DSN wasn't set.
 *     Now validateEnv() throws at boot time if SENTRY_DSN is absent in prod.
 *   - Switched from Meta WhatsApp Cloud API to Twilio WhatsApp API.
 *     META_WA_TOKEN, META_WA_PHONE_ID, META_WA_TEMPLATE_* removed.
 *     TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM added.
 *   - Added NEXT_PUBLIC_APP_URL to required in production (needed for
 *     correct CSP connect-src and absolute URL generation in emails).
 *
 * USAGE: Call validateEnv() at the top of any critical API route handler.
 * It throws immediately with a clear list of missing vars rather than
 * letting the route proceed to a cryptic downstream failure.
 */

type EnvConfig = {
  required: string[];
  productionOnly: string[];   // required in prod, optional in dev
  optional: string[];
};

const ENV: EnvConfig = {
  required: [
    "DATABASE_URL",
    "NEXTAUTH_SECRET",
    "NEXTAUTH_URL",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_WHATSAPP_FROM",
    "CRON_SECRET",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ],

  // These must be present in production but are optional during local dev
  // (you may not have Sentry or a real domain set up locally).
  productionOnly: [
    "SENTRY_DSN",
    "NEXT_PUBLIC_APP_URL",
  ],

  optional: [
    "DEV_TEST_EMAIL",
    "DEV_TEST_PHONE",
    "NODE_ENV",
  ],
};

export function validateEnv(): void {
  const missing: string[] = [];
  const isProd = process.env.NODE_ENV === "production";

  for (const key of ENV.required) {
    if (!process.env[key]?.trim()) missing.push(key);
  }

  if (isProd) {
    for (const key of ENV.productionOnly) {
      if (!process.env[key]?.trim()) missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[Env] Missing required environment variables: ${missing.join(", ")}. ` +
      `Set these in Vercel Dashboard → Settings → Environment Variables (or .env.local for dev).`
    );
  }
}
