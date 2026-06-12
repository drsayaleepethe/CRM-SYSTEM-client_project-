"use client";

/**
 * src/app/patient/dashboard/page.tsx
 * Patient self-service dashboard — shows appointment summary and recent visits.
 * Added: "My Assessment Reports" quick-link card.
 */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

type Appointment = {
  id: string;
  startTime: string;
  sessionType: string;
  status: string;
  doctor: { name: string };
};

type Patient = {
  id: string;
  patientCode: string;
  name: string;
  email: string;
  phone: string;
  age: number;
  gender: string;
  address: string;
  purposeOfVisit: string;
  medicalConditions: string;
  status: string;
  phase: string | null;
  totalSessionsPlanned: number;
  createdAt: string;
  appointments: Appointment[];
  visits: { notes: string; visitDate: string; appointment: { id: string } }[];
};

const STATUS_STYLES: Record<string, { pill: string; dot: string }> = {
  ATTENDED:  { pill: "bg-emerald-50 text-emerald-700 border border-emerald-200",  dot: "bg-emerald-500" },
  MISSED:    { pill: "bg-red-50 text-red-700 border border-red-200",              dot: "bg-red-500" },
  CONFIRMED: { pill: "bg-amber-50 text-amber-700 border border-amber-200",        dot: "bg-amber-500" },
  CANCELLED: { pill: "bg-slate-100 text-slate-500 border border-slate-200",       dot: "bg-slate-400" },
};

const SESSION_LABELS: Record<string, string> = {
  INITIAL_ASSESSMENT: "Initial Assessment",
  FOLLOW_UP: "Follow Up",
  SPECIALIZED: "Specialized",
};

const PHASE_CONFIG: Record<string, { short: string; label: string; color: string }> = {
  PHASE_1: { short: "P1", label: "Phase 1 – Every day",            color: "bg-violet-100 text-violet-700" },
  PHASE_2: { short: "P2", label: "Phase 2 – Alternate days",       color: "bg-blue-100 text-blue-700" },
  PHASE_3: { short: "P3", label: "Phase 3 – Twice a week",         color: "bg-teal-100 text-teal-700" },
  PHASE_4: { short: "P4", label: "Phase 4 – Weekly once",          color: "bg-emerald-100 text-emerald-700" },
  PHASE_5: { short: "P5", label: "Phase 5 – Weekly (maintenance)", color: "bg-amber-100 text-amber-700" },
};

