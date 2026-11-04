CREATE TABLE "ReportGeofence" (
  "id" TEXT NOT NULL,
  "boundary" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportGeofence_pkey" PRIMARY KEY ("id")
);
