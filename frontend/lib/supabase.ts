import { createClient } from '@supabase/supabase-js';

// Create anonymous client for public operations
export function createAnonClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
    }

    if (!supabaseAnonKey) {
        throw new Error('Missing SUPABASE_ANON_KEY environment variable');
    }

    return createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            autoRefreshToken: true,
            persistSession: true
        }
    });
}
