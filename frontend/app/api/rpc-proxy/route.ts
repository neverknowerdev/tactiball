import { NextRequest, NextResponse } from 'next/server';
import { defaultPaymaster, baseSepoliaPaymaster } from '@/lib/paymaster-proxy';

// Rate limiting configuration
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100; // 100 requests per minute

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const userRequests = requestCounts.get(ip);

    if (!userRequests || now > userRequests.resetTime) {
        requestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return false;
    }

    if (userRequests.count >= MAX_REQUESTS_PER_WINDOW) {
        return true;
    }

    userRequests.count++;
    return false;
}

// Allowed RPC methods for security
const ALLOWED_METHODS = [
    // Standard Ethereum methods
    'eth_call',
    'eth_getBalance',
    'eth_getTransactionCount',
    'eth_getTransactionReceipt',
    'eth_getBlockByNumber',
    'eth_getBlockByHash',
    'eth_getLogs',
    'eth_estimateGas',
    'eth_sendRawTransaction',
    'eth_getCode',
    'eth_getStorageAt',
    'eth_gasPrice',
    'eth_maxPriorityFeePerGas',
    'eth_feeHistory',
    'eth_blockNumber',
    'eth_chainId',

    // Base Account specific methods
    'pm_sponsorUserOperation',
    'pm_estimateUserOperationGas',
    'pm_getPaymasterStatus',

    // Web3 methods
    'web3_clientVersion',
    'web3_sha3',

    // Net methods
    'net_version',
    'net_listening',
    'net_peerCount',
];

// Base RPC endpoints
const BASE_RPC_ENDPOINTS = {
    baseMainnet: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
    baseSepolia: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
};

export async function POST(request: NextRequest) {
    try {
        // Rate limiting
        const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
        if (isRateLimited(ip)) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please try again later.' },
                { status: 429 }
            );
        }

        const body = await request.json();

        // Validate the request body
        if (!body.method || !body.params) {
            return NextResponse.json(
                { error: 'Invalid request format' },
                { status: 400 }
            );
        }

        // Check if method is allowed
        if (!ALLOWED_METHODS.includes(body.method)) {
            return NextResponse.json(
                { error: 'Method not allowed' },
                { status: 405 }
            );
        }

        // Handle paymaster-specific methods
        if (body.method.startsWith('pm_')) {
            return await handlePaymasterRequest(body, request);
        }

        // Forward standard RPC requests to Base RPC
        return await forwardToBaseRPC(body, request);

    } catch (error) {
        console.error('RPC Proxy error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

async function handlePaymasterRequest(body: any, request: NextRequest): Promise<NextResponse> {
    try {
        // Determine which chain to use based on request context or default to mainnet
        const chain = request.headers.get('x-chain') || 'baseMainnet';
        const paymaster = chain === 'baseSepolia' ? baseSepoliaPaymaster : defaultPaymaster;

        // For paymaster methods, we need to handle them specially
        if (body.method === 'pm_sponsorUserOperation') {
            const result = await paymaster.sponsorUserOperation(
                body.params.userOperation,
                body.params.sponsorInfo
            );

            return NextResponse.json({
                jsonrpc: '2.0',
                id: body.id,
                result,
            });
        }

        if (body.method === 'pm_estimateUserOperationGas') {
            const result = await paymaster.estimateUserOperationGas(body.params.userOperation);

            return NextResponse.json({
                jsonrpc: '2.0',
                id: body.id,
                result,
            });
        }

        if (body.method === 'pm_getPaymasterStatus') {
            const config = paymaster.getChainConfig();

            return NextResponse.json({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                    status: 'active',
                    chain: config.chain,
                    entryPoint: config.entryPoint,
                    paymasterUrl: config.paymasterUrl,
                },
            });
        }

        return NextResponse.json(
            { error: 'Unsupported paymaster method' },
            { status: 400 }
        );

    } catch (error) {
        console.error('Paymaster request error:', error);
        return NextResponse.json({
            jsonrpc: '2.0',
            id: body.id,
            error: {
                code: -32603,
                message: error instanceof Error ? error.message : 'Internal error',
            },
        });
    }
}

async function forwardToBaseRPC(body: any, request: NextRequest): Promise<NextResponse> {
    try {
        // Determine which chain to use
        const chain = request.headers.get('x-chain') || 'baseMainnet';
        const rpcUrl = BASE_RPC_ENDPOINTS[chain as keyof typeof BASE_RPC_ENDPOINTS];

        if (!rpcUrl) {
            return NextResponse.json(
                { error: 'Invalid chain specified' },
                { status: 400 }
            );
        }

        // Forward the request to Base RPC
        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'ChessBall-RPC-Proxy/1.0',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Base RPC error:', response.status, errorText);
            return NextResponse.json(
                { error: 'RPC request failed', details: errorText },
                { status: response.status }
            );
        }

        const result = await response.json();
        return NextResponse.json(result);

    } catch (error) {
        console.error('Base RPC forwarding error:', error);
        return NextResponse.json(
            { error: 'Failed to forward RPC request' },
            { status: 500 }
        );
    }
}

// Health check endpoint
export async function GET() {
    return NextResponse.json({
        status: 'ok',
        service: 'Enhanced RPC Proxy with Paymaster Support',
        timestamp: new Date().toISOString(),
        features: {
            rateLimit: {
                window: RATE_LIMIT_WINDOW / 1000,
                maxRequests: MAX_REQUESTS_PER_WINDOW,
            },
            supportedMethods: ALLOWED_METHODS,
            paymasterSupport: true,
            chains: ['baseMainnet', 'baseSepolia'],
        },
        endpoints: {
            baseMainnet: BASE_RPC_ENDPOINTS.baseMainnet,
            baseSepolia: BASE_RPC_ENDPOINTS.baseSepolia,
        },
    });
}
