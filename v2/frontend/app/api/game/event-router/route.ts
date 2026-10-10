import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { processEventRouter } from '@/lib/event-router';
import { WebhookEvent } from '@/lib/webhook';

function isValidSignatureForStringBody(
    body: string, // must be raw string body, not json transformed version of the body
    signature: string, // your "X-Alchemy-Signature" from header
): boolean {
    const signingKey = process.env.ALCHEMY_SIGNING_KEY || '';

    if (signingKey === '') {
        throw new Error('Missing ALCHEMY_SIGNING_KEY environment variable');
    }
    const hmac = createHmac("sha256", signingKey); // Create a HMAC SHA256 hash using the signing key
    hmac.update(body, "utf8"); // Update the token hash with the request body using utf8
    const digest = hmac.digest("hex");
    return signature === digest;
}

export async function POST(request: NextRequest) {
    try {
        const signature = request.headers.get('X-Alchemy-Signature');
        const apiKey = request.headers.get('X-Api-Key');

        if (!signature && !apiKey) {
            return NextResponse.json(
                { error: 'Missing X-Alchemy-Signature or X-Api-Key header' },
                { status: 400 }
            );
        }

        // Read the body as text first for signature validation
        const bodyText = await request.text();

        if (signature) {
            if (!isValidSignatureForStringBody(bodyText, signature)) {
                return NextResponse.json(
                    { error: 'Invalid signature' },
                    { status: 400 }
                );
            }
        } else {
            if (apiKey !== process.env.WEBHOOK_API_KEY) {
                return NextResponse.json(
                    { error: 'Invalid API key' },
                    { status: 400 }
                );
            }
        }

        // Parse the incoming webhook payload from the text we already read
        const webhookEvent: WebhookEvent = JSON.parse(bodyText);

        console.log('webhookEvent', JSON.stringify(webhookEvent));

        // Process the event using the event router
        const result = await processEventRouter(webhookEvent);

        if (result.success) {
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json(
                { error: result.error || 'Unknown error processing event' },
                { status: 500 }
            );
        }

    } catch (error: unknown) {
        console.error('Error processing webhook:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}
