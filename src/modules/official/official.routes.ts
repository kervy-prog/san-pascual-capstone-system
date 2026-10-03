import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, type AuthRequest } from "../../middleware/require-auth.js";
import { sendResidentProgressSms } from "../../lib/semaphore.js";
import { sendStoredFile } from "../../lib/file-storage.js";
import { compressResolvedReportImages } from "../../lib/report-image-optimization.js";

const router = Router();
router.use(requireAuth);

function requireOfficial(request: AuthRequest, response: import("express").Response, next: import("express").NextFunction) {
  if (request.userRole !== "STAFF") {
    response.status(403).json({ error: "Barangay official access required" });
    return;
  }
  next();
}

router.use(requireOfficial);

const reportStatusSchema = z.object({
  status: z.enum(["SUBMITTED", "UNDER_REVIEW", "IN_PROGRESS", "RESOLVED", "REJECTED", "CANCELLED"]),
  notes: z.string().trim().max(1000).optional(),
});
const reportFeedbackSchema = z.object({ notes: z.string().trim().min(5).max(1000) });

router.get("/overview", async (request: AuthRequest, response, next) => {
  try {
    const official = await prisma.resident.findUnique({
      where: { id: request.userId },
      include: { officialProfile: true },
    });

    if (!official?.officialProfile) {
      response.status(404).json({ error: "Official profile not found" });
      return;
    }

    const [reportCount, submittedCount, inProgressCount, resolvedCount, reports] = await Promise.all([
      prisma.infrastructureReport.count({ where: { assignedOfficialId: official.officialProfile.id } }),
      prisma.infrastructureReport.count({ where: { assignedOfficialId: official.officialProfile.id, status: "UNDER_REVIEW" } }),
      prisma.infrastructureReport.count({ where: { assignedOfficialId: official.officialProfile.id, status: "IN_PROGRESS" } }),
      prisma.infrastructureReport.count({ where: { assignedOfficialId: official.officialProfile.id, status: "RESOLVED" } }),
      prisma.infrastructureReport.findMany({
        where: { assignedOfficialId: official.officialProfile.id, status: { not: "SUBMITTED" } },
        orderBy: { dateSubmitted: "desc" },
        include: {
          resident: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          category: true,
          media: true,
          actions: true,
          assignedOfficial: { include: { resident: { select: { firstName: true, lastName: true } } } },
        },
      }),
    ]);

    response.json({
      official: {
        id: official.id,
        firstName: official.firstName,
        lastName: official.lastName,
        middleName: official.middleName,
        email: official.email,
        phone: official.phone,
        address: official.address,
        barangay: official.barangay,
        municipality: official.municipality,
        province: official.province,
        role: official.role,
        approvalStatus: official.approvalStatus,
        isVerified: official.isVerified,
        officialProfile: official.officialProfile,
      },
      counts: { reports: reportCount, submitted: submittedCount, inProgress: inProgressCount, resolved: resolvedCount },
      reports,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/reports/media/:fileName", (request, response) => {
  const fileName = path.basename(request.params.fileName);
  void sendStoredFile(response, { localDirectory: path.resolve(process.cwd(), "private-uploads", "reports"), storagePath: `reports/${fileName}`, fileName }).then((found) => {
    if (!found && !response.headersSent) response.status(404).json({ error: "Report media not found" });
  });
});

router.post("/reports/:id/feedback", async (request: AuthRequest, response, next) => {
  try {
    const { notes } = reportFeedbackSchema.parse(request.body);
    const official = await prisma.barangayOfficial.findFirst({
      where: { residentId: request.userId },
      select: { id: true },
    });
    if (!official) {
      response.status(404).json({ error: "Official profile not found" });
      return;
    }

    const report = await prisma.infrastructureReport.findFirst({
      where: { id: String(request.params.id), assignedOfficialId: official.id },
      select: { id: true },
    });
    if (!report) {
      response.status(404).json({ error: "This report is not assigned to you" });
      return;
    }

    const feedback = await prisma.barangayAction.create({
      data: {
        officialId: official.id,
        reportId: report.id,
        actionStatus: "FIELD_FEEDBACK",
        actionRemarks: notes,
      },
      select: { id: true, actionRemarks: true, actionDate: true },
    });
    response.status(201).json(feedback);
  } catch (error) {
    next(error);
  }
});

router.patch("/reports/:id/status", async (request: AuthRequest, response, next) => {
  try {
    const { status, notes } = reportStatusSchema.parse(request.body);
    const official = await prisma.barangayOfficial.findFirst({
      where: { residentId: request.userId },
      select: { id: true },
    });
    if (!official) {
      response.status(404).json({ error: "Official profile not found" });
      return;
    }

    const report = await prisma.$transaction(async (tx) => {
      const reportId = String(request.params.id);
      const assignedReport = await tx.infrastructureReport.findFirst({
        where: { id: reportId, assignedOfficialId: official.id },
        select: {
          id: true,
          ticketNumber: true,
          status: true,
          resident: { select: { firstName: true, phone: true } },
          media: { where: { mediaType: "IMAGE" }, select: { filePath: true, mediaType: true } },
        },
      });
      if (!assignedReport) {
        throw new Error("This report is not assigned to you");
      }
      const updated = await tx.infrastructureReport.update({
        where: { id: assignedReport.id },
        data: { status, currentStatus: status },
        select: { id: true, reportId: true, ticketNumber: true, status: true, currentStatus: true },
      });

      await tx.barangayAction.create({
        data: {
          officialId: official.id,
          reportId: updated.id,
          actionStatus: `STATUS_CHANGE_TO_${status}`,
          actionRemarks: notes || `Status changed to ${status}`,
        },
      });

      return { ...updated, previousStatus: assignedReport.status, resident: assignedReport.resident, media: assignedReport.media };
    });

    const imageOptimization = status === "RESOLVED" && report.previousStatus !== "RESOLVED"
      ? await compressResolvedReportImages(report.media)
      : undefined;

    if (status === "IN_PROGRESS") {
      void sendResidentProgressSms(report.resident.phone, report.ticketNumber).catch((error: unknown) => {
        console.error("Unable to send resident progress SMS:", error);
      });
    }

    response.json({
      id: report.id,
      reportId: report.reportId,
      ticketNumber: report.ticketNumber,
      status: report.status,
      currentStatus: report.currentStatus,
      smsNotification: status === "IN_PROGRESS" ? "queued" : "not_applicable",
      imageOptimization,
    });
  } catch (error) {
    next(error);
  }
});

export { router as officialRouter };