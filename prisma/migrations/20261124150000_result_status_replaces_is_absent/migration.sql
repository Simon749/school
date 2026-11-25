-- One representation of "absent": assessment_results.result_status  ('scored' | 'absent' | 'not_entered').
--
-- Background: two designs existed for the same problem. GitHub main (PR #2) uses result_status; an
-- interim is_absent flag (migration 20261124120000) was applied to the development database.
-- Decision (owner, 2026-11-24): keep result_status. This migration moves any is_absent data into it and
-- removes is_absent, so that every database ends up with exactly the schema in schema.prisma.
--
-- An ABSENT learner is stored as marks = 0 with status 'absent', so every average or ranking that
-- reads marks already counts the absence as zero. 'not_entered' is NOT zero.
--
-- Safe on a database that already has data: nothing is deleted except the empty-of-meaning is_absent
-- column, and every is_absent = true row is carried over to status 'absent'.

-- The interim rule forbids marks on an absent row; we are about to give those rows marks = 0.
ALTER TABLE "assessment_results" DROP CONSTRAINT IF EXISTS "chk_assessment_results_absent_has_no_marks";

ALTER TABLE "assessment_results"
  ADD COLUMN IF NOT EXISTS "result_status" VARCHAR(20) NOT NULL DEFAULT 'not_entered';

-- 1. Learners recorded as absent carry over as ABSENT with a zero mark.
UPDATE "assessment_results"
SET "result_status" = 'absent', "marks_obtained" = 0
WHERE "is_absent" = true;

-- 2. Everything else with a mark or a rubric score is SCORED (same rule as GitHub's migration).
--    Rows with neither stay NOT_ENTERED: absence is never inferred from a blank mark.
UPDATE "assessment_results" AS result
SET "result_status" = 'scored'
WHERE result."result_status" = 'not_entered'
  AND (
    result."marks_obtained" IS NOT NULL
    OR EXISTS (SELECT 1 FROM "rubric_scores" AS rubric WHERE rubric."result_id" = result."id")
  );

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assessment_results_result_status_check') THEN
    ALTER TABLE "assessment_results"
      ADD CONSTRAINT "assessment_results_result_status_check"
      CHECK ("result_status" IN ('scored', 'absent', 'not_entered'));
  END IF;
END $$;

-- The database itself refuses an absent row whose mark is not zero (the application already writes 0).
ALTER TABLE "assessment_results"
  ADD CONSTRAINT "assessment_results_absent_means_zero_check"
  CHECK ("result_status" <> 'absent' OR COALESCE("marks_obtained", -1) = 0);

ALTER TABLE "assessment_results" DROP COLUMN IF EXISTS "is_absent";
