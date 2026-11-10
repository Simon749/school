/*
  Warnings:

  - Added the required column `school_id` to the `assessment_results` table without a default value. This is not possible if the table is not empty.
  - Added the required column `school_id` to the `notifications` table without a default value. This is not possible if the table is not empty.
  - Added the required column `school_id` to the `portfolio_artefacts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `school_id` to the `student_activities` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "assessment_results" ADD COLUMN     "school_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "lesson_registers" ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "school_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "portfolio_artefacts" ADD COLUMN     "school_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "student_activities" ADD COLUMN     "school_id" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "checkout_request_id" VARCHAR(100) NOT NULL,
    "merchant_request_id" VARCHAR(100),
    "amount" DECIMAL(12,2) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "mpesa_code" VARCHAR(20),
    "mpesa_name" VARCHAR(100),
    "callback_payload" JSONB,
    "failure_reason" TEXT,
    "payment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_checkout_request_id_key" ON "payment_attempts"("checkout_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_payment_id_key" ON "payment_attempts"("payment_id");

-- CreateIndex
CREATE INDEX "idx_payment_attempts_school_status" ON "payment_attempts"("school_id", "status");

-- CreateIndex
CREATE INDEX "idx_payment_attempts_checkout" ON "payment_attempts"("checkout_request_id");

-- CreateIndex
CREATE INDEX "idx_assessment_results_school" ON "assessment_results"("school_id");

-- CreateIndex
CREATE INDEX "idx_notifications_school" ON "notifications"("school_id");

-- CreateIndex
CREATE INDEX "idx_portfolio_artefacts_school" ON "portfolio_artefacts"("school_id");

-- CreateIndex
CREATE INDEX "idx_student_activities_school" ON "student_activities"("school_id");

-- AddForeignKey
ALTER TABLE "student_activities" ADD CONSTRAINT "student_activities_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_artefacts" ADD CONSTRAINT "portfolio_artefacts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "fee_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
