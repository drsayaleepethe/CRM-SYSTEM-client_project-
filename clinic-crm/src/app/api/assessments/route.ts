/**
 * src/app/api/assessments/route.ts
 *
 * POST /api/assessments  — Doctor creates/saves an assessment (DRAFT or PUBLISHED)
 * GET  /api/assessments  — List assessments (doctor sees own; admin/receptionist sees all)
 *
 * FIX: patientId is now OPTIONAL. Assessments can be saved without linking to
 * a CRM patient (e.g. when opened directly from /dashboard/assessment without
 * a ?patientId= param). The 400 "patientId and assessmentData are required"
 * error is resolved by only validating assessmentData as required.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/rbac";
import { auditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";

// ─── POST — Create assessment ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    requireRole(session, ["DOCTOR", "ADMIN"]);

    const body = await req.json();
    const {
      patientId,
      appointmentId,
      assessmentData,
      aiDiagnosis,
      aiDocuments,
      status = "DRAFT",
    } = body;

    // assessmentData is the only hard requirement
    if (!assessmentData) {
      return NextResponse.json(
        { error: "assessmentData is required" },
        { status: 400 }
      );
    }

    // patientId is optional — verify only if provided
    let patient: { id: string; name: string; passwordHash: string | null } | null = null;
    if (patientId) {
      patient = await prisma.patient.findUnique({
        where: { id: patientId, isActive: true },
        select: { id: true, name: true, passwordHash: true },
      });
      if (!patient) {
        return NextResponse.json({ error: "Patient not found" }, { status: 404 });
      }
    }

    // ── Extract queryable metadata from AI output ────────────────────────────
    const dx    = aiDiagnosis?.dx?.[0];
    const prog  = aiDiagnosis?.prog;
    const inv   = aiDiagnosis?.inv;
    const flags: string[] = aiDiagnosis?.flags ?? [];

    // NDI score
    const ndiArr: number[] = assessmentData.ndi ?? [];
    const ndiTotal = ndiArr.reduce((a: number, b: number) => a + b, 0);
    const ndiScore = ndiArr.length ? Math.round((ndiTotal / 50) * 100) : null;

    // Mobility score
    const movD   = assessmentData.movD   ?? {};
    const tightD = assessmentData.tightD ?? {};
    let mobilityScore: number | null = null;
    let mobilityGrade: string | null = null;
    {
      let p = 0, t = 0;
      Object.values(movD as Record<string, { q?: string }>).forEach((v) => {
        t += 3;
        p += v.q === "G" ? 3 : v.q === "F" ? 2 : v.q === "P" ? 1 : 0;
      });
      Object.values(
        tightD as Record<string, { left?: number; right?: number; single?: number }>
      ).forEach((v) => {
        (["left", "right", "single"] as const).forEach((s) => {
          const val = v[s];
          if (val != null) { t += 3; p += 3 - Math.min(Number(val), 3); }
        });
      });
      if (t > 0) {
        mobilityScore = Math.round((p / t) * 100);
        mobilityGrade =
          mobilityScore >= 80 ? "A — Excellent" :
          mobilityScore >= 60 ? "B — Good"      :
          mobilityScore >= 40 ? "C — Fair"      : "D — Poor";
      }
    }

    const investmentPlan = inv
      ? `Phase ${inv.ph} — ${inv.nm} · ${inv.sess} sessions · ${inv.pr}`
      : null;

    const publishedAt = status === "PUBLISHED" ? new Date() : undefined;

    // ── Create the assessment row ─────────────────────────────────────────────
    // Use unchecked create (raw scalar IDs) so patientId can be null without
    // Prisma demanding a required relation connect object.
    const assessment = await prisma.patientAssessment.create({
      data: {
        patientId:     patientId    ?? null,
        doctorId:      session.user.id,
        appointmentId: appointmentId ?? null,

        // Metadata
        primaryComplaint:    assessmentData.C?.primary ?? null,
        nrsScore:            assessmentData.C?.nrs     ?? null,
        ndiScore,
        mobilityScore,
        mobilityGrade,
        primaryDiagnosis:    dx?.n   ?? null,
        primaryDxIcd:        dx?.icd ?? null,
        diagnosisConfidence: dx?.c   ?? null,
        irritability:        aiDiagnosis?.irr   ?? null,
        stage:               aiDiagnosis?.stage ?? null,
        loadClassification:  aiDiagnosis?.load  ?? null,
        totalSessions:       prog?.sess ?? null,
        timelineWeeks:       prog?.wks  ?? null,
        investmentPlan,
        hasRedFlags: flags.filter((f: string) => f && f !== "...").length > 0,

        // Blobs
        assessmentData,
        aiDiagnosis:  aiDiagnosis  ?? undefined,
        aiDocuments:  aiDocuments  ?? undefined,

        status:      status as "DRAFT" | "PUBLISHED" | "ARCHIVED",
        publishedAt,
      } as any, // cast to any to use unchecked input — patientId is nullable in DB
    });

    // ── Audit log ─────────────────────────────────────────────────────────────
    const patientName = patient?.name ?? assessmentData?.P?.name ?? "unknown";
    await auditLog({
      session,
      req,
      action:      "CREATE",
      entity:      "PatientAssessment",
      entityId:    assessment.id,
      description: `Assessment ${status === "PUBLISHED" ? "published" : "saved as draft"} for ${patientName}${patientId ? "" : " (not linked to CRM patient)"}`,
    });

    // ── Notify patient if publishing and they have a portal account ───────────
    if (status === "PUBLISHED" && patient?.passwordHash && patientId) {
      await prisma.inAppNotification.create({
        data: {
          userId:   patientId,
          type:     "ASSESSMENT_PUBLISHED",
          title:    "Your Assessment Report is Ready",
          body:     `Your physiotherapy assessment report from ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} has been published. You can now view and download it.`,
          entityId: assessment.id,
        },
      }).catch(() => {});
    }

    logger.info("Assessment saved", {
      assessmentId: assessment.id,
      patientId:    patientId ?? "unlinked",
      status,
    });

    return NextResponse.json({ assessment }, { status: 201 });
  } catch (err) {
    if (err instanceof NextResponse) throw err;
    logger.error("POST /api/assessments failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── GET — List assessments ───────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    requireRole(session, ["DOCTOR", "ADMIN", "RECEPTIONIST"]);

    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get("patientId");
    const status    = searchParams.get("status");
    const page      = Math.max(1, Number(searchParams.get("page")  ?? "1"));
    const limit     = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "20")));

    const where: Record<string, unknown> = {};

    // DOCTORs can only see their own assessments
    if (session.user.role === "DOCTOR") {
      where.doctorId = session.user.id;
    }
    if (patientId) where.patientId = patientId;
    if (status)    where.status    = status;

    const [assessments, total] = await Promise.all([
      prisma.patientAssessment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip:    (page - 1) * limit,
        take:    limit,
        select: {
          id:                  true,
          patientId:           true,
          doctorId:            true,
          appointmentId:       true,
          primaryComplaint:    true,
          nrsScore:            true,
          ndiScore:            true,
          mobilityScore:       true,
          mobilityGrade:       true,
          primaryDiagnosis:    true,
          primaryDxIcd:        true,
          diagnosisConfidence: true,
          irritability:        true,
          stage:               true,
          investmentPlan:      true,
          hasRedFlags:         true,
          status:              true,
          publishedAt:         true,
          createdAt:           true,
          updatedAt:           true,
          patient: { select: { name: true, patientCode: true, age: true } },
          doctor:  { select: { name: true } },
        },
      }),
      prisma.patientAssessment.count({ where }),
    ]);

    return NextResponse.json({
      assessments,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    if (err instanceof NextResponse) throw err;
    logger.error("GET /api/assessments failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}