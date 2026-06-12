"use client";

/**
 * src/app/dashboard/feedback/page.tsx
 *
 * Admin / Doctor / Receptionist view for all patient feedback.
 * Themed to match the Vyayama Physio clinic design system.
 */

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  Search,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react";

interface Feedback {
  id: string;
  overallFeedback: string;
  painBefore: number;
  painAfter: number;
  createdAt: string;
  patient: { name: string; patientCode: string };
  appointment?: {
    startTime: string;
    sessionType: string;
    doctor: { name: string };
  } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

function PainBadge({ score, label }: { score: number; label: string }) {
  const bg =
    score <= 3 ? "bg-[#EFF9F3] text-[#1E6640] border-[#96D4B0]" :
    score <= 6 ? "bg-[#FFF8E6] text-[#9A6A00] border-[#F0D080]" :
                 "bg-[#FDF0F0] text-[#A83030] border-[#E8B8B8]";
  return (
    <div className="text-center">
      <div className="text-[10px] text-[#8A7055] mb-1 font-medium uppercase tracking-wide">{label}</div>
      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${bg}`}>
        {score}/10
      </span>
    </div>
  );
}

function DeltaBadge({ before, after }: { before: number; after: number }) {
  const diff = before - after;
  if (diff > 0) return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-[#EFF9F3] text-[#1E6640] border border-[#96D4B0]">
      <TrendingDown className="h-3 w-3" /> -{diff}
    </span>
  );
  if (diff < 0) return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-[#FDF0F0] text-[#A83030] border border-[#E8B8B8]">
      <TrendingUp className="h-3 w-3" /> +{Math.abs(diff)}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-[#F4EFE6] text-[#8A7055] border border-[#DDD3C0]">
      <Minus className="h-3 w-3" /> 0
    </span>
  );
}

export default function FeedbackDashboardPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    if (authStatus === "unauthenticated") router.replace("/auth/login");
    if (
      authStatus === "authenticated" &&
      !["ADMIN", "DOCTOR", "RECEPTIONIST"].includes(session?.user?.role ?? "")
    ) router.replace("/dashboard");
  }, [authStatus, session, router]);

  const fetchFeedbacks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
        ...(search ? { search } : {}),
      });
      const res = await fetch(`/api/admin/feedback?${params}`);
      const data = await res.json();
      if (data.feedbacks) {
        setFeedbacks(data.feedbacks);
        setPagination(data.pagination);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => {
    if (authStatus === "authenticated") fetchFeedbacks();
  }, [authStatus, fetchFeedbacks]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  const avgBefore = feedbacks.length
    ? (feedbacks.reduce((s, f) => s + f.painBefore, 0) / feedbacks.length).toFixed(1) : "—";
  const avgAfter = feedbacks.length
    ? (feedbacks.reduce((s, f) => s + f.painAfter, 0) / feedbacks.length).toFixed(1) : "—";
  const improvements = feedbacks.filter((f) => f.painAfter < f.painBefore).length;

  if (authStatus === "loading") return null;

  return (
    <div className="min-h-screen bg-[#F4EFE6] p-5">
      <div className="max-w-5xl mx-auto">

        {/* ── Page Header ── */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-[#2C150A] flex items-center justify-center">
              <MessageSquare className="h-4 w-4 text-[#F4EFE6]" />
            </div>
            <h1 className="text-2xl font-bold text-[#2C150A]">Patient Feedback</h1>
          </div>
          <p className="text-sm text-[#8A7055] ml-12">
            View all session feedback submitted by patients
          </p>
        </div>

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Total Feedbacks",    value: pagination?.total ?? 0,  color: "text-[#2C150A]" },
            { label: "Avg Pain Before",    value: avgBefore,               color: "text-[#C4622D]" },
            { label: "Avg Pain After",     value: avgAfter,                color: "text-[#1E6640]" },
            { label: "Improvements (page)",value: improvements,            color: "text-[#1D4ED8]" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-2xl border border-[#DDD3C0] p-4 shadow-sm">
              <div className="text-[10px] text-[#8A7055] uppercase tracking-wider font-medium mb-2">{label}</div>
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* ── Search ── */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A7055]" />
            <input
              type="text"
              placeholder="Search by patient name…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#DDD3C0] bg-white text-sm text-[#2C150A] placeholder-[#B0A090] focus:outline-none focus:ring-2 focus:ring-[#C4622D]/30 focus:border-[#C4622D]"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 bg-[#2C150A] text-[#F4EFE6] rounded-xl text-sm font-medium hover:bg-[#3D1A0E] transition-colors"
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}
              className="px-4 py-2.5 text-[#8A7055] rounded-xl border border-[#DDD3C0] bg-white text-sm hover:bg-[#F4EFE6] transition-colors"
            >
              Clear
            </button>
          )}
        </form>

        {/* ── Feedback List ── */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-[#DDD3C0] p-12 text-center text-[#8A7055] shadow-sm">
            <div className="animate-pulse">Loading feedback…</div>
          </div>
        ) : feedbacks.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#DDD3C0] p-12 text-center shadow-sm">
            <MessageSquare className="h-10 w-10 mx-auto mb-3 text-[#DDD3C0]" />
            <p className="text-[#8A7055] text-sm">No feedback found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {feedbacks.map((fb) => {
              const diff = fb.painBefore - fb.painAfter;
              const accentColor =
                diff > 0 ? "border-l-[#1E6640]" :
                diff < 0 ? "border-l-[#A83030]" :
                           "border-l-[#DDD3C0]";

              return (
                <div
                  key={fb.id}
                  className={`bg-white rounded-2xl border border-[#DDD3C0] border-l-4 ${accentColor} p-4 shadow-sm`}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      {/* Patient meta row */}
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="font-bold text-[#2C150A] text-sm">{fb.patient.name}</span>
                        <span className="text-[10px] bg-[#F4EFE6] text-[#8A7055] border border-[#DDD3C0] px-2 py-0.5 rounded-full font-medium">
                          {fb.patient.patientCode}
                        </span>
                        <span className="text-[#DDD3C0]">·</span>
                        <span className="text-xs text-[#8A7055]">
                          {new Date(fb.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric", month: "short", year: "numeric",
                          })}
                        </span>
                        {fb.appointment && (
                          <>
                            <span className="text-[#DDD3C0]">·</span>
                            <span className="text-xs text-[#8A7055]">Dr. {fb.appointment.doctor.name}</span>
                            <span className="text-[#DDD3C0]">·</span>
                            <span className="text-xs text-[#8A7055]">
                              {fb.appointment.sessionType.replace(/_/g, " ")}
                            </span>
                          </>
                        )}
                      </div>
                      {/* Feedback text */}
                      <p className="text-sm text-[#3D1A0E] leading-relaxed bg-[#F9F6F1] rounded-xl p-3 border border-[#EDE8DF]">
                        {fb.overallFeedback}
                      </p>
                    </div>

                    {/* Pain score column */}
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                      <PainBadge score={fb.painBefore} label="Before" />
                      <span className="text-[#DDD3C0] text-sm font-light mt-4">→</span>
                      <PainBadge score={fb.painAfter} label="After" />
                      <div className="mt-4">
                        <DeltaBadge before={fb.painBefore} after={fb.painAfter} />
                      </div>
                    </div>
                  </div>
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
