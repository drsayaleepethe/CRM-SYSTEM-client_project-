/**
 * src/app/api/patient/assessments/route.ts
 *
 * GET /api/patient/assessments   — Patient views their own PUBLISHED assessments
 *
 * Auth: PATIENT role only (via NextAuth JWT).
 * The patientId is read from session.user.patientId — it cannot be spoofed.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== "PATIENT" || !session.user.patientId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const patientId = session.user.patientId;

    const assessments = await prisma.patientAssessment.findMany({
      where: {
        patientId,
        status: "PUBLISHED",
      },
      orderBy: { publishedAt: "desc" },
      select: {
        id:                  true,
        primaryComplaint:    true,
        primaryDiagnosis:    true,
        primaryDxIcd:        true,
        diagnosisConfidence: true,
        nrsScore:            true,
        ndiScore:            true,
        mobilityScore:       true,
        mobilityGrade:       true,
        irritability:        true,
        stage:               true,
        investmentPlan:      true,
        totalSessions:       true,
        timelineWeeks:       true,
        hasRedFlags:         true,
        publishedAt:         true,
        aiDiagnosis:         true,
        aiDocuments:         true,
        assessmentData:      true,
        doctor: { select: { name: true } },
      },
    });

    return NextResponse.json({ assessments });
  } catch (err) {
    logger.error("GET /api/patient/assessments failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}