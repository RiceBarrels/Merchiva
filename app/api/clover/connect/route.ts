import { NextResponse } from "next/server";
import { getCloverBaseUrl } from "@/lib/clover/api";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const redirectUri =
    process.env.CLOVER_REDIRECT_URI ??
    "https://project-management-phi-red.vercel.app/api/clover/callback";

  const params = new URLSearchParams({
    client_id: process.env.CLOVER_APP_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
  });

  const authorizeUrl = `${getCloverBaseUrl()}/oauth/v2/authorize?${params.toString()}`;
  return NextResponse.redirect(authorizeUrl);
}
