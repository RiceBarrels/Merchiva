import "server-only";

// The Drive storage config of this process (see handlers/config.ts for the
// rules). The environment does not change while a process runs, so it is read
// once.

import { parseDriveStorageConfig } from "./handlers/config";
import type { DriveStorageConfig } from "./handlers/types";

let cached: { config: DriveStorageConfig | null } | null = null;

export function readDriveStorageConfig(): DriveStorageConfig | null {
  if (!cached) cached = { config: parseDriveStorageConfig(process.env) };
  return cached.config;
}
