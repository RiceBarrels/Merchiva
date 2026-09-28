// The spreadsheet route's access is the INTERSECTION of the signed-in account's access and the device
// ceiling of the acting member (sheets.md §10.2), exactly as the sheet reducers intersect the caller and
// the operator (spacetimedb/src/drive/sheets.ts requireSheetAccess). A staff-account tablet therefore shows
// "no access" for an operator's private sheet instead of an editable sheet that can never save.

import { DOC_ROLE_RANK } from "@/lib/docs/access";
import type { DocAccess } from "@/lib/docs/types";

/** The lower of the two roles, with every capability flag ANDed. */
export function intersectDocAccess(a: DocAccess, b: DocAccess): DocAccess {
  return {
    role: DOC_ROLE_RANK[a.role] <= DOC_ROLE_RANK[b.role] ? a.role : b.role,
    canView: a.canView && b.canView,
    canComment: a.canComment && b.canComment,
    canEdit: a.canEdit && b.canEdit,
    canManage: a.canManage && b.canManage,
  };
}
