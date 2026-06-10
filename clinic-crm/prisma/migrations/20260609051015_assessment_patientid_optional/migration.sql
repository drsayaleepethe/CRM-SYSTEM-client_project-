-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InAppNotifType" ADD VALUE 'ASSESSMENT_CREATED';
ALTER TYPE "InAppNotifType" ADD VALUE 'ASSESSMENT_PUBLISHED';

-- CreateTable
CREATE TABLE "PatientAssessment" (
    "id" TEXT NOT NULL,
    "patientId" TEXT,
    "doctorId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "primaryComplaint" TEXT,
    "nrsScore" INTEGER,
    "ndiScore" INTEGER,
    "mobilityScore" INTEGER,
    "mobilityGrade" TEXT,
    "primaryDiagnosis" TEXT,
    "primaryDxIcd" TEXT,
    "diagnosisConfidence" INTEGER,
    "irritability" TEXT,
    "stage" TEXT,
    "loadClassification" TEXT,
    "totalSessions" TEXT,
    "timelineWeeks" TEXT,
    "investmentPlan" TEXT,
    "hasRedFlags" BOOLEAN NOT NULL DEFAULT false,
    "assessmentData" JSONB NOT NULL,
    "aiDiagnosis" JSONB,
    "aiDocuments" JSONB,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientAssessment_appointmentId_key" ON "PatientAssessment"("appointmentId");

-- CreateIndex
CREATE INDEX "PatientAssessment_patientId_idx" ON "PatientAssessment"("patientId");

-- CreateIndex
CREATE INDEX "PatientAssessment_doctorId_idx" ON "PatientAssessment"("doctorId");

-- CreateIndex
CREATE INDEX "PatientAssessment_status_idx" ON "PatientAssessment"("status");

-- CreateIndex
CREATE INDEX "PatientAssessment_createdAt_idx" ON "PatientAssessment"("createdAt");

-- AddForeignKey
ALTER TABLE "PatientAssessment" ADD CONSTRAINT "PatientAssessment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAssessment" ADD CONSTRAINT "PatientAssessment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAssessment" ADD CONSTRAINT "PatientAssessment_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
