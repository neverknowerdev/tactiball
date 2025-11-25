import { NextRequest, NextResponse } from 'next/server';
import { checkAuthSignatureAndMessage } from './lib/auth';
import * as Sentry from '@sentry/nextjs';

/**
 * List of API routes that should NOT require authentication
 * These routes are public and can be accessed without signature verification
 */
const PUBLIC_ROUTES = [
    '/api/get-global-stat',
    '/api/get-team-info',
    '/api/get-leaderboard',
    '/api/waiting-rooms/list', // Public listing endpoint
    '/api/zealy/verify', // Zealy webhook verification
    '/api/zealy/signature', // Zealy signature verification
    '/api/game/event-router', // Webhook endpoint
    '/api/webhook', // Webhook endpoint
    '/api/notify', // Notification endpoint
    '/api/cron/cleanup-rooms', // Cron job endpoint
];

/**
 * Checks if a given path should be excluded from authentication
 * 
 * @param pathname - The request pathname
 * @returns true if the route should be public, false otherwise
 */
function isPublicRoute(pathname: string): boolean {
    return PUBLIC_ROUTES.some(route => pathname.startsWith(route));
}

/**
 * Next.js Middleware for API Authentication
 * 
 * This middleware intercepts all /api/* requests and applies authentication
 * for protected routes. Public routes are allowed through without authentication.
 * 
 * For POST/PUT/PATCH requests, it reads the request body to validate authentication.
 * For GET requests, authentication is handled by the route handler.
 * 
 * Note: This middleware runs in the Edge Runtime. If viem's verifyMessage
 * doesn't work in edge runtime, authentication will fall back to route handlers.
 */
export async function middleware(request: NextRequest) {
    const { pathname, search } = request.nextUrl;
    const url = request.url;

    // Set Sentry context for all API routes
    if (pathname.startsWith('/api/')) {
        Sentry.setContext('request', {
            url: url,
            pathname: pathname,
            method: request.method,
            search: search || undefined,
            userAgent: request.headers.get('user-agent') || undefined,
            referer: request.headers.get('referer') || undefined,
        });
    }

    // Only process API routes
    if (!pathname.startsWith('/api/')) {
        return NextResponse.next();
    }

    // Check if this is a public route
    if (isPublicRoute(pathname)) {
        return NextResponse.next();
    }

    // For GET requests, let the route handler validate auth
    // (since GET requests typically don't have auth in body)
    if (request.method === 'GET') {
        return NextResponse.next();
    }

    // For POST/PUT/PATCH requests, validate authentication from body
    try {
        // Clone the request to read the body without consuming the original stream
        // The original request body will still be readable by the route handler
        const clonedRequest = request.clone();
        let body: any;

        try {
            const bodyText = await clonedRequest.text();
            if (!bodyText) {
                // Empty body - let route handler deal with it
                return NextResponse.next();
            }
            body = JSON.parse(bodyText);
        } catch (parseError) {
            // If body parsing fails, let the route handler handle it
            console.warn('Failed to parse request body in middleware:', parseError);
            return NextResponse.next();
        }

        console.log('Body:', body);
        // Extract auth fields (handle different possible field names)
        const signature = body.signature;
        const message = body.message;
        const walletAddress = body.wallet_address || body.walletAddress;

        console.log('Signature:', signature);
        console.log('Message:', message);
        console.log('Wallet address:', walletAddress);

        // Validate required fields
        if (!signature || !message || !walletAddress) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: signature, message, and wallet_address' },
                { status: 400 }
            );
        }

        // Validate wallet address format
        if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
            return NextResponse.json(
                { success: false, error: 'Invalid wallet address format' },
                { status: 400 }
            );
        }

        // Validate signature and message
        // Note: viem's verifyMessage doesn't work reliably in Edge Runtime
        // So we delegate signature verification to route handlers (Node.js runtime)
        // The middleware just validates the presence and format of auth fields
        
        // Set Sentry user context for error tracking
        Sentry.setUser({
            username: walletAddress,
        });

        // Enhance Sentry context with authenticated request details
        Sentry.setContext('request', {
            url: url,
            pathname: pathname,
            method: request.method,
            search: search || undefined,
            userAgent: request.headers.get('user-agent') || undefined,
            referer: request.headers.get('referer') || undefined,
            authenticated: true,
            walletAddress: walletAddress,
        });

        // Add authenticated wallet address to headers for route handlers to use
        // Route handlers will perform actual signature verification
        const response = NextResponse.next();
        response.headers.set('x-authenticated-wallet', walletAddress);
        return response;

    } catch (error) {
        console.error('Error in authentication middleware:', error);
        // If there's an error, let the route handler deal with it
        // (it might have different error handling logic)
        return NextResponse.next();
    }
}

/**
 * Configure which routes the middleware should run on
 */
export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder files
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};

