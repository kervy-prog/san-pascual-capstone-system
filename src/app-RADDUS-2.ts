import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import { prisma } from "./lib/prisma.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { officialRouter } from "./modules/official/official.routes.js";
import { requestRouter } from "./modules/requests/request.routes.js";
import { errorHandler } from "./middleware/error-handler.js";

export const app = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "img-src": ["'self'", "data:", "blob:"],
        "media-src": ["'self'", "data:", "blob:"],
      },
    },
  })
);
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

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

const publicDir = path.resolve(process.cwd(), "public");
app.use(express.static(publicDir));

app.get("/", (_request, response) => {
  response.sendFile(path.join(publicDir, "index.html"));
});

app.use(errorHandler);
