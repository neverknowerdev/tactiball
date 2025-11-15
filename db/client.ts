import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const DEFAULT_CONNECTION = 'postgres://postgres:postgres@localhost:5432/postgres';

type Database = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
    __dbPool?: Pool;
    __db?: Database;
};

function createPool(): Pool {
    const connectionString = process.env.DB_CONNECTION_STRING || DEFAULT_CONNECTION;
    return new Pool({
        connectionString,
        max: Number(process.env.DB_POOL_MAX || 10)
    });
}

const pool = globalForDb.__dbPool ?? createPool();
if (process.env.NODE_ENV !== 'production') {
    globalForDb.__dbPool = pool;
}

const db = globalForDb.__db ?? drizzle(pool, { schema });
if (process.env.NODE_ENV !== 'production') {
    globalForDb.__db = db;
}

export { db, pool, schema };
export type { Database };

