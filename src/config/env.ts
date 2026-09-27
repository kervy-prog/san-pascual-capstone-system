import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16).default("development-jwt-secret-change-me"),
  CORS_ORIGIN: z.string().url().optional(),
  SEMAPHORE_API_KEY: z.string().min(1).optional(),
  SEMAPHORE_SENDER_NAME: z.string().min(1).max(11).default("SANPASCUAL"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("private-uploads"),
});

export const env = envSchema.parse(process.env);
