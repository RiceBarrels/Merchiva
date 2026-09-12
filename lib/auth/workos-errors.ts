// Normalises the many shapes WorkOS SDK exceptions come in into one
// { code, message, status } triple the auth routes can return to the client.
//
// Shapes seen in the wild (SDK 9.x):
//   BadRequestException   { code: "user_creation_error", errors: [{ code: "email_not_available" }] }
//   BadRequestException   { code: "password_strength_error", errors: [{ message, code }] }
//   OauthException        { error: "sso_required", errorDescription }
//   AuthenticationException { code: "email_verification_required", pendingAuthenticationToken }
//   ConflictException     { status: 409, message }
//   GenericServerException { status, code, rawData }

export type AuthErrorCode =
  | "email_exists"
  | "weak_password"
  | "sso_required"
  | "email_verification_required"
  | "invalid_email"
  | "rate_limited"
  | "unknown";

export interface NormalizedAuthError {
  code: AuthErrorCode;
  message: string;
  status: number;
  /** Raw WorkOS code, for logging / debugging. */
  raw?: string;
}

interface WorkOSSubError {
  code?: string;
  message?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyError = any;

function subErrors(err: AnyError): WorkOSSubError[] {
  const list = err?.errors ?? err?.rawData?.errors;
  return Array.isArray(list) ? (list as WorkOSSubError[]) : [];
}

export function workosErrorCode(err: AnyError): string | undefined {
  return err?.code ?? err?.error ?? err?.rawData?.code ?? err?.rawData?.error;
}

export function normalizeWorkOSError(
  err: AnyError,
  fallback = "Something went wrong",
): NormalizedAuthError {
  const raw = workosErrorCode(err);
  const subs = subErrors(err);
  const subCodes = subs.map((s) => s.code);
  const baseMessage: string =
    err?.errorDescription ??
    err?.rawData?.error_description ??
    err?.message ??
    err?.rawData?.message ??
    fallback;

  if (raw === "email_verification_required") {
    return { code: "email_verification_required", message: baseMessage, status: 403, raw };
  }

  if (raw === "sso_required") {
    return {
      code: "sso_required",
      message:
        "This email domain is configured for single sign-on. Please sign in with SSO instead of a password.",
      status: 400,
      raw,
    };
  }

  if (
    subCodes.includes("email_not_available") ||
    err?.status === 409 ||
    /already exists|not available/i.test(baseMessage)
  ) {
    return {
      code: "email_exists",
      message: "An account with this email already exists. Sign in instead.",
      status: 409,
      raw,
    };
  }

  if (raw === "password_strength_error" || subCodes.some((c) => c?.startsWith("password_"))) {
    const detail = subs
      .map((s) => s.message)
      .filter((m): m is string => Boolean(m))
      .join(" ");
    return {
      code: "weak_password",
      message: detail || "Password does not meet strength requirements.",
      status: 400,
      raw,
    };
  }

  if (subCodes.includes("email_required") || raw === "invalid_request_parameters") {
    const detail = subs.map((s) => s.message).filter(Boolean).join(" ");
    return { code: "invalid_email", message: detail || baseMessage, status: 400, raw };
  }

  if (err?.status === 429) {
    return {
      code: "rate_limited",
      message: "Too many attempts. Please wait a moment and try again.",
      status: 429,
      raw,
    };
  }

  const status = typeof err?.status === "number" && err.status >= 400 ? err.status : 400;
  return { code: "unknown", message: baseMessage, status, raw };
}
