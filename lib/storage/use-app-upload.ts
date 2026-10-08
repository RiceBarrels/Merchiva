"use client";

// lib/storage/app-upload.ts for components on useUploadThing / UploadButton:
//
//   const upload = useAppUploadProps("tasks");
//   useUploadThing("taskEvidence", { headers: upload.headers, … });
//   if (upload.input) startUpload(files, upload.input);
//   upload.input && <UploadButton endpoint="taskEvidence" headers={upload.headers} input={upload.input} … />
//
// `input` is null until the active store is known: don't start an upload (or render the button) then.

import { useMemo } from "react";
import { usePermissions } from "@/lib/context/permissions";
import { appUploadHeaders, appUploadInput, type AppUploadInputValue } from "@/lib/storage/app-upload";
import type { AppFileSource } from "@/lib/storage/sources";

export interface AppUploadProps {
  headers: () => Promise<Record<string, string>>;
  input: AppUploadInputValue | null;
}

/** The headers + input of an app upload from `source`, for the active store (or `organizationId` when given). */
export function useAppUploadProps(source: AppFileSource, organizationId?: string | null): AppUploadProps {
  const { organizationId: activeOrgId } = usePermissions();
  const orgId = organizationId ?? activeOrgId;
  return useMemo(
    () => ({ headers: appUploadHeaders, input: orgId ? appUploadInput(orgId, source) : null }),
    [orgId, source],
  );
}
