import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";

const router = Router();

const createRequestSchema = z.object({
  type: z.enum(["COMPLAINT", "SERVICE_REQUEST"]),
  category: z.string().trim().min(2).max(80),
  title: z.string().trim().min(5).max(160),
  description: z.string().trim().min(10).max(5000),
  address: z.string().trim().min(5).max(255),
  residentId: z.string().cuid(),
  priority: z.number().int().min(1).max(5).optional(),
});

router.get("/", async (_request, response, next) => {
  try {
    const requests = await prisma.serviceRequest.findMany({
      orderBy: { createdAt: "desc" },
      include: { resident: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    response.json(requests);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (request, response, next) => {
  try {
    const input = createRequestSchema.parse(request.body);
    const created = await prisma.serviceRequest.create({
      data: {
        ...input,
        referenceCode: `SP-${Date.now().toString(36).toUpperCase()}`,
      },
    });
    response.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

export { router as requestRouter };
