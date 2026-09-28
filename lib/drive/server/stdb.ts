import "server-only";

// SpacetimeDB over HTTP for the Drive routes: reducer calls by their
// snake_case names with positional arguments (stdb-calls.ts), and single
// SELECTs over /sql. User calls carry the caller's token so the module's
// ctx.sender and RLS are the caller's; service calls carry the service token.

import { callReducer } from "@/lib/spacetimedb/server-rpc";
import { spacetimeSql } from "@/lib/spacetimedb/sql";
import { driveHttpError } from "./http";
import { sqlRows, type SqlRow } from "./sql-rows";
import { DRIVE_STDB_CALLS, driveCallArgs, type DriveStdbArgs, type DriveStdbCallKey } from "./stdb-calls";
import type { DriveServerDeps, DriveStorageConfig } from "./handlers/types";

const SELECT_RE = /^\s*select\b/i;

export function createDriveStdb(config: DriveStorageConfig): Pick<DriveServerDeps, "call" | "sql"> {
  return {
    async call<K extends DriveStdbCallKey>(key: K, args: DriveStdbArgs[K], userToken?: string): Promise<void> {
      const spec = DRIVE_STDB_CALLS[key];
      const token = spec.as === "user" ? userToken : config.serviceToken;
      if (!token) throw driveHttpError("unauthenticated", "Sign in again");
      await callReducer({ token, name: spec.name, args: driveCallArgs(key, args) });
    },

    async sql(query: string, userToken: string | null): Promise<SqlRow[]> {
      if (!SELECT_RE.test(query) || query.includes(";")) throw new Error("Drive SQL must be a single SELECT");
      return sqlRows(await spacetimeSql(query, { token: userToken ?? config.serviceToken }));
    },
  };
}
