-- Documents become project-scoped and categorised so the same table serves
-- CE attachments, Early Warning photo proofs, and the drawings register.

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('GENERAL', 'PHOTO', 'DRAWING');

-- AlterTable: new columns (projectId nullable for backfill)
ALTER TABLE "Document" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Document" ADD COLUMN "ewId" TEXT;
ALTER TABLE "Document" ADD COLUMN "reference" TEXT;
ALTER TABLE "Document" ADD COLUMN "category" "DocumentCategory" NOT NULL DEFAULT 'GENERAL';

-- Backfill projectId from the owning compensation event
UPDATE "Document" d
SET "projectId" = ce."projectId"
FROM "CompensationEvent" ce
WHERE d."ceId" = ce."id" AND d."projectId" IS NULL;

-- Drop any orphans that could not be resolved, then enforce NOT NULL
DELETE FROM "Document" WHERE "projectId" IS NULL;
ALTER TABLE "Document" ALTER COLUMN "projectId" SET NOT NULL;

-- ceId becomes optional (drawings and project files have no CE)
ALTER TABLE "Document" ALTER COLUMN "ceId" DROP NOT NULL;

-- Re-point the CE foreign key so it tolerates NULL
ALTER TABLE "Document" DROP CONSTRAINT IF EXISTS "Document_ceId_fkey";
ALTER TABLE "Document" ADD CONSTRAINT "Document_ceId_fkey"
  FOREIGN KEY ("ceId") REFERENCES "CompensationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Document" ADD CONSTRAINT "Document_ewId_fkey"
  FOREIGN KEY ("ewId") REFERENCES "EarlyWarning"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Document_projectId_category_idx" ON "Document"("projectId", "category");
