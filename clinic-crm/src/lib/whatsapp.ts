/**
 * src/lib/whatsapp.ts
 *
 * Sends WhatsApp messages via Twilio's WhatsApp API.
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID     — console.twilio.com → Account Info
 *   TWILIO_AUTH_TOKEN      — console.twilio.com → Account Info
 *   TWILIO_WHATSAPP_FROM   — Your Twilio WhatsApp sender, e.g.:
 *                              Sandbox:  whatsapp:+14155238886
 *                              Approved: whatsapp:+91XXXXXXXXXX
 *
 * Sandbox setup (testing without an approved number):
 *   1. console.twilio.com → Messaging → Try it out → Send a WhatsApp message
 *   2. Have each recipient send "join <sandbox-keyword>" to +14155238886
 *   3. Set TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
 *
 * Production setup (approved sender):
 *   1. console.twilio.com → Messaging → Senders → WhatsApp Senders
 *   2. Register your business number and complete Meta verification
 *   3. Set TWILIO_WHATSAPP_FROM=whatsapp:+91XXXXXXXXXX
 */

import twilio from "twilio";
import { logger } from "@/lib/logger";

// ─── Phone normalisation ──────────────────────────────────────────────────────
// Twilio requires E.164 WITH the leading + (e.g. +919876543210)

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");

  if (raw.startsWith("+")) return `+${digits}`;

  // 10-digit Indian mobile (starts with 6–9)
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `+91${digits}`;
  }

  // Already has 91 prefix: 12 digits starting with 91
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }

  return `+${digits}`;
}

// ─── Twilio client ────────────────────────────────────────────────────────────

function getClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error(
      "[WhatsApp] TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN is not set. " +
      "Get these from console.twilio.com → Account Info."
    );
  }

  return twilio(accountSid, authToken);
}

// ─── sendWhatsApp — free-form message ────────────────────────────────────────

/**
 * Send a WhatsApp message via Twilio with automatic retry (3 attempts).
 *
 * @param to      Recipient phone — any reasonable Indian format
 * @param message Plain-text message body
 */
export async function sendWhatsApp(to: string, message: string): Promise<void> {
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!from) {
    throw new Error(
      "[WhatsApp] TWILIO_WHATSAPP_FROM is not set. " +
      "Set it to your Twilio WhatsApp sender, e.g. whatsapp:+14155238886"
    );
  }

  const normalised = normalizePhone(to);
  if (!normalised || normalised.length < 10) {
    logger.warn("[WhatsApp] Skipping invalid phone", { raw: to });
    return;
  }

  const client = getClient();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const msg = await client.messages.create({
        from,
        to:   `whatsapp:${normalised}`,
        body: message,
      });

      logger.info("[WhatsApp] Sent", { to: normalised, sid: msg.sid, attempt });
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn(`[WhatsApp] Attempt ${attempt}/3 failed`, {
        to: normalised,
        error: lastError.message,
      });
      if (attempt < 3) await new Promise(r => setTimeout(r, 500 * attempt));
    }
  }

  throw new Error(
    `[WhatsApp] All 3 attempts failed for ${normalised}. Last: ${lastError?.message}`
  );
}

// ─── sendWhatsAppTemplate — Twilio Content Template API ──────────────────────

/**
 * Send a pre-approved Twilio Content Template message.
 *
 * Use this for outbound-initiated notifications (booking confirmations,
 * reminders) where the patient hasn't messaged you in the last 24 hours.
 *
 * Template errors (invalid SID, inactive template) are logged and swallowed —
 * they do NOT throw, keeping the notification workflow moving.
 * Network/auth errors ARE retried (3 attempts).
 *
 * @param to          Recipient phone
 * @param contentSid  Twilio Content Template SID (e.g. HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx)
 *                    From console.twilio.com → Content Template Builder
 * @param variables   Template variable substitutions, e.g. { "1": "Anjali", "2": "10am" }
 * @returns           true if sent, false if skipped due to template error
 */
