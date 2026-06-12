/**
 * src/lib/email.ts
 * Production-safe email via Resend with retry + structured logging.
 *
 * FIX: Added escapeHtml() helper and applied it to every user-supplied
 * string (patientName, doctorName, dateTimeIST) injected into HTML
 * templates. Without this, a patient name containing "<script>" would
 * be injected verbatim into the email HTML — an XSS vector for any
 * email client that renders scripts (rare but real).
 */

import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("[Email] RESEND_API_KEY is not set");
    _resend = new Resend(key);
  }
  return _resend;
}

// ─── XSS sanitiser ────────────────────────────────────────────────────────────

/**
 * Escape the five HTML special characters so user-supplied strings
 * are safe to interpolate directly into HTML templates.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// ─── sendEmail ────────────────────────────────────────────────────────────────

/**
 * Send an email via Resend with automatic retry on transient failures.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  maxAttempts = 3
): Promise<void> {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error(
      "[Email] EMAIL_FROM is not set. " +
      "Set it to a Resend-verified address, e.g. 'Clinic <noreply@app.vyayamaphysio.co.in>'"
    );
  }

  if (!to || !to.includes("@")) {
    console.warn(`[Email] Skipping invalid address: "${to}"`);
    return;
  }

  const resend = getResend();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data, error } = await resend.emails.send({ from, to, subject, html });

      if (error) {
        throw new Error(`Resend API error: ${error.message}`);
      }

      console.log(`[Email] Sent ✓ | to=${to} | subject="${subject}" | id=${data?.id} | attempt=${attempt}`);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[Email] Attempt ${attempt}/${maxAttempts} failed for ${to}: ${lastError.message}`);

      if (attempt < maxAttempts) {
        // Exponential backoff: 500 ms, 1000 ms
        await new Promise(r => setTimeout(r, 500 * attempt));
      }
    }
  }

  throw new Error(`[Email] All ${maxAttempts} attempts failed for ${to}. Last: ${lastError?.message}`);
}

// ─── HTML Templates ───────────────────────────────────────────────────────────

/**
 * Reusable clinic contact footer block for all patient-facing emails.
 * Update these values to match the clinic's real contact details.
 */
function clinicContactFooterHtml(): string {
  return `
    <div style="margin-top:24px;padding:16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;color:#6b7280">
      <p style="margin:0 0 8px;font-weight:600;color:#374151">Vyayama Physio — Contact Us</p>
      <table style="border-collapse:collapse;width:100%">
        <tr>
          <td style="padding:3px 8px 3px 0">📞 Phone</td>
          <td style="padding:3px 0"><a href="+91-8088516867" style="color:#1d4ed8">+91-XXXXX-XXXXX</a></td>
        </tr>
        <tr>
          <td style="padding:3px 8px 3px 0">📧 Email</td>
          <td style="padding:3px 0"><a href="mailto:drsayaleepethe@vyayamaphysio.co.in" style="color:#1d4ed8">care@vyayamaphysio.co.in</a></td>
        </tr>
        <tr>
          <td style="padding:3px 8px 3px 0">🌐 Website</td>
          <td style="padding:3px 0"><a href="https://www.vyayamaphysio.co.in" style="color:#1d4ed8">www.vyayamaphysio.co.in</a></td>
        </tr>
        <tr>
          <td style="padding:3px 8px 3px 0">📍 Location</td>
          <td style="padding:3px 0">[https://maps.app.goo.gl/qUo3ZMUE9ft4gXxV7 /n Vyayama Physio, Yemalur Main Rd, Kempapura, Bellandur, Bengaluru, Karnataka 560037]</td>
        </tr>
        <tr>
          <td style="padding:3px 8px 3px 0">📱 Patient App</td>
          <td style="padding:3px 0"><a href="https://app.vyayamaphysio.co.in" style="color:#1d4ed8">app.vyayamaphysio.co.in</a></td>
        </tr>
      </table>
    </div>
  `;
}

