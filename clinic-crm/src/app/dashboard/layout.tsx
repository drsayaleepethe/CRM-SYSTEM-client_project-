"use client";
import Image from "next/image";
/**
 * src/app/dashboard/layout.tsx
 *
 * VYAYAMA PHYSIO — Dashboard Layout
 * ─────────────────────────────────
 * ✅ Brand-colored sidebar (primary deep-brown gradient)
 * ✅ Mobile: hidden by default, slide-in via hamburger
 * ✅ Desktop: fixed 240px sidebar
 * ✅ Overlay backdrop on mobile
 * ✅ RBAC-filtered nav (same as original)
 * ✅ Role badge, user info, sign-out
 */

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";
import NotificationBell from "@/components/NotificationBell";
import {
  LayoutGrid,
  Users,
  CalendarDays,
  Timer,
  BarChart3,
  Bell,
  KeyRound,
  UserPlus,
  UserCircle,
  UsersRound,
  CalendarOff,
  UserCheck,
  Menu,
  X,
  Activity,
  Wallet,
  ShieldCheck,
  ClipboardList,
  FileText,
  MessageSquare,
} from "lucide-react";
import type { ForwardRefExoticComponent, RefAttributes } from "react";
import type { LucideProps } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type LucideIcon = ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>;

// Raw nav item — href OR getHref, but never both
type StaticNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
};

type DynamicNavItem = {
  getHref: (userId: string) => string;
  label: string;
  icon: LucideIcon;
  roles: string[];
};

type RawNavItem = StaticNavItem | DynamicNavItem;

// Resolved nav item — always has a concrete href
type ResolvedNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
};

type NavGroup = {
  group: string;
  items: RawNavItem[];
};

type ResolvedNavGroup = {
  group: string;
  items: ResolvedNavItem[];
};

// ─── Nav Structure ────────────────────────────────────────────────────────────

const NAV: NavGroup[] = [
  {
    group: "Profile",
    items: [
      {
        label: "My Profile",
        icon: UserCircle,
        roles: ["ADMIN", "DOCTOR", "RECEPTIONIST"],
        getHref: (userId: string) => `/dashboard/staff/${userId}`,
      },
    ],
  },
  {
    group: "Main",
    items: [
      { href: "/dashboard",          label: "Dashboard",    icon: LayoutGrid,   roles: ["ADMIN"] },
      { href: "/dashboard/staff",    label: "Staff",        icon: UsersRound,   roles: ["ADMIN"] },
      { href: "/dashboard/patients", label: "Patients",     icon: Users,        roles: ["ADMIN", "RECEPTIONIST", "DOCTOR"] },
      { href: "/dashboard/booking",  label: "Booking",      icon: CalendarDays, roles: ["ADMIN", "RECEPTIONIST"] },
    ],
  },
  {
    group: "Views",
    items: [
      { href: "/dashboard/assessment", label: "Assessment",   icon: ClipboardList, roles: ["ADMIN", "DOCTOR"] }, 
      { href: "/dashboard/reports",    label: "Reports",       icon: FileText,      roles: ["ADMIN", "DOCTOR"] },
      { href: "/dashboard/doctor",   label: "Session View", icon: Timer,        roles: ["ADMIN", "DOCTOR"] },
    ],
  },
  {
    group: "Workflow",
    items: [
      { href: "/dashboard/holiday-requests", label: "Holiday Requests", icon: CalendarOff, roles: ["ADMIN", "RECEPTIONIST", "DOCTOR"] },
      { href: "/dashboard/reassignments",    label: "Reassignments",    icon: UserCheck,   roles: ["ADMIN", "RECEPTIONIST", "DOCTOR"] },
    ],
  },
  {
    group: "System",
    items: [
      { href: "/dashboard/analytics",     label: "Analytics",     icon: BarChart3, roles: ["ADMIN"] },
      { href: "/dashboard/expenses",      label: "Expenses",      icon: Wallet,       roles: ["ADMIN", "RECEPTIONIST"] },
      { href: "/dashboard/admin/audit-logs", label: "Audit Logs",    icon: ShieldCheck,  roles: ["ADMIN"] },
      { href: "/dashboard/notifications", label: "Notifications", icon: Bell,      roles: ["ADMIN", "RECEPTIONIST"] },
      { href: "/dashboard/feedback",      label: "Feedback",      icon: MessageSquare, roles: ["ADMIN", "DOCTOR", "RECEPTIONIST"] },
    ],
  },
  {
    group: "Account",
    items: [
      { href: "/dashboard/signup",         label: "Sign Up",        icon: UserPlus, roles: ["ADMIN"] },
      { href: "/dashboard/reset-password", label: "Reset Password", icon: KeyRound, roles: ["ADMIN", "DOCTOR", "RECEPTIONIST"] },
    ],
  },
];

