-- 1. Add school_id as nullable first to prevent lock failures on existing data
ALTER TABLE "student_activities" ADD COLUMN "school_id" TEXT;
ALTER TABLE "assessment_results" ADD COLUMN "school_id" TEXT;
ALTER TABLE "portfolio_artefacts" ADD COLUMN "school_id" TEXT;
ALTER TABLE "notifications" ADD COLUMN "school_id" TEXT;

-- 2. (Optional) If you have existing data, update it with your default school ID before step 3.
-- UPDATE "student_activities" SET "school_id" = 'YOUR_DEFAULT_SCHOOL_ID' WHERE "school_id" IS NULL;
-- UPDATE "assessment_results" SET "school_id" = 'YOUR_DEFAULT_SCHOOL_ID' WHERE "school_id" IS NULL;
-- UPDATE "portfolio_artefacts" SET "school_id" = 'YOUR_DEFAULT_SCHOOL_ID' WHERE "school_id" IS NULL;
-- UPDATE "notifications" SET "school_id" = 'YOUR_DEFAULT_SCHOOL_ID' WHERE "school_id" IS NULL;

-- 3. Enforce NOT NULL constraint
ALTER TABLE "student_activities" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "assessment_results" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "portfolio_artefacts" ALTER COLUMN "school_id" SET NOT NULL;
ALTER TABLE "notifications" ALTER COLUMN "school_id" SET NOT NULL;

-- 4. Create the payment_attempts table (R3-02)
CREATE TABLE "payment_attempts" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "checkout_request_id" TEXT NOT NULL,
    "merchant_request_id" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "mpesa_code" TEXT,
    "mpesa_name" TEXT,
    "callback_payload" JSONB,
    "failure_reason" TEXT,
    "payment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_attempts_checkout_request_id_key" UNIQUE ("checkout_request_id"),
    CONSTRAINT "payment_attempts_payment_id_key" UNIQUE ("payment_id")
);

-- 5. Add Foreign Keys
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "fee_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "student_activities" ADD CONSTRAINT "student_activities_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "portfolio_artefacts" ADD CONSTRAINT "portfolio_artefacts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Add Indexes
CREATE INDEX "idx_payment_attempts_school_status" ON "payment_attempts"("school_id", "status");
CREATE INDEX "idx_payment_attempts_checkout" ON "payment_attempts"("checkout_request_id");
CREATE INDEX "idx_student_activities_school" ON "student_activities"("school_id");
CREATE INDEX "idx_assessment_results_school" ON "assessment_results"("school_id");
CREATE INDEX "idx_portfolio_artefacts_school" ON "portfolio_artefacts"("school_id");
CREATE INDEX "idx_notifications_school" ON "notifications"("school_id");

-- 7. PostgreSQL Partial Index for notification held jobs (Constitution §57 / ATT-09)
CREATE INDEX "idx_student_lesson_notification" ON "student_lesson_attendance"("notification_held", "notification_job_id") WHERE "notification_held" = true;