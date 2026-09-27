ALTER TABLE "BarangayOfficial"
  ADD COLUMN IF NOT EXISTS "residentId" TEXT;

ALTER TABLE "InfrastructureReport"
  ADD COLUMN IF NOT EXISTS "assignedOfficialId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "BarangayOfficial_residentId_key" ON "BarangayOfficial"("residentId");