import { NextRequest, NextResponse } from "next/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { assertSafeMcpUrl, mcpHeaders, normalizeMcpServers, publicMcpServers } from "@/lib/merchiva/mcp/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function POST(req: NextRequest) {
  let client: Client | null = null;
  let transport: StreamableHTTPClientTransport | null = null;

  try {
    const body = await req.json();
    const server = normalizeMcpServers([body.server ?? body])[0];
    if (!server) {
      return NextResponse.json({ error: "Missing MCP server config" }, { status: 400 });
    }

    const url = assertSafeMcpUrl(server.url);
    transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers: mcpHeaders(server) },
    });
    client = new Client({ name: "merchiva", version: "0.1.1-beta" });
    await client.connect(transport, { timeout: 10_000 });
    const result = await client.listTools(undefined, { timeout: 10_000 });

    return NextResponse.json({
      ok: true,
      server: publicMcpServers([server])[0],
      tools: result.tools.map((tool) => ({
        name: tool.name,
        title: tool.title ?? null,
        description: tool.description ?? null,
        readOnly: tool.annotations?.readOnlyHint ?? null,
        destructive: tool.annotations?.destructiveHint ?? null,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    await client?.close().catch(() => {});
    await transport?.close().catch(() => {});
  }
}
