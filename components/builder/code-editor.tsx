"use client";

import { useCallback } from "react";
import dynamic from "next/dynamic";
import type { OnChange, OnMount } from "@monaco-editor/react";

import { Spinner } from "@/components/ui/loaders/geometric";

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.Editor), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-stone-950 text-stone-400">
      <Spinner size={16} />
    </div>
  ),
});

interface CodeEditorProps {
  value: string;
  onChange: (next: string) => void;
  language?: string;
  className?: string;
  ariaLabel?: string;
}

export function CodeEditor({
  value,
  onChange,
  language = "html",
  className,
  ariaLabel,
}: CodeEditorProps) {
  const handleChange = useCallback<OnChange>(
    (next) => onChange(next ?? ""),
    [onChange],
  );

  const handleMount = useCallback<OnMount>((editor, monaco) => {
    monaco.editor.defineTheme("merchiva-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#0c0a09",
        "editor.foreground": "#e7e5e4",
        "editorLineNumber.foreground": "#44403c",
        "editorLineNumber.activeForeground": "#a8a29e",
        "editor.lineHighlightBackground": "#1c1917",
        "editor.selectionBackground": "#44403c",
        "editorCursor.foreground": "#fafaf9",
        "editorIndentGuide.background": "#1c1917",
      },
    });
    monaco.editor.setTheme("merchiva-dark");
    if (ariaLabel) editor.updateOptions({ ariaLabel });
  }, [ariaLabel]);

  return (
    <div className={className}>
      <MonacoEditor
        height="100%"
        language={language}
        value={value}
        onChange={handleChange}
        onMount={handleMount}
        theme="merchiva-dark"
        options={{
          fontFamily:
            "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
          lineHeight: 18,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: "on",
          automaticLayout: true,
          tabSize: 2,
          padding: { top: 12, bottom: 12 },
          renderLineHighlight: "line",
          contextmenu: false,
          smoothScrolling: true,
          cursorBlinking: "smooth",
          formatOnPaste: true,
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
            useShadows: false,
          },
          guides: { indentation: false, highlightActiveIndentation: false },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
        }}
      />
    </div>
  );
}
