import { NextRequest, NextResponse } from "next/server";
import { verifyAdminFromAuthHeader } from "@/lib/auth/admin";
import { workos } from "@/lib/auth/workos";

// Promote / demote a WorkOS user by writing `metadata.role`. The env-allowlist
// path is read-only here — env-based admins must be edited via deploy config.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await verifyAdminFromAuthHeader(req.headers.get("authorization"));
  if (!admin?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let body: { role?: "admin" | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const existing = await workos.userManagement.getUser(id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingMeta = ((existing as any).metadata ?? {}) as Record<string, string>;
    const meta: Record<string, string> = { ...existingMeta };
    if (body.role === "admin") meta.role = "admin";
    else delete meta.role;

    const updated = await workos.userManagement.updateUser({
      userId: id,
      metadata: meta,
    });
    return NextResponse.json({
      id: updated.id,
      email: updated.email,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      role: ((updated as any).metadata?.role as string | undefined) ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
