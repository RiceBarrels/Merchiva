import { redirect } from "next/navigation";

// AI usage moved into Settings → AI Usage. Keep the old route working by
// redirecting anyone who lands on /~/usage (bookmarks, old links).
export default function UsageRedirectPage() {
  redirect("/~/settings");
}
