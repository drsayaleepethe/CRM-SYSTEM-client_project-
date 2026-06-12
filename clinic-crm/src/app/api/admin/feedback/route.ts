/**
 * src/app/api/admin/route.ts
 * GET /api/admin — main dashboard stats
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimitAdmin, rateLimitResponse } from "@/lib/rateLimit";

const ALLOWED_ROLES = ["ADMIN", "RECEPTIONIST"];

export async function GET(req: NextRequest) {
  const rl = await rateLimitAdmin(req);
  if (!rl.success) return rateLimitResponse(rl);

  const session = await getServerSession(authOptions);

  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!ALLOWED_ROLES.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1); // Monday

  const [
    totalPatients,
    newPatients,
    returningPatients,
    todayTotal,
    missedWeek,
    confirmedUpcoming,
    todayAppointments,
    recentAppointments,
    allPatients,
  ] = await Promise.all([
    prisma.patient.count(),
    prisma.patient.count({ where: { status: "NEW" } }),
    prisma.patient.count({ where: { status: "RETURNING" } }),
    prisma.appointment.count({ where: { startTime: { gte: today, lt: tomorrow } } }),
    prisma.appointment.count({ where: { status: "MISSED", startTime: { gte: weekStart } } }),
    prisma.appointment.count({ where: { status: "CONFIRMED" } }),
    prisma.appointment.findMany({
      where:   { startTime: { gte: today, lt: tomorrow } },
      orderBy: { startTime: "asc" },
      include: { patient: true, doctor: true },
    }),
    prisma.appointment.findMany({
      take:    5,
      orderBy: { createdAt: "desc" },
      include: {
        patient: { include: { _count: { select: { appointments: true } } } },
        doctor:  true,
      },
    }),
    prisma.patient.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { appointments: true } } },
    }),
  ]);

  const weekCounts = await Promise.all(
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      return prisma.appointment.count({ where: { startTime: { gte: d, lt: next } } });
    })
  );

  return NextResponse.json({
    totalPatients,
    newPatients,
    returningPatients,
    todayTotal,
    missedWeek,
    confirmedUpcoming,
    todayAppointments,
    recentAppointments,
    weekCounts,
    allPatients,
  });
}