import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { prisma } from "./lib/prisma.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { requestRouter } from "./modules/requests/request.routes.js";
import { errorHandler } from "./middleware/error-handler.js";

export const app = express();
const publicDirectory = path.resolve(process.cwd(), "public");

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDirectory));

app.get("/health", (_request, response) => {
  response.json({ status: "ok", service: "san-pascual-infrastructure-api" });
});

app.get("/health/db", async (_request, response, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    response.json({ status: "ok", database: "reachable" });
  } catch (error) {
    next(error);
  }
});

app.use("/api/requests", requestRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.get("/{*splat}", (_request, response) => {
  response.sendFile(path.join(publicDirectory, "index.html"));
});
app.use(errorHandler);
