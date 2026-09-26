import { prisma } from "../src/lib/prisma.js";

const categories = [
  { name: "Roads and traffic", description: "Road damage, traffic signs, and access concerns", urgencyLevel: "MEDIUM" },
  { name: "Drainage and flooding", description: "Blocked drainage, flooding, and water flow concerns", urgencyLevel: "HIGH" },
  { name: "Water and sanitation", description: "Water supply, sanitation, and wastewater concerns", urgencyLevel: "HIGH" },
  { name: "Electricity and power", description: "Electrical lines, lighting, and power infrastructure concerns", urgencyLevel: "HIGH" },
  { name: "Public facility", description: "Barangay buildings and shared public facilities", urgencyLevel: "MEDIUM" },
  { name: "Other", description: "Other infrastructure concerns", urgencyLevel: "MEDIUM" },
];

(async () => {
  for (const category of categories) {
    await prisma.infrastructureCategory.upsert({
      where: { name: category.name },
      update: category,
      create: category,
    });
  }

  console.log(`Seeded ${categories.length} infrastructure categories.`);
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});