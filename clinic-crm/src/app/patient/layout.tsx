"use client";
import Image from "next/image";
/**
 * src/app/patient/layout.tsx
 * Patient portal layout — mirrors the staff dashboard visual design
 * but is restricted to PATIENT-only navigation.
 */

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutGrid, UserCircle, KeyRound, Menu, X, LogOut, MessageSquare, FileText } from "lucide-react";
import SignOutButton from "@/components/SignOutButton";

const NAV = [
  { href: "/patient/dashboard",       label: "My Dashboard",   icon: LayoutGrid },
  { href: "/patient/assessments",     label: "My Assessments", icon: FileText },
  { href: "/patient/feedback",        label: "Feedback",       icon: MessageSquare },
  { href: "/patient/profile",         label: "My Profile",     icon: UserCircle },
  { href: "/patient/reset-password",  label: "Reset Password", icon: KeyRound },
];

const sidebarStyle = {
  background: "linear-gradient(175deg, #5B1A0E 0%, #4A1509 40%, #3A0F08 100%)",
  boxShadow: "2px 0 20px 0 rgba(58,15,8,0.18)",
};

function SidebarContent({
  pathname,
  patientName,
  patientEmail,
  onNavClick,
}: {
  pathname: string;
  patientName: string;
  patientEmail: string;
  onNavClick?: () => void;
}) {
  const initials = patientName
    .split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "P";

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-2xl overflow-hidden border border-[#5A1F14]/20 shadow-md bg-white flex items-center justify-center flex-shrink-0">
            <Image src="/logo.png" alt="Vyayama Logo" width={64} height={64} className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="text-xl font-black text-[#EAE6DC] leading-tight tracking-tight">Vyayama-Physio</p>
            <p className="text-xs text-[#EAE6DC]/70 leading-tight mt-1 font-medium">Patient Portal</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-1">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] px-3 mb-3"
          style={{ color: "rgba(255,255,255,0.30)" }}>
          My Account
        </p>
        {NAV.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavClick}
              className="group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150"
              style={{
                background: isActive ? "rgba(255,255,255,0.14)" : "transparent",
                color: isActive ? "#FFFFFF" : "rgba(255,255,255,0.58)",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)";
                  (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.90)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.58)";
                }
              }}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                  style={{ background: "#F4A261" }} />
              )}
              <Icon
                size={16}
                strokeWidth={isActive ? 2.4 : 1.9}
                style={{ color: isActive ? "#F4A261" : "rgba(255,255,255,0.45)" }}
              />
              <span className="flex-1">{label}</span>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "rgba(244,162,97,0.7)" }} />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="flex-shrink-0 px-4 py-4 border-t" style={{ borderColor: "rgba(255,255,255,0.10)" }}>
        <div className="rounded-2xl p-3.5 mb-3"
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0"
              style={{ background: "rgba(212,106,46,0.35)", border: "1px solid rgba(212,106,46,0.40)", color: "#F4A261" }}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate leading-tight">{patientName}</p>
              <p className="text-[10px] truncate leading-tight mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                {patientEmail}
              </p>
            </div>
            <span className="text-[9px] font-black px-2 py-1 rounded-lg flex-shrink-0"
              style={{ background: "rgba(212,106,46,0.22)", color: "#F4A261", border: "1px solid rgba(212,106,46,0.30)" }}>
              Patient
            </span>
          </div>
        </div>
        <SignOutButton />
      </div>
    </div>
  );
}

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const patientName  = session?.user?.name ?? "";
  const patientEmail = session?.user?.email ?? "";

  // Redirect non-patients away
  useEffect(() => {
    if (session && session.user.role !== "PATIENT") {
      router.replace("/dashboard");
    }
  }, [session, router]);

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);

  const sidebarProps = { pathname, patientName, patientEmail };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#F5F1E8" }}>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-60 flex-shrink-0 h-screen sticky top-0 flex-col relative overflow-hidden"
        style={sidebarStyle}>
        <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full pointer-events-none"
          style={{ background: "rgba(255,255,255,0.04)" }} />
        <div className="absolute -bottom-10 -right-6 w-36 h-36 rounded-full pointer-events-none"
          style={{ background: "rgba(0,0,0,0.08)" }} />
        <SidebarContent {...sidebarProps} />
      </aside>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-72 flex flex-col lg:hidden overflow-hidden transition-transform duration-300 ease-in-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={sidebarStyle}>
        <button onClick={() => setSidebarOpen(false)}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.70)" }}>
          <X size={16} />
        </button>
        <SidebarContent {...sidebarProps} onNavClick={() => setSidebarOpen(false)} />
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="flex-shrink-0 h-14 flex items-center justify-between px-4 sm:px-6 z-30"
          style={{ background: "#FFFFFF", borderBottom: "1px solid #E8E0D0", boxShadow: "0 1px 3px 0 rgba(91,26,14,0.06)" }}>
          <button onClick={() => setSidebarOpen(true)}
            className="lg:hidden w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ color: "#5B1A0E" }}>
            <Menu size={20} />
          </button>
          <div className="lg:hidden flex items-center gap-2">
            <span className="text-sm font-extrabold tracking-tight" style={{ color: "#5B1A0E" }}>
              Vyayama Physio
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2 text-sm font-medium" style={{ color: "#7A685F" }}>
            <span className="hidden sm:inline">Patient Portal</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto" style={{ background: "#F5F1E8" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
