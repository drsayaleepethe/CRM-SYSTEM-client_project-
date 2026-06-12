"use client";

/**
 * src/app/dashboard/reports/page.tsx
 *
 * Assessment Reports Viewer — Doctor & Admin
 * Themed to match the Vyayama Physio clinic design system.
 */

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  Archive,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Assessment {
  id: string;
  patientId: string | null;
  doctorId: string;
  primaryComplaint: string | null;
  nrsScore: number | null;
  ndiScore: number | null;
  mobilityScore: number | null;
  mobilityGrade: string | null;
  primaryDiagnosis: string | null;
  primaryDxIcd: string | null;
  diagnosisConfidence: number | null;
  irritability: string | null;
  stage: string | null;
  investmentPlan: string | null;
  hasRedFlags: boolean;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedAt: string | null;
  createdAt: string;
  patient: { name: string; patientCode: string; age: number | null } | null;
  doctor: { name: string };
  assessmentData?: any;
  aiDiagnosis?: any;
  aiDocuments?: any;
}

interface FullAssessment extends Assessment {
  patient: (Assessment["patient"] & { gender?: string | null; phone?: string | null }) | null;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  DRAFT:     { label: "Draft",     className: "bg-[#F4EFE6] text-[#8A7055] border border-[#DDD3C0]",      icon: <Clock      className="h-3 w-3" /> },
  PUBLISHED: { label: "Published", className: "bg-[#EFF9F3] text-[#1E6640] border border-[#96D4B0]",    icon: <CheckCircle className="h-3 w-3" /> },
  ARCHIVED:  { label: "Archived",  className: "bg-[#FFF8E6] text-[#9A6A00] border border-[#F0D080]",    icon: <Archive    className="h-3 w-3" /> },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.className}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ─── Report Panel Helpers ─────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-px flex-1 bg-[#EDE8DF]" />
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#8A7055] px-1">{title}</h4>
        <div className="h-px flex-1 bg-[#EDE8DF]" />
      </div>
      {children}
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex gap-2 text-sm mb-1.5">
      <span className="text-[#8A7055] min-w-[150px] shrink-0 text-xs">{label}</span>
      <span className="text-[#2C150A] font-semibold text-xs">{value}</span>
    </div>
  );
}

// ─── Outcome Measures Table ───────────────────────────────────────────────────

