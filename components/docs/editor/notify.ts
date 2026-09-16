"use client";

import { toast } from "sonner";
import { DOC_ERROR_I18N_KEYS, docErrorCode } from "@/lib/docs/errors";

/** Shows the translated message for a docs reducer failure (`[doc.<code>]`), or `fallbackKey` for anything else. */
export function reportDocError(err: unknown, t: (key: string) => string, fallbackKey = "docs.errors.generic"): void {
  const code = docErrorCode(err);
  toast.error(t(code ? DOC_ERROR_I18N_KEYS[code] : fallbackKey));
}
