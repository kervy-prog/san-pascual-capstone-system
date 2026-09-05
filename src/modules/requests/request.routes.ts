import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

const router = Router();

const createRequestSchema = z.object({
  categoryId: z.string().cuid(),
  exactLocationLandmark: z.string().trim().min(5).max(500),
  descriptionOfHazard: z.string().trim().min(10).max(5000),
  currentStatus: z.string().trim().min(2).max(50),
  residentId: z.string().cuid(),
  submitAnonymously: z.boolean().optional(),
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

router.post("/", async (request, response, next) => {
  try {
    const input = createRequestSchema.parse(request.body);
    const created = await prisma.infrastructureReport.create({
      data: {
        ...input,
        ticketNumber: `SP-${Date.now().toString(36).toUpperCase()}`,
      },
    });
    response.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

export { router as requestRouter };
