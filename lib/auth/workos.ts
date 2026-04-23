import { WorkOS } from "@workos-inc/node";

const apiKey = process.env.WORKOS_API_KEY;

if (!apiKey && process.env.NODE_ENV === "production") {
  console.warn("[WorkOS] WORKOS_API_KEY is not set");
}

export const workos = new WorkOS(apiKey ?? "sk_placeholder");
export const clientId = process.env.WORKOS_CLIENT_ID ?? "";
