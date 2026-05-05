import { NextResponse } from "next/server";

/**
 * POST /api/clover/disconnect
 *
 * Disconnects the Clover integration by clearing all Clover-related cookies.
 */
export async function POST() {
  const response = NextResponse.json({ success: true });

  // Clear all Clover cookies
  const cookieNames = [
    "clover_access_token",
    "clover_merchant_id",
    "clover_connected",
  ];

  for (const name of cookieNames) {
    response.cookies.delete({ name, path: "/" });
  }

  return response;
}
