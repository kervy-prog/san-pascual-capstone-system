import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1).default("file:./dev.db"),
  JWT_SECRET: z.string().min(16).default("development-jwt-secret-change-me"),
});

export const env = envSchema.parse(process.env);
