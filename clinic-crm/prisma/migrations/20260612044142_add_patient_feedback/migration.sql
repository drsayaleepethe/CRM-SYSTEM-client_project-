-- AlterEnum
ALTER TYPE "InAppNotifType" ADD VALUE 'FEEDBACK_SUBMITTED';

-- CreateTable
CREATE TABLE "PatientFeedback" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "overallFeedback" TEXT NOT NULL,
    "painBefore" INTEGER NOT NULL,
    "painAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientFeedback_patientId_idx" ON "PatientFeedback"("patientId");

-- CreateIndex
CREATE INDEX "PatientFeedback_createdAt_idx" ON "PatientFeedback"("createdAt");

-- AddForeignKey
ALTER TABLE "PatientFeedback" ADD CONSTRAINT "PatientFeedback_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientFeedback" ADD CONSTRAINT "PatientFeedback_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
