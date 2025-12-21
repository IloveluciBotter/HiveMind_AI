import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { env } from "./env";

const { Pool } = pg;

let _pool: pg.Pool | null = null;
let _db: NodePgDatabase<typeof schema> | null = null;

/**
 * Get database connection (lazy initialization)
 * In test mode without DATABASE_URL, throws when actually used
 */
function getPool(): pg.Pool {
  if (_pool) {
    return _pool;
  }

  // DATABASE_URL is validated in env.ts, but we check here for test mode edge cases
  if (!env.DATABASE_URL) {
    // In test mode, allow missing DATABASE_URL but throw when actually used
    if (env.NODE_ENV === "test") {
      throw new Error(
        "Database not configured for tests. Set DATABASE_URL or skip DB-dependent tests."
      );
    }
    // This should never happen as env.ts validates DATABASE_URL
    throw new Error("DATABASE_URL environment variable is required");
  }

  _pool = new Pool({
    connectionString: env.DATABASE_URL,
  });

  return _pool;
}

/**
 * Get database instance (lazy initialization)
 */
export function getDb(): NodePgDatabase<typeof schema> {
  if (_db) {
    return _db;
  }

  const pool = getPool();
  _db = drizzle(pool, { schema });
  return _db;
}

/**
 * Export db for backward compatibility
 * In test mode without DATABASE_URL, this will throw when accessed
 */
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop) {
    return getDb()[prop as keyof NodePgDatabase<typeof schema>];
  },
});

export async function closeDb() {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}

/**
 * Check if database is configured
 */
export function isDbConfigured(): boolean {
  return !!env.DATABASE_URL;
}