export function bookingConfirmedPatientHtml(
  patientName: string,
  doctorName: string,
  dateTimeIST: string
): string {
  const p = escapeHtml(patientName);
  const d = escapeHtml(doctorName);
  const t = escapeHtml(dateTimeIST);
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:auto">
      <h2 style="color:#1d4ed8">Appointment Confirmed ✅</h2>
      <p>Dear <strong>${p}</strong>,</p>
      <p>Your appointment has been successfully booked.</p>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Doctor</strong></td>
            <td style="padding:8px;border:1px solid #e5e7eb">${d}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Date &amp; Time (IST)</strong></td>
            <td style="padding:8px;border:1px solid #e5e7eb">${t}</td></tr>
      </table>
      <p style="margin-top:16px">Please arrive 10 minutes early. To reschedule, contact us at least 24 hours in advance.</p>
      ${clinicContactFooterHtml()}
    </div>
  `;
}

export function bookingConfirmedDoctorHtml(
  doctorName: string,
  patientName: string,
  dateTimeIST: string
): string {
  const d = escapeHtml(doctorName);
  const p = escapeHtml(patientName);
  const t = escapeHtml(dateTimeIST);
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:auto">
      <h2 style="color:#1d4ed8">New Appointment Booked 📅</h2>
      <p>Dear <strong>${d}</strong>,</p>
      <p>A new appointment has been scheduled for you.</p>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Patient</strong></td>
            <td style="padding:8px;border:1px solid #e5e7eb">${p}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Date &amp; Time (IST)</strong></td>
            <td style="padding:8px;border:1px solid #e5e7eb">${t}</td></tr>
      </table>
      <p style="color:#6b7280;font-size:12px;margin-top:16px">Vyayama Physio — Automated Notification</p>
    </div>
  `;
}

export function missedSessionDoctorHtml(
  doctorName: string,
  patientName: string,
  dateTimeIST: string
): string {
  const d = escapeHtml(doctorName);
  const p = escapeHtml(patientName);
  const t = escapeHtml(dateTimeIST);
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:auto">
      <h2 style="color:#dc2626">Missed Session Alert ❌</h2>
      <p>Dear <strong>${d}</strong>,</p>
      <p>The following appointment was marked as <strong>MISSED</strong>.</p>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Patient</strong></td>
            <td style="padding:8px;border:1px solid #e5e7eb">${p}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Scheduled Time (IST)</strong></td>
            <td style="padding:8px;border:1px solid #e5e7eb">${t}</td></tr>
      </table>
      <p style="margin-top:16px">Please follow up with the patient to reschedule.</p>
      <p style="color:#6b7280;font-size:12px">Vyayama Physio — Automated Notification</p>
    </div>
  `;
}

// ─── Reminder Email Templates (with clinic contact) ───────────────────────────

export function reminder24hPatientHtml(
  patientName: string,
  doctorName: string,
  dateTimeIST: string
): string {
  const p = escapeHtml(patientName);
  const d = escapeHtml(doctorName);
  const t = escapeHtml(dateTimeIST);
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:auto">
      <h2 style="color:#d97706">⏰ Appointment Reminder — 24 Hours</h2>
      <p>Dear <strong>${p}</strong>,</p>
      <p>This is a friendly reminder that you have an appointment <strong>tomorrow</strong>.</p>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Doctor</strong></td>
            <td style="padding:8px;border:1px solid #e5e7eb">${d}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Date &amp; Time (IST)</strong></td>
            <td style="padding:8px;border:1px solid #e5e7eb">${t}</td></tr>
      </table>
      <p style="margin-top:16px">Please arrive 10 minutes early. If you need to reschedule, contact us as soon as possible.</p>
      ${clinicContactFooterHtml()}
    </div>
  `;
}

export function reminder2hPatientHtml(
  patientName: string,
  doctorName: string,
  dateTimeIST: string
): string {
  const p = escapeHtml(patientName);
  const d = escapeHtml(doctorName);
  const t = escapeHtml(dateTimeIST);
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:auto">
      <h2 style="color:#d97706">⏰ Appointment Reminder — 2 Hours</h2>
      <p>Dear <strong>${p}</strong>,</p>
      <p>Your appointment with <strong>${d}</strong> is in approximately <strong>2 hours</strong>.</p>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Time (IST)</strong></td>
            <td style="padding:8px;border:1px solid #e5e7eb">${t}</td></tr>
      </table>
      <p style="margin-top:16px">Please make your way to the clinic soon. We look forward to seeing you!</p>
      ${clinicContactFooterHtml()}
    </div>
  `;
}