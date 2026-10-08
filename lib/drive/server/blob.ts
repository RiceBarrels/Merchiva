import "server-only";

// The Vercel Blob operations Drive uses, bound to the configured store. The
// store is private: bytes are only reachable through presigned URLs.
//
// Every GET URL is signed locally (HMAC) from one cached store-wide get/head
// delegation, re-issued when less than DRIVE_READ_DELEGATION_REFRESH_MS remain;
// its clientSigningToken never leaves the server. `download=1` is appended
// outside the signature, which the Blob CDN answers as an attachment.

import {
  BlobNotFoundError, del, head, issueSignedToken, list, presignUrl, type IssuedSignedToken, type ListBlobResultBlob,
} from "@vercel/blob";
import { DRIVE_READ_DELEGATION_REFRESH_MS, DRIVE_READ_DELEGATION_TTL_MS } from "./handlers/config";
import type { DriveBlobOps, DriveListPage, DriveStorageConfig } from "./handlers/types";

export {
  DRIVE_GET_TTL_MS, DRIVE_PUT_TTL_MULTIPART_MS, DRIVE_PUT_TTL_SINGLE_MS, DRIVE_READ_DELEGATION_TTL_MS,
} from "./handlers/config";

function listedBlobs(blobs: readonly ListBlobResultBlob[]): DriveListPage["blobs"] {
  return blobs.map((blob) => ({ pathname: blob.pathname, size: blob.size, uploadedAt: blob.uploadedAt.getTime() }));
}

export function createDriveBlobOps(config: DriveStorageConfig, now: () => number = Date.now): DriveBlobOps {
  const auth = "token" in config.blobAuth ? { token: config.blobAuth.token } : { storeId: config.blobAuth.storeId };
  let readDelegation: IssuedSignedToken | null = null;
  let issuing: Promise<IssuedSignedToken> | null = null;

  /** The cached read delegation; concurrent callers share one issuance. */
  function currentReadDelegation(): Promise<IssuedSignedToken> {
    if (readDelegation && readDelegation.validUntil - now() > DRIVE_READ_DELEGATION_REFRESH_MS) {
      return Promise.resolve(readDelegation);
    }
    if (!issuing) {
      issuing = issueSignedToken({
        ...auth, pathname: "*", operations: ["get", "head"], validUntil: now() + DRIVE_READ_DELEGATION_TTL_MS,
      })
        .then((token) => {
          readDelegation = token;
          return token;
        })
        .finally(() => {
          issuing = null;
        });
    }
    return issuing;
  }

  return {
    issuePutToken(pathname, opts) {
      return issueSignedToken({ ...auth, pathname, operations: ["put"], ...opts });
    },

    async presignGet(pathname, { validUntil, download }) {
      const delegation = await currentReadDelegation();
      const { presignedUrl } = await presignUrl(delegation, { operation: "get", pathname, access: "private", validUntil });
      if (!download) return presignedUrl;
      const url = new URL(presignedUrl);
      url.searchParams.set("download", "1");
      return url.toString();
    },

    async head(pathname) {
      try {
        const result = await head(pathname, auth);
        return { size: result.size, contentType: result.contentType, etag: result.etag, uploadedAt: result.uploadedAt.getTime() };
      } catch (err) {
        if (err instanceof BlobNotFoundError) return null;
        throw err;
      }
    },

    async del(pathnames) {
      if (pathnames.length > 0) await del(pathnames, auth);
    },

    async list({ prefix, cursor, limit, mode }) {
      if (mode === "folded") {
        const page = await list({ ...auth, prefix, cursor, limit, mode: "folded" });
        return { blobs: listedBlobs(page.blobs), folders: page.folders, cursor: page.cursor, hasMore: page.hasMore };
      }
      const page = await list({ ...auth, prefix, cursor, limit, mode: "expanded" });
      return { blobs: listedBlobs(page.blobs), folders: [], cursor: page.cursor, hasMore: page.hasMore };
    },
  };
}
