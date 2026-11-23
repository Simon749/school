-- Add an explicit state for each learner's assessment result.
-- Existing scored data is preserved as SCORED. Rows with no stored mark or rubric
-- score remain NOT_ENTERED; absence is never inferred from a null mark.
ALTER TABLE "assessment_results"
ADD COLUMN "result_status" VARCHAR(20) NOT NULL DEFAULT 'not_entered';

UPDATE "assessment_results" AS result
SET "result_status" = 'scored'
WHERE result."marks_obtained" IS NOT NULL
   OR EXISTS (
     SELECT 1
     FROM "rubric_scores" AS rubric
     WHERE rubric."result_id" = result."id"
   );

ALTER TABLE "assessment_results"
ADD CONSTRAINT "assessment_results_result_status_check"
CHECK ("result_status" IN ('scored', 'absent', 'not_entered'));
