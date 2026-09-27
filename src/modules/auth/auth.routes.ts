import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import { z } from "zod";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, type AuthRequest } from "../../middleware/require-auth.js";

const router = Router();
const uploadDirectory = path.resolve(process.cwd(), "private-uploads", "officials");
const residentUploadDirectory = path.resolve(process.cwd(), "private-uploads", "residents");
const allowedUploadTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
  fileFilter: (_request, file, callback) => callback(null, allowedUploadTypes.has(file.mimetype)),
});

const credentialsSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});

const signupPasswordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must not exceed 128 characters")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[0-9]/, "Password must include a number")
  .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/, "Password must include a special character");

const signupSchema = credentialsSchema.extend({
  password: signupPasswordSchema,
  confirmPassword: z.string(),
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  middleName: z.string().trim().min(2).max(80),
  age: z.coerce.number().int().min(18).max(120),
  gender: z.enum(["FEMALE", "MALE", "NON_BINARY", "PREFER_NOT_TO_SAY"]),
  birthDate: z.coerce.date().refine((date) => date < new Date(), "Birthdate must be in the past"),
  nationality: z.string().trim().min(2).max(60),
  phone: z.string().trim().min(7).max(30),
  address: z.string().trim().min(15).max(255),
  barangay: z.string().trim().min(2).max(80),
  municipality: z.string().trim().min(2).max(80),
  province: z.string().trim().min(2).max(80),
  residencyConfirmed: z.preprocess((value) => value === true || value === "true", z.boolean()).default(false),
  privacyConsent: z.preprocess((value) => value === true || value === "true", z.boolean()).default(false),
  role: z.enum(["RESIDENT", "STAFF"]).default("RESIDENT"),
  designationPosition: z.string().trim().min(2).max(120).optional(),
  governmentIdType: z.string().trim().min(2).max(80).optional(),
  governmentIdNumber: z.string().trim().min(3).max(80).optional(),
}).refine((input) => input.password === input.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match",
});

function createToken(userId: string, role: string) {
  return jwt.sign({ role }, env.JWT_SECRET, { subject: userId, expiresIn: "8h" });
}

