"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type Quill from "quill";
import "quill/dist/quill.core.css";
import {
  Heading1, Heading2, Bold, Italic, Code, List, ListOrdered,
  Quote, Link as LinkIcon, Eraser, Image as ImageIcon, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface QuillEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minHeight?: number;
  /** When provided, an Image button appears in the toolbar. The callback
   *  receives the file the user picked and should return the URL the image is
   *  hosted at (or null on failure). The editor inserts an inline `<img>` at
   *  the caret position once the upload resolves. */
  onUploadImage?: (file: File) => Promise<string | null>;
}

type ActiveFormats = Record<string, unknown>;

export function QuillEditor({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  minHeight = 160,
  onUploadImage,
}: QuillEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const lastEmittedRef = useRef<string>(value);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<ActiveFormats>({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || quillRef.current) return;

    let cancelled = false;

    void (async () => {
      const QuillCtor = (await import("quill")).default;
      if (cancelled || !hostRef.current) return;

      const editor = new QuillCtor(host, {
        placeholder,
        modules: { toolbar: false },
        formats: [
          "header", "bold", "italic", "code", "code-block",
          "list", "blockquote", "link", "image",
        ],
      });

      if (value) {
        editor.clipboard.dangerouslyPasteHTML(value, "silent");
      }

      const syncActive = () => {
        const sel = editor.getSelection();
        setActive(sel ? (editor.getFormat(sel.index, sel.length) as ActiveFormats) : {});
      };

      editor.on("text-change", () => {
        const root = editor.root.innerHTML;
        const html = root === "<p><br></p>" ? "" : root;
        lastEmittedRef.current = html;
        onChangeRef.current(html);
        syncActive();
      });
      editor.on("selection-change", syncActive);

      quillRef.current = editor;
      setReady(true);
    })();

    return () => {
      cancelled = true;
      quillRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = quillRef.current;
    if (!editor) return;
    if (value === lastEmittedRef.current) return;
    const sel = editor.getSelection();
    editor.clipboard.dangerouslyPasteHTML(value || "", "silent");
    lastEmittedRef.current = value;
    if (sel) editor.setSelection(sel.index, sel.length, "silent");
  }, [value]);

  useEffect(() => {
    const editor = quillRef.current;
    if (!editor) return;
    editor.enable(!disabled);
  }, [disabled]);

  const ensureFocus = useCallback(() => {
    const editor = quillRef.current;
    if (!editor) return null;
    if (!editor.hasFocus()) {
      editor.focus();
    }
    return editor;
  }, []);

  const toggleInline = useCallback((fmt: string) => {
    const editor = ensureFocus();
    if (!editor) return;
    const sel = editor.getSelection();
    const current = sel ? editor.getFormat(sel.index, sel.length) : {};
    editor.format(fmt, !current[fmt]);
  }, [ensureFocus]);

  const setBlock = useCallback((fmt: string, val: string | number | boolean) => {
    const editor = ensureFocus();
    if (!editor) return;
    const current = editor.getFormat();
    editor.format(fmt, current[fmt] === val ? false : val);
  }, [ensureFocus]);

  const insertLink = useCallback(() => {
    const editor = ensureFocus();
    if (!editor) return;
    const sel = editor.getSelection();
    const url = window.prompt("URL", "https://");
    if (!url) return;
    if (sel && sel.length > 0) {
      editor.format("link", url);
    } else {
      const text = window.prompt("Link text", url) || url;
      const idx = sel?.index ?? editor.getLength();
      editor.insertText(idx, text, { link: url } as Record<string, unknown>);
      editor.setSelection(idx + text.length, 0);
    }
  }, [ensureFocus]);

  const clearFormat = useCallback(() => {
    const editor = ensureFocus();
    if (!editor) return;
    const sel = editor.getSelection();
    if (!sel) return;
    if (sel.length > 0) {
      editor.removeFormat(sel.index, sel.length);
    } else {
      const fmts = editor.getFormat();
      Object.keys(fmts).forEach((k) => editor.format(k, false));
    }
  }, [ensureFocus]);

  const pickImage = useCallback(() => {
    if (!onUploadImage || uploading) return;
    fileInputRef.current?.click();
  }, [onUploadImage, uploading]);

  const insertImage = useCallback(
    async (file: File) => {
      if (!onUploadImage) return;
      const editor = quillRef.current;
      if (!editor) return;
      // Remember caret position BEFORE the upload — the editor may lose focus
      // while the user waits.
      const sel = editor.getSelection(true);
      const insertAt = sel ? sel.index : editor.getLength();
      setUploading(true);
      try {
        const url = await onUploadImage(file);
        if (!url) return;
        editor.insertEmbed(insertAt, "image", url, "user");
        // Move caret past the inserted image.
        editor.setSelection(insertAt + 1, 0, "user");
        // Quill's `insertEmbed` does not always fire `text-change` in older
        // builds — sync the emitted value manually to be safe.
        const root = editor.root.innerHTML;
        const html = root === "<p><br></p>" ? "" : root;
        lastEmittedRef.current = html;
        onChangeRef.current(html);
      } catch (err) {
        console.error("[QuillEditor] image upload failed", err);
      } finally {
        setUploading(false);
      }
    },
    [onUploadImage],
  );

  const isActive = (fmt: string, val?: string | number): boolean => {
    const v = active[fmt];
    if (val === undefined) return Boolean(v);
    return v === val;
  };

  const tools: ToolItem[] = [
    { kind: "btn", label: "Heading 1", icon: Heading1, active: isActive("header", 1), onClick: () => setBlock("header", 1) },
    { kind: "btn", label: "Heading 2", icon: Heading2, active: isActive("header", 2), onClick: () => setBlock("header", 2) },
    { kind: "sep" },
    { kind: "btn", label: "Bold", icon: Bold, active: isActive("bold"), onClick: () => toggleInline("bold") },
    { kind: "btn", label: "Italic", icon: Italic, active: isActive("italic"), onClick: () => toggleInline("italic") },
    { kind: "btn", label: "Inline code", icon: Code, active: isActive("code"), onClick: () => toggleInline("code") },
    { kind: "sep" },
    { kind: "btn", label: "Bullet list", icon: List, active: isActive("list", "bullet"), onClick: () => setBlock("list", "bullet") },
    { kind: "btn", label: "Numbered list", icon: ListOrdered, active: isActive("list", "ordered"), onClick: () => setBlock("list", "ordered") },
    { kind: "btn", label: "Quote", icon: Quote, active: isActive("blockquote"), onClick: () => setBlock("blockquote", true) },
    { kind: "sep" },
    { kind: "btn", label: "Link", icon: LinkIcon, active: isActive("link"), onClick: insertLink },
    ...(onUploadImage
      ? ([
          {
            kind: "btn" as const,
            label: uploading ? "Uploading…" : "Insert image",
            icon: uploading ? Loader2 : ImageIcon,
            active: false,
            onClick: pickImage,
            spin: uploading,
          },
        ] satisfies ToolItem[])
      : []),
    { kind: "btn", label: "Clear formatting", icon: Eraser, active: false, onClick: clearFormat },
  ];

  return (
    <div
      className={cn(
        "merchiva-quill rounded-lg border border-border bg-background overflow-hidden",
        className,
      )}
      style={{ ["--quill-min-h" as string]: `${minHeight}px` }}
    >
      <div
        className="flex items-center gap-0.5 px-2 h-9 border-b border-border bg-muted/40"
        aria-disabled={disabled || !ready}
      >
        {tools.map((tool, i) => {
          if (tool.kind === "sep") {
            return <div key={i} className="w-px h-4 bg-border mx-1" aria-hidden />;
          }
          const Icon = tool.icon;
          return (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={tool.onClick}
              disabled={disabled || !ready}
              title={tool.label}
              aria-label={tool.label}
              aria-pressed={tool.active}
              className={cn(
                "h-6 w-6 rounded inline-flex items-center justify-center transition-colors disabled:opacity-50",
                tool.active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon
                className={cn("h-3.5 w-3.5", tool.spin && "animate-spin")}
                strokeWidth={1.75}
              />
            </button>
          );
        })}
        <div className="flex-1" />
        <span className="font-mono text-[9.5px] text-muted-foreground/70 uppercase tracking-wider">
          rich text
        </span>
      </div>
      <div ref={hostRef} />
      {onUploadImage && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void insertImage(f);
            e.target.value = "";
          }}
        />
      )}
    </div>
  );
}

type ToolItem =
  | { kind: "sep" }
  | {
      kind: "btn";
      label: string;
      icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
      active: boolean;
      onClick: () => void;
      /** Spin the icon (used while an upload is in flight). */
      spin?: boolean;
    };
