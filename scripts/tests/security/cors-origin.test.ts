import { describe, expect, test } from "bun:test";
import { getAllowedOrigin } from "@/proxy";

// The /api/* responses carry Access-Control-Allow-Credentials, so a matched
// origin can read authenticated responses. Matching must be exact.
describe("getAllowedOrigin", () => {
  const allowed = [
    "https://project-management-phi-red.vercel.app",
    "https://localhost",
    "capacitor://localhost",
    "ionic://localhost",
    "http://localhost:5500",
    "http://localhost:3000",
  ];

  test("accepts each configured origin exactly", () => {
    for (const origin of allowed) expect(getAllowedOrigin(origin)).toBe(origin);
  });

  test("accepts the app's own custom scheme", () => {
    expect(getAllowedOrigin("merchiva://localhost")).toBe("merchiva://localhost");
  });

  test("rejects a look-alike domain that merely starts with an allowed origin", () => {
    // Registrable by anyone: the old startsWith() check let this through.
    expect(getAllowedOrigin("https://project-management-phi-red.vercel.app.attacker.com")).toBeNull();
    expect(getAllowedOrigin("https://localhost.attacker.com")).toBeNull();
    expect(getAllowedOrigin("capacitor://localhost.attacker.com")).toBeNull();
  });

  test("rejects a different port on localhost", () => {
    expect(getAllowedOrigin("http://localhost:30000")).toBeNull();
    expect(getAllowedOrigin("http://localhost:4000")).toBeNull();
  });

  test("rejects a missing or unknown origin", () => {
    expect(getAllowedOrigin(null)).toBeNull();
    expect(getAllowedOrigin("https://example.com")).toBeNull();
  });
});