router.post("/signup", upload.fields([
  { name: "residencyIdFile", maxCount: 1 },
  { name: "governmentIdFile", maxCount: 1 },
  { name: "appointmentProofFile", maxCount: 1 },
]), async (request, response, next) => {
  try {
    const input = signupSchema.parse(request.body);
    if (!input.privacyConsent) {
      response.status(400).json({ error: "Privacy consent is required for administrative verification" });
      return;
    }
    const files = request.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const residencyIdFile = files?.residencyIdFile?.[0];
    const governmentIdFile = files?.governmentIdFile?.[0];
    const appointmentProofFile = files?.appointmentProofFile?.[0];
    if (input.role === "STAFF" && (!input.designationPosition || !input.governmentIdType || !input.governmentIdNumber || !governmentIdFile || !appointmentProofFile)) {
      response.status(400).json({ error: "Barangay official accounts require designation, government ID details, an ID upload, and proof of appointment or oath of office" });
      return;
    }
    if (input.role === "RESIDENT" && (!input.residencyConfirmed || !residencyIdFile || input.nationality.toLowerCase() !== "filipino" || input.barangay.toLowerCase() !== "san pascual" || input.municipality.toLowerCase() !== "san narciso" || input.province.toLowerCase() !== "zambales")) {
      response.status(400).json({ error: "Resident accounts are limited to Filipino citizens residing in Barangay San Pascual, San Narciso, Zambales" });
      return;
    }
    const existingUser = await prisma.resident.findUnique({ where: { email: input.email } });

    if (existingUser) {
      response.status(409).json({ error: "An account with this email already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    let residencyIdPath: string | undefined;
    if (input.role === "RESIDENT" && residencyIdFile) {
      await fs.mkdir(residentUploadDirectory, { recursive: true });
      const extension = path.extname(residencyIdFile.originalname).toLowerCase() || ".bin";
      const fileName = `${crypto.randomUUID()}${extension}`;
      await fs.writeFile(path.join(residentUploadDirectory, fileName), residencyIdFile.buffer);
      residencyIdPath = `/uploads/residents/${fileName}`;
    }
    const user = await prisma.resident.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        middleName: input.middleName,
        age: input.age,
        gender: input.gender,
        birthDate: input.birthDate,
        nationality: input.nationality,
        email: input.email,
        phone: input.phone,
        address: input.address,
        barangay: input.barangay,
        municipality: input.municipality,
        province: input.province,
        passwordHash,
        role: input.role,
        privacyConsent: input.privacyConsent,
        privacyConsentAt: new Date(),
        residencyIdFile: residencyIdPath,
      },
      select: { id: true, firstName: true, lastName: true, email: true, role: true, isVerified: true, approvalStatus: true },
    });

    if (input.role === "STAFF" && governmentIdFile && appointmentProofFile) {
      const designationPosition = input.designationPosition;
      const governmentIdType = input.governmentIdType;
      const governmentIdNumber = input.governmentIdNumber;
      if (!designationPosition || !governmentIdType || !governmentIdNumber) {
        response.status(400).json({ error: "Official verification details are incomplete" });
        return;
      }
      await fs.mkdir(uploadDirectory, { recursive: true });
      const saveUpload = async (file: Express.Multer.File) => {
        const extension = path.extname(file.originalname).toLowerCase() || ".bin";
        const fileName = `${user.id}-${crypto.randomUUID()}${extension}`;
        await fs.writeFile(path.join(uploadDirectory, fileName), file.buffer);
        return `/uploads/officials/${fileName}`;
      };
      await prisma.barangayOfficial.create({
        data: {
          fullName: `${input.firstName} ${input.lastName}`,
          residentId: user.id,
          designationPosition,
          contactNumber: input.phone,
          userRole: "STAFF",
          proofOfAppointment: await saveUpload(appointmentProofFile),
          identityVerification: `${governmentIdType}: ${governmentIdNumber} | ${await saveUpload(governmentIdFile)}`,
        },
      });
    }

    response.status(201).json({ user, pendingApproval: true, message: "Your account is pending barangay approval. You cannot access the system yet." });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (request, response, next) => {
  try {
    const input = credentialsSchema.parse(request.body);
    const user = await prisma.resident.findUnique({ where: { email: input.email } });
    const passwordMatches = user ? await bcrypt.compare(input.password, user.passwordHash) : false;

    if (!user || !passwordMatches) {
      response.status(401).json({ error: "Invalid email or password" });
      return;
    }

    if (user.role !== "ADMIN" && user.approvalStatus !== "APPROVED") {
      response.status(403).json({ error: "Your account is pending approval and cannot access the system yet", approvalStatus: user.approvalStatus });
      return;
    }

    response.json({
      token: createToken(user.id, user.role),
      user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role, isVerified: user.isVerified, approvalStatus: user.approvalStatus },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, async (request: AuthRequest, response, next) => {
  try {
    const user = await prisma.resident.findUnique({
      where: { id: request.userId! },
      include: {
        reports: {
          orderBy: { dateSubmitted: "desc" },
          include: { category: true, media: true },
        },
      },
    });

    if (!user) {
      response.status(404).json({ error: "Resident account not found" });
      return;
    }

    response.json({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        middleName: user.middleName,
        email: user.email,
        phone: user.phone,
        age: user.age,
        gender: user.gender,
        birthDate: user.birthDate,
        nationality: user.nationality,
        address: user.address,
        barangay: user.barangay,
        municipality: user.municipality,
        province: user.province,
        role: user.role,
        isVerified: user.isVerified,
        approvalStatus: user.approvalStatus,
        privacyConsent: user.privacyConsent,
        privacyConsentAt: user.privacyConsentAt,
        reports: user.reports,
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as authRouter };
