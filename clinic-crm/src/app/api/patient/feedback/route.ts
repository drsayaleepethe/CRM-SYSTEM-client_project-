/**
 * src/app/api/patient/feedback/route.ts
 *
 * POST /api/patient/feedback  — Patient submits feedback for a session
 * GET  /api/patient/feedback  — Patient retrieves their own feedback history
 *
 * Uses getServerSession + manual role check (same pattern as all other
 * /api/patient/* routes) because requireRole() in lib/rbac.ts only accepts
 * the staff union "ADMIN" | "DOCTOR" | "RECEPTIONIST".
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ─── auth helper — patient-only ───────────────────────────────────────────────

async function requirePatient() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { session: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.user.role !== "PATIENT") {
    return { session: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, error: null };
}

// ─── POST — Submit feedback ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requirePatient();
    if (error) return error;

    const body = await req.json();
    const { overallFeedback, painBefore, painAfter, appointmentId } = body;

    // Validate text
    if (!overallFeedback || typeof overallFeedback !== "string" || overallFeedback.trim().length < 5) {
      return NextResponse.json(
        { error: "Overall feedback must be at least 5 characters." },
        { status: 400 }
      );
    }

    // Validate pain scores
    if (
      typeof painBefore !== "number" || painBefore < 0 || painBefore > 10 ||
      typeof painAfter  !== "number" || painAfter  < 0 || painAfter  > 10
    ) {
      return NextResponse.json(
        { error: "Pain scores must be numbers between 0 and 10." },
        { status: 400 }
      );
    }

    // Verify the patient record exists (matched by email)
    const patient = await prisma.patient.findFirst({
      where: {
        email:    session!.user.email ?? "",
        isActive: true,
      },
      select: { id: true, name: true },
    });

    if (!patient) {
      return NextResponse.json({ error: "Patient record not found." }, { status: 404 });
    }

    // If appointmentId supplied, verify it belongs to this patient
    if (appointmentId) {
      const appt = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: { patientId: true },
      });
      if (!appt || appt.patientId !== patient.id) {
        return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
      }
    }

    const feedback = await prisma.patientFeedback.create({
      data: {
        patientId:       patient.id,
        appointmentId:   appointmentId ?? null,
        overallFeedback: overallFeedback.trim(),
        painBefore:      Math.round(painBefore),
        painAfter:       Math.round(painAfter),
      },
    });

    // Notify admins (best-effort, non-blocking)
    try {
      const admins = await prisma.user.findMany({
        where:  { role: "ADMIN", isActive: true },
        select: { id: true },
      });
      await Promise.all(
        admins.map((admin) =>
          prisma.inAppNotification.create({
            data: {
              userId:   admin.id,
              type:     "FEEDBACK_SUBMITTED",
              title:    "New Patient Feedback Received",
              body:     `${patient.name} submitted session feedback. Pain: ${painBefore}/10 → ${painAfter}/10.`,
              entityId: feedback.id,
            },
          })
        )
      );
    } catch (_notifErr) {
      // non-blocking — notification failure must not fail the request
    }

    logger.info("Patient feedback submitted", {
      feedbackId: feedback.id,
      patientId:  patient.id,
    });

    return NextResponse.json({ feedback }, { status: 201 });
  } catch (err) {
    logger.error("POST /api/patient/feedback failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── GET — List patient's own feedback history ────────────────────────────────

export async function GET(_req: NextRequest) {
  try {
    const { session, error } = await requirePatient();
    if (error) return error;

    const patient = await prisma.patient.findFirst({
      where: {
        email:    session!.user.email ?? "",
        isActive: true,
      },
      select: { id: true },
    });

    if (!patient) {
      return NextResponse.json({ feedbacks: [] });
    }

    const feedbacks = await prisma.patientFeedback.findMany({
      where:   { patientId: patient.id },
      orderBy: { createdAt: "desc" },
      include: {
        appointment: {
          select: {
            startTime:   true,
            sessionType: true,
            doctor: { select: { name: true } },
          },
        },
      },
    });

    return NextResponse.json({ feedbacks });
  } catch (err) {
    logger.error("GET /api/patient/feedback failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
