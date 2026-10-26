import { PrismaClient } from "@prisma/client";

const MAX_ATTEMPTS = 3;
const READ_OPERATIONS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany",
  "count", "aggregate", "groupBy", "$queryRaw", "$queryRawUnsafe",
]);
// Errors raised before the query reaches the database, so any operation can be retried safely.
const CONNECTION_ACQUIRE_CODES = new Set(["P1001", "P1002", "P2024"]);
const CONNECTION_ACQUIRE_MESSAGE = /max client connections|too many (clients|connections)|remaining connection slots|can't reach database server|timed out fetching a new connection/i;
// Errors that may happen mid-query, so only reads are retried.
const CONNECTION_LOST_CODES = new Set(["P1008", "P1017"]);
const CONNECTION_LOST_MESSAGE = /server has closed the connection|connection (reset|terminated|closed)|ECONNRESET/i;

function errorCode(error: unknown) {
  const candidate = error as { code?: unknown; errorCode?: unknown };
  return String(candidate?.code ?? candidate?.errorCode ?? "");
}

export function isDatabaseConnectionError(error: unknown) {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : "";
  return CONNECTION_ACQUIRE_CODES.has(code) || CONNECTION_LOST_CODES.has(code)
    || CONNECTION_ACQUIRE_MESSAGE.test(message) || CONNECTION_LOST_MESSAGE.test(message);
}

function isRetryable(error: unknown, operation: string) {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : "";
  if (CONNECTION_ACQUIRE_CODES.has(code) || CONNECTION_ACQUIRE_MESSAGE.test(message)) return true;
  return READ_OPERATIONS.has(operation) && (CONNECTION_LOST_CODES.has(code) || CONNECTION_LOST_MESSAGE.test(message));
}

// Serverless instances each open their own pool, so keep it to one connection per instance
// to avoid exhausting the database's connection limit under concurrent requests.
function serverlessDatabaseUrl() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl || !process.env.VERCEL) return undefined;
  try {
    const url = new URL(rawUrl);
    if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "1");
    if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "20");
    if (url.port === "6543" && !url.searchParams.has("pgbouncer")) url.searchParams.set("pgbouncer", "true");
    return url.toString();
  } catch {
    return undefined;
  }
}

const datasourceUrl = serverlessDatabaseUrl();
const baseClient = new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined);

export const prisma = baseClient.$extends({
  query: {
    async $allOperations({ operation, args, query }) {
      for (let attempt = 1; ; attempt += 1) {
        try {
          return await query(args);
        } catch (error) {
          if (attempt >= MAX_ATTEMPTS || !isRetryable(error, operation)) throw error;
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt + Math.random() * 250));
        }
      }
    },
  },
});
