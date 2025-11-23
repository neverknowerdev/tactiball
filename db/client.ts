// Server-only: This module uses Node.js built-in modules (tls, net, etc.)
// and should only be imported in API routes or server components
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';
import * as fs from 'fs';
import * as schema from './schema';

const DEFAULT_CONNECTION = 'postgres://postgres:postgres@localhost:5432/postgres';

type Database = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
    __dbPool?: Pool;
    __db?: Database;
};

function buildSslConfig(connectionString: string): PoolConfig['ssl'] {
    // If DB_CONNECTION_STRING is explicitly set, it's a remote connection - always use SSL with rejectUnauthorized: false
    // This directly fixes Supabase and other remote PostgreSQL SSL certificate errors
    if (process.env.DB_CONNECTION_STRING && process.env.DB_CONNECTION_STRING !== DEFAULT_CONNECTION) {
        // Allow explicit override, but default to false to fix certificate errors
        const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' ? true : false;
        return { rejectUnauthorized };
    }

    const sslSetting = (process.env.DB_SSL || '').toLowerCase();
    if (sslSetting === 'disable' || sslSetting === 'false') {
        return undefined;
    }

    // Check if this is a localhost connection
    const isLocalhost = connectionString.includes('localhost') ||
        connectionString.includes('127.0.0.1');

    const rejectUnauthorizedEnv = process.env.DB_SSL_REJECT_UNAUTHORIZED;
    const certFromEnv = process.env.DB_SSL_CERT;
    const certPath = process.env.DB_SSL_CERT_PATH;

    // Handle certificate-based SSL first (if provided)
    if (certPath) {
        try {
            const ca = fs.readFileSync(certPath, 'utf8');
            const rejectUnauthorized = rejectUnauthorizedEnv
                ? rejectUnauthorizedEnv !== 'false'
                : true;
            return { ca, rejectUnauthorized };
        } catch (error) {
            console.warn(`⚠️  Failed to read DB SSL cert at ${certPath}:`, error);
        }
    }

    if (certFromEnv) {
        const rejectUnauthorized = rejectUnauthorizedEnv
            ? rejectUnauthorizedEnv !== 'false'
            : true;
        return { ca: certFromEnv, rejectUnauthorized };
    }

    // For any non-localhost connection, enable SSL with rejectUnauthorized: false
    if (!isLocalhost) {
        const rejectUnauthorized = rejectUnauthorizedEnv === 'true' ? true : false;
        return { rejectUnauthorized };
    }

    // For localhost, only enable SSL if explicitly required
    if (sslSetting === 'require' || connectionString.includes('sslmode=require')) {
        const rejectUnauthorized = rejectUnauthorizedEnv === 'true' ? true : false;
        return { rejectUnauthorized };
    }

    return undefined;
}

function createPool(): Pool {
    let connectionString = process.env.DB_CONNECTION_STRING || DEFAULT_CONNECTION;

    // Remove sslmode from connection string if present - we'll handle SSL via Pool config
    connectionString = connectionString.replace(/[?&]sslmode=[^&]*/g, '');

    const sslConfig = buildSslConfig(connectionString);
    const schemaName = process.env.DB_SCHEMA || 'tactiball';

    // Validate schema name to prevent SQL injection (only alphanumeric and underscore)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
        throw new Error(`Invalid schema name: ${schemaName}. Schema names must start with a letter or underscore and contain only alphanumeric characters and underscores.`);
    }

    // Add search_path to connection string via options parameter
    // This is more reliable than using the connect event
    const separator = connectionString.includes('?') ? '&' : '?';
    connectionString = `${connectionString}${separator}options=-csearch_path%3D${encodeURIComponent(schemaName)}`;

    const poolConfig: PoolConfig = {
        connectionString,
        max: Number(process.env.DB_POOL_MAX || 10),
    };

    // Always set SSL config if we have one
    if (sslConfig !== undefined) {
        poolConfig.ssl = sslConfig;
    }

    return new Pool(poolConfig);
}

// Cache the pool globally to avoid creating multiple pools
// This prevents connection termination issues when the module is imported multiple times
const pool = globalForDb.__dbPool ?? createPool();
if (!globalForDb.__dbPool) {
    globalForDb.__dbPool = pool;

    // Handle pool errors gracefully
    pool.on('error', (err) => {
        console.error('Unexpected error on idle database client', err);
    });
}

const db = globalForDb.__db ?? drizzle(pool, { schema });
if (!globalForDb.__db) {
    globalForDb.__db = db;
}

export { db, pool, schema };
export type { Database };

