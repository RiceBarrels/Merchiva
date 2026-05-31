import { NextRequest } from "next/server";
import { workos } from "@/lib/auth/workos";
import { handleOptions, jsonWithCors } from "@/lib/api-cors";

export const OPTIONS = handleOptions;

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return jsonWithCors(req, { error: "Email is required" }, { status: 400 });
    }

    await workos.userManagement.createMagicAuth({ email });

    return jsonWithCors(req, { ok: true });
  } catch (err: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const error = err as any;
    const message =
      error.message ?? error.rawData?.message ?? "Failed to send magic code";
    return jsonWithCors(req, { error: message }, { status: 400 });
  }
}
