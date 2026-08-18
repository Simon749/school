/*
  Warnings:

  - Added the required column `updated_at` to the `student_lesson_attendance` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "student_lesson_attendance" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "lesson_registers" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "submitted_at" TIMESTAMP(3),
    "submitted_by" TEXT,
    "unlocked_at" TIMESTAMP(3),
    "unlocked_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_registers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_lesson_register_school_date" ON "lesson_registers"("school_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "idx_lesson_register_unique" ON "lesson_registers"("slot_id", "date");

-- AddForeignKey
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_raised_by_fkey" FOREIGN KEY ("raised_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "fee_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_registers" ADD CONSTRAINT "lesson_registers_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_registers" ADD CONSTRAINT "lesson_registers_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "timetable_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
