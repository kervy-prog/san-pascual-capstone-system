import { Router } from "express";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { gps } from "exifr";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, type AuthRequest } from "../../middleware/require-auth.js";
import { isWithinSanPascualVicinity } from "./report-geofence.js";
import { geocodeBarangayCenter, geocodeReportedLandmark } from "../../lib/geocoder.js";
import { createSignedReportUploadUrl, isDirectUploadConfigured, readStoredUpload, sendStoredFile, storeUpload } from "../../lib/file-storage.js";

const router = Router();
const reportUploadDirectory = path.resolve(process.cwd(), "private-uploads", "reports");
const maxReportMediaBytes = 4 * 1024 * 1024;
const maxDirectUploadFileBytes = 10 * 1024 * 1024;
const maxDirectUploadReportBytes = 25 * 1024 * 1024;
const reportMimeExtensions: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};
const reportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxReportMediaBytes, files: 5 },
  fileFilter: (_request, file, callback) => callback(null, file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")),
});
const categoryNames: Record<string, string> = {
  roads: "Roads and traffic",
  drainage: "Drainage and flooding",
  water: "Water and sanitation",
  electricity: "Electricity and power",
  "public-facility": "Public facility",
  "residential-issues": "Residential Issues",
  other: "Other",
};

const createRequestSchema = z.object({
  categoryId: z.string().trim().min(1),
  urgencyLevel: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  exactLocationLandmark: z.string().trim().min(5).max(500),
  descriptionOfHazard: z.string().trim().min(10).max(5000),
  currentStatus: z.string().trim().min(2).max(50),
  residentId: z.string().cuid().optional(),
  dateSubmitted: z.string().optional(),
  submitAnonymously: z.preprocess((value) => value === true || value === "true", z.boolean()).optional(),
  locationLatitude: z.coerce.number().min(-90).max(90).optional(),
  locationLongitude: z.coerce.number().min(-180).max(180).optional(),
  uploadedMedia: z.array(z.object({
    storagePath: z.string().min(1).max(300),
    originalname: z.string().trim().min(1).max(255),
    mimetype: z.string().trim().min(1).max(120),
    size: z.number().int().positive().max(maxDirectUploadFileBytes),
  })).max(5).optional(),
});

router.get("/", async (_request, response, next) => {
  try {
    const requests = await prisma.infrastructureReport.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        resident: { select: { id: true, firstName: true, lastName: true, email: true } },
        category: true,
        media: true,
        actions: true,
      },
    });
    response.json(requests);
  } catch (error) {
    next(error);
  }
});

router.get("/:id/resolution-proof", requireAuth, async (request: AuthRequest, response, next) => {
  try {
    if (request.userRole !== "RESIDENT") {
      response.status(403).json({ error: "Resident access required" });
      return;
    }
    const report = await prisma.infrastructureReport.findFirst({
      where: { id: String(request.params.id), residentId: request.userId },
      select: {
        media: {
          where: { isResolutionProof: true },
          orderBy: { uploadedAt: "desc" },
          take: 1,
          select: { filePath: true },
        },
      },
    });
    const proof = report?.media[0];
    if (!proof) {
      response.status(404).json({ error: "No resolution proof is available for this report" });
      return;
    }
    const fileName = path.basename(proof.filePath);
    const found = await sendStoredFile(response, {
      localDirectory: reportUploadDirectory,
      storagePath: `reports/${fileName}`,
      fileName,
    });
    if (!found && !response.headersSent) response.status(404).json({ error: "Resolution proof image not found" });
  } catch (error) {
    next(error);
  }
});

