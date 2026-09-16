"use client";

import { useId, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { AppIcon } from "@/components/device/app-icons";
import { MerchivaLogo } from "@/components/logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useActiveTab, useNavSections, useTabPresentation, type NavSection, type TabUrl } from "@/lib/browser-shell";
import { useI18n, useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";
import {
  SIDEBAR_CLASS,
  SIDEBAR_HEADER_CLASS,
  SIDEBAR_ICON_BUTTON_CLASS,
  SIDEBAR_PAD_CLASS,
  SIDEBAR_ROW_ACTIVE_CLASS,
  SIDEBAR_ROW_CLASS,
  SIDEBAR_ROW_IDLE_CLASS,
  SIDEBAR_SUB_ROW_CLASS,
} from "../chrome-classes";
import {
  activeSectionHref,
  isRowActive,
  isSectionRowActive,
  splitSidebarSections,
  toggleExpanded,
  withExpanded,
} from "./sidebar-nav";
import { SIDEBAR_ELEMENT_ID } from "./sidebar-state";
import { SidebarWorkspaceSwitcher } from "./workspace-switcher";

/*
 * Desktop sidebar (≥1024px only; the mobile Safari chrome keeps its page menu and launcher).
 * It replicates the legacy sidebar (components/sidebar.tsx SidebarContent): logo header,
 * combined store + account switcher, nav rows with expandable sub-pages, Settings pinned at
 * the bottom, the collapse control and the version line.
 *
 * Its rows come from core `useNavSections()`, so permission / device-app / personal-mode /
 * Capacitor gating is the same as everywhere else in the shell, and they are plain <Link>
 * anchors so core's link interceptor turns Mod-click and middle-click into tabs.
 *
 * `collapsed` (icon rail) and the panel width are owned by the chrome's ResizablePanelGroup;
 * hiding the sidebar entirely is the toolbar toggle (sidebar-state.ts).
 */

/** Suppresses Windows middle-button autoscroll; core's interceptor opens the tab. */
function onRowMouseDown(event: MouseEvent<HTMLAnchorElement>): void {
  if (event.button === 1) event.preventDefault();
}

export function BrowserSidebar({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse(): void }) {
  const { t, dir } = useI18n();
  const sections = useNavSections();
  const activeTab = useActiveTab();
  const presentation = useTabPresentation(activeTab);
  const activeUrl = presentation.url;

  const { primary, pinned } = useMemo(() => splitSidebarSections(sections), [sections]);
  const activeSection = useMemo(() => activeSectionHref(sections, activeUrl), [sections, activeUrl]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [expandedFor, setExpandedFor] = useState<string | null>(null);

  // Auto-expand the section that owns the active tab, and never auto-collapse another one.
  // Adjusting the state while rendering (React's "you might not need an effect") keeps the
  // sub-pages open in the same paint as the row that opened them.
  if (activeSection !== expandedFor) {
    setExpandedFor(activeSection);
    setExpanded((prev) => withExpanded(prev, activeSection));
  }

  return (
    <aside
      id={SIDEBAR_ELEMENT_ID}
      data-slot="browser-sidebar"
      data-collapsed={collapsed ? "" : undefined}
      // The panel group is pinned to LTR so the resize drag tracks the pointer in RTL
      // (chrome-classes.ts SIDEBAR_HANDLE_CLASS); the sidebar re-declares the real direction.
      dir={dir}
      aria-label={t("browserDesktop.sidebar.label")}
      className={SIDEBAR_CLASS}
    >
      <div className={cn(SIDEBAR_HEADER_CLASS, collapsed && "justify-center px-2")}>
        <MerchivaLogo size={24} fg="var(--background)" bg="var(--foreground)" rounded />
        {collapsed ? null : (
          <p className="min-w-0 truncate text-[13px] font-semibold leading-tight tracking-tight">
            Merchiva <span className="text-[10px] font-normal text-muted-foreground">{t("components.sidebar.beta")}</span>
          </p>
        )}
      </div>

      <div className={cn("shrink-0 border-b border-border py-2", SIDEBAR_PAD_CLASS)}>
        <SidebarWorkspaceSwitcher collapsed={collapsed} />
      </div>

      <nav
        aria-label={t("browserDesktop.sidebar.nav")}
        className={cn("min-h-0 flex-1 space-y-0.5 overflow-y-auto py-2", SIDEBAR_PAD_CLASS)}
      >
        {primary.map((section) => (
          <SidebarSection
            key={section.href}
            section={section}
            collapsed={collapsed}
            activeUrl={activeUrl}
            activeSection={activeSection}
            expanded={expanded.has(section.href)}
            onToggle={() => setExpanded((prev) => toggleExpanded(prev, section.href))}
          />
        ))}
      </nav>

      <div className={cn("shrink-0 space-y-0.5 border-t border-border py-2", SIDEBAR_PAD_CLASS)}>
        {pinned.map((section) => (
          <SidebarRow
            key={section.href}
            href={section.href}
            title={t(section.titleKey)}
            icon={section.icon}
            // Pinned rows never show sub-pages, so the row itself carries sub-routes like
            // /manager/settings/billing.
            active={isSectionRowActive(section, activeUrl, activeSection, false)}
            collapsed={collapsed}
          />
        ))}
        <CollapseControl collapsed={collapsed} onToggle={onToggleCollapse} />
        {collapsed ? null : (
          <p className="px-2 pt-1.5 font-mono text-[10px] text-muted-foreground">{t("components.sidebar.version")}</p>
        )}
      </div>
    </aside>
  );
}

function SidebarSection({
  section,
  collapsed,
  activeUrl,
  activeSection,
  expanded,
  onToggle,
}: {
  section: NavSection;
  collapsed: boolean;
  activeUrl: TabUrl;
  activeSection: TabUrl | null;
  expanded: boolean;
  onToggle(): void;
}) {
  const t = useT();
  const listId = useId();
  const reducedMotion = useReducedMotion() ?? false;
  const title = t(section.titleKey);
  // Sub-pages are a desktop, expanded-sidebar affordance (legacy sidebar.tsx:970). While they are
  // off screen — icon rail, no sub-pages, or a section the user closed — the section row carries
  // the location itself, so the sidebar always has exactly one `aria-current="page"`.
  const childrenVisible = !collapsed && expanded && section.children.length > 0;
  const active = isSectionRowActive(section, activeUrl, activeSection, childrenVisible);

  if (collapsed || section.children.length === 0) {
    return <SidebarRow href={section.href} title={title} icon={section.icon} active={active} collapsed={collapsed} />;
  }

  return (
    <div>
      <div className="flex items-center gap-0.5">
        <SidebarRow
          href={section.href}
          title={title}
          icon={section.icon}
          active={active}
          collapsed={false}
          className="min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          aria-label={fmt(t(expanded ? "browserDesktop.sidebar.hideSubPages" : "browserDesktop.sidebar.showSubPages"), { title })}
          className={SIDEBAR_ICON_BUTTON_CLASS}
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none rtl:-scale-x-100",
              expanded && "rotate-90",
            )}
          />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            id={listId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            // motion ignores prefers-reduced-motion unless asked (no MotionConfig in this app),
            // so the disclosure matches the chevron's `motion-reduce:transition-none`.
            transition={reducedMotion ? { duration: 0 } : { duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="my-0.5 ms-[18px] space-y-0.5 border-s border-border ps-2.5">
              {section.children.map((child) => (
                <Link
                  key={child.href}
                  href={child.href}
                  prefetch={false}
                  onMouseDown={onRowMouseDown}
                  aria-current={isRowActive(child.href, activeUrl) ? "page" : undefined}
                  className={cn(
                    SIDEBAR_SUB_ROW_CLASS,
                    isRowActive(child.href, activeUrl) ? SIDEBAR_ROW_ACTIVE_CLASS : SIDEBAR_ROW_IDLE_CLASS,
                  )}
                >
                  {t(child.titleKey)}
                </Link>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function SidebarRow({
  href,
  title,
  icon: Icon,
  active,
  collapsed,
  className,
}: {
  href: TabUrl;
  title: string;
  icon: AppIcon;
  active: boolean;
  collapsed: boolean;
  className?: string;
}) {
  const content: ReactNode = (
    <>
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {collapsed ? null : <span className="min-w-0 flex-1 truncate">{title}</span>}
    </>
  );
  const rowClass = cn(
    SIDEBAR_ROW_CLASS,
    collapsed && "justify-center",
    active ? SIDEBAR_ROW_ACTIVE_CLASS : SIDEBAR_ROW_IDLE_CLASS,
    className,
  );

  if (!collapsed) {
    return (
      <Link
        href={href}
        prefetch={false}
        onMouseDown={onRowMouseDown}
        aria-current={active ? "page" : undefined}
        className={rowClass}
      >
        {content}
      </Link>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={href}
            prefetch={false}
            onMouseDown={onRowMouseDown}
            aria-current={active ? "page" : undefined}
            aria-label={title}
            className={rowClass}
          />
        }
      >
        {content}
      </TooltipTrigger>
      <TooltipContent side="inline-end">{title}</TooltipContent>
    </Tooltip>
  );
}

/** Collapses the sidebar to the icon rail and back (the drag handle does the same). */
function CollapseControl({ collapsed, onToggle }: { collapsed: boolean; onToggle(): void }) {
  const t = useT();
  const label = t(collapsed ? "components.sidebar.expand" : "components.sidebar.collapse");
  const icon = collapsed ? (
    <PanelLeftOpen aria-hidden className="h-[15px] w-[15px] shrink-0 rtl:-scale-x-100" />
  ) : (
    <PanelLeftClose aria-hidden className="h-[15px] w-[15px] shrink-0 rtl:-scale-x-100" />
  );
  const buttonClass = cn(
    "mt-1 flex w-full items-center rounded px-2 py-1.5 text-[12px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 dark:hover:bg-background",
    collapsed ? "justify-center" : "gap-2.5",
  );

  if (!collapsed) {
    return (
      <button type="button" onClick={onToggle} aria-label={label} className={buttonClass}>
        {icon}
        <span className="min-w-0 truncate">{label}</span>
      </button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<button type="button" onClick={onToggle} aria-label={label} className={buttonClass} />}>
        {icon}
      </TooltipTrigger>
      <TooltipContent side="inline-end">{label}</TooltipContent>
    </Tooltip>
  );
}