export async function sendWhatsAppTemplate(
  to: string,
  contentSid: string,
  variables: Record<string, string> = {}
): Promise<boolean> {
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!from) {
    throw new Error("[WhatsApp] TWILIO_WHATSAPP_FROM is not set.");
  }

  const normalised = normalizePhone(to);
  if (!normalised || normalised.length < 10) {
    logger.warn("[WhatsApp] Skipping invalid phone", { raw: to });
    return false;
  }

  const client = getClient();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const msg = await client.messages.create({
        from,
        to:                    `whatsapp:${normalised}`,
        contentSid,
        contentVariables:      JSON.stringify(variables),
      });

      logger.info("[WhatsApp Template] Sent", {
        to: normalised,
        contentSid,
        sid: msg.sid,
        attempt,
      });
      return true;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      const errMsg = lastError.message;

      // Twilio error 63016 = content template not found / not approved
      // Twilio error 63007 = WhatsApp sender not enabled for this channel
      // These are not retryable — log and return false
      if (/63016|63007|inactive|not found|not approved/i.test(errMsg)) {
        logger.warn("[WhatsApp Template] Template error — skipping, not retrying", {
          to: normalised,
          contentSid,
          error: errMsg,
          hint: "Check console.twilio.com → Content Template Builder for approval status",
        });
        return false;
      }

      logger.warn(`[WhatsApp Template] Attempt ${attempt}/3 failed`, {
        to: normalised,
        contentSid,
        error: errMsg,
      });
      if (attempt < 3) await new Promise(r => setTimeout(r, 500 * attempt));
    }
  }

  throw new Error(
    `[WhatsApp Template] All 3 attempts failed for ${normalised} (sid: ${contentSid}). ` +
    `Last: ${lastError?.message}`
  );
}

// ─── Message body builders ────────────────────────────────────────────────────

// ─── Clinic Contact Footer ────────────────────────────────────────────────────
// Appended to every patient-facing WhatsApp notification.
// Update these values to match the clinic's real contact details.

const CLINIC_FOOTER = `
📞 Phone: +91-8088516867
📧 Email: drsayaleepethe@vyayamaphysio.co.in
🌐 Website: www.vyayamaphysio.co.in
📍 Location: https://maps.app.goo.gl/qUo3ZMUE9ft4gXxV7
    Vyayama Physio, Yemalur Main Rd, Kempapura, Bellandur, Bengaluru, Karnataka 560037
📱 Patient Portal: https://app.vyayamaphysio.co.in

— Vyayama Physio`.trim();

export function bookingConfirmedPatientMsg(
  patientName: string,
  doctorName: string,
  dateTimeIST: string
): string {
  return (
    `Hello ${patientName} 👋\n\n` +
    `✅ *Appointment Confirmed!*\n` +
    `📋 Doctor: ${doctorName}\n` +
    `🕐 Date & Time (IST): ${dateTimeIST}\n\n` +
    `Please arrive 10 minutes early.\n\n` +
    `${CLINIC_FOOTER}`
  );
}

export function bookingConfirmedDoctorMsg(
  doctorName: string,
  patientName: string,
  dateTimeIST: string
): string {
  return (
    `Hello ${doctorName} 👋\n\n` +
    `📅 *New Appointment Booked*\n` +
    `👤 Patient: ${patientName}\n` +
    `🕐 Date & Time (IST): ${dateTimeIST}\n\n` +
    `— Vyayama Physio`
  );
}

export function reminder24hMsg(
  patientName: string,
  doctorName: string,
  dateTimeIST: string
): string {
  return (
    `Hello ${patientName} 👋\n\n` +
    `⏰ *Appointment Reminder — 24 Hours*\n` +
    `Your appointment with ${doctorName} is tomorrow.\n` +
    `🕐 Time (IST): ${dateTimeIST}\n\n` +
    `${CLINIC_FOOTER}`
  );
}

export function reminder2hMsg(
  patientName: string,
  doctorName: string,
  dateTimeIST: string
): string {
  return (
    `Hello ${patientName} 👋\n\n` +
    `⏰ *Appointment Reminder — 2 Hours*\n` +
    `Your appointment with ${doctorName} is soon!\n` +
    `🕐 Time (IST): ${dateTimeIST}\n\n` +
    `${CLINIC_FOOTER}`
  );
}

export function missedSessionPatientMsg(
  patientName: string,
  doctorName: string,
  dateTimeIST: string
): string {
  return (
    `Hello ${patientName} 👋\n\n` +
    `❌ *Missed Appointment*\n` +
    `We noticed you missed your appointment with ${doctorName} at ${dateTimeIST} (IST).\n\n` +
    `Please contact us to reschedule.\n\n` +
    `${CLINIC_FOOTER}`
  );
}