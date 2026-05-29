// Minimal Markdown → HTML conversion used to seed the Quill editor when an
// admin opens an existing post. Posts are *stored* as Markdown (so the public
// /blogs page can render them via react-markdown), but Quill works in HTML.
// Round-tripping through a full Markdown parser would pull DOMpurify and a
// heavier dep — this tiny converter covers the constructs Quill emits and
// gracefully falls back to wrapping unknown lines in <p>.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inline(s: string): string {
  let out = escapeHtml(s);
  // Links: [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
    const safeUrl = String(url).replace(/"/g, "&quot;");
    return `<a href="${safeUrl}">${text}</a>`;
  });
  // Bold + italic
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  // Inline code
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  return out;
}

// Walks the Markdown line-by-line, grouping list items and fenced code blocks.
// Returns an HTML string suitable for `quill.clipboard.dangerouslyPasteHTML` or
// initial value in `<ReactQuill value=…>`.
export function markdownToQuillHtml(md: string): string {
  if (!md) return "";
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inCode = false;
  let codeBuffer: string[] = [];
  let listKind: "ul" | "ol" | null = null;

  function closeList() {
    if (listKind) {
      out.push(`</${listKind}>`);
      listKind = null;
    }
  }

  for (const raw of lines) {
    if (inCode) {
      if (raw.startsWith("```")) {
        out.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
        codeBuffer = [];
        inCode = false;
      } else {
        codeBuffer.push(raw);
      }
      continue;
    }
    if (raw.startsWith("```")) {
      closeList();
      inCode = true;
      continue;
    }
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      closeList();
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      continue;
    }
    if (/^>\s+/.test(line)) {
      closeList();
      out.push(`<blockquote>${inline(line.replace(/^>\s+/, ""))}</blockquote>`);
      continue;
    }
    const ul = /^[-*]\s+(.+)$/.exec(line);
    if (ul) {
      if (listKind !== "ul") {
        closeList();
        out.push("<ul>");
        listKind = "ul";
      }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }
    const ol = /^\d+\.\s+(.+)$/.exec(line);
    if (ol) {
      if (listKind !== "ol") {
        closeList();
        out.push("<ol>");
        listKind = "ol";
      }
      out.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  if (inCode) {
    out.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
  }
  return out.join("");
}
