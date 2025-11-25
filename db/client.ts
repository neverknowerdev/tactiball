import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';
import * as fs from 'fs';
import * as schema from '../frontend/db/schema';

const DEFAULT_CONNECTION = 'postgres://postgres:postgres@localhost:5432/postgres';
const ENV_CONNECTION = process.env.DB_CONNECTION_STRING || process.env.DATABASE_URL || '';

type Database = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
    __dbPool?: Pool;
    __db?: Database;
};

function buildSslConfig(connectionString: string): PoolConfig['ssl'] {
    const isCustomConnection =
        (ENV_CONNECTION && ENV_CONNECTION !== DEFAULT_CONNECTION) ||
        (process.env.DB_CONNECTION_STRING && process.env.DB_CONNECTION_STRING !== DEFAULT_CONNECTION);

    if (isCustomConnection) {
        const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true';
        return { rejectUnauthorized };
    }

    const sslSetting = (process.env.DB_SSL || '').toLowerCase();
    if (sslSetting === 'disable' || sslSetting === 'false') {
        return undefined;
    }

    const isLocalhost =
        connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

    const rejectUnauthorizedEnv = process.env.DB_SSL_REJECT_UNAUTHORIZED;
    const certFromEnv = process.env.DB_SSL_CERT;
    const certPath = process.env.DB_SSL_CERT_PATH;

    if (certPath) {
        try {
            const ca = fs.readFileSync(certPath, 'utf8');
            const rejectUnauthorized = rejectUnauthorizedEnv ? rejectUnauthorizedEnv !== 'false' : true;
            return { ca, rejectUnauthorized };
        } catch (error) {
            console.warn(`⚠️  Failed to read DB SSL cert at ${certPath}:`, error);
        }
    }

    if (certFromEnv) {
        const rejectUnauthorized = rejectUnauthorizedEnv ? rejectUnauthorizedEnv !== 'false' : true;
        return { ca: certFromEnv, rejectUnauthorized };
    }

    if (!isLocalhost) {
        const rejectUnauthorized = rejectUnauthorizedEnv === 'true';
        return { rejectUnauthorized };
    }

    if (sslSetting === 'require' || connectionString.includes('sslmode=require')) {
        const rejectUnauthorized = rejectUnauthorizedEnv === 'true';
        return { rejectUnauthorized };
    }

    return undefined;
}

function createPool(): Pool {
    let connectionString = ENV_CONNECTION || DEFAULT_CONNECTION;
    connectionString = connectionString.replace(/[?&]sslmode=[^&]*/g, '');

    const sslConfig = buildSslConfig(connectionString);

    const poolConfig: PoolConfig = {
        connectionString,
        max: Number(process.env.DB_POOL_MAX || 10),
        idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT || 20000), // 20 seconds - close idle connections before DB terminates them
        connectionTimeoutMillis: Number(process.env.DB_POOL_CONNECTION_TIMEOUT || 10000), // 10 seconds
    };

    if (sslConfig !== undefined) {
        poolConfig.ssl = sslConfig;
    }

    return new Pool(poolConfig);
}

const pool = globalForDb.__dbPool ?? createPool();
if (!globalForDb.__dbPool) {
    globalForDb.__dbPool = pool;

    // Handle errors on idle clients - remove them from the pool
    pool.on('error', (err: any) => {
        // Log connection termination errors but don't crash
        if (err.code === 'XX000' || err.message?.includes('shutdown') || err.message?.includes('termination')) {
            console.warn('Database connection terminated (this is normal for managed databases):', err.message || err.code);
            // The pool will automatically remove the dead connection
            return;
        }
        // Log other errors
        console.error('Unexpected error on idle database client', err);
    });

    // Handle connect events to verify connections are healthy
    pool.on('connect', () => {
        // Connection established successfully
    });

    // Handle remove events when connections are removed from pool
    pool.on('remove', () => {
        // Connection removed from pool (normal cleanup)
    });
}

const db = globalForDb.__db ?? drizzle(pool, { schema });
if (!globalForDb.__db) {
    globalForDb.__db = db;
}

export { db, pool, schema };
export type { Database };

