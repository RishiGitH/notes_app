import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// Pooled client for runtime (Next.js Server Actions / RSC).
// Reads DATABASE_URL (pooler, port 6543).
let pooledClient: ReturnType<typeof postgres> | null = null;
let pooledDb: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!pooledDb) {
    pooledClient = postgres(url, { prepare: false });
    pooledDb = drizzle(pooledClient);
  }
  return pooledDb;
}

// Direct client for migrations only. Reads DIRECT_URL (port 5432).
// Never import this from runtime code paths — use getDb() instead.
export function getDirectDb() {
  const url = process.env.DIRECT_URL;
  if (!url) {
    throw new Error("DIRECT_URL is not set");
  }
  const client = postgres(url, { max: 1 });
  return drizzle(client);
}
