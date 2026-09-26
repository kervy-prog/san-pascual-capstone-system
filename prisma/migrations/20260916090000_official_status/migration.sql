-- CreateEnum
CREATE TYPE "OfficialStatus" AS ENUM ('ACTIVE', 'RETIRED', 'NOT_ON_DUTY');

-- AddColumn
ALTER TABLE "BarangayOfficial"
ADD COLUMN "status" "OfficialStatus" NOT NULL DEFAULT 'ACTIVE';
