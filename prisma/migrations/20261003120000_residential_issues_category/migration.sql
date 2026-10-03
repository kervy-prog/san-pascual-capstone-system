INSERT INTO "InfrastructureCategory" ("id", "name", "description", "urgencyLevel", "createdAt", "updatedAt")
VALUES (
  'residential-issues-category',
  'Residential Issues',
  'Hazards and infrastructure concerns affecting residential areas',
  'MEDIUM',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;