import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAdmin } from "../../middleware/require-admin.js";

const router = Router();
router.use(requireAdmin);

const approvalSchema = z.object({ status: z.enum(["APPROVED", "REJECTED"]) });

router.get("/overview", async (_request, response, next) => {
  try {
    const [residents, officials, reports, pendingResidents, pendingOfficials] = await Promise.all([
      prisma.resident.count({ where: { role: "RESIDENT" } }),
      prisma.resident.count({ where: { role: "STAFF" } }),
      prisma.infrastructureReport.count(),
      prisma.resident.findMany({
        where: { role: "RESIDENT", approvalStatus: "PENDING" },
        select: { id: true, firstName: true, lastName: true, middleName: true, email: true, phone: true, address: true, barangay: true, municipality: true, province: true, nationality: true, privacyConsentAt: true, createdAt: true, approvalStatus: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.resident.findMany({
        where: { role: "STAFF", approvalStatus: "PENDING" },
        select: { id: true, firstName: true, lastName: true, middleName: true, email: true, phone: true, address: true, barangay: true, municipality: true, province: true, privacyConsentAt: true, createdAt: true, approvalStatus: true, officialProfile: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    response.json({ counts: { residents, officials, reports, pending: pendingResidents.length + pendingOfficials.length }, pendingResidents, pendingOfficials });
  } catch (error) {
    next(error);
  }
});

router.get("/reports", async (_request, response, next) => {
  try {
    const reports = await prisma.infrastructureReport.findMany({
      orderBy: { dateSubmitted: "desc" },
      include: { resident: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } }, category: true, media: true, actions: true },
    });
    response.json(reports);
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
