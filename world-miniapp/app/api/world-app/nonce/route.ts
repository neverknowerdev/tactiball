// app/api/world-app/nonce/route.ts
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    // Generate a secure nonce - must be at least 8 alphanumeric characters
    const nonce = crypto.randomUUID().replace(/-/g, "");

    // Store nonce in secure HTTP-only cookie
    // The nonce should be stored somewhere that is not tamperable by the client
    const cookieStore = await cookies();
    cookieStore.set("chessball_world_siwe", nonce, { 
      secure: true,
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 60 * 10 // 10 minutes expiry
    });

    return NextResponse.json({ nonce });
  } catch (error) {
    console.error('Error generating nonce:', error);
    return NextResponse.json(
      { error: 'Failed to generate nonce' },
      { status: 500 }
    );
  }
}