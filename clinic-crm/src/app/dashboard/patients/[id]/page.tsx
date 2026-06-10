"use client";
import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import EditProfileModal from "@/components/EditProfileModal";

type Appointment = {
  id: string; startTime: string; sessionType: string;
  status: string; doctor: { name: string };
};

type Patient = {
  id: string; patientCode: string; name: string; phone: string;
  email: string; age: number; gender: string; address: string;
  purposeOfVisit: string; medicalConditions: string;
  status: string; phase: string | null; totalSessionsPlanned: number;
  createdAt: string;
  appointments: Appointment[];
  visits: { notes: string; visitDate: string; appointment: { id: string } }[];
};

const PHASES: Record<string, { label: string; desc: string; color: string; bg: string; border: string; dot: string; ring: string }> = {
  PHASE_1: { label: "Phase 1", desc: "Every day",                color: "text-[#D97332]",  bg: "bg-[#FDF3EC]",      border: "border-[#D97332]/30", dot: "bg-[#D97332]",  ring: "ring-[#D97332]/30" },
  PHASE_2: { label: "Phase 2", desc: "Alternate days",           color: "text-[#5C1408]",  bg: "bg-[#4B0F05]/5",   border: "border-[#5C1408]/20", dot: "bg-[#5C1408]",  ring: "ring-[#5C1408]/20" },
  PHASE_3: { label: "Phase 3", desc: "Twice a week",             color: "text-[#4F8A5B]",  bg: "bg-[#4F8A5B]/8",   border: "border-[#4F8A5B]/25", dot: "bg-[#4F8A5B]",  ring: "ring-[#4F8A5B]/25" },
  PHASE_4: { label: "Phase 4", desc: "Weekly once",              color: "text-[#8B6419]",  bg: "bg-[#D9A441]/8",   border: "border-[#D9A441]/30", dot: "bg-[#D9A441]",  ring: "ring-[#D9A441]/30" },
  PHASE_5: { label: "Phase 5", desc: "Weekly once (maintenance)",color: "text-[#4B0F05]",  bg: "bg-[#4B0F05]/5",   border: "border-[#4B0F05]/20", dot: "bg-[#4B0F05]",  ring: "ring-[#4B0F05]/20" },
};

const STATUS_STYLES: Record<string, { pill: string; dot: string }> = {
  ATTENDED:  { pill: "bg-[#4F8A5B]/10 text-[#4F8A5B] border border-[#4F8A5B]/30",  dot: "bg-[#4F8A5B]" },
  MISSED:    { pill: "bg-[#C94F4F]/10 text-[#C94F4F] border border-[#C94F4F]/30",   dot: "bg-[#C94F4F]" },
  CONFIRMED: { pill: "bg-[#D97332]/10 text-[#D97332] border border-[#D97332]/30",   dot: "bg-[#D97332]" },
  CANCELLED: { pill: "bg-[#E8E1D5] text-[#7A685F] border border-[#DDD2C2]",          dot: "bg-[#7A685F]" },
};

