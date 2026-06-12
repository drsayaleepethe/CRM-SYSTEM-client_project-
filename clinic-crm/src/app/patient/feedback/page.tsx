"use client";

/**
 * src/app/patient/feedback/page.tsx
 *
 * Patient-facing feedback page.
 * - Free-text overall feedback
 * - Pain scale (0-10) BEFORE the session
 * - Pain scale (0-10) AFTER the session
 * - Optional: link to a recent appointment
 * - Shows history of previously submitted feedbacks
 */

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface FeedbackEntry {
  id: string;
  overallFeedback: string;
  painBefore: number;
  painAfter: number;
  createdAt: string;
  appointment?: {
    startTime: string;
    sessionType: string;
    doctor: { name: string };
  } | null;
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=DM+Sans:opsz,wght@9..40,400;9..40,500&display=swap');
*{box-sizing:border-box}
:root{--bg:#F4EFE6;--w:#fff;--br:#2C150A;--br2:#3D1A0E;--te:#C4622D;--or:#E8884A;--mu:#8A7055;--bd:#DDD3C0}
body{background:var(--bg);font-family:'DM Sans',sans-serif;color:var(--br2);font-size:13px;margin:0}
.wrap{max-width:700px;margin:0 auto;padding:16px}
.hdr{background:var(--br);border-radius:12px;padding:12px 16px;margin-bottom:14px}
.hn{font-family:'Cormorant Garamond',serif;font-size:17px;color:#F4EFE6;font-weight:600}
.hs{font-size:10px;color:var(--or);letter-spacing:.5px;margin-top:2px}
.card{background:var(--w);border:1px solid var(--bd);border-radius:12px;padding:16px;margin-bottom:12px}
.ct{font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:600;color:var(--br2);margin-bottom:8px}
label{display:block;font-size:11px;font-weight:500;color:var(--mu);margin-bottom:4px;text-transform:uppercase;letter-spacing:.4px}
textarea{width:100%;border:1px solid var(--bd);border-radius:8px;padding:10px 12px;font-family:inherit;font-size:13px;color:var(--br2);background:var(--w);resize:vertical;min-height:90px;outline:none}
textarea:focus{border-color:var(--te)}
.scale-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}
.scale-btn{width:38px;height:38px;border-radius:8px;border:1px solid var(--bd);background:var(--w);font-family:inherit;font-size:13px;font-weight:500;cursor:pointer;color:var(--mu);transition:all .15s}
.scale-btn.sel{background:var(--te);color:#fff;border-color:var(--te)}
.scale-btn:hover:not(.sel){border-color:var(--te);color:var(--te)}
.scale-labels{display:flex;justify-content:space-between;font-size:10px;color:var(--mu);margin-top:4px;padding:0 2px}
.btn-p{background:var(--te);color:#fff;border:none;border-radius:8px;padding:10px 20px;font-family:inherit;font-size:13px;font-weight:500;cursor:pointer}
.btn-p:hover{background:#B05520}
.btn-p:disabled{opacity:.5;cursor:not-allowed}
.success{background:#EFF9F3;border:1px solid #96D4B0;border-radius:8px;padding:12px;color:#1E6640;font-size:13px;margin-bottom:12px}
.err{background:#FDF0F0;border:1px solid #E8B8B8;border-radius:8px;padding:12px;color:#A83030;font-size:13px;margin-bottom:12px}
.hst-item{border-left:3px solid var(--bd);padding:8px 12px;margin-bottom:10px}
.hst-item.pos{border-left-color:#1E6640}
.hst-item.neg{border-left-color:#A83030}
.hst-item.neu{border-left-color:var(--or)}
.hst-meta{font-size:10px;color:var(--mu);margin-bottom:4px}
.pain-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500}
.pain-chip.lo{background:#EFF9F3;color:#1E6640}
.pain-chip.md{background:#FFF8E6;color:#9A6A00}
.pain-chip.hi{background:#FDF0F0;color:#A83030}
.empty{text-align:center;padding:24px;color:var(--mu);font-size:12px}
`;

function painChipClass(score: number): string {
  if (score <= 3) return "pain-chip lo";
  if (score <= 6) return "pain-chip md";
  return "pain-chip hi";
}

function PainScale({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="scale-row">
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            type="button"
            className={`scale-btn${value === i ? " sel" : ""}`}
            onClick={() => onChange(i)}
          >
            {i}
          </button>
        ))}
      </div>
      <div className="scale-labels">
        <span>No pain</span>
        <span>Worst pain</span>
      </div>
    </div>
  );
}

export default function PatientFeedbackPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [overallFeedback, setOverallFeedback] = useState("");
  const [painBefore, setPainBefore] = useState<number | null>(null);
  const [painAfter, setPainAfter] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [history, setHistory] = useState<FeedbackEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Auth guard
  useEffect(() => {
    if (authStatus === "unauthenticated") router.replace("/auth/login");
  }, [authStatus, router]);

  // Load feedback history
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    fetch("/api/patient/feedback")
      .then((r) => r.json())
      .then((d) => {
        if (d.feedbacks) setHistory(d.feedbacks);
      })
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, [authStatus, success]);

  async function handleSubmit() {
    setError("");
    if (overallFeedback.trim().length < 5) {
      setError("Please write at least a few words in your feedback.");
      return;
    }
    if (painBefore === null || painAfter === null) {
      setError("Please select both pain scores (before and after your session).");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/patient/feedback", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          overallFeedback: overallFeedback.trim(),
          painBefore,
          painAfter,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to submit feedback.");
        return;
      }
      setSuccess(true);
      setOverallFeedback("");
      setPainBefore(null);
      setPainAfter(null);
      setTimeout(() => setSuccess(false), 4000);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (authStatus === "loading") return null;

  return (
    <>
      <style>{CSS}</style>
      <div className="wrap">
        {/* Header */}
        <div className="hdr">
          <div className="hn">Session Feedback</div>
          <div className="hs">VYAYAMA PHYSIO · PATIENT PORTAL</div>
        </div>

        {success && (
          <div className="success">
            ✅ Thank you! Your feedback has been submitted successfully.
          </div>
        )}
        {error && <div className="err">⚠️ {error}</div>}

        {/* Submit Form */}
        <div className="card">
          <div className="ct">Submit Feedback</div>
          <p style={{ fontSize: 12, color: "var(--mu)", marginBottom: 14, marginTop: 0 }}>
            Help us improve your care by sharing how your session went.
          </p>

          {/* Overall feedback */}
          <div style={{ marginBottom: 16 }}>
            <label>Overall Feedback *</label>
            <textarea
              placeholder="Describe your experience — the treatment, how you felt, anything we can improve..."
              value={overallFeedback}
              onChange={(e) => setOverallFeedback(e.target.value)}
              maxLength={1000}
            />
            <div style={{ fontSize: 10, color: "var(--mu)", textAlign: "right", marginTop: 2 }}>
              {overallFeedback.length}/1000
            </div>
          </div>

          {/* Pain Before */}
          <div style={{ marginBottom: 16 }}>
            <label>Pain Level BEFORE the session * (0 = no pain, 10 = worst)</label>
            <PainScale value={painBefore} onChange={setPainBefore} />
          </div>

          {/* Pain After */}
          <div style={{ marginBottom: 18 }}>
            <label>Pain Level AFTER the session * (0 = no pain, 10 = worst)</label>
            <PainScale value={painAfter} onChange={setPainAfter} />
          </div>

          {/* Pain comparison */}
          {painBefore !== null && painAfter !== null && (
            <div
              style={{
                background: painAfter < painBefore ? "#EFF9F3" : painAfter > painBefore ? "#FDF0F0" : "#F4EFE6",
                border: `1px solid ${painAfter < painBefore ? "#96D4B0" : painAfter > painBefore ? "#E8B8B8" : "var(--bd)"}`,
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 12,
                color: painAfter < painBefore ? "#1E6640" : painAfter > painBefore ? "#A83030" : "var(--mu)",
                marginBottom: 14,
              }}
            >
              {painAfter < painBefore
                ? `✅ Pain reduced by ${painBefore - painAfter} point${painBefore - painAfter !== 1 ? "s" : ""}`
                : painAfter > painBefore
                ? `⚠️ Pain increased by ${painAfter - painBefore} point${painAfter - painBefore !== 1 ? "s" : ""} — please mention this to your therapist`
                : "➡️ Pain level unchanged"}
            </div>
          )}

          <button
            className="btn-p"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Submitting…" : "Submit Feedback"}
          </button>
        </div>

        {/* History */}
        <div className="card">
          <div className="ct">My Feedback History</div>

          {loadingHistory ? (
            <div className="empty">Loading…</div>
          ) : history.length === 0 ? (
            <div className="empty">No feedback submitted yet.</div>
          ) : (
            history.map((fb) => {
              const diff = fb.painBefore - fb.painAfter;
              const cls = diff > 0 ? "pos" : diff < 0 ? "neg" : "neu";
              return (
                <div key={fb.id} className={`hst-item ${cls}`}>
                  <div className="hst-meta">
                    {new Date(fb.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                    {fb.appointment && (
                      <> · {fb.appointment.doctor.name} · {fb.appointment.sessionType.replace(/_/g, " ")}</>
                    )}
                  </div>
                  <p style={{ margin: "4px 0 6px", lineHeight: 1.6 }}>{fb.overallFeedback}</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span className={painChipClass(fb.painBefore)}>
                      Before: {fb.painBefore}/10
                    </span>
                    <span className={painChipClass(fb.painAfter)}>
                      After: {fb.painAfter}/10
                    </span>
                    {diff > 0 && (
                      <span className="pain-chip lo">↓ {diff} pt improvement</span>
                    )}
                    {diff < 0 && (
                      <span className="pain-chip hi">↑ {Math.abs(diff)} pt increase</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
