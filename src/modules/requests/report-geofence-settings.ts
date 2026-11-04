import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { barangayCenter, barangayRadiusMeters, boundarySchema, type BoundaryPoint } from "./report-geofence.js";

const boundaryId = "san-pascual";

export class BoundaryConflictError extends Error {
  constructor() {
    super("The boundary was changed by another admin. Reload the saved boundary before editing again.");
  }
}

export async function getReportGeofenceSettings() {
  const [setting, saved] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: "enforceReportGeofence" } }),
    prisma.reportGeofence.findUnique({ where: { id: boundaryId } }),
  ]);
  return {
    enforceReportGeofence: setting?.value ?? true,
    boundary: saved ? boundarySchema.parse(saved.boundary) : null,
    revision: saved?.revision ?? 0,
    legacyVicinity: { center: barangayCenter, radiusMeters: barangayRadiusMeters },
  };
}

export async function saveReportBoundary(boundary: BoundaryPoint[], expectedRevision: number) {
  const points = boundarySchema.parse(boundary);
  if (expectedRevision === 0) {
    try {
      await prisma.reportGeofence.create({ data: { id: boundaryId, boundary: points } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new BoundaryConflictError();
      throw error;
    }
  } else {
    const updated = await prisma.reportGeofence.updateMany({
      where: { id: boundaryId, revision: expectedRevision },
      data: { boundary: points, revision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new BoundaryConflictError();
  }
  return { boundary: points, revision: expectedRevision + 1 };
}
