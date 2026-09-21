"use client";

// "Docs" on /store + /personal.
//
// Unlike the other device apps this is not a simplified rewrite: it renders the
// manager's own Docs screens — the phone layout of /manager/docs and
// /manager/docs/edit — inside the device panel, so a store tablet and a staff
// phone get the same documents and the same editor, without the back office
// around them.
//
// A panel has no URL of its own, so navigation is caught in two places:
//   · `DocsOpenProvider` replaces `openUrl` for everything the Docs screens do
//     in code (create, import, "open", the mobile back button, …);
//   · the click capture below catches the plain `/manager/docs/edit?id=…`
//     links in the document lists and grids.
// Every other /manager link is swallowed: a device never leaves its surface —
// the store tablet is signed in as the account that owns it.

import { Suspense, useCallback, useState, type MouseEvent } from "react";
import { DocsOpenProvider, type DocsOpenUrl } from "@/components/docs/docs-open-context";
import { DocEditorRoute } from "@/components/docs/editor/doc-editor-route";
import { DocsHome } from "@/components/docs/home/docs-home";
import { Spinner } from "@/components/ui/loaders/geometric";
import { DOCS_EDIT_PATH } from "@/lib/docs/hrefs";
import { isDocumentId } from "@/lib/docs/ids";

function Loading() {
  return (
    <div className="flex h-full min-h-[40vh] items-center justify-center">
      <Spinner size={20} className="text-muted-foreground" />
    </div>
  );
}

/** `/manager/docs/edit?id=<uuid>` → the document id; anything else → null (= the list). */
function docIdFromHref(href: string): string | null {
  const [path, query = ""] = href.split("#")[0].split("?");
  if ((path.replace(/\/+$/, "") || "/") !== DOCS_EDIT_PATH) return null;
  const id = new URLSearchParams(query).get("id");
  return id && isDocumentId(id) ? id.toLowerCase() : null;
}

export function DocsLite() {
  const [openId, setOpenId] = useState<string | null>(null);

  // Docs home → editor → back, as screens of this panel instead of URLs.
  const open = useCallback<DocsOpenUrl>((url) => setOpenId(docIdFromHref(url)), []);

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
    const href = anchor?.getAttribute("href") ?? "";
    if (!href.startsWith("/manager")) return;
    event.preventDefault();
    event.stopPropagation();
    open(href, "current");
  };

  return (
    <DocsOpenProvider open={open}>
      <div onClickCapture={onClickCapture} className="flex h-full min-h-0 flex-col">
        <Suspense fallback={<Loading />}>
          {openId ? <DocEditorRoute key={openId} documentId={openId} mobile /> : <DocsHome compact />}
        </Suspense>
      </div>
    </DocsOpenProvider>
  );
}
