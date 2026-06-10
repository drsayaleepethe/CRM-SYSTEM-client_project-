"use client";
import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";


// ─── Brand Theme ──────────────────────────────────────────────────────────────
// primary: #4A0F06  secondary: #5C1408  accent: #D86F32
// cream: #F5F2E8    surface: #FAF8F2

// ─── Types ────────────────────────────────────────────────────────────────────
type Patient = {
  id: string;
  patientCode: string;
  name: string;
  phone: string;
  email: string;
  age?: number;
  gender?: string;
  address?: string;
  purposeOfVisit?: string;
  medicalConditions?: string;
  status: string;
  phase?: string;
  totalSessionsPlanned?: number;
  createdAt: string;
  appointments: { startTime: string }[];
  _count: { appointments: number };
};

// FIX: age typed as string | number so the input (string) and the coerced
// payload (number | undefined) both satisfy the type without casting.
type PatientForm = {
  name: string;
  phone: string;
  email: string;
  age: string | number;
  gender: string;
  address: string;
  purposeOfVisit: string;
  medicalConditions: string;
};

// ── +91 is pre-filled and protected as the default country code ───────────────
const BLANK_PATIENT: PatientForm = {
  name: "", phone: "+91", email: "", age: "",
  gender: "", address: "", purposeOfVisit: "", medicalConditions: "",
};

const STATUS_CONFIG: Record<string, { pill: string; dot: string; label: string }> = {
  NEW:        { pill: "bg-sky-50 text-sky-700 border border-sky-200",        dot: "bg-sky-400",   label: "New" },
  RETURNING:  { pill: "bg-emerald-50 text-emerald-700 border border-emerald-200", dot: "bg-emerald-500", label: "Returning" },
  DISCHARGED: { pill: "bg-slate-100 text-slate-500 border border-slate-200", dot: "bg-slate-400", label: "Discharged" },
  INACTIVE:   { pill: "bg-amber-50 text-amber-700 border border-amber-200",  dot: "bg-amber-400", label: "Inactive" },
};

const PHASE_CONFIG: Record<string, { short: string; color: string }> = {
  PHASE_1: { short: "P1", color: "bg-violet-100 text-violet-700" },
  PHASE_2: { short: "P2", color: "bg-blue-100 text-blue-700" },
  PHASE_3: { short: "P3", color: "bg-teal-100 text-teal-700" },
  PHASE_4: { short: "P4", color: "bg-emerald-100 text-emerald-700" },
  PHASE_5: { short: "P5", color: "bg-amber-100 text-amber-700" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function exportToGoogleSheets(patients: Patient[]) {
  const headers = ["Patient ID","Name","Phone","Email","Age","Gender","Address","Purpose of Visit","Medical Conditions","Status","Phase","Sessions Planned","Sessions Attended","Last Visit","Registered On"];
  const rows = patients.map((p) => [
    p.patientCode, p.name, p.phone, p.email ?? "", p.age ?? "", p.gender ?? "",
    p.address ?? "", p.purposeOfVisit ?? "", p.medicalConditions ?? "",
    p.status, p.phase ?? "Not assigned", p.totalSessionsPlanned ?? 0,
    p._count.appointments,
    p.appointments?.[0] ? new Date(p.appointments[0].startTime).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}) : "—",
    new Date(p.createdAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}),
  ]);
  const BOM = "\uFEFF";
  const escape = (v: unknown) => { const s = String(v ?? ""); return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g,'""')}"` : s; };
  const csv = BOM + [headers,...rows].map(row => row.map(escape).join(",")).join("\n");
  const blob = new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const date = new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}).replace(/ /g,"-");
  link.download = `Patient-Registry-${date}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase();
  const colors = ["bg-amber-100 text-amber-800","bg-orange-100 text-orange-800","bg-rose-100 text-rose-800","bg-teal-100 text-teal-800","bg-violet-100 text-violet-800","bg-blue-100 text-blue-800"];
  const color = colors[name.charCodeAt(0) % colors.length];
  const sz = size === "sm" ? "w-8 h-8 text-xs" : "w-9 h-9 text-sm";
  return <div className={`${sz} ${color} rounded-xl flex items-center justify-center font-black flex-shrink-0`}>{initials}</div>;
}

// ─── Field ────────────────────────────────────────────────────────────────────
function Field({ label, required: req, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-[#4A0F06]/60 uppercase tracking-widest mb-1.5">
        {label} {req && <span className="text-[#D86F32]">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full bg-[#FAF8F2] border border-[#4A0F06]/15 rounded-xl px-3.5 py-2.5 text-sm text-[#4A0F06] placeholder:text-[#4A0F06]/30 focus:outline-none focus:ring-2 focus:ring-[#D86F32]/40 focus:border-[#D86F32]/50 transition-all";

// ─── WhatsApp Business deep-link helper ──────────────────────────────────────
// Strategy:
//   1. Try "whatsapp://send?phone=…&text=…"  — opens WhatsApp Business if it is
//      the default/only WA app on the device (Android app chooser appears when
//      both regular and Business are installed, letting the user pick).
//   2. After 1 500 ms, if the page is still visible (i.e. no app opened), fall
//      back to "https://wa.me/…" which opens WhatsApp Web or the installed app
//      via the browser's default WA association.
// On iOS both apps register the whatsapp:// scheme; the OS opens whichever the
// user has set as default. There is no official URL that exclusively targets the
// Business app — this is the closest the web platform allows.
function openWhatsAppBusiness(waUrl: string, phone: string, text: string): void {
  const deepLink = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(text)}`;
  const fallback = waUrl; // https://wa.me/… already built by the caller

  // Try the native deep link
  window.location.href = deepLink;

  // If the browser didn't hand off to an app after 1.5 s, open wa.me in a new tab
  const timer = setTimeout(() => {
    window.open(fallback, "_blank", "noopener,noreferrer");
  }, 1500);

  // If the page blurs (app opened), clear the fallback timer
  const onBlur = () => { clearTimeout(timer); window.removeEventListener("blur", onBlur); };
  window.addEventListener("blur", onBlur);
}

