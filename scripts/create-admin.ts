import bcrypt from "bcryptjs";
import "dotenv/config";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const firstName = process.env.ADMIN_FIRST_NAME?.trim();
  const lastName = process.env.ADMIN_LAST_NAME?.trim();

  if (!email || !password || !firstName || !lastName) {
    throw new Error("Set ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FIRST_NAME, and ADMIN_LAST_NAME before running admin:seed");
  }

  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.resident.upsert({
  where: { email },
  update: { passwordHash, role: UserRole.ADMIN, approvalStatus: "APPROVED", isVerified: true },
  create: {
    email,
    passwordHash,
    firstName,
    lastName,
    middleName: "Admin",
    age: 18,
    gender: "PREFER_NOT_TO_SAY",
    birthDate: new Date("2000-01-01"),
    nationality: "Filipino",
    phone: "N/A",
    address: "Barangay San Pascual",
    role: UserRole.ADMIN,
    approvalStatus: "APPROVED",
    isVerified: true,
    privacyConsent: true,
    privacyConsentAt: new Date(),
  },
  select: { id: true, email: true, role: true },
  });

  console.log(`Admin provisioned: ${admin.email} (${admin.role})`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
