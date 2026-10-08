"use client";

/**
 * Docs-local dropdown / menubar menu parts: thin wrappers over `@base-ui/react/menu`
 * in the style of `components/ui/context-menu.tsx`.
 *
 * - Works standalone (`DocMenu` + `DocMenuTrigger`) and inside a Base UI `Menubar`
 *   (Menu.Root detects the menubar context on its own).
 * - The positioner sits at `z-[100]` (same as `components/ui/popover.tsx`) so menus
 *   clear DynamicUIElement pages (`50 + depth`) and vaul drawers.
 * - Logical properties only (`ps-`, `ms-`, `inline-end`) so the menus mirror in RTL.
 * - Wrapper `className` props are plain strings (Base UI also allows a state callback,
 *   which `cn` cannot merge); use `data-*` variants for state styling.
 */

import * as React from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { CheckIcon, ChevronRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type IconComponent = React.ComponentType<{ className?: string }>;
type WithStringClassName<P> = Omit<P, "className"> & { className?: string };

const POPUP_CLASS =
  "z-50 max-h-(--available-height) max-w-(--available-width) min-w-44 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-[0.3rem] border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95";

const ITEM_CLASS =
  "group/doc-menu-item relative flex min-h-7 w-full cursor-default items-center gap-2 rounded px-2 py-1 text-start text-[13px] leading-5 outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 pointer-coarse:min-h-10 [&_svg]:pointer-events-none [&_svg]:shrink-0";

const DESTRUCTIVE_ITEM_CLASS =
  "text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive dark:data-highlighted:bg-destructive/20";

/** Keeps icon / check columns aligned across items in one menu. */
function ItemLeading({
  icon: Icon,
  inset,
  destructive,
}: {
  icon?: IconComponent;
  inset?: boolean;
  destructive?: boolean;
}) {
  if (Icon) {
    return (
      <Icon
        className={cn(
          "size-4 shrink-0",
          destructive
            ? "text-destructive"
            : "text-muted-foreground group-data-highlighted/doc-menu-item:text-accent-foreground",
        )}
      />
    );
  }
  if (inset) return <span aria-hidden className="size-4 shrink-0" />;
  return null;
}

function labelFromChildren(children: React.ReactNode): string | undefined {
  return typeof children === "string" ? children : undefined;
}

// ── Root / trigger ──────────────────────────────────────────────────────────

function DocMenu(props: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root {...props} />;
}

function DocMenuTrigger({
  className,
  ...props
}: WithStringClassName<MenuPrimitive.Trigger.Props>) {
  return (
    <MenuPrimitive.Trigger
      data-slot="doc-menu-trigger"
      className={cn("select-none", className)}
      {...props}
    />
  );
}

// ── Popup ───────────────────────────────────────────────────────────────────

type PositionerOptions = Pick<
  MenuPrimitive.Positioner.Props,
  "align" | "alignOffset" | "side" | "sideOffset" | "anchor" | "collisionPadding" | "sticky"
>;

export type DocMenuContentProps = WithStringClassName<MenuPrimitive.Popup.Props> &
  PositionerOptions & {
    /** Extra classes for the positioner (e.g. a different stacking layer). */
    positionerClassName?: string;
  };

function DocMenuContent({
  className,
  positionerClassName,
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  anchor,
  collisionPadding = 8,
  sticky,
  ...props
}: DocMenuContentProps) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className={cn("pointer-events-auto isolate z-[100] outline-none", positionerClassName)}
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        anchor={anchor}
        collisionPadding={collisionPadding}
        sticky={sticky}
      >
        <MenuPrimitive.Popup
          data-slot="doc-menu-content"
          className={cn(POPUP_CLASS, className)}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

// ── Items ───────────────────────────────────────────────────────────────────

function DocMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="doc-menu-shortcut"
      // Shortcut labels ("⌘⇧H", "Ctrl+Alt+M") must not reorder in RTL locales.
      dir="ltr"
      className={cn(
        "ms-auto shrink-0 ps-6 font-mono text-[11px] text-muted-foreground group-data-highlighted/doc-menu-item:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

export interface DocMenuItemExtraProps {
  /** Pre-formatted shortcut hint (see `lib/docs/shortcut-label.ts`). */
  shortcut?: string;
  /** A short prose note at the trailing end (already translated); unlike `shortcut` it follows the text direction. */
  hint?: string;
  /** Leading icon (`size-4`). */
  icon?: IconComponent;
  /** Destructive styling (delete, move to trash). */
  destructive?: boolean;
  /** Reserve the leading icon column when the item has no icon. */
  inset?: boolean;
}

export type DocMenuItemProps = WithStringClassName<MenuPrimitive.Item.Props> & DocMenuItemExtraProps;

function DocMenuItem({
  className,
  children,
  shortcut,
  hint,
  icon,
  destructive = false,
  inset = false,
  label,
  ...props
}: DocMenuItemProps) {
  return (
    <MenuPrimitive.Item
      data-slot="doc-menu-item"
      data-variant={destructive ? "destructive" : "default"}
      label={label ?? labelFromChildren(children)}
      className={cn(ITEM_CLASS, destructive && DESTRUCTIVE_ITEM_CLASS, className)}
      {...props}
    >
      <ItemLeading icon={icon} inset={inset} destructive={destructive} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? (
        <span
          dir="auto"
          className="ms-auto shrink-0 ps-6 text-[11px] text-muted-foreground group-data-highlighted/doc-menu-item:text-accent-foreground"
        >
          {hint}
        </span>
      ) : null}
      {shortcut ? <DocMenuShortcut>{shortcut}</DocMenuShortcut> : null}
    </MenuPrimitive.Item>
  );
}

// ── Submenus ────────────────────────────────────────────────────────────────

function DocMenuSub(props: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot {...props} />;
}

export type DocMenuSubTriggerProps = WithStringClassName<MenuPrimitive.SubmenuTrigger.Props> &
  Pick<DocMenuItemExtraProps, "icon" | "inset">;

function DocMenuSubTrigger({
  className,
  children,
  icon,
  inset = false,
  label,
  ...props
}: DocMenuSubTriggerProps) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="doc-menu-sub-trigger"
      label={label ?? labelFromChildren(children)}
      className={cn(ITEM_CLASS, "data-popup-open:bg-accent data-popup-open:text-accent-foreground", className)}
      {...props}
    >
      <ItemLeading icon={icon} inset={inset} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <ChevronRightIcon aria-hidden className="ms-auto size-4 text-muted-foreground rtl:rotate-180" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

function DocMenuSubContent({
  side = "inline-end",
  align = "start",
  alignOffset = -5,
  sideOffset = 2,
  ...props
}: DocMenuContentProps) {
  return (
    <DocMenuContent
      data-slot="doc-menu-sub-content"
      side={side}
      align={align}
      alignOffset={alignOffset}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

// ── Structure ───────────────────────────────────────────────────────────────

function DocMenuSeparator({
  className,
  ...props
}: WithStringClassName<React.ComponentProps<typeof MenuPrimitive.Separator>>) {
  return (
    <MenuPrimitive.Separator
      data-slot="doc-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

/** True inside `DocMenuGroup`, where Base UI's GroupLabel has the context it requires. */
const DocMenuGroupContext = React.createContext(false);

function DocMenuGroup({
  className,
  ...props
}: WithStringClassName<MenuPrimitive.Group.Props>) {
  return (
    <DocMenuGroupContext.Provider value={true}>
      <MenuPrimitive.Group data-slot="doc-menu-group" className={className} {...props} />
    </DocMenuGroupContext.Provider>
  );
}

const LABEL_CLASS = "px-2 pt-1.5 pb-1 text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase";

/**
 * Section label. Inside `DocMenuGroup` it is Base UI's GroupLabel (announced as the
 * group's name); outside a group it renders a presentational heading, so it never
 * throws the "Menu group parts must be used within <Menu.Group>" error.
 */
function DocMenuLabel({
  className,
  inset = false,
  ...props
}: React.ComponentProps<"div"> & { inset?: boolean }) {
  const inGroup = React.useContext(DocMenuGroupContext);
  const classes = cn(LABEL_CLASS, inset && "ps-8", className);
  if (inGroup) {
    return <MenuPrimitive.GroupLabel data-slot="doc-menu-label" className={classes} {...props} />;
  }
  return <div data-slot="doc-menu-label" role="presentation" className={classes} {...props} />;
}

// ── Radio / checkbox ────────────────────────────────────────────────────────

function DocMenuRadioGroup({
  className,
  ...props
}: WithStringClassName<MenuPrimitive.RadioGroup.Props>) {
  return <MenuPrimitive.RadioGroup data-slot="doc-menu-radio-group" className={className} {...props} />;
}

export type DocMenuRadioItemProps = WithStringClassName<MenuPrimitive.RadioItem.Props> &
  Pick<DocMenuItemExtraProps, "shortcut">;

function DocMenuRadioItem({ className, children, shortcut, label, ...props }: DocMenuRadioItemProps) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="doc-menu-radio-item"
      label={label ?? labelFromChildren(children)}
      className={cn(ITEM_CLASS, className)}
      {...props}
    >
      <span aria-hidden className="flex size-4 shrink-0 items-center justify-center">
        <MenuPrimitive.RadioItemIndicator>
          <CheckIcon className="size-4" />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut ? <DocMenuShortcut>{shortcut}</DocMenuShortcut> : null}
    </MenuPrimitive.RadioItem>
  );
}

export type DocMenuCheckboxItemProps = WithStringClassName<MenuPrimitive.CheckboxItem.Props> &
  Pick<DocMenuItemExtraProps, "shortcut">;

function DocMenuCheckboxItem({ className, children, shortcut, label, ...props }: DocMenuCheckboxItemProps) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="doc-menu-checkbox-item"
      label={label ?? labelFromChildren(children)}
      className={cn(ITEM_CLASS, className)}
      {...props}
    >
      <span aria-hidden className="flex size-4 shrink-0 items-center justify-center">
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon className="size-4" />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut ? <DocMenuShortcut>{shortcut}</DocMenuShortcut> : null}
    </MenuPrimitive.CheckboxItem>
  );
}

export {
  DocMenu,
  DocMenuTrigger,
  DocMenuContent,
  DocMenuItem,
  DocMenuSub,
  DocMenuSubTrigger,
  DocMenuSubContent,
  DocMenuSeparator,
  DocMenuLabel,
  DocMenuRadioGroup,
  DocMenuRadioItem,
  DocMenuCheckboxItem,
  DocMenuGroup,
  DocMenuShortcut,
};
