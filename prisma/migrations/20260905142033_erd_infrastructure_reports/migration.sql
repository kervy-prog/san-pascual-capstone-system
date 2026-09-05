-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('RESIDENT', 'STAFF', 'ADMIN');

-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('COMPLAINT', 'SERVICE_REQUEST');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO', 'DOCUMENT', 'OTHER');

-- CreateTable
CREATE TABLE "Resident" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "middleName" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "gender" "Gender" NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "nationality" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "barangay" TEXT NOT NULL DEFAULT 'San Pascual',
    "municipality" TEXT NOT NULL DEFAULT 'San Narciso',
    "province" TEXT NOT NULL DEFAULT 'Zambales',
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'RESIDENT',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfrastructureCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "urgencyLevel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfrastructureCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfrastructureReport" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "exactLocationLandmark" TEXT NOT NULL,
    "descriptionOfHazard" TEXT NOT NULL,
    "currentStatus" TEXT NOT NULL,
    "submitAnonymously" BOOLEAN NOT NULL DEFAULT false,
    "dateSubmitted" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticketNumber" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfrastructureReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportMedia" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarangayOfficial" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "designationPosition" TEXT NOT NULL,
    "contactNumber" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "proofOfAppointment" TEXT NOT NULL,
    "identityVerification" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BarangayOfficial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarangayAction" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "officialId" TEXT NOT NULL,
    "actionStatus" TEXT NOT NULL,
    "actionRemarks" TEXT NOT NULL,
    "actionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BarangayAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Resident_email_key" ON "Resident"("email");

-- CreateIndex
CREATE UNIQUE INDEX "InfrastructureCategory_name_key" ON "InfrastructureCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "InfrastructureReport_reportId_key" ON "InfrastructureReport"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "InfrastructureReport_ticketNumber_key" ON "InfrastructureReport"("ticketNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ReportMedia_mediaId_key" ON "ReportMedia"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "BarangayOfficial_actionId_key" ON "BarangayOfficial"("actionId");

-- CreateIndex
CREATE UNIQUE INDEX "BarangayAction_actionId_key" ON "BarangayAction"("actionId");

-- AddForeignKey
ALTER TABLE "InfrastructureReport" ADD CONSTRAINT "InfrastructureReport_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfrastructureReport" ADD CONSTRAINT "InfrastructureReport_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "InfrastructureCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportMedia" ADD CONSTRAINT "ReportMedia_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "InfrastructureReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarangayAction" ADD CONSTRAINT "BarangayAction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "InfrastructureReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarangayAction" ADD CONSTRAINT "BarangayAction_officialId_fkey" FOREIGN KEY ("officialId") REFERENCES "BarangayOfficial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
