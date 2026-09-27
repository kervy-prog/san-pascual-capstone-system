import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAdmin } from "../../middleware/require-admin.js";

const router = Router();
router.use(requireAdmin);

const approvalSchema = z.object({ status: z.enum(["APPROVED", "REJECTED"]) });
const officialStatusSchema = z.object({ status: z.enum(["ACTIVE", "RETIRED", "NOT_ON_DUTY"]) });
const reportApprovalSchema = z.object({ status: z.enum(["SUBMITTED", "UNDER_REVIEW", "IN_PROGRESS", "RESOLVED", "REJECTED", "CANCELLED"]) });
const reportAssignmentSchema = z.object({ officialId: z.string().cuid().nullable() });

router.get("/overview", async (_request, response, next) => {
  try {
    const [residents, officials, reports, reportStatusGroups, pendingResidents, pendingOfficials] = await Promise.all([
      prisma.resident.count({ where: { role: "RESIDENT" } }),
      prisma.resident.count({ where: { role: "STAFF", approvalStatus: "APPROVED" } }),
      prisma.infrastructureReport.count(),
      prisma.infrastructureReport.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.resident.findMany({
        where: { role: "RESIDENT", approvalStatus: "PENDING" },
        select: { id: true, firstName: true, lastName: true, middleName: true, email: true, phone: true, address: true, barangay: true, municipality: true, province: true, nationality: true, residencyIdFile: true, privacyConsentAt: true, createdAt: true, approvalStatus: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.resident.findMany({
        where: { role: "STAFF", approvalStatus: "PENDING" },
        select: { id: true, firstName: true, lastName: true, middleName: true, email: true, phone: true, address: true, barangay: true, municipality: true, province: true, privacyConsentAt: true, createdAt: true, approvalStatus: true, officialProfile: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const reportProgress = reportStatusGroups.reduce((progress, group) => {
      const count = group._count._all;
      if (group.status === "RESOLVED") progress.done += count;
      else if (group.status === "IN_PROGRESS") progress.ongoing += count;
      else progress.unfinished += count;
      return progress;
    }, { done: 0, ongoing: 0, unfinished: 0 });
    response.json({ counts: { residents, officials, reports, pending: pendingResidents.length + pendingOfficials.length }, reportProgress, pendingResidents, pendingOfficials });
  } catch (error) {
    next(error);
  }
});

router.get("/residents", async (_request, response, next) => {
  try {
    const residents = await prisma.resident.findMany({
      where: { role: "RESIDENT", approvalStatus: "APPROVED" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        email: true,
        phone: true,
        age: true,
        gender: true,
        birthDate: true,
        nationality: true,
        address: true,
        barangay: true,
        municipality: true,
        province: true,
        isVerified: true,
        privacyConsent: true,
        privacyConsentAt: true,
        createdAt: true,
        updatedAt: true,
        approvalStatus: true,
      },
      orderBy: { createdAt: "desc" },
    });
    response.json(residents);
  } catch (error) {
    next(error);
  }
});

router.get("/officials", async (_request, response, next) => {
  try {
    const officials = await prisma.barangayOfficial.findMany({
      where: { resident: { role: "STAFF", approvalStatus: "APPROVED" } },
      include: {
        resident: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            email: true,
            phone: true,
            address: true,
            barangay: true,
            municipality: true,
            province: true,
            approvalStatus: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    response.json(officials);
  } catch (error) {
    next(error);
  }
});

router.get("/reports", async (_request, response, next) => {
  try {
    const reports = await prisma.infrastructureReport.findMany({
      orderBy: { dateSubmitted: "desc" },
      include: { resident: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } }, category: true, media: true, actions: true, assignedOfficial: { include: { resident: { select: { firstName: true, lastName: true } } } } },
    });
    response.json(reports);
  } catch (error) {
    next(error);
  }
});

router.get("/reports/media/:fileName", (request, response) => {
  const fileName = path.basename(request.params.fileName);
  const filePath = path.resolve(process.cwd(), "private-uploads", "reports", fileName);
  if (!fs.existsSync(filePath)) {
    response.status(404).json({ error: "Report media not found" });
    return;
  }
  response.sendFile(filePath);
});

router.get("/officials/documents/:fileName", (request, response) => {
  const fileName = path.basename(request.params.fileName);
  const filePath = path.resolve(process.cwd(), "private-uploads", "officials", fileName);
  if (!fs.existsSync(filePath)) {
    response.status(404).json({ error: "Document not found" });
    return;
  }
  response.sendFile(filePath);
});

router.get("/residents/documents/:fileName", (request, response) => {
  const fileName = path.basename(request.params.fileName);
  const filePath = path.resolve(process.cwd(), "private-uploads", "residents", fileName);
  if (!fs.existsSync(filePath)) {
    response.status(404).json({ error: "Resident document not found" });
    return;
  }
  response.sendFile(filePath);
});

router.patch("/reports/:id/status", async (request, response, next) => {
  try {
    const { status } = reportApprovalSchema.parse(request.body);
    const report = await prisma.infrastructureReport.update({
      where: { id: request.params.id },
      data: { status, currentStatus: status },
      select: { id: true, reportId: true, ticketNumber: true, status: true, currentStatus: true },
    });
    response.json(report);
  } catch (error) {
    next(error);
  }
});

router.patch("/reports/:id/assignment", async (request, response, next) => {
  try {
    const { officialId } = reportAssignmentSchema.parse(request.body);
    if (officialId) {
      const official = await prisma.barangayOfficial.findFirst({
        where: { id: officialId, resident: { role: "STAFF", approvalStatus: "APPROVED" } },
        select: { id: true },
      });
      if (!official) {
        response.status(400).json({ error: "Select an approved Barangay official" });
        return;
      }
    }
    const report = await prisma.infrastructureReport.update({
      where: { id: request.params.id },
      data: { assignedOfficialId: officialId },
      select: { id: true, ticketNumber: true, assignedOfficial: { include: { resident: { select: { firstName: true, lastName: true } } } } },
    });
    response.json(report);
  } catch (error) {
    next(error);
  }
});

router.patch("/officials/:id/status", async (request, response, next) => {
  try {
    const { status } = officialStatusSchema.parse(request.body);
    const official = await prisma.barangayOfficial.update({
      where: { id: request.params.id },
      data: { status },
      select: { id: true, status: true, resident: { select: { firstName: true, lastName: true } } },
    });
    response.json(official);
  } catch (error) {
    next(error);
  }
});

router.delete("/accounts/:id", async (request, response, next) => {
  try {
    const account = await prisma.resident.findUnique({
      where: { id: request.params.id },
      select: { id: true, role: true, officialProfile: { select: { id: true } } },
    });
    if (!account) {
      response.status(404).json({ error: "Account not found" });
      return;
    }
    if (account.role === "ADMIN") {
      response.status(400).json({ error: "Admin accounts cannot be removed from this dashboard" });
      return;
    }

    await prisma.$transaction(async (transaction) => {
      if (account.officialProfile) {
        await transaction.barangayAction.deleteMany({ where: { officialId: account.officialProfile.id } });
        await transaction.barangayOfficial.delete({ where: { id: account.officialProfile.id } });
      }
      const reports = await transaction.infrastructureReport.findMany({ where: { residentId: account.id }, select: { id: true } });
      if (reports.length > 0) {
        const reportIds = reports.map((report) => report.id);
        await transaction.reportMedia.deleteMany({ where: { reportId: { in: reportIds } } });
        await transaction.barangayAction.deleteMany({ where: { reportId: { in: reportIds } } });
        await transaction.infrastructureReport.deleteMany({ where: { id: { in: reportIds } } });
      }
      await transaction.serviceRequest.deleteMany({ where: { residentId: account.id } });
      await transaction.resident.delete({ where: { id: account.id } });
    });
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.patch("/accounts/:id/approval", async (request, response, next) => {
  try {
    const { status } = approvalSchema.parse(request.body);
    const account = await prisma.resident.update({ where: { id: request.params.id }, data: { approvalStatus: status, isVerified: status === "APPROVED" }, select: { id: true, firstName: true, lastName: true, role: true, approvalStatus: true, isVerified: true } });
    response.json(account);
  } catch (error) {
    next(error);
  }
});

export { router as adminRouter };
