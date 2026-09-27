import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { requestRouter } from "./modules/requests/request.routes-RADDUS.js";
import { officialRouter } from "./modules/official/official.routes.js";
import { errorHandler } from "./middleware/error-handler.js";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN || true }));
app.use(express.json({ limit: "1mb" }));

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
app.use("/api/official", officialRouter);
app.use(errorHandler);
