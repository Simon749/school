/*
  Warnings:

  - You are about to drop the column `result_status` on the `assessment_results` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "assessment_results" DROP COLUMN "result_status",
ADD COLUMN     "is_absent" BOOLEAN NOT NULL DEFAULT false;
