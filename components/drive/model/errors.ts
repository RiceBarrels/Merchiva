// The toast for a failed Drive action. lib/drive/errors.ts driveErrorKey reads every failure a
// Drive screen can meet (`[drive.*]`, `[doc.*]`, `[sheet.*]`, the client's own codes); a failure
// it can't name maps to its generic key, and the toast then says what the action was instead
// ("Couldn't create it. Try again." rather than "Something went wrong").

import { DRIVE_GENERIC_ERROR_KEY, driveErrorKey } from "@/lib/drive/errors";

/** i18n key for a failed action: the error's own key when it has one, else `fallback`. */
export function driveErrorToastKey(err: unknown, fallback: string = DRIVE_GENERIC_ERROR_KEY): string {
  const key = driveErrorKey(err);
  return key === DRIVE_GENERIC_ERROR_KEY ? fallback : key;
}