// ─── Action Icon Button ───────────────────────────────────────────────────────
function ActionIconBtn({ href, onClick, title, disabled, children, variant = "default", waPhone, waText }: {
  href?: string; onClick?: () => void; title: string; disabled?: boolean;
  children: React.ReactNode; variant?: "default" | "mail" | "whatsapp" | "danger";
  waPhone?: string; waText?: string;
}) {
  const variants: Record<string, string> = {
    default:  "bg-[#FAF8F2] hover:bg-[#D86F32]/10 border-[#4A0F06]/10 hover:border-[#D86F32]/30 text-[#4A0F06]/40 hover:text-[#D86F32]",
    mail:     "bg-[#FAF8F2] hover:bg-blue-50 border-[#4A0F06]/10 hover:border-blue-200 text-[#4A0F06]/40 hover:text-blue-600",
    whatsapp: "bg-[#FAF8F2] hover:bg-emerald-50 border-[#4A0F06]/10 hover:border-emerald-200 text-[#4A0F06]/40 hover:text-emerald-600",
    danger:   "bg-[#FAF8F2] hover:bg-red-50 border-[#4A0F06]/10 hover:border-red-200 text-[#4A0F06]/40 hover:text-red-500",
  };
  const base = `flex items-center justify-center w-8 h-8 border rounded-lg transition-all flex-shrink-0 ${variants[variant]} ${disabled ? "opacity-30 cursor-not-allowed pointer-events-none" : ""}`;

  // WhatsApp buttons: use the deep-link + fallback strategy
  if (variant === "whatsapp" && waPhone && waText && href && !disabled) {
    return (
      <button
        type="button"
        title={title}
        className={base}
        onClick={() => openWhatsAppBusiness(href, waPhone, waText)}
      >
        {children}
      </button>
    );
  }

  if (href && !disabled) return <a href={href} title={title} target="_blank" rel="noopener noreferrer" className={base}>{children}</a>;
  return <button type="button" onClick={onClick} title={title} disabled={disabled} className={base}>{children}</button>;
}

