import { NextRequest, NextResponse } from 'next/server';
import { CONTRACT_ADDRESS } from '@/lib/contract';
import { createAnonClient } from '@/lib/supabase';
import { redis } from '@/lib/redis';

// Function to get transaction count from Basescan with caching
async function getTransactionCountFromBasescan(): Promise<number> {
    const cacheKey = `basescan-tx-count:${CONTRACT_ADDRESS}`;

    // Check cache first
    if (redis) {
        try {
            const cachedCount = await redis.get(cacheKey);
            if (cachedCount !== null) {
                console.log('Returning cached transaction count from Basescan');
                return parseInt(cachedCount as string, 10);
            }
        } catch (cacheError) {
            console.warn('Redis cache read error:', cacheError);
        }
    }

    try {
        const apiKey = process.env.BASESCAN_API_KEY;
        if (!apiKey) {
            console.warn('BASESCAN_API_KEY not found, using fallback estimation');
            return 0;
        }

        // Get transaction list for the contract address
        const url = `https://api.basescan.org/api?module=account&action=txlist&address=${CONTRACT_ADDRESS}&startblock=0&endblock=99999999&page=1&offset=10000&sort=desc&apikey=${apiKey}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Basescan API error: ${response.status}`);
        }

        const data = await response.json();

        if (data.status !== '1') {
            console.warn('Basescan API returned error:', data.message);
            return 0;
        }

        // Count transactions (result is an array of transactions)
        const transactionCount = Array.isArray(data.result) ? data.result.length : 0;
        console.log(`Found ${transactionCount} transactions for contract ${CONTRACT_ADDRESS}`);

        // Cache the result for 10 minutes (600 seconds)
        if (redis) {
            try {
                await redis.setex(cacheKey, 600, transactionCount.toString());
                console.log('Cached transaction count from Basescan');
            } catch (cacheError) {
                console.warn('Redis cache write error:', cacheError);
            }
        }

        return transactionCount;
    } catch (error) {
        console.error('Error fetching from Basescan:', error);
        return 0;
    }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
    try {
        // Get team count from Supabase
        const supabase = createAnonClient();
        const { count: teamCount, error: teamError } = await supabase
            .from('teams')
            .select('*', { count: 'exact', head: true });

        if (teamError) {
            console.error('Error fetching team count:', teamError);
            return NextResponse.json(
                { success: false, error: 'Failed to fetch team count' },
                { status: 500 }
            );
        }

        // Get total games count from Supabase
        const { count: gameCount, error: gameError } = await supabase
            .from('games')
            .select('*', { count: 'exact', head: true });

        if (gameError) {
            console.error('Error fetching game count:', gameError);
            return NextResponse.json(
                { success: false, error: 'Failed to fetch game count' },
                { status: 500 }
            );
        }

        // Get transaction count from Basescan API
        let transactionCount = 0;
        try {
            // Try to get real transaction count from Basescan
            transactionCount = await getTransactionCountFromBasescan();

            // Fallback to estimation if Basescan fails
            if (transactionCount === 0) {
                console.log('Using fallback estimation for transaction count');
                // Each team creation = 1 transaction, each game = 2 transactions (create + finish)
                transactionCount = (teamCount || 0) + ((gameCount || 0) * 2);
            }
        } catch (txError) {
            console.error('Error fetching transaction count:', txError);
            // Fallback to estimated count
            transactionCount = (teamCount || 0) + ((gameCount || 0) * 2);
        }

        return NextResponse.json({
            success: true,
            data: {
                total_teams: teamCount || 0,
                total_games: gameCount || 0,
                total_transactions: transactionCount,
                lastUpdated: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error in get-global-stat API:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
