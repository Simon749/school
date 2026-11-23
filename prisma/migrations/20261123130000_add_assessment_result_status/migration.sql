-- Add an explicit state for each learner's assessment result.
-- Existing rows are intentionally classified as not_entered; historical null marks
-- must not be silently interpreted as an absence.
ALTER TABLE "assessment_results"
ADD COLUMN "result_status" VARCHAR(20) NOT NULL DEFAULT 'not_entered';

ALTER TABLE "assessment_results"
ADD CONSTRAINT "assessment_results_result_status_check"
CHECK ("result_status" IN ('scored', 'absent', 'not_entered'));
