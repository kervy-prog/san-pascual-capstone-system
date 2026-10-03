ALTER TABLE "InfrastructureReport"
  ADD COLUMN IF NOT EXISTS "urgencyLevel" TEXT NOT NULL DEFAULT 'MEDIUM';

UPDATE "InfrastructureReport" AS report
SET "urgencyLevel" = category."urgencyLevel"
FROM "InfrastructureCategory" AS category
WHERE report."categoryId" = category."id"
  AND category."urgencyLevel" IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');