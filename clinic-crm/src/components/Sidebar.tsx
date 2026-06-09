"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Users,
  CalendarDays,
  Stethoscope,
  UserRound,
  ClipboardList,
  BarChart3,
  Bell,
} from "lucide-react";

// ─── Nav structure ────────────────────────────────────────────────────────────

const NAV = [
  {
    group: "MAIN",
    items: [
      { label: "Admin",    href: "/dashboard/admin",    icon: LayoutGrid   },
      { label: "Patients", href: "/dashboard/patients", icon: Users        },
      { label: "Booking",  href: "/dashboard/booking",  icon: CalendarDays },
    ],
  },
  {
    group: "VIEWS",
    items: [
      { label: "Doctor",     href: "/dashboard/doctor",     icon: Stethoscope  },
      { label: "Client",     href: "/dashboard/client",     icon: UserRound    },
      { label: "Assessment", href: "/dashboard/assessment", icon: ClipboardList },
    ],
  },
  {
    group: "SYSTEM",
    items: [
      { label: "Analytics",     href: "/dashboard/analytics",     icon: BarChart3 },
      { label: "Notifications", href: "/dashboard/notifications", icon: Bell      },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 h-screen sticky top-0 flex flex-col bg-white border-r border-gray-100">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-teal-600 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1C3.686 1 1 3.686 1 7s2.686 6 6 6 6-2.686 6-6-2.686-6-6-6z" fill="white" opacity="0.3"/>
              <path d="M7 3.5v3.5l2.5 1.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="text-sm font-bold text-gray-900 tracking-tight">Clinicare</span>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV.map(({ group, items }) => (
          <div key={group}>
            {/* Group label */}
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-1.5">
              {group}
            </p>

            {/* Items */}
            <ul className="space-y-0.5">
              {items.map(({ label, href, icon: Icon }) => {
                const isActive =
                  pathname === href || pathname.startsWith(href + "/");

                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={`
                        flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium
                        transition-all duration-150
                        ${
                          isActive
                            ? "bg-teal-50 text-teal-700"
                            : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                        }
                      `}
                    >
                      <Icon
                        size={16}
                        strokeWidth={isActive ? 2.2 : 1.8}
                        className={isActive ? "text-teal-600" : "text-gray-400"}
                      />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer — user avatar */}
      <div className="px-4 py-4 border-t border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 text-xs font-bold">
            A
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-800 truncate">Admin</p>
            <p className="text-[10px] text-gray-400 truncate">admin@clinicare.in</p>
          </div>
        </div>
      </div>
    </aside>
  );
}