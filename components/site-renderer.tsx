"use client";

import type { SiteElement, SiteTheme } from "@/lib/types";

// ─── Theme CSS variables ───────────────────────────────────────────────────────

function themeToVars(theme: SiteTheme): React.CSSProperties {
  return {
    "--site-primary": theme.primaryColor,
    "--site-secondary": theme.secondaryColor,
    "--site-accent": theme.accentColor,
    "--site-bg": theme.backgroundColor,
    "--site-text": theme.textColor,
    "--site-font-heading": theme.headingFont + ", Inter, system-ui, sans-serif",
    "--site-font-body": theme.bodyFont + ", Inter, system-ui, sans-serif",
    "--site-font-size": theme.baseFontSize + "px",
    "--site-radius": theme.borderRadius + "px",
    "--site-max-width": theme.maxContentWidth + "px",
    "--site-padding": theme.sectionPadding + "px",
  } as React.CSSProperties;
}

// ─── Individual element renderers ─────────────────────────────────────────────

function ElementText({ el, editable }: { el: SiteElement; editable?: boolean }) {
  const tag = (el.props.tag as string) ?? "p";
  const content = (el.props.content as string) ?? "Text block";
  const align = (el.props.align as string) ?? "left";
  const color = (el.props.color as string) ?? "var(--site-text)";

  const style: React.CSSProperties = {
    color,
    textAlign: align as React.CSSProperties["textAlign"],
    fontFamily:
      tag.startsWith("h") ? "var(--site-font-heading)" : "var(--site-font-body)",
    fontSize: tag === "h1" ? "2.5em" : tag === "h2" ? "2em" : tag === "h3" ? "1.5em" : "1em",
    fontWeight: tag.startsWith("h") ? 700 : 400,
    lineHeight: tag.startsWith("h") ? "1.2" : "1.6",
    margin: "0 0 0.75em",
  };

  if (editable) {
    return (
      <div
        contentEditable
        suppressContentEditableWarning
        data-element-id={el.id}
        style={style}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  const Tag = tag as keyof JSX.IntrinsicElements;
  return <Tag style={style} dangerouslySetInnerHTML={{ __html: content }} />;
}

function ElementImage({ el }: { el: SiteElement }) {
  const src = (el.props.src as string) ?? "";
  const alt = (el.props.alt as string) ?? "";
  const width = (el.props.width as string) ?? "100%";
  const borderRadius = (el.props.rounded as boolean) ? "var(--site-radius)" : "0";

  if (!src) {
    return (
      <div
        style={{
          width,
          height: "200px",
          background: "#e2e8f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#94a3b8",
          fontSize: "14px",
          borderRadius,
        }}
      >
        Image
      </div>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} style={{ width, borderRadius, display: "block", maxWidth: "100%" }} />;
}

function ElementButton({ el }: { el: SiteElement }) {
  const label = (el.props.label as string) ?? "Button";
  const href = (el.props.href as string) ?? "#";
  const variant = (el.props.variant as string) ?? "primary";
  const align = (el.props.align as string) ?? "left";

  const baseStyle: React.CSSProperties = {
    display: "inline-block",
    padding: "0.6em 1.4em",
    borderRadius: "var(--site-radius)",
    fontFamily: "var(--site-font-body)",
    fontSize: "1em",
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "none",
    border: "none",
    lineHeight: "1",
  };

  const variantStyle: React.CSSProperties =
    variant === "outline"
      ? {
          background: "transparent",
          border: "2px solid var(--site-primary)",
          color: "var(--site-primary)",
        }
      : variant === "ghost"
      ? {
          background: "transparent",
          color: "var(--site-primary)",
        }
      : {
          background: "var(--site-primary)",
          color: "#ffffff",
        };

  return (
    <div style={{ textAlign: align as React.CSSProperties["textAlign"] }}>
      <a href={href} style={{ ...baseStyle, ...variantStyle }}>
        {label}
      </a>
    </div>
  );
}

function ElementDivider({ el }: { el: SiteElement }) {
  const color = (el.props.color as string) ?? "#e2e8f0";
  return (
    <hr
      style={{
        border: "none",
        borderTop: `1px solid ${color}`,
        margin: "1.5em 0",
      }}
    />
  );
}

function ElementSpacer({ el }: { el: SiteElement }) {
  const height = (el.props.height as number) ?? 32;
  return <div style={{ height: `${height}px` }} />;
}

function ElementHero({ el, editable }: { el: SiteElement; editable?: boolean }) {
  const title = (el.props.title as string) ?? "Welcome to our site";
  const subtitle = (el.props.subtitle as string) ?? "Your tagline goes here";
  const bgImage = el.props.bgImage as string | undefined;
  const bgColor = (el.props.bgColor as string) ?? "var(--site-primary)";
  const ctaLabel = (el.props.ctaLabel as string) ?? "Get Started";
  const ctaHref = (el.props.ctaHref as string) ?? "#";
  const align = (el.props.align as string) ?? "center";
  const minHeight = (el.props.minHeight as number) ?? 480;

  const wrapStyle: React.CSSProperties = {
    minHeight: `${minHeight}px`,
    display: "flex",
    alignItems: "center",
    justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
    padding: "var(--site-padding)",
    background: bgImage
      ? `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url(${bgImage}) center/cover`
      : bgColor,
    color: bgImage ? "#ffffff" : "#ffffff",
    textAlign: align as React.CSSProperties["textAlign"],
  };

  return (
    <section style={wrapStyle}>
      <div style={{ maxWidth: "700px" }}>
        <h1
          contentEditable={editable}
          suppressContentEditableWarning
          style={{
            fontFamily: "var(--site-font-heading)",
            fontSize: "3em",
            fontWeight: 800,
            margin: "0 0 0.5em",
            lineHeight: 1.1,
          }}
        >
          {title}
        </h1>
        <p
          contentEditable={editable}
          suppressContentEditableWarning
          style={{ fontSize: "1.25em", opacity: 0.9, margin: "0 0 1.5em" }}
        >
          {subtitle}
        </p>
        <a
          href={ctaHref}
          style={{
            display: "inline-block",
            background: "var(--site-accent)",
            color: "#000",
            padding: "0.75em 2em",
            borderRadius: "var(--site-radius)",
            fontWeight: 700,
            textDecoration: "none",
            fontSize: "1em",
          }}
        >
          {ctaLabel}
        </a>
      </div>
    </section>
  );
}

function ElementNav({ el }: { el: SiteElement }) {
  const logo = (el.props.logo as string) ?? "MySite";
  const links = (el.props.links as { label: string; href: string }[]) ?? [];
  const bgColor = (el.props.bgColor as string) ?? "#ffffff";
  const textColor = (el.props.textColor as string) ?? "var(--site-text)";

  return (
    <nav
      style={{
        background: bgColor,
        borderBottom: "1px solid #e2e8f0",
        padding: "0 var(--site-padding)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "60px",
      }}
    >
      <span
        style={{
          fontFamily: "var(--site-font-heading)",
          fontWeight: 700,
          fontSize: "1.2em",
          color: textColor,
        }}
      >
        {logo}
      </span>
      <div style={{ display: "flex", gap: "1.5em" }}>
        {links.map((link, i) => (
          <a
            key={i}
            href={link.href}
            style={{
              color: textColor,
              textDecoration: "none",
              fontFamily: "var(--site-font-body)",
              fontSize: "0.95em",
            }}
          >
            {link.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

function ElementFooter({ el }: { el: SiteElement }) {
  const columns = (el.props.columns as { heading: string; links: { label: string; href: string }[] }[]) ?? [];
  const copyright = (el.props.copyright as string) ?? "";
  const bgColor = (el.props.bgColor as string) ?? "#0f172a";
  const textColor = (el.props.textColor as string) ?? "#94a3b8";

  return (
    <footer
      style={{
        background: bgColor,
        color: textColor,
        padding: "var(--site-padding)",
        fontFamily: "var(--site-font-body)",
        fontSize: "0.9em",
      }}
    >
      {columns.length > 0 && (
        <div style={{ display: "flex", gap: "3em", flexWrap: "wrap", marginBottom: "2em" }}>
          {columns.map((col, i) => (
            <div key={i}>
              <div style={{ fontWeight: 700, color: "#ffffff", marginBottom: "0.75em" }}>{col.heading}</div>
              {col.links.map((link, j) => (
                <div key={j} style={{ marginBottom: "0.5em" }}>
                  <a href={link.href} style={{ color: textColor, textDecoration: "none" }}>
                    {link.label}
                  </a>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {copyright && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "1em" }}>
          {copyright}
        </div>
      )}
    </footer>
  );
}

function ElementContainer({
  el,
  editable,
  onSelect,
  selectedId,
}: {
  el: SiteElement;
  editable?: boolean;
  onSelect?: (id: string) => void;
  selectedId?: string;
}) {
  const direction = (el.props.direction as string) ?? "column";
  const gap = (el.props.gap as number) ?? 16;
  const bgColor = el.props.bgColor as string | undefined;
  const padding = (el.props.padding as number) ?? 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: direction as React.CSSProperties["flexDirection"],
        gap: `${gap}px`,
        background: bgColor,
        padding: `${padding}px`,
      }}
    >
      {(el.children ?? []).map((child) => (
        <ElementNode
          key={child.id}
          el={child}
          editable={editable}
          onSelect={onSelect}
          selectedId={selectedId}
        />
      ))}
    </div>
  );
}

function ElementColumns({
  el,
  editable,
  onSelect,
  selectedId,
}: {
  el: SiteElement;
  editable?: boolean;
  onSelect?: (id: string) => void;
  selectedId?: string;
}) {
  const gap = (el.props.gap as number) ?? 24;

  return (
    <div
      style={{
        display: "flex",
        gap: `${gap}px`,
        flexWrap: "wrap",
        alignItems: "flex-start",
      }}
    >
      {(el.children ?? []).map((child) => (
        <div key={child.id} style={{ flex: 1, minWidth: "200px" }}>
          <ElementNode
            el={child}
            editable={editable}
            onSelect={onSelect}
            selectedId={selectedId}
          />
        </div>
      ))}
    </div>
  );
}

function ElementVideo({ el }: { el: SiteElement }) {
  const src = (el.props.src as string) ?? "";
  const isYoutube = src.includes("youtube") || src.includes("youtu.be");

  if (!src) {
    return (
      <div
        style={{
          width: "100%",
          paddingTop: "56.25%",
          background: "#0f172a",
          position: "relative",
          borderRadius: "var(--site-radius)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#475569" }}>
          Video
        </span>
      </div>
    );
  }

  if (isYoutube) {
    const videoId = src.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]+)/)?.[1] ?? "";
    return (
      <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: "var(--site-radius)", overflow: "hidden" }}>
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
          allowFullScreen
          title="Video"
        />
      </div>
    );
  }

  return (
    <video
      src={src}
      controls
      style={{ width: "100%", borderRadius: "var(--site-radius)", display: "block" }}
    />
  );
}

function ElementGallery({ el }: { el: SiteElement }) {
  const images = (el.props.images as { src: string; alt: string }[]) ?? [];
  const columns = (el.props.columns as number) ?? 3;
  const gap = (el.props.gap as number) ?? 12;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: `${gap}px`,
      }}
    >
      {images.map((img, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={img.src}
          alt={img.alt}
          style={{
            width: "100%",
            aspectRatio: "1",
            objectFit: "cover",
            borderRadius: "var(--site-radius)",
            display: "block",
          }}
        />
      ))}
      {images.length === 0 && (
        <div style={{ gridColumn: `1 / span ${columns}`, padding: "2em", textAlign: "center", color: "#94a3b8", background: "#f1f5f9", borderRadius: "var(--site-radius)" }}>
          Gallery (no images added)
        </div>
      )}
    </div>
  );
}

function ElementCustomHtml({ el }: { el: SiteElement }) {
  const html = (el.props.html as string) ?? "";
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

function ElementNode({
  el,
  editable,
  onSelect,
  selectedId,
}: {
  el: SiteElement;
  editable?: boolean;
  onSelect?: (id: string) => void;
  selectedId?: string;
}) {
  const isSelected = editable && selectedId === el.id;

  const wrapStyle: React.CSSProperties = editable
    ? {
        position: "relative",
        outline: isSelected ? "2px solid #2563eb" : "1px dashed transparent",
        outlineOffset: "2px",
        cursor: "pointer",
        transition: "outline 0.1s",
      }
    : {};

  const inner = (() => {
    switch (el.type) {
      case "text":
        return <ElementText el={el} editable={editable} />;
      case "image":
        return <ElementImage el={el} />;
      case "button":
        return <ElementButton el={el} />;
      case "divider":
        return <ElementDivider el={el} />;
      case "spacer":
        return <ElementSpacer el={el} />;
      case "hero":
        return <ElementHero el={el} editable={editable} />;
      case "nav":
        return <ElementNav el={el} />;
      case "footer":
        return <ElementFooter el={el} />;
      case "container":
        return <ElementContainer el={el} editable={editable} onSelect={onSelect} selectedId={selectedId} />;
      case "columns":
        return <ElementColumns el={el} editable={editable} onSelect={onSelect} selectedId={selectedId} />;
      case "video":
        return <ElementVideo el={el} />;
      case "gallery":
        return <ElementGallery el={el} />;
      case "custom-html":
        return <ElementCustomHtml el={el} />;
      default:
        return null;
    }
  })();

  if (!editable) return <>{inner}</>;

  return (
    <div
      style={wrapStyle}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(el.id);
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLDivElement).style.outline = "1px dashed #93c5fd";
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLDivElement).style.outline = "1px dashed transparent";
        }
      }}
    >
      {inner}
      {isSelected && (
        <div
          style={{
            position: "absolute",
            top: -20,
            left: 0,
            background: "#2563eb",
            color: "#fff",
            fontSize: "10px",
            padding: "2px 6px",
            borderRadius: "3px",
            fontFamily: "monospace",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          {el.type}
        </div>
      )}
    </div>
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function SiteRenderer({
  elements,
  theme,
  editable,
  onSelect,
  selectedId,
}: {
  elements: SiteElement[];
  theme: SiteTheme;
  editable?: boolean;
  onSelect?: (id: string) => void;
  selectedId?: string;
}) {
  return (
    <div
      style={{
        ...themeToVars(theme),
        background: "var(--site-bg)",
        color: "var(--site-text)",
        fontFamily: "var(--site-font-body)",
        fontSize: "var(--site-font-size)",
        minHeight: "100%",
      }}
    >
      {elements.map((el) => (
        <ElementNode
          key={el.id}
          el={el}
          editable={editable}
          onSelect={onSelect}
          selectedId={selectedId}
        />
      ))}
      {elements.length === 0 && !editable && (
        <div style={{ padding: "4em", textAlign: "center", color: "#94a3b8" }}>
          This page has no content yet.
        </div>
      )}
    </div>
  );
}

// ─── Mini preview (for theme page) ───────────────────────────────────────────

export function ThemePreview({ theme }: { theme: SiteTheme }) {
  const sampleElements: SiteElement[] = [
    {
      id: "prev-nav",
      siteId: "",
      pageId: "",
      parentId: null,
      type: "nav",
      sortOrder: 0,
      props: {
        logo: "MySite",
        links: [
          { label: "Home", href: "#" },
          { label: "About", href: "#" },
          { label: "Contact", href: "#" },
        ],
      },
    },
    {
      id: "prev-hero",
      siteId: "",
      pageId: "",
      parentId: null,
      type: "hero",
      sortOrder: 1,
      props: {
        title: "Welcome to MySite",
        subtitle: "The best place to showcase your work",
        ctaLabel: "Get Started",
        ctaHref: "#",
        align: "center",
        minHeight: 240,
      },
    },
    {
      id: "prev-section",
      siteId: "",
      pageId: "",
      parentId: null,
      type: "container",
      sortOrder: 2,
      props: { direction: "column", gap: 16, padding: 32 },
      children: [
        {
          id: "prev-h2",
          siteId: "",
          pageId: "",
          parentId: "prev-section",
          type: "text",
          sortOrder: 0,
          props: { tag: "h2", content: "Our Features", align: "center" },
        },
        {
          id: "prev-p",
          siteId: "",
          pageId: "",
          parentId: "prev-section",
          type: "text",
          sortOrder: 1,
          props: {
            tag: "p",
            content: "Everything you need to build a beautiful website.",
            align: "center",
          },
        },
        {
          id: "prev-btn",
          siteId: "",
          pageId: "",
          parentId: "prev-section",
          type: "button",
          sortOrder: 2,
          props: { label: "Learn More", href: "#", variant: "primary", align: "center" },
        },
      ],
    },
    {
      id: "prev-footer",
      siteId: "",
      pageId: "",
      parentId: null,
      type: "footer",
      sortOrder: 3,
      props: {
        copyright: "© 2026 MySite. All rights reserved.",
        columns: [],
      },
    },
  ];

  return <SiteRenderer elements={sampleElements} theme={theme} />;
}