function StatCard({
  label, value, icon, color,
}: {
  label: string; value: number; icon: string; color: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-[#E8E1D5] shadow-sm flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-black text-[#2B1A14]">{value}</p>
        <p className="text-xs font-semibold text-[#7A685F] uppercase tracking-wider mt-0.5">{label}</p>
      </div>
    </div>
  );
}

export default function PatientDashboard() {
  const { data: session } = useSession();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/patient/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { setPatient(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-[3px] border-[#D97332] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[#7A685F] font-medium">Loading your dashboard…</p>
      </div>
    </div>
  );

  if (!patient) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <p className="text-[#7A685F]">Unable to load your profile. Please try again.</p>
    </div>
  );

  const attended  = patient.appointments.filter((a) => a.status === "ATTENDED").length;
  const missed    = patient.appointments.filter((a) => a.status === "MISSED").length;
  const upcoming  = patient.appointments.filter((a) => a.status === "CONFIRMED").length;
  const total     = patient.appointments.length;
  const progressPct = patient.totalSessionsPlanned > 0
    ? Math.min((attended / patient.totalSessionsPlanned) * 100, 100)
    : 0;

  const recentAppointments = patient.appointments.slice(0, 5);
  const phase    = patient.phase && PHASE_CONFIG[patient.phase] ? PHASE_CONFIG[patient.phase] : null;
  const initials = patient.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">

      {/* Welcome Header */}
      <div
        className="bg-white rounded-2xl p-6 border border-[#E8E1D5] shadow-sm"
        style={{ background: "linear-gradient(135deg, #5B1A0E 0%, #3A0F08 100%)" }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-black flex-shrink-0"
            style={{
              background: "rgba(255,255,255,0.15)",
              color: "#F4A261",
              border: "1px solid rgba(255,255,255,0.2)",
            }}
          >
            {initials}
          </div>
          <div>
            <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-0.5">Welcome back</p>
            <h1 className="text-2xl font-black text-white leading-tight">{patient.name}</h1>
            <p className="text-sm text-white/60 mt-0.5">{patient.patientCode}</p>
          </div>
          {phase && (
            <div className="ml-auto hidden sm:block">
              <span className={`text-xs font-bold px-3 py-1.5 rounded-xl ${phase.color}`}>
                {phase.label}
              </span>
            </div>
          )}
        </div>
        {patient.totalSessionsPlanned > 0 && (
          <div className="mt-5">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-white/60">Treatment Progress</p>
              <p className="text-xs font-bold text-white">
                {attended} / {patient.totalSessionsPlanned} sessions
              </p>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%`, background: "#F4A261" }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total"    value={total}    icon="📅" color="bg-[#F5F1E8] text-[#5B1A0E]" />
        <StatCard label="Attended" value={attended} icon="✅" color="bg-emerald-50 text-emerald-700" />
        <StatCard label="Missed"   value={missed}   icon="⏱️" color="bg-red-50 text-red-700" />
        <StatCard label="Upcoming" value={upcoming} icon="🔜" color="bg-amber-50 text-amber-700" />
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* View Profile */}
        <Link
          href="/patient/profile"
          className="bg-white rounded-2xl p-5 border border-[#E8E1D5] shadow-sm flex items-center gap-4 hover:border-[#D97332]/50 hover:shadow-md transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-[#FDF3EC] flex items-center justify-center text-xl group-hover:bg-[#F4A261]/20 transition-colors">
            👤
          </div>
          <div>
            <p className="font-bold text-[#2B1A14]">View My Profile</p>
            <p className="text-xs text-[#7A685F] mt-0.5">See your personal details and medical info</p>
          </div>
          <span className="ml-auto text-[#D97332] text-lg">→</span>
        </Link>

        {/* Assessment Reports — NEW */}
        <Link
          href="/patient/assessments"
          className="bg-white rounded-2xl p-5 border border-[#E8E1D5] shadow-sm flex items-center gap-4 hover:border-[#D97332]/50 hover:shadow-md transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-[#FDF3EC] flex items-center justify-center text-xl group-hover:bg-[#F4A261]/20 transition-colors">
            📋
          </div>
          <div>
            <p className="font-bold text-[#2B1A14]">My Assessment Reports</p>
            <p className="text-xs text-[#7A685F] mt-0.5">View diagnoses, rehab plan & home exercises</p>
          </div>
          <span className="ml-auto text-[#D97332] text-lg">→</span>
        </Link>

        {/* Session Feedback */}
        <Link
          href="/patient/feedback"
          className="bg-white rounded-2xl p-5 border border-[#E8E1D5] shadow-sm flex items-center gap-4 hover:border-[#D97332]/50 hover:shadow-md transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-[#FDF3EC] flex items-center justify-center text-xl group-hover:bg-[#F4A261]/20 transition-colors">
            💬
          </div>
          <div>
            <p className="font-bold text-[#2B1A14]">Session Feedback</p>
            <p className="text-xs text-[#7A685F] mt-0.5">Rate your sessions & track your pain progress</p>
          </div>
          <span className="ml-auto text-[#D97332] text-lg">→</span>
        </Link>

        {/* Reset Password */}
        <Link
          href="/patient/reset-password"
          className="bg-white rounded-2xl p-5 border border-[#E8E1D5] shadow-sm flex items-center gap-4 hover:border-[#D97332]/50 hover:shadow-md transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-[#FDF3EC] flex items-center justify-center text-xl group-hover:bg-[#F4A261]/20 transition-colors">
            🔑
          </div>
          <div>
            <p className="font-bold text-[#2B1A14]">Reset Password</p>
            <p className="text-xs text-[#7A685F] mt-0.5">Change your account password securely</p>
          </div>
          <span className="ml-auto text-[#D97332] text-lg">→</span>
        </Link>
      </div>

      {/* Recent Appointments */}
      <div className="bg-white rounded-2xl border border-[#E8E1D5] shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#F0EAE0]">
          <h2 className="text-base font-black text-[#2B1A14]">Recent Appointments</h2>
        </div>
        {recentAppointments.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-sm font-semibold text-[#7A685F]">No appointments yet</p>
          </div>
        ) : (
          <div className="divide-y divide-[#F5F1E8]">
            {recentAppointments.map((appt) => {
              const styles = STATUS_STYLES[appt.status] ?? STATUS_STYLES["CONFIRMED"];
              const date   = new Date(appt.startTime);
              return (
                <div key={appt.id} className="px-6 py-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#F5F1E8] flex flex-col items-center justify-center flex-shrink-0">
                    <p className="text-[10px] font-bold text-[#7A685F] uppercase">
                      {date.toLocaleDateString("en-IN", { month: "short" })}
                    </p>
                    <p className="text-sm font-black text-[#2B1A14] leading-tight">{date.getDate()}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#2B1A14]">
                      {SESSION_LABELS[appt.sessionType] ?? appt.sessionType}
                    </p>
                    <p className="text-xs text-[#7A685F] mt-0.5">Dr. {appt.doctor.name}</p>
                  </div>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${styles.pill}`}>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${styles.dot}`} />
                    {appt.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}