import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';
import * as schema from './schema';

const DEFAULT_CONNECTION = 'postgres://postgres:postgres@localhost:5432/postgres';
const ENV_CONNECTION = process.env.DB_CONNECTION_STRING || process.env.DATABASE_URL || '';

// Determine if we're in a production/preview environment
const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
const isPreview = process.env.VERCEL_ENV === 'preview';
const isProductionOrPreview = isProduction || isPreview;

// Check if connection string already has SSL parameters
const connectionString = ENV_CONNECTION || DEFAULT_CONNECTION;
const hasSSLInConnectionString = connectionString.includes('sslmode=') || 
                                  connectionString.includes('ssl=true') ||
                                  connectionString.includes('ssl=1');

// Configure pool with SSL for production/preview environments
const poolConfig: PoolConfig = {
    connectionString,
};

// Add SSL configuration for production/preview if not already in connection string
if (isProductionOrPreview && !hasSSLInConnectionString) {
    // For Supabase and other managed PostgreSQL services, require SSL
    // but don't reject unauthorized certificates (common in managed services)
    poolConfig.ssl = {
        rejectUnauthorized: false,
    };
}

const pool = new Pool(poolConfig);

const db = drizzle({ client: pool, schema });

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export { db, pool, schema };