import { NextResponse } from "next/server";
import { getSkillCatalog } from "@/lib/merchiva/skills/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    skills: getSkillCatalog(),
  });
}
