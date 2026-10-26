import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

function timestamp(value: Date | null | undefined) {
  return value ? value.getTime() : 0;
}

// A cheap fingerprint of report activity: it changes whenever a report is added, removed,
// updated (status, assignment, resolution) or receives a new action, photo, or media file.
export async function getReportActivityVersion(where: Prisma.InfrastructureReportWhereInput) {
  const [reports, actions, media] = await Promise.all([
    prisma.infrastructureReport.aggregate({ where, _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.barangayAction.aggregate({ where: { report: where }, _count: { _all: true }, _max: { actionDate: true } }),
    prisma.reportMedia.aggregate({ where: { report: where }, _count: { _all: true }, _max: { uploadedAt: true } }),
  ]);

  return [
    reports._count._all, timestamp(reports._max.updatedAt),
    actions._count._all, timestamp(actions._max.actionDate),
    media._count._all, timestamp(media._max.uploadedAt),
  ].join(".");
}

export async function getAdminActivityVersion() {
  const [reportVersion, accounts, officials] = await Promise.all([
    getReportActivityVersion({}),
    prisma.resident.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.barangayOfficial.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
  ]);

  return [
    reportVersion,
    accounts._count._all, timestamp(accounts._max.updatedAt),
    officials._count._all, timestamp(officials._max.updatedAt),
  ].join(".");
}
