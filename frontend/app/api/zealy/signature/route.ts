import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const ZEALY_COMMUNITY_SECRET = process.env.ZEALY_COMMUNITY_SECRET || "a82cc4eMESdFKZ4Y7AToIVPffHQ";
if (!ZEALY_COMMUNITY_SECRET) {
    throw new Error("ZEALY_COMMUNITY_SECRET is not set");
}

/**
 * Verifies a Zealy signature against a URL
 * @param url - The URL to verify
 * @param signature - The signature to verify against
 * @returns boolean indicating if the signature is valid
 */
function verifyZealySignature(url: string, signature: string): boolean {
    if (!signature) {
        console.log("❌ No signature provided");
        return false;
    }

    try {
        const fullUrl = new URL(url);
        const originalSignature = signature;
        
        // Remove signature from URL for verification
        fullUrl.searchParams.delete("signature");
        
        const urlToVerify = fullUrl.toString();
        console.log("🔐 Verifying signature:", {
            originalUrl: url,
            urlWithoutSignature: urlToVerify,
            providedSignature: originalSignature,
        });

        const hmac = crypto.createHmac("sha256", ZEALY_COMMUNITY_SECRET as string);
        hmac.update(urlToVerify);
        const generatedSignature = hmac.digest("hex");

        const isValid = generatedSignature === originalSignature;
        console.log("🔐 Signature comparison:", {
            generated: generatedSignature,
            provided: originalSignature,
            match: isValid,
        });

        return isValid;
    } catch (err) {
        console.error("Error verifying signature:", err);
        return false;
    }
}

/**
 * Generates a callback signature for Zealy
 * @param url - The callback URL
 * @param identifier - The identifier to append
 * @returns The generated signature
 */
function generateCallbackSignature(url: string, identifier: string): string {
    const callbackWithParams = new URL(url);
    callbackWithParams.searchParams.append("identifier", identifier);

    const urlToSign = callbackWithParams.toString();
    console.log("🔑 Generating signature for:", {
        baseUrl: url,
        identifier,
        finalUrl: urlToSign,
    });

    const hmac = crypto.createHmac("sha256", ZEALY_COMMUNITY_SECRET as string);
    hmac.update(urlToSign);
    const signature = hmac.digest("hex");

    console.log("🔑 Generated signature:", signature);
    return signature;
}

export async function POST(req: NextRequest) {
    try {
        const { action, url, signature, identifier } = await req.json();

        console.log("📨 Zealy signature API request:", {
            action,
            url: url?.substring(0, 100) + "...",
            hasSignature: !!signature,
            hasIdentifier: !!identifier,
        });

        if (!action || !url) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Missing required fields: action and url",
                },
                { status: 400 },
            );
        }

        switch (action) {
            case "verify":
                if (!signature) {
                    return NextResponse.json(
                        {
                            success: false,
                            error: "Missing signature for verification",
                        },
                        { status: 400 },
                    );
                }

                const isValid = verifyZealySignature(url, signature);
                console.log(`✅ Verification result: ${isValid ? "VALID" : "INVALID"}`);
                
                return NextResponse.json({
                    success: true,
                    isValid,
                });

            case "generate":
                if (!identifier) {
                    return NextResponse.json(
                        {
                            success: false,
                            error: "Missing identifier for signature generation",
                        },
                        { status: 400 },
                    );
                }

                const generatedSignature = generateCallbackSignature(url, identifier);
                return NextResponse.json({
                    success: true,
                    signature: generatedSignature,
                });

            default:
                return NextResponse.json(
                    {
                        success: false,
                        error: "Invalid action. Must be 'verify' or 'generate'",
                    },
                    { status: 400 },
                );
        }
    } catch (error: any) {
        console.error("Zealy signature API error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || "Internal server error",
            },
            { status: 500 },
        );
    }
}