import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const sourceUrl = process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL;
const targetUrl = process.env.TARGET_DATABASE_URL;

if (!sourceUrl || !targetUrl) {
  throw new Error("Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL before running this script");
}

const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
const target = new PrismaClient({ datasources: { db: { url: targetUrl } } });

async function main() {
  const [residents, categories, reports, media, officials, actions] = await Promise.all([
    source.resident.findMany({ where: { role: { not: "ADMIN" } } }),
    source.infrastructureCategory.findMany(),
    source.infrastructureReport.findMany(),
    source.reportMedia.findMany(),
    source.barangayOfficial.findMany(),
    source.barangayAction.findMany(),
  ]);

  for (const resident of residents) {
    await target.resident.upsert({
      where: { id: resident.id },
      update: resident,
      create: resident,
    });
  }

  for (const category of categories) {
    await target.infrastructureCategory.upsert({
      where: { id: category.id },
      update: category,
      create: category,
    });
  }

  for (const official of officials) {
    await target.barangayOfficial.upsert({
      where: { id: official.id },
      update: official,
      create: official,
    });
  }

  for (const report of reports) {
    await target.infrastructureReport.upsert({
      where: { id: report.id },
      update: report,
      create: report,
    });
  }

  for (const item of media) {
    await target.reportMedia.upsert({
      where: { id: item.id },
      update: item,
      create: item,
    });
  }

  for (const action of actions) {
    await target.barangayAction.upsert({
      where: { id: action.id },
      update: action,
      create: action,
    });
  }

  console.log(`Migrated ${residents.length} residents, ${categories.length} categories, ${officials.length} officials, ${reports.length} reports, ${media.length} media files, and ${actions.length} actions.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await source.$disconnect();
    await target.$disconnect();
  });