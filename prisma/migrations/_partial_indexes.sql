-- Additive and backwards-compatible: one NOT NULL column with a default, so every existing row
-- becomes is_absent = false and no data is changed or removed.
--
-- is_absent = true means the learner did not sit the assessment (recorded as ZERO in class
-- rankings). marks_obtained = NULL with is_absent = false still means "not entered yet".
ALTER TABLE "assessment_results" ADD COLUMN "is_absent" BOOLEAN NOT NULL DEFAULT false;

-- A learner cannot both be absent and have marks. Enforced by the database, not only the app.
ALTER TABLE "assessment_results"
  ADD CONSTRAINT "chk_assessment_results_absent_has_no_marks"
  CHECK (NOT ("is_absent" AND "marks_obtained" IS NOT NULL));