function maskPhone(phone: string, role: string): string {
  if (!phone) return "—";
  if (role === "ADMIN") return phone;
  if (role === "DOCTOR") return `••••••${phone.slice(-4)}`;
  return phone;
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[#F5F1E8] last:border-0">
      <div className="w-7 h-7 rounded-lg bg-[#F5F1E8] flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-[#7A685F] text-sm">{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold text-[#7A685F] uppercase tracking-wider mb-0.5">{label}</p>
        <p className="text-sm font-medium text-[#2B1A14] leading-snug break-words">{value || "—"}</p>
      </div>
    </div>
  );
}

export default function PatientProfile() {
  const params = useParams();
  const { data: session } = useSession();
  const role = session?.user?.role ?? "";

  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [totalSessions, setTotalSessions] = useState(0);
  const [phase, setPhase] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"sessions" | "notes">("sessions");

  const canEdit = ["ADMIN", "DOCTOR"].includes(role);
  const canEditProfile = ["ADMIN", "RECEPTIONIST"].includes(role);
  const [editOpen, setEditOpen] = useState(false);

  const loadPatient = useCallback(async () => {
    const res = await fetch(`/api/patients/${params.id}`, { credentials: "include" });
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    // FIX: guarantee arrays are never undefined regardless of what the API returns
    setPatient({
      ...data,
      appointments: data.appointments ?? [],
      visits: data.visits ?? [],
    });
    setTotalSessions(data.totalSessionsPlanned ?? 0);
    setPhase(data.phase && PHASES[data.phase] ? data.phase : null);
    setLoading(false);
  }, [params.id]);

  useEffect(() => { loadPatient(); }, [loadPatient]);

  async function saveChanges() {
    setSaving(true);
    const body: Record<string, unknown> = { totalSessionsPlanned: totalSessions };
    body.phase = phase ?? null;
    await fetch(`/api/patients/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    setEditing(false);
    loadPatient();
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F1E8]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-[3px] border-[#D97332] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[#7A685F] font-medium">Loading patient profile…</p>
      </div>
    </div>
  );

  if (!patient) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F1E8] p-4">
      <div className="text-center">
        <div className="text-5xl mb-4">🔍</div>
        <p className="text-base font-semibold text-[#2B1A14]">Patient not found</p>
        <p className="text-sm text-[#7A685F] mt-1">This patient record may have been removed.</p>
        <Link href="/dashboard/patients" className="mt-4 inline-block text-sm text-[#D97332] font-medium hover:text-[#4B0F05] transition-colors">← Back to Patients</Link>
      </div>
    </div>
  );

  // FIX: safe defaults so these are always arrays even if the patient object
  // was set before the API response included the relations.
  const appointments = patient.appointments ?? [];
  const visits       = patient.visits       ?? [];

  const attended = appointments.filter(a => a.status === "ATTENDED").length;
  const missed   = appointments.filter(a => a.status === "MISSED").length;
  const upcoming = appointments.filter(a => a.status === "CONFIRMED").length;
  const total    = appointments.length;

  const filteredAppointments = statusFilter
    ? appointments.filter(a => a.status === statusFilter)
    : appointments;

  const latestNote   = visits[0]?.notes;
  const currentPhase = phase && PHASES[phase] ? PHASES[phase] : null;
  const progressPct  = patient.totalSessionsPlanned > 0
    ? Math.min((attended / patient.totalSessionsPlanned) * 100, 100)
    : 0;

  const initials = patient.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-[#F5F1E8]">

      {/* ── Breadcrumb / Top Nav Bar ── */}
      <div className="bg-white border-b border-[#E8E1D5] px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-1.5 sm:gap-2 text-sm min-w-0">
          <Link
            href="/dashboard/patients"
            className="text-[#7A685F] hover:text-[#D97332] transition-colors flex items-center gap-1 sm:gap-1.5 font-medium flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">Patients</span>
          </Link>
          <svg className="w-4 h-4 text-[#DDD2C2] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-semibold text-[#2B1A14] truncate max-w-[120px] sm:max-w-none">
            {patient.name}
          </span>
          <span className="text-[#DDD2C2] mx-0.5 hidden sm:inline">·</span>
          <span className="font-mono text-xs text-[#7A685F] bg-[#E8E1D5] px-2 py-0.5 rounded hidden sm:inline">
            {patient.patientCode}
          </span>
        </div>
        <span className={`text-xs px-2.5 sm:px-3 py-1 rounded-full font-bold border flex-shrink-0 ${
          patient.status === "NEW"
            ? "bg-[#D97332]/10 text-[#D97332] border-[#D97332]/30"
            : "bg-[#4F8A5B]/10 text-[#4F8A5B] border-[#4F8A5B]/30"
        }`}>
          {patient.status}
        </span>
      </div>

      <div className="max-w-[1400px] mx-auto p-4 sm:p-6">
        <div className="flex flex-col lg:grid lg:grid-cols-[340px_1fr] gap-5 sm:gap-6 items-start">

          {/* ════════ LEFT COLUMN ════════ */}
          <div className="space-y-4 sm:space-y-5 w-full">

            {/* Identity card */}
            <div className="bg-white rounded-2xl border border-[#DDD2C2] shadow-sm overflow-hidden">
              <div className="relative">
                <div className="h-20 sm:h-24 bg-gradient-to-br from-[#4B0F05] via-[#5C1408] to-[#D97332] relative overflow-hidden">
                  <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/10 rounded-full" />
                  <div className="absolute -right-2 top-8 w-12 h-12 bg-white/10 rounded-full" />
                  <div className="absolute left-1/2 -bottom-4 w-32 h-8 bg-white/5 rounded-full blur-md" />
                </div>
                <div className="absolute left-5 sm:left-6 top-12 sm:top-14 z-10">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white shadow-lg flex items-center justify-center text-[#4B0F05] text-xl sm:text-2xl font-bold border-2 border-white">
                    {initials}
                  </div>
                </div>
              </div>

              <div className="px-4 sm:px-5 pb-5 pt-12 sm:pt-14">
                <div className="mb-4 sm:mb-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h1 className="text-lg sm:text-xl font-extrabold text-[#2B1A14] tracking-tight">{patient.name}</h1>
                      <p className="text-xs text-[#7A685F] font-mono mt-0.5">{patient.patientCode}</p>
                    </div>
                    {canEditProfile && (
                      <button
                        onClick={() => setEditOpen(true)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-[#4F8A5B] hover:text-white hover:bg-[#4F8A5B] bg-[#4F8A5B]/8 border border-[#4F8A5B]/25 px-2.5 sm:px-3 py-1.5 rounded-lg transition-all duration-150 flex-shrink-0"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <span className="hidden sm:inline">Edit Profile</span>
                        <span className="sm:hidden">Edit</span>
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <InfoRow icon="📞" label="Phone"      value={maskPhone(patient.phone, role)} />
                  <InfoRow icon="✉️" label="Email"      value={patient.email ?? "—"} />
                  <InfoRow icon="🎂" label="Age"        value={patient.age ? `${patient.age} years old` : "—"} />
                  <InfoRow icon="⚧"  label="Gender"     value={patient.gender ?? "—"} />
                  <InfoRow icon="📍" label="Address"    value={patient.address ?? "—"} />
                  <InfoRow icon="🗓" label="Registered" value={new Date(patient.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} />
                </div>
              </div>
            </div>

            {/* Clinical Info */}
            <div className="bg-white rounded-2xl border border-[#DDD2C2] shadow-sm p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3 sm:mb-4">
                <div className="w-7 h-7 bg-[#FDF3EC] rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#D97332]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-sm font-bold text-[#2B1A14]">Clinical Info</h2>
              </div>
              <div className="space-y-3 sm:space-y-4">
                <div className="bg-[#F5F1E8] rounded-xl p-3 sm:p-3.5">
                  <p className="text-[10px] font-bold text-[#7A685F] uppercase tracking-widest mb-1.5">Purpose of Visit</p>
                  <p className="text-sm font-medium text-[#2B1A14]">{patient.purposeOfVisit ?? "—"}</p>
                </div>
                <div className="bg-[#F5F1E8] rounded-xl p-3 sm:p-3.5">
                  <p className="text-[10px] font-bold text-[#7A685F] uppercase tracking-widest mb-1.5">Medical Conditions</p>
                  <p className="text-sm font-medium text-[#2B1A14]">{patient.medicalConditions ?? "—"}</p>
                </div>
                {latestNote && (
                  <div className="bg-[#4B0F05]/5 border border-[#4B0F05]/15 rounded-xl p-3 sm:p-3.5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#D97332]" />
                      <p className="text-[10px] font-bold text-[#D97332] uppercase tracking-widest">Latest Doctor Note</p>
                    </div>
                    <p className="text-sm text-[#2B1A14] leading-relaxed">{latestNote}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Treatment Plan */}
            <div className="bg-white rounded-2xl border border-[#DDD2C2] shadow-sm overflow-hidden">
              <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-[#E8E1D5]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-[#4B0F05]/8 rounded-lg flex items-center justify-center">
                      <svg className="w-4 h-4 text-[#4B0F05]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-[#2B1A14]">Treatment Plan</h2>
                      <p className="text-[10px] text-[#7A685F]">Phase &amp; session management</p>
                    </div>
                  </div>
                  {canEdit && !editing && (
                    <button onClick={() => setEditing(true)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-[#D97332] hover:text-[#4B0F05] bg-[#FDF3EC] hover:bg-[#EFE7DA] border border-[#D97332]/30 px-3 py-1.5 rounded-lg transition-all duration-150">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </button>
                  )}
                </div>
              </div>

              <div className="p-4 sm:p-5">
                {editing ? (
                  <div className="space-y-4 sm:space-y-5">
                    <div>
                      <label className="text-xs font-bold text-[#7A685F] uppercase tracking-wider block mb-3">Treatment Phase</label>
                      <div className="space-y-2">
                        <button onClick={() => setPhase(null)}
                          className={`w-full flex items-center gap-3 px-3 sm:px-3.5 py-2.5 sm:py-3 rounded-xl border-2 text-left transition-all duration-150 ${
                            phase === null ? "border-[#DDD2C2] bg-[#F5F1E8] shadow-sm" : "border-[#E8E1D5] hover:border-[#DDD2C2] hover:bg-[#F5F1E8]/50"
                          }`}>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${phase === null ? "bg-[#DDD2C2]" : "bg-[#E8E1D5]"}`}>
                            <span className="w-2 h-2 rounded-full bg-[#7A685F] block" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#7A685F]">Not assigned</p>
                            <p className="text-xs text-[#7A685F]/60">No phase selected yet</p>
                          </div>
                          {phase === null && (
                            <div className="w-5 h-5 rounded-full bg-[#7A685F] flex items-center justify-center flex-shrink-0">
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </button>

                        {Object.entries(PHASES).map(([key, val]) => (
                          <button key={key} onClick={() => setPhase(key)}
                            className={`w-full flex items-center gap-3 px-3 sm:px-3.5 py-2.5 sm:py-3 rounded-xl border-2 text-left transition-all duration-150 ${
                              phase === key ? `${val.border} ${val.bg} shadow-sm` : "border-[#E8E1D5] hover:border-[#DDD2C2] hover:bg-[#F5F1E8]/50"
                            }`}>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${phase === key ? val.bg : "bg-[#E8E1D5]"}`}>
                              <span className={`w-2.5 h-2.5 rounded-full ${val.dot} block`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-bold ${phase === key ? val.color : "text-[#2B1A14]"}`}>{val.label}</p>
                              <p className="text-xs text-[#7A685F]">{val.desc}</p>
                            </div>
                            {phase === key && (
                              <div className={`w-5 h-5 rounded-full ${val.dot} flex items-center justify-center flex-shrink-0`}>
                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-[#7A685F] uppercase tracking-wider block mb-2">Total Sessions Planned</label>
                      <div className="relative">
                        <input type="number" min={0} value={totalSessions}
                          onChange={e => setTotalSessions(Number(e.target.value))}
                          className="w-full border-2 border-[#DDD2C2] rounded-xl px-4 py-3 text-sm font-semibold text-[#2B1A14] focus:outline-none focus:ring-0 focus:border-[#D97332] transition-colors bg-white"
                          placeholder="e.g. 20" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#7A685F] font-medium">sessions</span>
                      </div>
                    </div>

                    <div className="flex gap-2.5 pt-1">
                      <button onClick={saveChanges} disabled={saving}
                        className="flex-1 bg-[#4B0F05] hover:bg-[#5C1408] text-[#F5F1E8] text-sm font-bold py-3 rounded-xl disabled:opacity-50 transition-all duration-150 shadow-sm hover:shadow-md flex items-center justify-center gap-2">
                        {saving ? (
                          <><div className="w-4 h-4 border-2 border-[#F5F1E8] border-t-transparent rounded-full animate-spin" /> Saving…</>
                        ) : saved ? (
                          <><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg> Saved!</>
                        ) : "Save Changes"}
                      </button>
                      <button
                        onClick={() => {
                          setEditing(false);
                          setPhase(patient.phase && PHASES[patient.phase] ? patient.phase : null);
                          setTotalSessions(patient.totalSessionsPlanned ?? 0);
                        }}
                        className="px-4 sm:px-5 text-sm font-semibold text-[#7A685F] hover:text-[#2B1A14] bg-[#F5F1E8] hover:bg-[#E8E1D5] border-2 border-[#DDD2C2] rounded-xl transition-all duration-150">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 sm:space-y-4">
                    {currentPhase ? (
                      <div className={`flex items-center gap-3 p-3 sm:p-3.5 rounded-xl border ${currentPhase.bg} ${currentPhase.border}`}>
                        <div className={`w-8 sm:w-9 h-8 sm:h-9 rounded-xl ${currentPhase.bg} border ${currentPhase.border} flex items-center justify-center flex-shrink-0`}>
                          <span className={`w-3 h-3 rounded-full ${currentPhase.dot} block`} />
                        </div>
                        <div>
                          <p className={`text-sm font-extrabold ${currentPhase.color}`}>{currentPhase.label}</p>
                          <p className="text-xs text-[#7A685F]">{currentPhase.desc}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 p-3 sm:p-3.5 rounded-xl border-2 border-dashed border-[#DDD2C2] bg-[#F5F1E8]/80">
                        <div className="w-8 sm:w-9 h-8 sm:h-9 rounded-xl bg-[#E8E1D5] flex items-center justify-center flex-shrink-0">
                          <span className="w-3 h-3 rounded-full bg-[#7A685F]/30 block" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#7A685F]">Phase Not Assigned</p>
                          <p className="text-xs text-[#7A685F]/60">Pending doctor assignment</p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-[#F5F1E8] rounded-xl p-3 text-center">
                        <p className="text-xl sm:text-2xl font-extrabold text-[#2B1A14]">
                          {patient.totalSessionsPlanned > 0 ? patient.totalSessionsPlanned : "—"}
                        </p>
                        <p className="text-[10px] font-semibold text-[#7A685F] uppercase tracking-wider mt-0.5">Planned</p>
                      </div>
                      <div className="bg-[#4F8A5B]/8 rounded-xl p-3 text-center">
                        <p className="text-xl sm:text-2xl font-extrabold text-[#4F8A5B]">{attended}</p>
                        <p className="text-[10px] font-semibold text-[#4F8A5B]/60 uppercase tracking-wider mt-0.5">Completed</p>
                      </div>
                    </div>

                    {patient.totalSessionsPlanned > 0 && (
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-semibold text-[#7A685F]">Progress</span>
                          <span className="text-sm font-extrabold text-[#2B1A14]">{Math.round(progressPct)}%</span>
                        </div>
                        <div className="h-3 bg-[#E8E1D5] rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${progressPct}%`,
                              background: progressPct >= 80
                                ? "linear-gradient(90deg, #4F8A5B, #3d6e47)"
                                : progressPct >= 40
                                ? "linear-gradient(90deg, #D97332, #4B0F05)"
                                : "linear-gradient(90deg, #D9A441, #D97332)"
                            }} />
                        </div>
                        <p className="text-xs text-[#7A685F] mt-1.5 font-medium">{attended} of {patient.totalSessionsPlanned} sessions completed</p>
                      </div>
                    )}

                    {!currentPhase && canEdit && (
                      <button onClick={() => setEditing(true)}
                        className="w-full mt-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-[#D97332]/30 bg-[#FDF3EC]/60 text-[#D97332] text-xs font-semibold hover:bg-[#FDF3EC] hover:border-[#D97332]/50 transition-all duration-150">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                        Assign Treatment Phase
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ════════ RIGHT COLUMN ════════ */}
          <div className="space-y-4 sm:space-y-5 w-full min-w-0">

            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {[
                { label: "Total",    value: total,    color: "text-[#2B1A14]",  bg: "bg-[#E8E1D5]",         filter: null,        icon: <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
                { label: "Attended", value: attended, color: "text-[#4F8A5B]",  bg: "bg-[#4F8A5B]/12",     filter: "ATTENDED",  icon: <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
                { label: "Missed",   value: missed,   color: "text-[#C94F4F]",  bg: "bg-[#C94F4F]/12",     filter: "MISSED",    icon: <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
                { label: "Upcoming", value: upcoming, color: "text-[#D97332]",  bg: "bg-[#D97332]/12",     filter: "CONFIRMED", icon: <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
              ].map(s => (
                <button key={s.label}
                  onClick={() => setStatusFilter(statusFilter === s.filter ? null : s.filter)}
                  className={`bg-white rounded-2xl border shadow-sm p-3 sm:p-4 text-left transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 ${
                    statusFilter === s.filter ? "border-[#DDD2C2] ring-2 ring-[#D97332]/20 shadow-md" : "border-[#DDD2C2]"
                  }`}>
                  <div className={`w-8 h-8 sm:w-9 sm:h-9 ${s.bg} rounded-xl flex items-center justify-center ${s.color} mb-2 sm:mb-3`}>{s.icon}</div>
                  <div className={`text-2xl sm:text-3xl font-black ${s.color} mb-0.5 sm:mb-1`}>{s.value}</div>
                  <div className="text-xs font-semibold text-[#7A685F]">{s.label}</div>
                </button>
              ))}
            </div>

            {/* Tabs + Session History / Notes */}
            <div className="bg-white rounded-2xl border border-[#DDD2C2] shadow-sm overflow-hidden">
              {/* Tab bar */}
              <div className="flex border-b border-[#E8E1D5] px-3 sm:px-5 overflow-x-auto">
                {([
                  { key: "sessions", label: "Session History", count: filteredAppointments.length },
                  { key: "notes",    label: "Visit Notes",     count: visits.length },
                ] as const).map(tab => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm font-semibold border-b-2 transition-colors mr-1 sm:mr-2 whitespace-nowrap flex-shrink-0 ${
                      activeTab === tab.key ? "border-[#D97332] text-[#D97332]" : "border-transparent text-[#7A685F] hover:text-[#2B1A14]"
                    }`}>
                    {tab.label}
                    <span className={`text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-bold ${
                      activeTab === tab.key ? "bg-[#FDF3EC] text-[#D97332]" : "bg-[#E8E1D5] text-[#7A685F]"
                    }`}>{tab.count}</span>
                  </button>
                ))}
                <div className="ml-auto flex items-center gap-2 sm:gap-3 py-2 sm:py-3 flex-shrink-0">
                  {activeTab === "sessions" && statusFilter && (
                    <span className={`flex items-center gap-1 sm:gap-1.5 text-xs font-semibold px-2 sm:px-2.5 py-1 rounded-full border ${
                      statusFilter === "ATTENDED" ? "bg-[#4F8A5B]/10 text-[#4F8A5B] border-[#4F8A5B]/30" :
                      statusFilter === "MISSED"   ? "bg-[#C94F4F]/10 text-[#C94F4F] border-[#C94F4F]/30" :
                      "bg-[#D97332]/10 text-[#D97332] border-[#D97332]/30"
                    }`}>
                      {statusFilter.charAt(0) + statusFilter.slice(1).toLowerCase()}
                      <button onClick={() => setStatusFilter(null)} className="opacity-60 hover:opacity-100 text-base leading-none">×</button>
                    </span>
                  )}
                  {canEdit && (
                    <Link href="/dashboard/doctor"
                      className="text-xs text-[#D97332] hover:text-[#4B0F05] font-semibold flex items-center gap-1 bg-[#FDF3EC] hover:bg-[#EFE7DA] border border-[#D97332]/30 px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                      Update status
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7" />
                      </svg>
                    </Link>
                  )}
                </div>
              </div>

              {/* Sessions tab */}
              {activeTab === "sessions" && (
                filteredAppointments.length === 0 ? (
                  <div className="py-16 sm:py-20 text-center">
                    <div className="w-12 sm:w-14 h-12 sm:h-14 bg-[#E8E1D5] rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <svg className="w-6 sm:w-7 h-6 sm:h-7 text-[#7A685F]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-[#7A685F]">No sessions found</p>
                    <p className="text-xs text-[#7A685F]/60 mt-1">{statusFilter ? "Try removing the filter" : "Sessions will appear here once booked"}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[500px]">
                      <thead>
                        <tr className="text-[11px] text-[#7A685F] font-bold uppercase tracking-widest bg-[#F5F1E8]/80">
                          <th className="text-left px-4 sm:px-5 py-3 sm:py-3.5">Date</th>
                          <th className="text-left px-4 sm:px-5 py-3 sm:py-3.5">Session Type</th>
                          <th className="text-left px-4 sm:px-5 py-3 sm:py-3.5">Doctor</th>
                          <th className="text-left px-4 sm:px-5 py-3 sm:py-3.5">Status</th>
                          <th className="text-left px-4 sm:px-5 py-3 sm:py-3.5 hidden md:table-cell">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAppointments.map(a => {
                          const visit = visits.find(v => v.appointment?.id === a.id);
                          const style = STATUS_STYLES[a.status] ?? STATUS_STYLES.CANCELLED;
                          return (
                            <tr key={a.id} className="border-t border-[#F5F1E8] hover:bg-[#FDF3EC]/40 transition-colors duration-150">
                              <td className="px-4 sm:px-5 py-3 sm:py-4 text-xs font-semibold text-[#2B1A14] whitespace-nowrap">
                                {new Date(a.startTime).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                              </td>
                              <td className="px-4 sm:px-5 py-3 sm:py-4">
                                <span className="text-xs font-medium text-[#5C1408] bg-[#E8E1D5] px-2 sm:px-2.5 py-1 rounded-lg whitespace-nowrap">
                                  {a.sessionType.replace(/_/g, " ")}
                                </span>
                              </td>
                              <td className="px-4 sm:px-5 py-3 sm:py-4">
                                <div className="flex items-center gap-1.5 sm:gap-2">
                                  <div className="w-5 sm:w-6 h-5 sm:h-6 rounded-full bg-[#FDF3EC] border border-[#DDD2C2] flex items-center justify-center text-[#D97332] text-[9px] sm:text-[10px] font-bold flex-shrink-0">
                                    {a.doctor.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                                  </div>
                                  <span className="text-xs font-medium text-[#2B1A14] whitespace-nowrap">{a.doctor.name}</span>
                                </div>
                              </td>
                              <td className="px-4 sm:px-5 py-3 sm:py-4">
                                <span className={`inline-flex items-center gap-1 sm:gap-1.5 text-xs px-2 sm:px-2.5 py-1 rounded-full font-semibold ${style.pill}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                                  {a.status.charAt(0) + a.status.slice(1).toLowerCase()}
                                </span>
                              </td>
                              <td className="px-4 sm:px-5 py-3 sm:py-4 text-xs text-[#7A685F] max-w-[160px] sm:max-w-[200px] hidden md:table-cell">
                                {visit?.notes
                                  ? <span className="truncate block">{visit.notes}</span>
                                  : <span className="text-[#7A685F]/30 italic">No notes</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {/* Notes tab */}
              {activeTab === "notes" && (
                !visits.length ? (
                  <div className="py-16 sm:py-20 text-center">
                    <div className="w-12 sm:w-14 h-12 sm:h-14 bg-[#E8E1D5] rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <svg className="w-6 sm:w-7 h-6 sm:h-7 text-[#7A685F]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-[#7A685F]">No visit notes yet</p>
                    <p className="text-xs text-[#7A685F]/60 mt-1">Notes will appear here after doctor visits</p>
                  </div>
                ) : (
                  <div className="p-4 sm:p-5 space-y-3">
                    {visits.map((v, i) => (
                      <div key={i} className="flex gap-3 sm:gap-4 p-3 sm:p-4 bg-[#F5F1E8] rounded-xl hover:bg-[#EFE7DA] transition-colors duration-150">
                        <div className="w-7 sm:w-8 h-7 sm:h-8 bg-[#FDF3EC] border border-[#D97332]/20 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                          <svg className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-[#D97332]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-[#7A685F] mb-1">
                            {new Date(v.visitDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                          </p>
                          <p className="text-sm text-[#2B1A14] leading-relaxed break-words">
                            {v.notes || <span className="italic text-[#7A685F]/50">No notes recorded</span>}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Edit Profile Modal ── */}
      {editOpen && (
        <EditProfileModal
          type="patient"
          entityId={patient.id}
          initialData={{
            name: patient.name,
            phone: patient.phone,
            email: patient.email ?? "",
            age: patient.age ?? "",
            gender: patient.gender ?? "",
            address: patient.address ?? "",
            purposeOfVisit: patient.purposeOfVisit ?? "",
            medicalConditions: patient.medicalConditions ?? "",
            phase: patient.phase ?? "",
            totalSessionsPlanned: patient.totalSessionsPlanned,
          }}
          userRole={role}
          onClose={() => setEditOpen(false)}
          onSuccess={(updated) => {
            // FIX: preserve existing appointments/visits if the API response
            // omits them, so downstream .filter() calls never crash.
            setPatient(prev => ({
              ...prev!,
              ...(updated as Patient),
              appointments: (updated as Patient).appointments ?? prev?.appointments ?? [],
              visits:       (updated as Patient).visits       ?? prev?.visits       ?? [],
            }));
            setTotalSessions((updated as Patient).totalSessionsPlanned ?? 0);
            setPhase((updated as Patient).phase ?? null);
            setEditOpen(false);
          }}
        />
      )}
    </div>
  );
}