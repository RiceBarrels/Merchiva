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
// the store tablet is signed in as the account that owns it. A spreadsheet or
// presentation link keeps the current screen and says where the file opens:
// this panel has no editor for it (the Drive app does).
// Access, the starred list, new documents and renames are the operator's
// (DriveActorProvider), and nothing opens before the management notice is
// acknowledged (LiteNoticeGate). Comments, versions, stars and copies go through
// Docs reducers that record the signed-in tablet account, so the editor checks
// "mine" against that account, and star and copy are hidden while the operator
// is someone else (useDocsSender).

import { Suspense, useCallback, useState, type MouseEvent } from "react";
import { toast } from "sonner";
import { DocsOpenProvider, type DocsOpenUrl } from "@/components/docs/docs-open-context";
import { DocEditorRoute } from "@/components/docs/editor/doc-editor-route";
import { DocsHome } from "@/components/docs/home/docs-home";
import { DriveActorProvider } from "@/components/drive/drive-actor";
import { LiteNoticeGate } from "@/components/drive/notice/management-notice";
import { Spinner } from "@/components/ui/loaders/geometric";
import { parseEditorHref } from "@/lib/drive/hrefs";
import { useT } from "@/lib/i18n/context";
import type { LiteAppProps } from "./types";

function Loading() {
  return (
    <div className="flex h-full min-h-[40vh] items-center justify-center">
      <Spinner size={20} className="text-muted-foreground" />
    </div>
  );
}

interface OpenedDoc {
  id: string;
  isNew: boolean;
}

/** `?new=1` on an editor link: the document was just created. */
function isNewDocumentHref(url: string): boolean {
  const query = url.split("#")[0].split("?")[1] ?? "";
  return new URLSearchParams(query).get("new") === "1";
}

export function DocsLite({ member, surface }: LiteAppProps) {
  const t = useT();
  const [opened, setOpened] = useState<OpenedDoc | null>(null);

  // Docs home → editor → back, as screens of this panel instead of URLs:
  // `/manager/docs/edit?id=<uuid>` opens the editor (`&new=1`: just created
  // here), anything else but a spreadsheet or presentation link goes back to
  // the list.
  const open = useCallback<DocsOpenUrl>(
    (url) => {
      const target = parseEditorHref(url);
      if (!target) setOpened(null);
      else if (target.kind === "doc") setOpened({ id: target.id, isNew: isNewDocumentHref(url) });
      else toast(t("docs.editor.otherTypeTitle"));
    },
    [t],
  );

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
    <DriveActorProvider member={member} surface={surface}>
      <LiteNoticeGate>
        <DocsOpenProvider open={open}>
          <div onClickCapture={onClickCapture} className="flex h-full min-h-0 flex-col">
            <Suspense fallback={<Loading />}>
              {opened ? (
                <DocEditorRoute
                  key={opened.id}
                  documentId={opened.id}
                  isNew={opened.isNew}
                  mobile
                  opensOtherFileTypes={false}
                />
              ) : (
                <DocsHome compact />
              )}
            </Suspense>
          </div>
        </DocsOpenProvider>
      </LiteNoticeGate>
    </DriveActorProvider>
  );
}
