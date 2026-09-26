import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { geocodeReportedLandmark } from "../src/lib/geocoder.js";
import { isWithinSanPascualVicinity } from "../src/modules/requests/report-geofence.js";

async function main() {
  const reports = await prisma.infrastructureReport.findMany({
    where: {
      media: { some: { mediaType: "IMAGE" } },
      OR: [{ locationLatitude: null }, { locationLongitude: null }],
    },
    select: { id: true, ticketNumber: true, exactLocationLandmark: true },
  });

  let updated = 0;
  for (const report of reports) {
    const location = await geocodeReportedLandmark(report.exactLocationLandmark).catch(() => undefined);
    if (!location || !isWithinSanPascualVicinity(location.latitude, location.longitude)) {
      console.warn(`Could not resolve a San Pascual location for ${report.ticketNumber}`);
      continue;
    }
    await prisma.infrastructureReport.update({
      where: { id: report.id },
      data: { locationLatitude: location.latitude, locationLongitude: location.longitude },
    });
    updated += 1;
    console.log(`Pinned ${report.ticketNumber} at ${location.latitude}, ${location.longitude}`);
  }

  console.log(`Updated ${updated} of ${reports.length} image reports.`);
}

main().finally(() => prisma.$disconnect());
