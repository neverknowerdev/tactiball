// Minimal pool client for root scripts that only need the database pool
import { Pool, PoolConfig } from 'pg';
import * as fs from 'fs';

const DEFAULT_CONNECTION = 'postgres://postgres:postgres@localhost:5432/postgres';

function buildSslConfig(connectionString: string): PoolConfig['ssl'] {
    if (process.env.DB_CONNECTION_STRING && process.env.DB_CONNECTION_STRING !== DEFAULT_CONNECTION) {
        const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' ? true : false;
        return { rejectUnauthorized };
    }

    const sslSetting = (process.env.DB_SSL || '').toLowerCase();
    if (sslSetting === 'disable' || sslSetting === 'false') {
        return undefined;
    }

    const isLocalhost = connectionString.includes('localhost') ||
        connectionString.includes('127.0.0.1');

    const rejectUnauthorizedEnv = process.env.DB_SSL_REJECT_UNAUTHORIZED;
    const certFromEnv = process.env.DB_SSL_CERT;
    const certPath = process.env.DB_SSL_CERT_PATH;

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

    if (!isLocalhost) {
        const rejectUnauthorized = rejectUnauthorizedEnv === 'true' ? true : false;
        return { rejectUnauthorized };
    }

    if (sslSetting === 'require' || connectionString.includes('sslmode=require')) {
        const rejectUnauthorized = rejectUnauthorizedEnv === 'true' ? true : false;
        return { rejectUnauthorized };
    }

    return undefined;
}

function createPool(): Pool {
    let connectionString = process.env.DB_CONNECTION_STRING || DEFAULT_CONNECTION;
    connectionString = connectionString.replace(/[?&]sslmode=[^&]*/g, '');

    const sslConfig = buildSslConfig(connectionString);

    const poolConfig: PoolConfig = {
        connectionString,
        max: Number(process.env.DB_POOL_MAX || 10),
    };

    if (sslConfig !== undefined) {
        poolConfig.ssl = sslConfig;
    }

    return new Pool(poolConfig);
}

const pool = createPool();

pool.on('error', (err) => {
    console.error('Unexpected error on idle database client', err);
});

export { pool };

