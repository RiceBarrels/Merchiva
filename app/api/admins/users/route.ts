import { NextRequest, NextResponse } from "next/server";
import { verifyAdminFromAuthHeader, isAdminFromEnv } from "@/lib/auth/admin";
import { workos } from "@/lib/auth/workos";

// List all WorkOS users, decorated with admin status (env or metadata).
export async function GET(req: NextRequest) {
  const admin = await verifyAdminFromAuthHeader(req.headers.get("authorization"));
  if (!admin?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const search = req.nextUrl.searchParams.get("search") ?? "";
    const result = await workos.userManagement.listUsers({
      email: search || undefined,
      limit: 50,
    });
    return NextResponse.json({
      users: result.data.map((u) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const meta = (u as any).metadata ?? {};
        const role = typeof meta.role === "string" ? meta.role : null;
        const envAdmin = isAdminFromEnv(u.email ?? "");
        return {
          id: u.id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          emailVerified: u.emailVerified,
          createdAt: u.createdAt,
          role,
          isAdmin: role === "admin" || envAdmin,
          adminSource: envAdmin ? "env" : role === "admin" ? "metadata" : null,
        };
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
