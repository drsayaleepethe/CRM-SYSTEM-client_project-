"use client";

/**
 * src/app/patient/assessments/page.tsx
 *
 * Patient-facing assessment viewer.
 * Shows PUBLISHED assessments only.
 * Patients can view diagnoses, rehab plan, SOAP, HEP, and download/share report.
 */

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Assessment {
  id: string;
  primaryComplaint: string | null;
  primaryDiagnosis: string | null;
  primaryDxIcd: string | null;
  diagnosisConfidence: number | null;
  nrsScore: number | null;
  mobilityGrade: string | null;
  irritability: string | null;
  stage: string | null;
  investmentPlan: string | null;
  hasRedFlags: boolean;
  publishedAt: string;
  aiDiagnosis: any;
  aiDocuments: any;
  assessmentData: any;
  doctor: { name: string };
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=DM+Sans:opsz,wght@9..40,400;9..40,500&display=swap');
*{box-sizing:border-box}
:root{--bg:#F4EFE6;--w:#fff;--br:#2C150A;--br2:#3D1A0E;--te:#C4622D;--or:#E8884A;--mu:#8A7055;--bd:#DDD3C0;--pc:#A83030;--pb:#FDF0F0;--pbb:#E8B8B8;--nc:#1E6640;--nb:#EFF9F3;--nbb:#96D4B0}
body{background:var(--bg);font-family:'DM Sans',sans-serif;color:var(--br2);font-size:13px}
.wrap{max-width:720px;margin:0 auto;padding:16px}
.hdr{background:var(--br);border-radius:12px;padding:12px 16px;margin-bottom:14px}
.hn{font-family:'Cormorant Garamond',serif;font-size:17px;color:#F4EFE6;font-weight:600}
.hs{font-size:10px;color:var(--or);letter-spacing:.5px;margin-top:2px}
.card{background:var(--w);border:1px solid var(--bd);border-radius:12px;padding:15px;margin-bottom:12px}
.ct{font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:600;color:var(--br2);margin-bottom:3px}
.cs{font-size:11px;color:var(--mu);margin-bottom:10px}
.pill{padding:3px 9px;border-radius:12px;font-size:10px;font-weight:500;border:1px solid;display:inline-block;margin-right:4px;margin-bottom:3px}
.rtabs{display:flex;gap:4px;overflow-x:auto;margin-bottom:12px;scrollbar-width:none}
.rtabs::-webkit-scrollbar{display:none}
.rtab{padding:5px 12px;border-radius:20px;border:1px solid var(--bd);background:var(--w);font-size:11px;cursor:pointer;white-space:nowrap;font-family:inherit;color:var(--mu)}
.rtab.a{background:var(--te);color:#fff;border-color:var(--te)}
.sec{background:var(--bg);border:1px solid var(--bd);border-radius:9px;padding:10px 13px;margin-bottom:8px}
.slbl{font-size:9px;font-weight:500;color:var(--mu);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px}
.sval{font-size:12px;color:var(--br2);line-height:1.7}
.btn{padding:8px 16px;border-radius:8px;font-family:inherit;font-size:12px;font-weight:500;cursor:pointer;border:1px solid var(--bd);background:var(--w);color:var(--mu)}
.btn:hover{border-color:var(--te);color:var(--te)}
.btn-p{background:var(--te);color:#fff;border-color:var(--te)}
.btn-p:hover{background:#B05520}
.disclaimer{font-size:9px;color:var(--mu);text-align:center;padding:8px 0;opacity:.8;line-height:1.6}
`;

const phColors = ["#C4622D", "#D47830", "#B87040", "#9A5A30"];
const MOD_ICONS: Record<string, string> = {
  electro: "⚡", needle: "◉", tape: "◫", cup: "◐", manual: "🤲", edu: "◷", exercise: "◈"
};
function modT(s: string) {
  const t = (s || "").toLowerCase();
  if (/ift|tens|ultrasound|russian|nmes|traction/.test(t)) return "electro";
  if (/needl|dry/.test(t)) return "needle";
  if (/tape|kinesio/.test(t)) return "tape";
  if (/cupping/.test(t)) return "cup";
  if (/maitland|mobilisati|manual|mfr|soft tissue/.test(t)) return "manual";
  if (/educati|ergon|advice/.test(t)) return "edu";
  return "exercise";
}

export default function PatientAssessmentsPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selected, setSelected] = useState<Assessment | null>(null);
  const [rTab, setRTab] = useState("summary");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (authStatus === "authenticated" && session?.user?.role !== "PATIENT") {
      router.replace("/dashboard");
      return;
    }
    if (authStatus === "authenticated") {
      fetch("/api/patient/assessments")
        .then((r) => r.json())
        .then((d) => { setAssessments(d.assessments ?? []); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [authStatus, session, router]);

  function cp(text: string, key: string) {
    try { navigator.clipboard.writeText(text); } catch {}
    setCopied(key);
    setTimeout(() => setCopied(""), 2200);
  }

  function printReport() {
    window.print();
  }

  if (authStatus === "loading" || loading) {
    return (
      <>
        <style>{CSS}</style>
        <div className="wrap">
          <div style={{ textAlign: "center", padding: 40, color: "var(--mu)", fontSize: 13 }}>Loading your reports…</div>
        </div>
      </>
    );
  }

  if (selected) {
    const d = selected.aiDiagnosis;
    const docs = selected.aiDocuments;
    const P = selected.assessmentData?.P ?? {};
    const tabs = [
      ["summary", "Summary"],
      ["dx", "Diagnoses"],
      ["plan", "Rehab Plan"],
      ["soap", "Clinical Note"],
      ["hep", "Home Exercises"],
    ];

    return (
      <>
        <style>{CSS}</style>
        <style>{`@media print { .no-print { display: none !important; } }`}</style>
        <div className="wrap">
          {/* Header */}
          <div className="hdr">
            <div className="hn">Vyayāma Physio — Your Assessment Report</div>
            <div className="hs">
              {new Date(selected.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} · {selected.doctor.name}
            </div>
          </div>

          {/* Back + actions */}
          <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button className="btn" onClick={() => setSelected(null)}>← All Reports</button>
            <button className="btn" onClick={printReport}>🖨 Print / Save PDF</button>
            {docs?.wa && (
              <button className="btn" onClick={() => cp(docs.wa, "wa")} style={{ marginLeft: "auto" }}>
                {copied === "wa" ? "✓ Copied" : "📱 Copy WhatsApp"}
              </button>
            )}
          </div>

          {/* Red flags warning */}
          {selected.hasRedFlags && d?.flags?.filter((f: string) => f && f !== "...").length > 0 && (
            <div style={{ background: "#FDF5F5", border: "1px solid #F0CCCC", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#C0392B", marginBottom: 3 }}>🚩 Important — Please contact us immediately</div>
              {d.flags.map((f: string, i: number) => <div key={i} style={{ fontSize: 11, color: "#983020" }}>• {f}</div>)}
            </div>
          )}

          {/* Summary chips */}
          <div style={{ marginBottom: 10 }}>
            {selected.irritability && <span className="pill" style={{ background: "#FEF4EE", borderColor: "#F0B898", color: "var(--te)" }}>Irritability: {selected.irritability}</span>}
            {selected.stage && <span className="pill" style={{ background: "var(--bg)", borderColor: "var(--bd)", color: "var(--br2)" }}>Stage: {selected.stage}</span>}
            {selected.mobilityGrade && <span className="pill" style={{ background: "var(--nb)", borderColor: "var(--nbb)", color: "var(--nc)" }}>Mobility: {selected.mobilityGrade}</span>}
          </div>

          {/* Investment plan */}
          {selected.investmentPlan && (
            <div style={{ background: "var(--br)", color: "#F4EFE6", borderRadius: 10, padding: "11px 14px", marginBottom: 10 }}>
              <div style={{ fontSize: 9, opacity: .65, letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 2 }}>Recommended Programme</div>
              <div style={{ fontFamily: "Cormorant Garamond,serif", fontSize: 16, color: "#E8884A" }}>{selected.investmentPlan}</div>
            </div>
          )}

          {/* Tab navigation */}
          <div className="rtabs no-print">
            {tabs.map(([id, lb]) => (
              <button key={id} className={`rtab ${rTab === id ? "a" : ""}`} onClick={() => setRTab(id)}>{lb}</button>
            ))}
          </div>

          {/* SUMMARY TAB */}
          {rTab === "summary" && (
            <div>
              {docs?.vm?.pi && (
                <div className="sec">
                  <div className="slbl">What Your Pain Means</div>
                  <div className="sval">{docs.vm.pi}</div>
                </div>
              )}
              {docs?.vm?.rca && (
                <div className="sec">
                  <div className="slbl">Root Cause</div>
                  <div className="sval">{docs.vm.rca}</div>
                </div>
              )}
              {docs?.ptR && (
                <div style={{ background: "var(--nb)", border: "1px solid var(--nbb)", borderRadius: 9, padding: "10px 13px", marginBottom: 8 }}>
                  <div className="slbl" style={{ color: "var(--nc)" }}>In Plain English</div>
                  <div className="sval">{docs.ptR}</div>
                </div>
              )}
              {docs?.vm?.t3m && (
                <div className="sec">
                  <div className="slbl">Your 3-Month Target</div>
                  <div className="sval">{docs.vm.t3m}</div>
                </div>
              )}
              {docs?.vm?.lp && (
                <div className="sec">
                  <div className="slbl">Lifestyle Plan</div>
                  <div className="sval">{docs.vm.lp}</div>
                </div>
              )}
            </div>
          )}

          {/* DIAGNOSES TAB */}
          {rTab === "dx" && (
            <div>
              {(d?.dx ?? []).map((dx: any) => (
                <div key={dx.r} style={{ border: "1px solid var(--bd)", borderRadius: 10, padding: 12, marginBottom: 8, background: "var(--w)" }}>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--te)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, marginRight: 8, flexShrink: 0 }}>{dx.r}</span>
                    <span style={{ fontFamily: "Cormorant Garamond,serif", fontSize: 14, fontWeight: 600, color: "var(--br2)", flex: 1 }}>{dx.n}</span>
                    <span style={{ fontSize: 11, color: "var(--te)", fontWeight: 500 }}>{dx.c}% likely</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: "var(--bd)", marginBottom: 6, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 2, background: "linear-gradient(90deg,var(--or),var(--te))", width: (dx.c || 0) + "%" }} />
                  </div>
                  {dx.why && <div style={{ fontSize: 11, color: "var(--mu)", fontStyle: "italic" }}>{dx.why}</div>}
                </div>
              ))}
              <div className="disclaimer">These are provisional clinical classifications, not a definitive medical diagnosis. Always follow the advice of your physiotherapist.</div>
            </div>
          )}

          {/* REHAB PLAN TAB */}
          {rTab === "plan" && (
            <div>
              {["p1", "p2", "p3", "p4"].map((pk, i) => {
                const ph = d?.plan?.[pk];
                if (!ph) return null;
                return (
                  <div key={pk} style={{ border: "1px solid var(--bd)", borderRadius: 10, overflow: "hidden", marginBottom: 10, background: "var(--w)" }}>
                    <div style={{ padding: "8px 12px", background: phColors[i] + "18", borderBottom: `2px solid ${phColors[i]}30`, display: "flex", alignItems: "center", gap: 7 }}>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", background: phColors[i], color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, flexShrink: 0 }}>P{i + 1}</div>
                      <span style={{ fontFamily: "Cormorant Garamond,serif", fontSize: 14, fontWeight: 600, color: "var(--br2)" }}>{ph.t}</span>
                      <span style={{ marginLeft: "auto", fontSize: 9, padding: "2px 7px", borderRadius: 10, background: "var(--bg)", border: "1px solid var(--bd)", color: "var(--mu)" }}>⏱ {ph.d}</span>
                    </div>
                    {(ph.g || []).filter((g: string) => g && g !== "...").length > 0 && (
                      <div style={{ padding: "6px 12px", borderBottom: "1px solid var(--bd)", display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {ph.g.filter((g: string) => g && g !== "...").map((g: string, j: number) => (
                          <span key={j} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 12, background: "var(--nb)", color: "var(--nc)", border: "1px solid var(--nbb)" }}>→ {g}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                      {(ph.rx || []).filter((r: string) => r && r !== "...").map((item: string, j: number) => {
                        const mt = modT(item);
                        return (
                          <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "4px 8px", borderRadius: 7, fontSize: 11 }}>
                            <span style={{ flexShrink: 0 }}>{MOD_ICONS[mt] || "◈"}</span>
                            <span style={{ color: "var(--br2)" }}>{item}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* SOAP/CLINICAL NOTE TAB */}
          {rTab === "soap" && docs?.soap && (
            <div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 7 }} className="no-print">
                <button className="btn" onClick={() => cp(`S: ${docs.soap.s}\n\nO: ${docs.soap.o}\n\nA: ${docs.soap.a}\n\nP: ${docs.soap.p}`, "soap")}>
                  {copied === "soap" ? "✓ Copied" : "Copy Note"}
                </button>
              </div>
              {[["S", "Subjective (What you reported)", docs.soap.s], ["O", "Objective (What was found)", docs.soap.o], ["A", "Assessment (Clinical impression)", docs.soap.a], ["P", "Plan (What happens next)", docs.soap.p]].map(([l, lb, c]) => (
                <div key={l} style={{ background: "var(--w)", border: "1px solid var(--bd)", borderRadius: 9, marginBottom: 7, overflow: "hidden" }}>
                  <div style={{ padding: "6px 12px", background: "var(--bg)", borderBottom: "1px solid var(--bd)", display: "flex", gap: 7, alignItems: "center" }}>
                    <span style={{ width: 19, height: 19, borderRadius: "50%", background: "var(--te)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{l}</span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: "var(--br2)" }}>{lb}</span>
                  </div>
                  <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--br2)", lineHeight: 1.7 }}>{c}</div>
                </div>
              ))}
            </div>
          )}

          {/* HEP TAB */}
          {rTab === "hep" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, alignItems: "center" }}>
                <div style={{ fontSize: 11, color: "var(--mu)" }}>Home Exercise Programme — Phase 1</div>
                <button className="btn no-print" onClick={() => cp((d?.hep ?? []).map((e: any, i: number) => `${i + 1}. ${e.n}\n   ${e.s}×${e.r} | ${e.f}\n   ${e.c}`).join("\n\n"), "hep")}>
                  {copied === "hep" ? "✓ Copied" : "Copy HEP"}
                </button>
              </div>
              {(d?.hep ?? []).map((ex: any, i: number) => (
                <div key={i} style={{ border: "1px solid var(--bd)", borderRadius: 8, padding: "9px 11px", marginBottom: 7, background: "var(--w)", display: "flex", gap: 9 }}>
                  <div style={{ background: "var(--bg)", borderRadius: 6, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Cormorant Garamond,serif", color: "var(--te)", fontWeight: 600, flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "var(--br2)" }}>{ex.n}</div>
                    <div style={{ display: "flex", gap: 5, margin: "3px 0" }}>
                      <span style={{ fontSize: 9, background: "var(--bg)", border: "1px solid var(--bd)", color: "var(--mu)", padding: "2px 6px", borderRadius: 8 }}>{ex.s}×{ex.r}</span>
                      <span style={{ fontSize: 9, background: "var(--bg)", border: "1px solid var(--bd)", color: "var(--mu)", padding: "2px 6px", borderRadius: 8 }}>{ex.f}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--mu)" }}>{ex.c}</div>
                  </div>
                </div>
              ))}
              <div className="disclaimer">Do these exercises as instructed. Stop if pain increases significantly. Contact us if you have questions.</div>
            </div>
          )}

          <div className="disclaimer">
            ⚕ AI-assisted provisional classification only. Supports but does not replace qualified physiotherapist judgment.<br />
            Vyayāma Physio · Dr. Sayalee Pethe, B.P.Th, PG Diploma Manual Therapy · M.I.A.P 63221 · Bengaluru
          </div>
        </div>
      </>
    );
  }

  // ── Assessment list ───────────────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div className="wrap">
        <div className="hdr">
          <div className="hn">Your Assessment Reports</div>
          <div className="hs">{assessments.length} report{assessments.length !== 1 ? "s" : ""} available</div>
        </div>

        {assessments.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "32px 16px" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <div style={{ fontFamily: "Cormorant Garamond,serif", fontSize: 16, color: "var(--br2)", marginBottom: 4 }}>No reports yet</div>
            <div style={{ fontSize: 12, color: "var(--mu)" }}>Your assessment reports will appear here once your physiotherapist publishes them after your session.</div>
          </div>
        ) : (
          assessments.map((a) => (
            <div key={a.id} className="card" style={{ cursor: "pointer" }} onClick={() => { setSelected(a); setRTab("summary"); }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div className="ct">{a.primaryDiagnosis || a.primaryComplaint || "Assessment"}</div>
                  <div className="cs">
                    {a.publishedAt ? new Date(a.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—"}
                    {" · "}Dr. {a.doctor.name}
                  </div>
                </div>
                <div style={{ color: "var(--te)", fontSize: 18 }}>→</div>
              </div>
              <div>
                {a.primaryDxIcd && <span className="pill" style={{ background: "var(--bg)", borderColor: "var(--bd)", color: "var(--mu)" }}>{a.primaryDxIcd}</span>}
                {a.nrsScore != null && <span className="pill" style={{ background: a.nrsScore >= 7 ? "var(--pb)" : "#FFF7E0", borderColor: a.nrsScore >= 7 ? "var(--pbb)" : "#EDD060", color: a.nrsScore >= 7 ? "var(--pc)" : "#7A5A00" }}>Pain: {a.nrsScore}/10</span>}
                {a.mobilityGrade && <span className="pill" style={{ background: "var(--nb)", borderColor: "var(--nbb)", color: "var(--nc)" }}>{a.mobilityGrade}</span>}
                {a.hasRedFlags && <span className="pill" style={{ background: "var(--pb)", borderColor: "var(--pbb)", color: "var(--pc)" }}>🚩 Flags present</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}