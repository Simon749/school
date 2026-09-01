/*
  Warnings:

  - You are about to drop the column `is_published` on the `timetable_periods` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "timetable_periods" DROP COLUMN "is_published";

-- AlterTable
ALTER TABLE "timetable_slots" ADD COLUMN     "is_published" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
