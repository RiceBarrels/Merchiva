import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/merchiva-admin/session";
import { listReducers } from "@/lib/merchiva-admin/stdb";
import { errorResponse } from "../_shared";

/** List every reducer with its parameter names/types (for the reducer console). */
export async function GET() {
  try {
    await requireAdminSession();
    return NextResponse.json({ reducers: listReducers() });
  } catch (err) {
    return errorResponse(err);
  }
}
