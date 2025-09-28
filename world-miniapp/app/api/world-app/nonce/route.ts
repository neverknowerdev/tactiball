// app/api/world-app/nonce/route.ts
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    // Generate a secure nonce - must be at least 8 alphanumeric characters
    const nonce = crypto.randomUUID().replace(/-/g, "");
    
    console.log("Generated nonce:", nonce);

    // Store nonce in secure HTTP-only cookie
    // The nonce should be stored somewhere that is not tamperable by the client
    const cookieStore = await cookies();
    
    // Clear any existing nonce first
    cookieStore.delete("chessball_world_siwe");
    
    // Set new nonce with more flexible cookie settings for development
    const isProduction = process.env.NODE_ENV === "production";
    
    cookieStore.set("chessball_world_siwe", nonce, { 
      secure: isProduction, // Only require HTTPS in production
      httpOnly: true,
      sameSite: isProduction ? 'strict' : 'lax', // More lenient in development
      maxAge: 60 * 10, // 10 minutes expiry
      path: '/', // Ensure cookie is available for all paths
    });

    // Verify the cookie was set
    const verifyNonce = cookieStore.get("chessball_world_siwe")?.value;
    console.log("Cookie set verification:", verifyNonce);
    
    if (verifyNonce !== nonce) {
      console.error("Cookie was not set properly!");
      return NextResponse.json(
        { error: 'Failed to store nonce securely' },
        { status: 500 }
      );
    }

    return NextResponse.json({ nonce });
  } catch (error) {
    console.error('Error generating nonce:', error);
    return NextResponse.json(
      { error: 'Failed to generate nonce' },
      { status: 500 }
    );
  }
}