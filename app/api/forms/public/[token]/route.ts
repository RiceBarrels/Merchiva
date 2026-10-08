import { NextResponse } from "next/server";
import { publicFormHandlers } from "@/lib/forms/server/public-deps";

// The anyone-with-the-link Forms endpoint (web only; /f/<token> calls it).
// GET returns the public-safe form and a fresh signed render stamp; POST
// submits one response. Logic: lib/forms/server/public-handlers.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await ctx.params;
  const result = await publicFormHandlers().load(token);
  return NextResponse.json(result.body, { status: result.status, headers: HEADERS });
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await ctx.params;
  const result = await publicFormHandlers().submit(token, req);
  return NextResponse.json(result.body, { status: result.status, headers: HEADERS });
}
