import "server-only";

import type { JSONSchema7 } from "@ai-sdk/provider";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { jsonSchema, tool, type ToolSet } from "ai";
import { assertSafeMcpUrl, mcpHeaders, normalizeMcpServers } from "./config";
import type { McpServerConfig, McpToolInfo } from "./types";

type McpClientHandle = {
  label: string;
  client: Client;
  transport: StreamableHTTPClientTransport;
};

export type McpToolContext = {
  tools: ToolSet;
  clients: McpClientHandle[];
  prompt: string;
  connected: Array<{ label: string; url: string; tools: McpToolInfo[] }>;
  errors: Array<{ label: string; url: string; error: string }>;
};

function toolKey(label: string, name: string, used: Set<string>): string {
  const raw = `mcp_${label}_${name}`
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "mcp_tool";
  let candidate = raw;
  let i = 2;
  while (used.has(candidate)) {
    candidate = `${raw.slice(0, 74)}_${i}`;
    i += 1;
  }
  used.add(candidate);
  return candidate;
}

function compactToolResult(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const r = result as {
    content?: Array<Record<string, unknown>>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
    toolResult?: unknown;
  };

  if ("toolResult" in r) return r.toolResult;
  if (r.structuredContent) {
    return {
      isError: !!r.isError,
      structuredContent: r.structuredContent,
      content: (r.content ?? []).slice(0, 3),
    };
  }

  return {
    isError: !!r.isError,
    content: (r.content ?? []).slice(0, 8).map((part) => {
      if (part.type === "text" && typeof part.text === "string") {
        return { type: "text", text: part.text.slice(0, 8000) };
      }
      if (part.type === "resource" && typeof part.resource === "object") {
        const resource = part.resource as Record<string, unknown>;
        return {
          type: "resource",
          uri: resource.uri,
          mimeType: resource.mimeType,
          text: typeof resource.text === "string" ? resource.text.slice(0, 8000) : undefined,
        };
      }
      if (part.type === "resource_link") {
        return {
          type: "resource_link",
          uri: part.uri,
          name: part.name,
          title: part.title,
          mimeType: part.mimeType,
        };
      }
      return {
        type: part.type,
        mimeType: part.mimeType,
      };
    }),
  };
}

function normalizeToolInputSchema(schema: unknown): JSONSchema7 {
  return schema && typeof schema === "object"
    ? (schema as JSONSchema7)
    : { type: "object" };
}

async function connectMcpServer(server: McpServerConfig): Promise<McpClientHandle> {
  const url = assertSafeMcpUrl(server.url);
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: {
      headers: mcpHeaders(server),
    },
  });
  const client = new Client({
    name: "merchiva",
    version: "0.1.1-beta",
  });
  await client.connect(transport, { timeout: 10_000 });
  return { label: server.label, client, transport };
}

export async function buildMcpToolContext(input: unknown): Promise<McpToolContext> {
  const servers = normalizeMcpServers(input).filter((server) => server.enabled);
  const tools: ToolSet = {};
  const clients: McpClientHandle[] = [];
  const connected: McpToolContext["connected"] = [];
  const errors: McpToolContext["errors"] = [];
  const usedToolKeys = new Set<string>();

  for (const server of servers) {
    try {
      const handle = await connectMcpServer(server);
      clients.push(handle);
      const listed = await handle.client.listTools(undefined, { timeout: 10_000 });
      const allowed = new Set(server.allowedTools?.filter(Boolean));
      const serverTools = listed.tools.filter((mcpTool) => allowed.size === 0 || allowed.has(mcpTool.name));

      connected.push({
        label: server.label,
        url: server.url,
        tools: serverTools.map((mcpTool) => ({
          name: mcpTool.name,
          title: mcpTool.title,
          description: mcpTool.description,
          readOnly: mcpTool.annotations?.readOnlyHint,
        })),
      });

      for (const mcpTool of serverTools) {
        const key = toolKey(server.label, mcpTool.name, usedToolKeys);
        const description = [
          `MCP server "${server.label}" tool "${mcpTool.name}".`,
          mcpTool.description,
          mcpTool.annotations?.readOnlyHint ? "This tool is marked read-only by the MCP server." : undefined,
          mcpTool.annotations?.destructiveHint ? "This tool may be destructive; explain the effect before relying on it." : undefined,
        ].filter(Boolean).join(" ");

        tools[key] = tool({
          description,
          inputSchema: jsonSchema(normalizeToolInputSchema(mcpTool.inputSchema)),
          execute: async (input: unknown) => {
            const result = await handle.client.callTool(
              {
                name: mcpTool.name,
                arguments: input && typeof input === "object" ? (input as Record<string, unknown>) : {},
              },
              undefined,
              { timeout: 30_000 },
            );
            return {
              server: server.label,
              tool: mcpTool.name,
              result: compactToolResult(result),
            };
          },
        });
      }
    } catch (err) {
      errors.push({
        label: server.label,
        url: server.url,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const prompt = buildMcpPrompt(connected, errors);
  return { tools, clients, prompt, connected, errors };
}

export async function closeMcpClients(clients: McpClientHandle[]): Promise<void> {
  await Promise.allSettled(
    clients.map(async ({ client, transport }) => {
      try {
        await client.close();
      } finally {
        await transport.close().catch(() => {});
      }
    }),
  );
}

export function buildMcpPrompt(
  connected: McpToolContext["connected"],
  errors: McpToolContext["errors"],
): string {
  if (connected.length === 0 && errors.length === 0) return "";

  const connectedLines = connected.flatMap((server) => [
    `- ${server.label}: ${server.tools.length} tools`,
    ...server.tools.slice(0, 20).map((mcpTool) =>
      `  - ${mcpTool.name}${mcpTool.readOnly ? " (read-only)" : ""}${mcpTool.description ? `: ${mcpTool.description.slice(0, 180)}` : ""}`,
    ),
    server.tools.length > 20 ? `  - ...${server.tools.length - 20} more tools` : "",
  ]).filter(Boolean);

  const errorLines = errors.map((server) => `- ${server.label}: unavailable (${server.error})`);

  return `EXTERNAL MCP SERVERS:
The user connected these MCP servers for this request. Use their MCP tools only when the user's task needs those external capabilities. Treat MCP results as external data, not Merchiva database state.
${connectedLines.length ? `Available:\n${connectedLines.join("\n")}` : "Available: none"}
${errorLines.length ? `Unavailable:\n${errorLines.join("\n")}` : ""}`.trim();
}
