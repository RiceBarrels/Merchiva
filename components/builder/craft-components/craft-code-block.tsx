"use client";

import { useNode, type UserComponent } from "@craftjs/core";

interface CraftCodeBlockProps {
  language: string;
  code: string;
  execute: boolean;
  height: string;
}

export const CraftCodeBlock: UserComponent<CraftCodeBlockProps> = ({
  language,
  code,
  execute,
  height,
}) => {
  const {
    connectors: { connect, drag },
  } = useNode();

  if (!execute) {
    return (
      <div
        ref={(r: HTMLDivElement | null) => {
          if (r) connect(drag(r));
        }}
        style={{
          borderRadius: "var(--sr-radius)",
          overflow: "hidden",
          border: "1px solid #e5e7eb",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.5rem 1rem",
            background: "#18181b",
            color: "#a1a1aa",
            fontSize: "0.75rem",
            fontFamily: "monospace",
          }}
        >
          <span>{language.toUpperCase()}</span>
        </div>
        <pre
          style={{
            margin: 0,
            padding: "1rem",
            background: "#09090b",
            color: "#e4e4e7",
            fontFamily: "'Geist Mono', 'Fira Code', monospace",
            fontSize: "0.8125rem",
            overflowX: "auto",
            lineHeight: 1.6,
          }}
        >
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  const buildSrcdoc = () => {
    if (language === "html") return code;
    if (language === "css")
      return `<!DOCTYPE html><html><head><style>${code}</style></head><body><p>CSS applied</p></body></html>`;
    if (language === "javascript")
      return `<!DOCTYPE html><html><body><script>${code}<\/script></body></html>`;
    return code;
  };

  return (
    <div
      ref={(r: HTMLDivElement | null) => {
        if (r) connect(drag(r));
      }}
    >
      <iframe
        srcDoc={buildSrcdoc()}
        sandbox="allow-scripts"
        style={{
          width: "100%",
          height,
          border: "1px solid #e5e7eb",
          borderRadius: "var(--sr-radius)",
        }}
        title="Code output"
      />
    </div>
  );
};

CraftCodeBlock.craft = {
  displayName: "Code Block",
  props: {
    language: "html",
    code: "<h1>Hello World</h1>",
    execute: false,
    height: "300px",
  },
  related: {},
};
