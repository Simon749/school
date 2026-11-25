-- Reconstructed 2026-11-24. The original file of this name was applied to the database
-- (2026-11-24 06:00 UTC) and was later emptied by accident, which made Prisma report
-- "migration was modified after it was applied". This SQL is rebuilt from schema.prisma and from the
-- drift report, so that a database built from scratch (CI, a shadow database, a new school
-- environment) ends up with the same structure as the live database.
--
-- The live database already contains these changes: do NOT run this file against it. Record it as
-- applied instead (see the steps in the chat): `prisma migrate resolve --applied 20261124000000_sync_drift`.

-- CreateTable
CREATE TABLE "ReceiptSequence" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReceiptSequence_pkey" PRIMARY KEY ("id")
);

-- DropIndex: receipt numbers were unique across ALL schools; they are now unique per school.
DROP INDEX "fee_payments_receipt_number_key";

-- AlterTable
ALTER TABLE "fee_payments" ALTER COLUMN "receipt_number" SET DATA TYPE TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptSequence_schoolId_year_key" ON "ReceiptSequence"("schoolId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "fee_payments_school_id_receipt_number_key" ON "fee_payments"("school_id", "receipt_number");

-- AddForeignKey
ALTER TABLE "ReceiptSequence" ADD CONSTRAINT "ReceiptSequence_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