const ROLE_LABEL: Record<string, string> = {
  ADMIN:        "Admin",
  DOCTOR:       "Doctor",
  RECEPTIONIST: "Front Desk",
};

// ─── Sidebar Inner Content ────────────────────────────────────────────────────

function SidebarContent({
  visibleNav,
  pathname,
  initials,
  userName,
  userEmail,
  role,
  onNavClick,
}: {
  visibleNav: ResolvedNavGroup[];
  pathname: string;
  initials: string;
  userName: string;
  userEmail: string;
  role: string;
  onNavClick?: () => void;
}) {
  return (
    <div className="flex flex-col h-full">

      {/* ── Logo ── */}
      <div className="px-5 py-5 border-b border-white/10 flex-shrink-0">
  <div className="flex items-center gap-3">
    
    {/* Logo */}
    <div className="w-19 h-19 rounded-2xl overflow-hidden border border-[#5A1F14]/20 shadow-md bg-white flex items-center justify-center flex-shrink-0">
      <Image
  src="/logo.png"
  alt="Vyayama Logo"
  width={76}
  height={76}
  className="w-full h-full object-cover"
/>
    </div>

    {/* Text */}
    <div>
      <div>
  <p className="text-2xl font-black text-[#EAE6DC] leading-tight tracking-tight">
    Vyayama-Physio
  </p>
  <p className="text-sm text-[#EAE6DC]/70 leading-tight mt-1 font-medium">
    Clinic management
  </p>
</div>
    </div>

  </div>
</div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-5 no-scrollbar">
        {visibleNav.map(({ group, items }) => (
          <div key={group}>
            <p className="text-[9px] font-black uppercase tracking-[0.18em] px-3 mb-2"
              style={{ color: "rgba(255,255,255,0.30)" }}>
              {group}
            </p>
            <ul className="space-y-0.5">
              {items.map(({ label, href, icon: Icon }) => {
                const isActive =
                  href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname === href || pathname.startsWith(href + "/");

                return (
                  <li key={href}>
                    <Link
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
                        <span
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                          style={{ background: "#F4A261" }}
                        />
                      )}

                      <Icon
                        size={16}
                        strokeWidth={isActive ? 2.4 : 1.9}
                        style={{ color: isActive ? "#F4A261" : "rgba(255,255,255,0.45)" }}
                      />

                      <span className="flex-1">{label}</span>

                      {isActive && (
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: "rgba(244,162,97,0.7)" }}
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── User Footer ── */}
      <div className="flex-shrink-0 px-4 py-4 border-t" style={{ borderColor: "rgba(255,255,255,0.10)" }}>
        <div
          className="rounded-2xl p-3.5 mb-3"
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0"
              style={{
                background: "rgba(212, 106, 46, 0.35)",
                border: "1px solid rgba(212,106,46,0.40)",
                color: "#F4A261",
              }}
            >
              {initials}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate leading-tight">
                {userName || "User"}
              </p>
              <p className="text-[10px] truncate leading-tight mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                {userEmail || role}
              </p>
            </div>

            {role && (
              <span
                className="text-[9px] font-black px-2 py-1 rounded-lg flex-shrink-0"
                style={{
                  background: "rgba(212,106,46,0.22)",
                  color: "#F4A261",
                  border: "1px solid rgba(212,106,46,0.30)",
                }}
              >
                {ROLE_LABEL[role] ?? role}
              </span>
            )}
          </div>
        </div>

        <SignOutButton />
      </div>
    </div>
  );
}

// ─── Dashboard Layout ─────────────────────────────────────────────────────────

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);

  const role      = session?.user?.role ?? "";
  const userId    = session?.user?.id ?? "";
  const userName  = session?.user?.name ?? "";
  const userEmail = session?.user?.email ?? "";
  const initials  = userName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "?";

  // Resolve all nav items to concrete hrefs before passing to components.
  // This eliminates the union type ambiguity that caused ts(2339).
  const visibleNav: ResolvedNavGroup[] = NAV.map((group) => {
    const visibleItems: ResolvedNavItem[] = group.items
      .filter((item) => item.roles.includes(role))
      .map((item): ResolvedNavItem => {
        if ("getHref" in item) {
          // DynamicNavItem — resolve href now using current userId
          const { getHref, ...rest } = item;
          return { ...rest, href: getHref(userId) };
        }
        // StaticNavItem — href already present
        return item;
      });
    return { ...group, items: visibleItems };
  }).filter((group) => group.items.length > 0);

  const sidebarProps = { visibleNav, pathname, initials, userName, userEmail, role };

  const sidebarStyle = {
    background: "linear-gradient(175deg, #5B1A0E 0%, #4A1509 40%, #3A0F08 100%)",
    boxShadow: "2px 0 20px 0 rgba(58,15,8,0.18)",
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#F5F1E8" }}>

      {/* ════════════════════════════════
          DESKTOP SIDEBAR (≥ lg)
      ════════════════════════════════ */}
      <aside
        className="hidden lg:flex w-60 flex-shrink-0 h-screen sticky top-0 flex-col relative overflow-hidden"
        style={sidebarStyle}
      >
        <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full pointer-events-none" style={{ background: "rgba(255,255,255,0.04)" }} />
        <div className="absolute top-40 -left-8 w-28 h-28 rounded-full pointer-events-none" style={{ background: "rgba(255,255,255,0.04)" }} />
        <div className="absolute -bottom-10 -right-6 w-36 h-36 rounded-full pointer-events-none" style={{ background: "rgba(0,0,0,0.08)" }} />

        <SidebarContent {...sidebarProps} />
      </aside>

      {/* ════════════════════════════════
          MOBILE OVERLAY BACKDROP
      ════════════════════════════════ */}
      {sidebarOpen && (
        <div
          className="overlay-backdrop lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ════════════════════════════════
          MOBILE SIDEBAR (< lg)
      ════════════════════════════════ */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-72 flex flex-col
          lg:hidden overflow-hidden
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
        style={sidebarStyle}
        aria-label="Navigation sidebar"
      >
        <button
          onClick={() => setSidebarOpen(false)}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-xl flex items-center justify-center transition-all"
          style={{ background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.70)" }}
          aria-label="Close navigation"
        >
          <X size={16} />
        </button>

        <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full pointer-events-none" style={{ background: "rgba(255,255,255,0.04)" }} />
        <div className="absolute -bottom-10 -right-6 w-36 h-36 rounded-full pointer-events-none" style={{ background: "rgba(0,0,0,0.08)" }} />

        <SidebarContent
          {...sidebarProps}
          onNavClick={() => setSidebarOpen(false)}
        />
      </aside>

      {/* ════════════════════════════════
          MAIN CONTENT AREA
      ════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Top Bar ── */}
        <header
          className="flex-shrink-0 h-14 flex items-center justify-between px-4 sm:px-6 z-30"
          style={{
            background: "#FFFFFF",
            borderBottom: "1px solid #E8E0D0",
            boxShadow: "0 1px 3px 0 rgba(91,26,14,0.06)",
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden w-9 h-9 rounded-xl flex items-center justify-center transition-all"
            style={{ color: "#5B1A0E" }}
            aria-label="Open navigation"
            aria-expanded={sidebarOpen}
          >
            <Menu size={20} />
          </button>

          <div className="lg:hidden flex items-center gap-2">
            <span className="text-sm font-extrabold tracking-tight" style={{ color: "#5B1A0E" }}>
              Vyayama Physio
            </span>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <NotificationBell />
          </div>
        </header>

        {/* ── Scrollable Page Content ── */}
        <main className="flex-1 overflow-y-auto" style={{ background: "#F5F1E8" }}>
          {children}
        </main>

      </div>
    </div>
  );
}