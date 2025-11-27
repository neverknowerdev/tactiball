import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const DEFAULT_CONNECTION = 'postgres://postgres:postgres@localhost:5432/postgres';
const ENV_CONNECTION = process.env.DB_CONNECTION_STRING || process.env.DATABASE_URL || '';

const pool = new Pool({
    connectionString: ENV_CONNECTION || DEFAULT_CONNECTION,
});

const db = drizzle({ client: pool, schema });

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export { db, pool, schema };