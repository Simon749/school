-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('scored', 'absent', 'not_entered');

-- AlterTable
ALTER TABLE "assessment_results" ADD COLUMN     "result_status" "ResultStatus" NOT NULL DEFAULT 'not_entered';
