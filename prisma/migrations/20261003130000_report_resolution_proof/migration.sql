ALTER TABLE "InfrastructureReport"
  ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolutionDetails" TEXT;

ALTER TABLE "ReportMedia"
  ADD COLUMN IF NOT EXISTS "isResolutionProof" BOOLEAN NOT NULL DEFAULT false;