// ─── Mobile Patient Card ──────────────────────────────────────────────────────
function MobilePatientCard({ p, isAdmin, role, onDelete }: {
  p: Patient; isAdmin: boolean; role: string; onDelete: (id: string, name: string) => void;
}) {
  const router = useRouter();
  const statusCfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.NEW;
  const phaseCfg = p.phase ? PHASE_CONFIG[p.phase] : null;
  const rawPhone = p.phone?.replace(/\D/g,"") ?? "";
  const waPhone = rawPhone.startsWith("91") ? rawPhone : `91${rawPhone}`;
  const waUrl = rawPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent(`Hello ${p.name}, this is a message from Vyayama-physio.`)}` : "";
  const maskPhone = (ph: string) => role === "ADMIN" ? ph : role === "DOCTOR" ? `••••••${ph.slice(-4)}` : ph;

  return (
    <div
      onClick={() => router.push(`/dashboard/patients/${p.id}`)}
      className="p-4 border-b border-[#4A0F06]/5 last:border-0 hover:bg-[#D86F32]/5 active:bg-[#D86F32]/10 cursor-pointer transition-colors"
    >
      <div className="flex items-start gap-3">
        <Avatar name={p.name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className="text-sm font-bold text-[#4A0F06] truncate">{p.name}</p>
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${statusCfg.pill}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />{statusCfg.label}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[10px] text-[#4A0F06]/40 bg-[#4A0F06]/5 px-2 py-0.5 rounded-lg">{p.patientCode}</span>
            {phaseCfg && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${phaseCfg.color}`}>{phaseCfg.short}</span>}
          </div>
          {p.phone && <p className="text-xs text-[#4A0F06]/50 mt-1">{maskPhone(p.phone)}</p>}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2 text-xs text-[#4A0F06]/40">
              <span className="font-semibold">{p._count.appointments} sessions</span>
              {p.appointments?.[0] && (
                <span>· {new Date(p.appointments[0].startTime).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</span>
              )}
            </div>
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              {p.email && <ActionIconBtn href={`mailto:${p.email}`} title="Email" variant="mail">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
              </ActionIconBtn>}
              {rawPhone && <ActionIconBtn href={waUrl} waPhone={waPhone} waText={`Hello ${p.name}, this is a message from Vyayama-physio.`} title="WhatsApp Business" variant="whatsapp">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.854L.057 23.986l6.305-1.654A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.651-.51-5.17-1.399l-.371-.22-3.844 1.008 1.026-3.748-.242-.387A9.956 9.956 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
              </ActionIconBtn>}
              {isAdmin && <ActionIconBtn onClick={() => onDelete(p.id, p.name)} title="Remove" variant="danger">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </ActionIconBtn>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PatientsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "ADMIN";
  const role = session?.user?.role ?? "";

  function maskPhone(phone: string): string {
    if (role === "ADMIN") return phone;
    if (role === "DOCTOR") return `••••••${phone.slice(-4)}`;
    return phone;
  }

  const [patients,       setPatients]       = useState<Patient[]>([]);
  const [allPatients,    setAllPatients]     = useState<Patient[]>([]);
  const [search,         setSearch]          = useState("");
  const [statusFilter,   setStatusFilter]    = useState("");
  const [loading,        setLoading]         = useState(true);
  const [exporting,      setExporting]       = useState(false);
  const [exportDone,     setExportDone]      = useState(false);
  const [showPatientForm, setShowPatientForm] = useState(false);
  const [patientForm,     setPatientForm]     = useState<PatientForm>(BLANK_PATIENT);
  const [savingPatient,   setSavingPatient]   = useState(false);
  const [patientSuccess,  setPatientSuccess]  = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting,      setDeleting]      = useState(false);
  const [credentialsModal, setCredentialsModal] = useState<{ username: string; defaultPassword: string } | null>(null);

  // ── wrapped in useCallback so useEffect deps are satisfied ──────────────────

  const loadPatients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/patients?${params.toString()}`, { credentials: "include" });
      const text = await res.text();
      if (!text) { setPatients([]); setLoading(false); return; }
      const data = JSON.parse(text);
      // GET /api/patients returns { data, nextCursor, hasMore } (paginated)
      const list: Patient[] = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      const sorted = list.sort((a: Patient, b: Patient) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setPatients(sorted);
    } catch { setPatients([]); }
    setLoading(false);
  }, [search, statusFilter]);

  const loadAllPatients = useCallback(async () => {
    try {
      const res = await fetch(`/api/patients`, { credentials: "include" });
      const text = await res.text();
      if (!text) return;
      const data = JSON.parse(text);
      // GET /api/patients returns { data, nextCursor, hasMore } (paginated)
      const list: Patient[] = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      setAllPatients(list.sort((a: Patient, b: Patient) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
    } catch {}
  }, []);

  useEffect(() => { loadPatients(); }, [loadPatients]);
  useEffect(() => { loadAllPatients(); }, [loadAllPatients]);

  // ────────────────────────────────────────────────────────────────────────────

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/patients`, { credentials: "include" });
      const data = await res.json();
      // GET /api/patients returns { data, nextCursor, hasMore } (paginated)
      const list: Patient[] = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      setAllPatients(list);
      exportToGoogleSheets(list);
      setExportDone(true);
      setTimeout(() => setExportDone(false), 3000);
    } catch { alert("Export failed."); }
    setExporting(false);
  }

  async function handleRegisterPatient(e: React.FormEvent) {
    e.preventDefault();
    setSavingPatient(true);
    setPatientSuccess("");
    try {
      // FIX 1: Coerce age from string → number before sending.
      // HTML inputs always yield strings; Zod's z.number() rejects them → "Invalid input".
      // FIX 2: Strip spaces/hyphens from phone so "+91 98765 43210" passes the
      // /^\+?[0-9]{10,15}$/ regex in CreatePatientSchema.
      const payload = {
        ...patientForm,
        phone: patientForm.phone.replace(/[\s\-]/g, ""),
        age: patientForm.age !== "" ? Number(patientForm.age) : undefined,
      };

      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setPatientSuccess(`Patient registered! ID: ${data.patientCode}`);
        if (data._credentials) {
          setCredentialsModal(data._credentials);
        }
        setShowPatientForm(false);
        setPatientForm(BLANK_PATIENT);
        loadPatients(); loadAllPatients();
        setTimeout(() => setPatientSuccess(""), 5000);
      } else { alert(`Error: ${data.error ?? "Registration failed"}`); }
    } catch { alert("Network error"); }
    setSavingPatient(false);
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/patients/${confirmDelete.id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { setConfirmDelete(null); loadPatients(); loadAllPatients(); }
      else { const data = await res.json(); alert(`Delete failed: ${data.error ?? "Unknown error"}`); }
    } catch { alert("Network error during delete"); }
    setDeleting(false);
  }

  const totalNew = patients.filter(p => p.status === "NEW").length;
  const totalReturning = patients.filter(p => p.status === "RETURNING").length;

  const filterChips = [
    { value: "", label: "All Patients", count: patients.length, color: "bg-[#4A0F06]", bg: "bg-[#4A0F06]/5", border: "border-[#4A0F06]/20" },
    { value: "NEW", label: "New", count: totalNew, color: "bg-sky-500", bg: "bg-sky-50", border: "border-sky-200" },
    { value: "RETURNING", label: "Returning", count: totalReturning, color: "bg-emerald-500", bg: "bg-emerald-50", border: "border-emerald-200" },
  ] as const;

  return (
    <div className="min-h-screen bg-[#F5F2E8] p-4 sm:p-6">

      {/* Delete Confirm Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-[#4A0F06]/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#FAF8F2] rounded-2xl border border-[#4A0F06]/10 p-6 w-full max-w-sm shadow-2xl">
            <div className="w-11 h-11 bg-red-50 rounded-2xl flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </div>
            <h3 className="text-base font-bold text-[#4A0F06] mb-1">Remove patient?</h3>
            <p className="text-sm text-[#4A0F06]/60 mb-5 leading-relaxed">
              This will permanently remove <span className="font-semibold text-[#4A0F06]">{confirmDelete.name}</span> and all their records.
            </p>
            <div className="flex gap-2.5">
              <button onClick={handleDelete} disabled={deleting} className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50 transition-all">
                {deleting ? "Removing…" : "Yes, remove"}
              </button>
              <button onClick={() => setConfirmDelete(null)} className="flex-1 bg-[#4A0F06]/5 hover:bg-[#4A0F06]/10 border border-[#4A0F06]/10 text-[#4A0F06]/70 text-sm font-semibold py-2.5 rounded-xl transition-all">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 sm:mb-7">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 bg-[#4A0F06] rounded-xl flex items-center justify-center shadow-md shadow-[#4A0F06]/20">
              <svg className="w-4 h-4 text-[#F5F2E8]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-[#4A0F06] tracking-tight">Patient Registry</h1>
          </div>
          <p className="text-sm text-[#4A0F06]/40 ml-[42px]">Search, register, and manage all patients</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button onClick={handleExport} disabled={exporting}
            className={`flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border transition-all shadow-sm ${exportDone ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-[#FAF8F2] text-[#4A0F06]/70 border-[#4A0F06]/15 hover:border-[#D86F32]/40 hover:text-[#D86F32] hover:bg-[#D86F32]/5"}`}>
            {exporting ? <><div className="w-4 h-4 border-2 border-[#4A0F06]/30 border-t-transparent rounded-full animate-spin" />Exporting…</>
            : exportDone ? <><svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>Downloaded!</>
            : <><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill="#34A853"/><rect x="7" y="8" width="10" height="1.5" rx="0.75" fill="white"/><rect x="7" y="11" width="10" height="1.5" rx="0.75" fill="white"/><rect x="7" y="14" width="7" height="1.5" rx="0.75" fill="white"/><path d="M14 2v5h6" fill="none" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/></svg>Export to Sheets</>}
          </button>
          <button onClick={() => setShowPatientForm(!showPatientForm)}
            className="flex items-center gap-1.5 text-sm font-bold px-5 py-2.5 rounded-xl bg-[#4A0F06] hover:bg-[#5C1408] text-[#F5F2E8] transition-all shadow-md shadow-[#4A0F06]/25 hover:shadow-lg hover:-translate-y-0.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/></svg>
            New Patient
          </button>
        </div>
      </div>

      {/* Summary Chips */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5 sm:mb-6">
        {filterChips.map(({ value, label, count, color, bg, border }) => (
          <button key={value} onClick={() => setStatusFilter(value)}
            className={`flex items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-2xl border-2 text-left transition-all ${statusFilter === value ? `${bg} ${border} shadow-sm` : "bg-[#FAF8F2] border-[#4A0F06]/8 hover:border-[#4A0F06]/15 shadow-sm"}`}>
            <div className={`w-7 h-7 sm:w-8 sm:h-8 ${color} rounded-xl flex items-center justify-center flex-shrink-0`}>
              <span className="text-xs sm:text-sm font-black text-white">{count}</span>
            </div>
            <span className={`text-[10px] sm:text-xs font-bold ${statusFilter === value ? "text-[#4A0F06]" : "text-[#4A0F06]/50"}`}>{label}</span>
          </button>
        ))}
      </div>

      {/* Filtered Banner */}
      {allPatients.length > 0 && allPatients.length !== patients.length && (
        <div className="mb-4 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-amber-700">
          <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M3 3a1 1 0 000 2h11a1 1 0 100-2H3zM3 7a1 1 0 000 2h7a1 1 0 100-2H3zM3 11a1 1 0 100 2h4a1 1 0 100-2H3z"/></svg>
          Filtered — showing {patients.length} of {allPatients.length} total patients
        </div>
      )}

      {/* Toasts */}
      {patientSuccess && (
        <div className="mb-4 flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-sm font-semibold text-emerald-700 shadow-sm">
          <div className="w-6 h-6 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
          </div>
          {patientSuccess}
        </div>
      )}

      {/* New Patient Form */}
      {showPatientForm && (
        <div className="bg-[#FAF8F2] rounded-2xl border border-[#4A0F06]/10 shadow-sm p-5 sm:p-6 mb-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#D86F32] rounded-l-2xl" />
          <div className="flex items-center gap-2 mb-5">
            <div className="w-7 h-7 bg-[#D86F32]/10 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-[#D86F32]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
            </div>
            <h2 className="text-sm font-bold text-[#4A0F06]">Register New Patient</h2>
          </div>
          <form onSubmit={handleRegisterPatient}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <Field label="Full name" required>
                <input required value={patientForm.name} onChange={e => setPatientForm({...patientForm, name: e.target.value})} placeholder="e.g. Rahul Sharma" className={inputCls}/>
              </Field>
              <Field label="Phone number" required>
                <input
                  required
                  value={patientForm.phone}
                  onChange={e => {
                    const val = e.target.value;
                    // Prevent the +91 country-code prefix from being deleted
                    if (!val.startsWith("+91")) return;
                    setPatientForm({ ...patientForm, phone: val });
                  }}
                  placeholder="+919876543210"
                  className={inputCls}
                />
              </Field>
              <Field label="Email">
                <input type="email" value={patientForm.email} onChange={e => setPatientForm({...patientForm, email: e.target.value})} placeholder="email@example.com" className={inputCls}/>
              </Field>
              <Field label="Age" required>
                <input required type="number" min={0} max={150} value={patientForm.age} onChange={e => setPatientForm({...patientForm, age: e.target.value})} placeholder="e.g. 35" className={inputCls}/>
              </Field>
              <Field label="Gender" required>
                <select required value={patientForm.gender} onChange={e => setPatientForm({...patientForm, gender: e.target.value})} className={inputCls}>
                  <option value="">Select gender</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </Field>
              <Field label="Address">
                <input value={patientForm.address} onChange={e => setPatientForm({...patientForm, address: e.target.value})} placeholder="Full address" className={inputCls}/>
              </Field>
              <div className="col-span-1 sm:col-span-2">
                <Field label="Purpose of visit" required>
                  <input required value={patientForm.purposeOfVisit} onChange={e => setPatientForm({...patientForm, purposeOfVisit: e.target.value})} placeholder="e.g. Lower back pain, knee injury…" className={inputCls}/>
                </Field>
              </div>
              <div className="col-span-1 sm:col-span-2">
                <Field label="Medical conditions / history">
                  <textarea rows={2} value={patientForm.medicalConditions} onChange={e => setPatientForm({...patientForm, medicalConditions: e.target.value})} placeholder="Diabetes, hypertension, previous surgeries…" className={`${inputCls} resize-none`}/>
                </Field>
              </div>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button type="submit" disabled={savingPatient} className="bg-[#4A0F06] hover:bg-[#5C1408] text-[#F5F2E8] text-sm font-bold px-5 py-2.5 rounded-xl disabled:opacity-50 transition-all shadow-sm">
                {savingPatient ? "Registering…" : "Generate ID & Register"}
              </button>
              <button type="button" onClick={() => setShowPatientForm(false)} className="bg-[#4A0F06]/5 hover:bg-[#4A0F06]/10 border border-[#4A0F06]/10 text-[#4A0F06]/60 text-sm font-semibold px-5 py-2.5 rounded-xl transition-all">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Patient List Card */}
      <div className="bg-[#FAF8F2] rounded-2xl border border-[#4A0F06]/8 shadow-sm overflow-hidden">
        {/* Search bar */}
        <div className="px-4 sm:px-6 py-4 border-b border-[#4A0F06]/6 flex items-center gap-3 sm:gap-4">
          <div className="flex-1 relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg className="w-4 h-4 text-[#4A0F06]/30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone, or patient ID…"
              className="w-full bg-[#F5F2E8] border-2 border-[#4A0F06]/10 rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium text-[#4A0F06] placeholder:text-[#4A0F06]/30 focus:outline-none focus:border-[#D86F32]/50 transition-all"/>
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#4A0F06]/30 hover:text-[#4A0F06]/60 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            )}
          </div>
          <span className="text-xs font-semibold text-[#4A0F06]/40 bg-[#4A0F06]/5 border border-[#4A0F06]/10 px-3 py-1.5 rounded-xl flex-shrink-0 whitespace-nowrap">
            {patients.length} result{patients.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-20 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-[3px] border-[#D86F32] border-t-transparent rounded-full animate-spin"/>
            <p className="text-sm text-[#4A0F06]/40 font-medium">Loading patients…</p>
          </div>
        ) : patients.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-14 h-14 bg-[#4A0F06]/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-[#4A0F06]/20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            </div>
            <p className="text-sm font-semibold text-[#4A0F06]/50">No patients found</p>
            <p className="text-xs text-[#4A0F06]/30 mt-1">{search || statusFilter ? "Try adjusting your search or filters" : "Register your first patient using the button above"}</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="block sm:hidden divide-y divide-[#4A0F06]/5">
              {patients.map(p => (
                <MobilePatientCard key={p.id} p={p} isAdmin={isAdmin} role={role} onDelete={(id, name) => setConfirmDelete({ id, name })}/>
              ))}
            </div>

            {/* Desktop/Tablet table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#4A0F06]/3 border-b border-[#4A0F06]/6">
                    {["Patient","Role / ID","Phone","Sessions","Last Visit","Phase","Status","Actions"].map(h => (
                      <th key={h} className="text-left px-5 py-3.5 text-[10px] font-bold text-[#4A0F06]/40 uppercase tracking-widest whitespace-nowrap">
                        {h === "Role / ID" ? "ID" : h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {patients.map((p, idx) => {
                    const statusCfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.NEW;
                    const phaseCfg = p.phase ? PHASE_CONFIG[p.phase] : null;
                    const lastVisit = p.appointments?.[0] ? new Date(p.appointments[0].startTime).toLocaleDateString("en-IN",{day:"numeric",month:"short"}) : null;
                    const rawPhone = p.phone?.replace(/\D/g,"") ?? "";
                    const waPhone = rawPhone.startsWith("91") ? rawPhone : `91${rawPhone}`;
                    const waUrl = rawPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent(`Hello ${p.name}, this is a message from Vyayama-physio.`)}` : "";

                    return (
                      <tr key={p.id}
                        onClick={() => router.push(`/dashboard/patients/${p.id}`)}
                        className={`border-b border-[#4A0F06]/4 last:border-0 cursor-pointer transition-all group ${idx % 2 === 0 ? "bg-[#FAF8F2]" : "bg-[#F5F2E8]/40"} hover:bg-[#D86F32]/6 hover:shadow-sm`}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar name={p.name}/>
                            <div>
                              <p className="text-sm font-bold text-[#4A0F06] leading-tight group-hover:text-[#5C1408]">{p.name}</p>
                              {p.email ? (
                                <a href={`mailto:${p.email}`} onClick={e => e.stopPropagation()}
                                  className="text-xs text-[#4A0F06]/40 hover:text-[#D86F32] transition-colors mt-0.5 block truncate max-w-[160px]">{p.email}</a>
                              ) : <span className="text-xs text-[#4A0F06]/20 mt-0.5 block">No email</span>}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="font-mono text-[11px] font-semibold text-[#4A0F06]/40 bg-[#4A0F06]/6 px-2.5 py-1 rounded-lg">{p.patientCode}</span>
                        </td>
                        <td className="px-5 py-4">
                          {p.phone ? (
                            <a href={role === "ADMIN" ? `tel:${p.phone}` : undefined} onClick={e => e.stopPropagation()}
                              className="flex items-center gap-1.5 text-sm font-medium text-[#4A0F06]/60 hover:text-[#D86F32] transition-colors">
                              <svg className="w-3.5 h-3.5 text-[#4A0F06]/20 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                              {maskPhone(p.phone)}
                            </a>
                          ) : <span className="text-xs text-[#4A0F06]/20">—</span>}
                        </td>
                        <td className="px-5 py-4">
                          <div className="w-7 h-7 bg-[#4A0F06]/8 rounded-lg flex items-center justify-center">
                            <span className="text-xs font-black text-[#4A0F06]/70">{p._count.appointments}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {lastVisit ? <span className="text-sm font-medium text-[#4A0F06]/60">{lastVisit}</span> : <span className="text-sm text-[#4A0F06]/20">—</span>}
                        </td>
                        <td className="px-5 py-4">
                          {phaseCfg ? <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${phaseCfg.color}`}>{phaseCfg.short}</span> : <span className="text-xs text-[#4A0F06]/20">—</span>}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${statusCfg.pill}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`}/>{statusCfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            <ActionIconBtn href={p.email ? `mailto:${p.email}` : undefined} title={p.email ? `Email ${p.name}` : "No email"} disabled={!p.email} variant="mail">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                            </ActionIconBtn>
                            <ActionIconBtn href={waUrl || undefined} waPhone={waPhone} waText={`Hello ${p.name}, this is a message from Vyayama-physio.`} title={rawPhone ? `WhatsApp Business — ${p.name}` : "No phone"} disabled={!rawPhone} variant="whatsapp">
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.854L.057 23.986l6.305-1.654A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.651-.51-5.17-1.399l-.371-.22-3.844 1.008 1.026-3.748-.242-.387A9.956 9.956 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
                            </ActionIconBtn>
                            {isAdmin && (
                              <ActionIconBtn onClick={() => setConfirmDelete({ id: p.id, name: p.name })} title="Remove patient" variant="danger">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                              </ActionIconBtn>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Footer */}
              <div className="px-6 py-3.5 border-t border-[#4A0F06]/6 bg-[#4A0F06]/2 flex items-center justify-between">
                <p className="text-xs text-[#4A0F06]/40 font-medium">
                  Showing <span className="font-bold text-[#4A0F06]/70">{patients.length}</span> patient{patients.length !== 1 ? "s" : ""}
                  {(search || statusFilter) && allPatients.length > 0 && <span> · {allPatients.length} total in registry</span>}
                </p>
                <button onClick={handleExport} disabled={exporting} className="flex items-center gap-1.5 text-xs font-semibold text-[#4A0F06]/40 hover:text-[#D86F32] transition-colors">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" rx="2" fill="#34A853"/><rect x="7" y="8" width="10" height="1.5" rx="0.75" fill="white"/><rect x="7" y="11" width="10" height="1.5" rx="0.75" fill="white"/><rect x="7" y="14" width="7" height="1.5" rx="0.75" fill="white"/><path d="M14 2v5h6" fill="none" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/></svg>
                  Export all {allPatients.length > 0 ? allPatients.length : ""} patients
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Patient Credentials Modal ── */}
      {credentialsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-[#E8E1D5]">
            <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, #3E1F14 0%, #5A1F14 40%, #C8A882 100%)" }} />
            <div className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-xl flex-shrink-0">🔐</div>
                <div>
                  <h3 className="font-black text-[#2B1A14] text-lg">Patient Login Created</h3>
                  <p className="text-xs text-[#7A685F]">Share these credentials with the patient</p>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="bg-[#F5F1E8] rounded-xl p-4">
                  <p className="text-[10px] font-bold text-[#7A685F] uppercase tracking-wider mb-1">Username (Email)</p>
                  <p className="text-sm font-mono font-semibold text-[#2B1A14] select-all">{credentialsModal.username}</p>
                </div>
                <div className="bg-[#F5F1E8] rounded-xl p-4">
                  <p className="text-[10px] font-bold text-[#7A685F] uppercase tracking-wider mb-1">Default Password</p>
                  <p className="text-sm font-mono font-semibold text-[#2B1A14] select-all">{credentialsModal.defaultPassword}</p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5">
                <p className="text-xs text-amber-800 font-medium">
                  ⚠️ Please share this password securely. The patient should reset it after first login from their portal.
                </p>
              </div>

              <button
                onClick={() => setCredentialsModal(null)}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all"
                style={{ background: "linear-gradient(135deg, #3E1F14, #5A1F14, #8B3A1E)" }}
              >
                Got it, Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}