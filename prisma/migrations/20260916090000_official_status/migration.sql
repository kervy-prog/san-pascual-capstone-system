-- CreateEnum when it is not already present in a restored database.
DO $$
BEGIN
	CREATE TYPE "OfficialStatus" AS ENUM ('ACTIVE', 'RETIRED', 'NOT_ON_DUTY');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

-- AddColumn
ALTER TABLE "BarangayOfficial"
ADD COLUMN IF NOT EXISTS "status" "OfficialStatus" NOT NULL DEFAULT 'ACTIVE';
