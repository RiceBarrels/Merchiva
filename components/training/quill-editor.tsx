"use client";

import { useEffect, useRef } from "react";
import type Quill from "quill";
import "quill/dist/quill.snow.css";
import { cn } from "@/lib/utils";

interface QuillEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minHeight?: number;
}

export function QuillEditor({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  minHeight = 160,
}: QuillEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const onChangeRef = useRef(onChange);
  const lastEmittedRef = useRef<string>(value);

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
        theme: "snow",
        placeholder,
        modules: {
          toolbar: [
            [{ header: 1 }, { header: 2 }],
            ["bold", "italic", "code"],
            [{ list: "ordered" }, { list: "bullet" }, "blockquote"],
            ["link"],
            ["clean"],
          ],
        },
      });

      if (value) {
        editor.clipboard.dangerouslyPasteHTML(value, "silent");
      }

      editor.on("text-change", () => {
        const root = editor.root.innerHTML;
        const html = root === "<p><br></p>" ? "" : root;
        lastEmittedRef.current = html;
        onChangeRef.current(html);
      });

      quillRef.current = editor;
    })();

    return () => {
      cancelled = true;
      quillRef.current = null;
    };
    // mount once; value sync handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (e.g. when switching which day is being edited).
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

  return (
    <div
      className={cn("merchiva-quill rounded-[0.3rem] border border-border bg-background", className)}
      style={{ ["--quill-min-h" as string]: `${minHeight}px` }}
    >
      <div ref={hostRef} />
    </div>
  );
}
