"use client";

// Hands the signed-in session's token getter to lib/drive/api.ts, which has no
// React of its own. Drive's roots (DriveHome, DriveLite) call it once, and so do
// useDriveUploads and useDriveUrl, so any Drive request made from an event
// handler finds a getter.

import { useEffect } from "react";
import { useAuth } from "@/lib/auth/context";
import { registerDriveTokenGetter } from "@/lib/drive/api";

export function useDriveTokenBridge(): void {
  const { getToken } = useAuth();
  useEffect(() => registerDriveTokenGetter(getToken), [getToken]);
}