router.post("/uploads/sign", requireAuth, async (request: AuthRequest, response, next) => {
  try {
    if (!request.userId) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    if (request.userRole !== "RESIDENT") {
      response.status(403).json({ error: "Resident access required" });
      return;
    }
    if (!isDirectUploadConfigured()) {
      response.status(503).json({ error: "Direct uploads are unavailable; cloud storage configuration is required for files over 4 MB." });
      return;
    }
    const input = z.object({
      fileName: z.string().trim().min(1).max(255),
      contentType: z.string().trim().refine((value) => Object.hasOwn(reportMimeExtensions, value), "Choose a supported photo or video format"),
      size: z.number().int().positive().max(maxDirectUploadFileBytes),
    }).parse(request.body);
    const extension = reportMimeExtensions[input.contentType];
    const fileName = `${request.userId}-upload-${crypto.randomUUID()}${extension}`;
    const storagePath = `reports/${fileName}`;
    const signedUpload = await createSignedReportUploadUrl(storagePath);
    response.status(201).json({ storagePath, ...signedUpload });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireAuth, reportUpload.array("media", 5), async (request: AuthRequest, response, next) => {
  try {
    const input = createRequestSchema.parse(request.body);
    if (!request.userId) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    const category = await prisma.infrastructureCategory.findFirst({
      where: {
        OR: [
          { id: input.categoryId },
          ...(categoryNames[input.categoryId] ? [{ name: categoryNames[input.categoryId] }] : []),
        ],
      },
    });
    if (!category) {
      response.status(400).json({ error: "Select a valid infrastructure report category." });
      return;
    }
    const allowedUrgencyLevels = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
    const urgencyLevel = input.urgencyLevel
      ?? (allowedUrgencyLevels.includes(category.urgencyLevel) ? category.urgencyLevel : "MEDIUM");
    const multipartFiles = (request.files as Express.Multer.File[] | undefined) || [];
    const uploadedMedia = input.uploadedMedia || [];
    if (multipartFiles.length > 0 && uploadedMedia.length > 0) {
      response.status(400).json({ error: "Use either direct uploads or multipart media, not both." });
      return;
    }
    const totalDirectUploadBytes = uploadedMedia.reduce((total, file) => total + file.size, 0);
    if (totalDirectUploadBytes > maxDirectUploadReportBytes) {
      response.status(413).json({ error: "Report media must total no more than 25 MB." });
      return;
    }
    if (multipartFiles.reduce((total, file) => total + file.size, 0) > maxReportMediaBytes) {
      response.status(413).json({ error: "Report photos and videos must total no more than 4 MB when direct cloud uploads are unavailable." });
      return;
    }
    const directFiles = await Promise.all(uploadedMedia.map(async (file) => {
      const expectedPrefix = `reports/${request.userId}-upload-`;
      if (!file.storagePath.startsWith(expectedPrefix) || file.storagePath.includes("..") || file.storagePath.includes("\\")) {
        throw new Error("Uploaded media reference is invalid");
      }
      const buffer = await readStoredUpload(file.storagePath);
      if (buffer.length !== file.size || buffer.length > maxDirectUploadFileBytes) {
        throw new Error("Uploaded media size did not match its signed upload request");
      }
      return { ...file, buffer };
    }));
    const files = [...multipartFiles, ...directFiles];
    const imageFiles = files.filter((file) => file.mimetype.startsWith("image/"));
    const geofenceSetting = await prisma.appSetting.findUnique({ where: { key: "enforceReportGeofence" } });
    const enforceReportGeofence = geofenceSetting?.value ?? true;
    let photoLocation: { latitude: number; longitude: number } | undefined;

    for (const file of imageFiles) {
      const metadata = await gps(file.buffer).catch(() => undefined);
      if (metadata && typeof metadata.latitude === "number" && typeof metadata.longitude === "number") {
        photoLocation = metadata;
        if (enforceReportGeofence && !isWithinSanPascualVicinity(metadata.latitude, metadata.longitude)) {
          response.status(422).json({ error: "Sorry, the uploaded image isn't part of our Barangay" });
          return;
        }
      }
    }

    let submittedLocation = photoLocation || (input.locationLatitude !== undefined && input.locationLongitude !== undefined
      ? { latitude: input.locationLatitude, longitude: input.locationLongitude }
      : undefined);
    let locationSource: "image-exif" | "device" | "landmark-geocode" | "landmark-geocode-approximate" | undefined = photoLocation
      ? "image-exif"
      : submittedLocation
        ? "device"
        : undefined;
    if (imageFiles.length > 0 && !submittedLocation) {
      submittedLocation = await geocodeReportedLandmark(input.exactLocationLandmark).catch(() => undefined);
      locationSource = submittedLocation ? "landmark-geocode" : undefined;
    }
    if (imageFiles.length > 0 && !submittedLocation) {
      submittedLocation = await geocodeBarangayCenter().catch(() => undefined);
      locationSource = submittedLocation ? "landmark-geocode-approximate" : undefined;
    }
    if (imageFiles.length > 0 && !submittedLocation) {
      response.status(422).json({ error: "A location pin is required for image reports. Allow device location or enable camera GPS metadata." });
      return;
    }
    if (enforceReportGeofence && submittedLocation && !isWithinSanPascualVicinity(submittedLocation.latitude, submittedLocation.longitude)) {
      response.status(422).json({ error: "Sorry, the uploaded image isn't part of our Barangay" });
      return;
    }

    const created = await prisma.infrastructureReport.create({
      data: {
        categoryId: category.id,
        urgencyLevel,
        exactLocationLandmark: input.exactLocationLandmark,
        descriptionOfHazard: input.descriptionOfHazard,
        currentStatus: input.currentStatus,
        residentId: request.userId!,
        submitAnonymously: input.submitAnonymously,
        dateSubmitted: input.dateSubmitted ? new Date(input.dateSubmitted) : undefined,
        ticketNumber: `SP-${Date.now().toString(36).toUpperCase()}`,
        locationLatitude: submittedLocation?.latitude,
        locationLongitude: submittedLocation?.longitude,
        locationSource,
      },
    });

    if (files.length > 0) {
      await prisma.reportMedia.createMany({
        data: await Promise.all(files.map(async (file) => {
          const directStoragePath = "storagePath" in file ? file.storagePath : undefined;
          const extension = path.extname(file.originalname).toLowerCase() || ".bin";
          const fileName = directStoragePath ? path.basename(directStoragePath) : `${created.id}-${crypto.randomUUID()}${extension}`;
          if (!directStoragePath) {
            await storeUpload({ localDirectory: reportUploadDirectory, storagePath: `reports/${fileName}`, fileName, buffer: file.buffer, contentType: file.mimetype });
          }
          return {
            reportId: created.id,
            filePath: `/private-uploads/reports/${fileName}`,
            mediaType: file.mimetype.startsWith("image/") ? "IMAGE" as const : "VIDEO" as const,
          };
        })),
      });
    }
    response.status(201).json({
      ...created,
      location: submittedLocation
        ? {
            latitude: submittedLocation.latitude,
            longitude: submittedLocation.longitude,
            source: locationSource,
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
});

export { router as requestRouter };
