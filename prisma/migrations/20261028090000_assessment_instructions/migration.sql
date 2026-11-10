-- Additive and backwards-compatible: a new nullable column, no data is changed or removed.
-- The Create Assessment dialog has an "Instructions" field that previously had nowhere to be
-- stored (the old route crashed on it). Design: assessments.instructions (SYSTEM_DESIGN §4).
ALTER TABLE "assessments" ADD COLUMN "instructions" TEXT;