function OutcomeTable({ assessment }: { assessment: FullAssessment }) {
  const ai = assessment.aiDiagnosis;
  const rows = [
    {
      key: "NDI", full: "Neck Disability Index",
      score: assessment.ndiScore != null ? `${assessment.ndiScore}%` : "—",
      interp: assessment.ndiScore != null
        ? assessment.ndiScore < 10 ? "No disability"
        : assessment.ndiScore < 30 ? "Mild disability"
        : assessment.ndiScore < 50 ? "Moderate disability"
        : assessment.ndiScore < 70 ? "Severe disability"
        : "Complete disability"
        : null,
    },
    {
      key: "ODI", full: "Oswestry Disability Index",
      score: ai?.outcomeMeasures?.odi != null ? `${ai.outcomeMeasures.odi}%` : "—",
      interp: ai?.outcomeMeasures?.odi != null
        ? ai.outcomeMeasures.odi < 21 ? "Minimal disability"
        : ai.outcomeMeasures.odi < 41 ? "Moderate disability"
        : ai.outcomeMeasures.odi < 61 ? "Severe disability"
        : ai.outcomeMeasures.odi < 81 ? "Crippling back pain"
        : "Bed-bound / exaggerating"
        : null,
    },
    {
      key: "LEFS", full: "Lower Extremity Functional Scale",
      score: ai?.outcomeMeasures?.lefs != null ? `${ai.outcomeMeasures.lefs}/80` : "—",
      interp: ai?.outcomeMeasures?.lefs != null
        ? ai.outcomeMeasures.lefs >= 64 ? "Minimal / no limitation"
        : ai.outcomeMeasures.lefs >= 40 ? "Moderate limitation"
        : "Severe limitation"
        : null,
    },
    {
      key: "DASH", full: "Disabilities of the Arm, Shoulder & Hand",
      score: ai?.outcomeMeasures?.dash != null ? `${ai.outcomeMeasures.dash}/100` : "—",
      interp: ai?.outcomeMeasures?.dash != null
        ? ai.outcomeMeasures.dash < 20 ? "Mild limitation"
        : ai.outcomeMeasures.dash < 40 ? "Moderate limitation"
        : "Severe limitation"
        : null,
    },
    {
      key: "PSFS", full: "Patient-Specific Functional Scale",
      score: ai?.outcomeMeasures?.psfs != null ? `${ai.outcomeMeasures.psfs}/10` : "—",
      interp: ai?.outcomeMeasures?.psfs != null
        ? ai.outcomeMeasures.psfs >= 7 ? "Good function"
        : ai.outcomeMeasures.psfs >= 4 ? "Moderate limitation"
        : "Severe limitation"
        : null,
    },
  ];

  return (
    <div className="overflow-x-auto rounded-xl border border-[#DDD3C0]">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-[#F4EFE6]">
            {["Measure", "Full Name", "Score", "Interpretation"].map((h) => (
              <th key={h} className="text-left px-3 py-2.5 font-bold text-[#3D1A0E] border-b border-[#DDD3C0] text-[11px] uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key} className={i % 2 === 0 ? "bg-white" : "bg-[#F9F6F1]"}>
              <td className="px-3 py-2.5 border-b border-[#EDE8DF] font-bold text-[#C4622D]">{r.key}</td>
              <td className="px-3 py-2.5 border-b border-[#EDE8DF] text-[#3D1A0E]">{r.full}</td>
              <td className="px-3 py-2.5 border-b border-[#EDE8DF] font-semibold text-[#2C150A]">{r.score}</td>
              <td className="px-3 py-2.5 border-b border-[#EDE8DF] text-[#8A7055]">
                {r.interp ?? <span className="text-[#B0A090] italic">Not applicable / not collected</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {ai?.outcomeMeasures?.notes && (
        <div className="px-3 py-2 bg-[#F9F6F1] border-t border-[#DDD3C0] text-[11px] text-[#8A7055] italic">
          {ai.outcomeMeasures.notes}
        </div>
      )}
    </div>
  );
}

// ─── Full Report Expanded Panel ───────────────────────────────────────────────

function ReportPanel({ assessment }: { assessment: FullAssessment }) {
  const ai   = assessment.aiDiagnosis;
  const docs = assessment.aiDocuments;
  const soap = docs?.soap;
  const vm   = docs?.vm;

  return (
    <div className="mt-3 pt-4 border-t border-[#EDE8DF] space-y-1">

      {/* Patient & Session */}
      <Section title="Patient & Session">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-0.5 bg-[#F9F6F1] rounded-xl p-3 border border-[#EDE8DF]">
          <KV label="Patient"      value={assessment.patient?.name ?? "—"} />
          <KV label="Patient Code" value={assessment.patient?.patientCode ?? "—"} />
          <KV label="Age"          value={assessment.patient?.age ? `${assessment.patient.age} yrs` : null} />
          <KV label="Doctor"       value={assessment.doctor.name} />
          <KV label="Date"         value={new Date(assessment.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} />
          <KV label="Status"       value={<StatusBadge status={assessment.status} />} />
        </div>
      </Section>

      {/* Clinical Summary */}
      <Section title="Clinical Summary">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-0.5 bg-[#F9F6F1] rounded-xl p-3 border border-[#EDE8DF]">
          <KV label="Primary Complaint"   value={assessment.primaryComplaint} />
          <KV label="Primary Diagnosis"   value={assessment.primaryDiagnosis} />
          <KV label="ICD Code"            value={assessment.primaryDxIcd} />
          <KV label="Confidence"          value={assessment.diagnosisConfidence ? `${assessment.diagnosisConfidence}%` : null} />
          <KV label="NRS Pain Score"      value={assessment.nrsScore !== null ? `${assessment.nrsScore}/10` : null} />
          <KV label="NDI Score"           value={assessment.ndiScore !== null ? `${assessment.ndiScore}%` : null} />
          <KV label="Mobility Score"      value={assessment.mobilityScore !== null ? `${assessment.mobilityScore}%` : null} />
          <KV label="Mobility Grade"      value={assessment.mobilityGrade} />
          <KV label="Irritability"        value={assessment.irritability} />
          <KV label="Stage"               value={assessment.stage} />
          <KV label="Investment Plan"     value={assessment.investmentPlan} />
          <KV label="Red Flags"           value={assessment.hasRedFlags
            ? <span className="text-[#A83030] font-bold">⚠️ Yes</span>
            : <span className="text-[#1E6640]">None</span>}
          />
        </div>
      </Section>

      {/* Outcome Measures */}
      <Section title="Outcome Measures (NDI · ODI · LEFS · DASH · PSFS)">
        <OutcomeTable assessment={assessment} />
      </Section>

      {/* Differential Diagnoses */}
      {ai?.dx?.length > 0 && (
        <Section title="Differential Diagnoses">
          <div className="space-y-2">
            {ai.dx.map((d: any, i: number) => (
              <div key={i} className="bg-[#F9F6F1] rounded-xl p-3 border border-[#EDE8DF]">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-bold text-[#2C150A] text-xs">{d.n || d.name}</span>
                  <span className="text-[10px] text-[#C4622D] bg-[#FDF3EC] border border-[#E8C8A8] px-2 py-0.5 rounded-full">{d.icd}</span>
                  {d.c != null && (
                    <span className="ml-auto text-[10px] bg-[#EFF9F3] text-[#1E6640] border border-[#96D4B0] px-2 py-0.5 rounded-full font-semibold">
                      {d.c}% confidence
                    </span>
                  )}
                </div>
                {d.why && <p className="text-[11px] text-[#8A7055]">{d.why}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* SOAP Note */}
      {soap && (
        <Section title="SOAP Note">
          <div className="grid md:grid-cols-2 gap-2">
            {[
              { k: "s", label: "S — Subjective" },
              { k: "o", label: "O — Objective" },
              { k: "a", label: "A — Assessment" },
              { k: "p", label: "P — Plan" },
            ].map(({ k, label }) =>
              soap[k] ? (
                <div key={k} className="bg-[#F9F6F1] rounded-xl p-3 border border-[#EDE8DF]">
                  <div className="text-[10px] font-bold text-[#C4622D] uppercase tracking-wide mb-1.5">{label}</div>
                  <p className="text-xs text-[#3D1A0E] leading-relaxed">{soap[k]}</p>
                </div>
              ) : null
            )}
          </div>
        </Section>
      )}

      {/* Vyayama Clinical Report */}
      {vm && (
        <Section title="Clinical Report">
          {[
            { key: "pi",  label: "Presentation" },
            { key: "rca", label: "Root Cause Analysis" },
            { key: "mp",  label: "Management Plan" },
            { key: "lp",  label: "Lifestyle Plan" },
            { key: "t3m", label: "3-Month Target" },
          ].map(({ key, label }) =>
            vm[key] ? (
              <div key={key} className="mb-2">
                <div className="text-[10px] font-bold text-[#C4622D] uppercase tracking-wide mb-1">{label}</div>
                <p className="text-xs text-[#3D1A0E] leading-relaxed bg-[#F9F6F1] rounded-xl p-3 border border-[#EDE8DF]">{vm[key]}</p>
              </div>
            ) : null
          )}
        </Section>
      )}

      {/* Red Flags */}
      {ai?.flags?.filter((f: string) => f && f !== "...").length > 0 && (
        <Section title="Red Flags">
          <div className="bg-[#FDF0F0] border border-[#E8B8B8] rounded-xl p-3">
            <ul className="space-y-1">
              {ai.flags.filter((f: string) => f && f !== "...").map((f: string, i: number) => (
                <li key={i} className="text-xs text-[#A83030] flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{f}
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      {/* HEP */}
      {ai?.hep?.length > 0 && (
        <Section title="Home Exercise Programme">
          <div className="grid md:grid-cols-2 gap-2">
            {ai.hep.map((ex: any, i: number) => (
              <div key={i} className="bg-[#EFF9F3] rounded-xl p-3 border border-[#96D4B0]">
                <div className="font-bold text-[#1E6640] text-xs mb-1">{ex.n}</div>
                <div className="text-xs text-[#2E7D52] mb-1">{ex.s} sets × {ex.r} reps · {ex.f}</div>
                {ex.c && <p className="text-[11px] text-[#3D8C5C]">{ex.c}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReportsDashboardPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [assessments, setAssessments]     = useState<Assessment[]>([]);
  const [pagination, setPagination]       = useState<any>(null);
  const [loading, setLoading]             = useState(true);
  const [page, setPage]                   = useState(1);
  const [search, setSearch]               = useState("");
  const [searchInput, setSearchInput]     = useState("");
  const [statusFilter, setStatusFilter]   = useState("");
  const [expanded, setExpanded]           = useState<string | null>(null);
  const [fullReports, setFullReports]     = useState<Record<string, FullAssessment>>({});
  const [loadingReport, setLoadingReport] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus === "unauthenticated") router.replace("/auth/login");
    if (
      authStatus === "authenticated" &&
      !["ADMIN", "DOCTOR", "RECEPTIONIST"].includes(session?.user?.role ?? "")
    ) router.replace("/dashboard");
  }, [authStatus, session, router]);

  const fetchAssessments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
        ...(statusFilter ? { status: statusFilter } : {}),
      });
      const res  = await fetch(`/api/assessments?${params}`);
      const data = await res.json();
      if (data.assessments) {
        setAssessments(data.assessments);
        setPagination(data.pagination);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [page, statusFilter]);

  useEffect(() => {
    if (authStatus === "authenticated") fetchAssessments();
  }, [authStatus, fetchAssessments]);

  async function toggleExpand(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (fullReports[id]) return;
    setLoadingReport(id);
    try {
      const res  = await fetch(`/api/assessments/${id}`);
      const data = await res.json();
      if (data.assessment) setFullReports((p) => ({ ...p, [id]: data.assessment }));
    } catch { /* silent */ }
    finally { setLoadingReport(null); }
  }

  const visible = search
    ? assessments.filter(
        (a) =>
          (a.patient?.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (a.primaryDiagnosis ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : assessments;

  if (authStatus === "loading") return null;

  return (
    <div className="min-h-screen bg-[#F4EFE6] p-5">
      <div className="max-w-5xl mx-auto">

        {/* ── Page Header ── */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-[#2C150A] flex items-center justify-center">
              <FileText className="h-4 w-4 text-[#F4EFE6]" />
            </div>
            <h1 className="text-2xl font-bold text-[#2C150A]">Assessment Reports</h1>
          </div>
          <p className="text-sm text-[#8A7055] ml-12">
            View and review all saved physiotherapy assessment reports
          </p>
        </div>

        {/* ── Filters ── */}
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A7055]" />
            <input
              type="text"
              placeholder="Search patient or diagnosis…"
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); setSearch(e.target.value); }}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#DDD3C0] bg-white text-sm text-[#2C150A] placeholder-[#B0A090] focus:outline-none focus:ring-2 focus:ring-[#C4622D]/30 focus:border-[#C4622D]"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2.5 rounded-xl border border-[#DDD3C0] bg-white text-sm text-[#2C150A] focus:outline-none focus:ring-2 focus:ring-[#C4622D]/30 focus:border-[#C4622D]"
          >
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>

        {/* ── List ── */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-[#DDD3C0] p-12 text-center text-[#8A7055] shadow-sm">
            <div className="animate-pulse">Loading reports…</div>
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#DDD3C0] p-12 text-center shadow-sm">
            <FileText className="h-10 w-10 mx-auto mb-3 text-[#DDD3C0]" />
            <p className="text-[#8A7055] text-sm">No assessment reports found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((a) => {
              const isOpen     = expanded === a.id;
              const full       = fullReports[a.id];
              const isLoading  = loadingReport === a.id;

              return (
                <div key={a.id} className="bg-white rounded-2xl border border-[#DDD3C0] overflow-hidden shadow-sm">

                  {/* Summary row */}
                  <button
                    onClick={() => toggleExpand(a.id)}
                    className="w-full text-left p-4 hover:bg-[#F9F6F1] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        {/* Name + badges */}
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-bold text-[#2C150A]">
                            {a.patient?.name ?? "Unnamed Patient"}
                          </span>
                          {a.patient?.patientCode && (
                            <span className="text-[10px] bg-[#F4EFE6] text-[#8A7055] border border-[#DDD3C0] px-2 py-0.5 rounded-full font-medium">
                              {a.patient.patientCode}
                            </span>
                          )}
                          <StatusBadge status={a.status} />
                          {a.hasRedFlags && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#A83030] bg-[#FDF0F0] border border-[#E8B8B8] px-2 py-0.5 rounded-full font-semibold">
                              <AlertTriangle className="h-3 w-3" /> Red Flags
                            </span>
                          )}
                        </div>

                        {/* Diagnosis */}
                        <div className="text-sm text-[#3D1A0E] font-medium">
                          {a.primaryDiagnosis ?? "No diagnosis"}
                          {a.primaryDxIcd && (
                            <span className="ml-2 text-[11px] text-[#C4622D] bg-[#FDF3EC] border border-[#E8C8A8] px-1.5 py-0.5 rounded-md">
                              {a.primaryDxIcd}
                            </span>
                          )}
                        </div>

                        {/* Meta row */}
                        <div className="flex gap-2 mt-1.5 flex-wrap text-xs text-[#8A7055]">
                          <span>Dr. {a.doctor.name}</span>
                          <span className="text-[#DDD3C0]">·</span>
                          <span>{new Date(a.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                          {a.nrsScore !== null && <><span className="text-[#DDD3C0]">·</span><span>NRS {a.nrsScore}/10</span></>}
                          {a.mobilityGrade && <><span className="text-[#DDD3C0]">·</span><span>Mobility {a.mobilityGrade}</span></>}
                          {a.stage && <><span className="text-[#DDD3C0]">·</span><span>{a.stage}</span></>}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-[#8A7055] shrink-0">
                        {isLoading ? (
                          <span className="text-xs animate-pulse">Loading…</span>
                        ) : isOpen ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Expanded panel */}
                  {isOpen && (
                    <div className="px-4 pb-4">
                      {isLoading ? (
                        <div className="py-6 text-center text-[#8A7055] text-sm animate-pulse">
                          Loading full report…
                        </div>
                      ) : full ? (
                        <ReportPanel assessment={full} />
                      ) : (
                        <div className="py-6 text-center text-[#8A7055] text-sm">
                          Could not load report details.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Pagination ── */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between mt-4 bg-white rounded-2xl border border-[#DDD3C0] px-4 py-3 shadow-sm">
            <span className="text-sm text-[#8A7055]">
              Page {pagination.page} of {pagination.pages} · {pagination.total} total
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-[#DDD3C0] bg-white disabled:opacity-40 hover:bg-[#F4EFE6] transition-colors"
              >
                <ChevronLeft className="h-4 w-4 text-[#8A7055]" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={page === pagination.pages}
                className="p-1.5 rounded-lg border border-[#DDD3C0] bg-white disabled:opacity-40 hover:bg-[#F4EFE6] transition-colors"
              >
                <ChevronRight className="h-4 w-4 text-[#8A7055]" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
