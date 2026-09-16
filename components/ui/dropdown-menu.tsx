"use client"

/**
 * Dropdown menu (base-nova naming) built by hand on `@base-ui/react/menu`, following
 * `components/ui/context-menu.tsx` (plan D50: never generated with the shadcn CLI).
 *
 * Differences from the context menu primitive, per design-system/README.md "Overlays":
 * - popup is `rounded-[0.3rem] border border-border bg-popover shadow-md` (no ring);
 * - the positioner sits at `z-[100]` like `components/ui/popover.tsx`, so menus clear
 *   DynamicUIElement pages (50 + depth) and vaul drawers;
 * - logical properties only (`ps-`, `ms-`, `end-`, `inline-end`) so menus mirror in RTL.
 *
 * `DropdownMenuLabel` renders Base UI's GroupLabel and must sit inside `DropdownMenuGroup`.
 * Wrapper `className` props are plain strings (Base UI also allows a state callback, which
 * `cn` cannot merge); use `data-*` variants for state styling.
 */

import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { CheckIcon, ChevronRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type WithStringClassName<P> = Omit<P, "className"> & { className?: string }

const ITEM_BASE =
  "group/dropdown-menu-item relative flex min-h-7 cursor-default items-center gap-2 rounded px-2 py-1 text-start text-[13px] leading-5 outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 pointer-coarse:min-h-10 data-inset:ps-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

function DropdownMenu(props: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuPortal(props: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
}

function DropdownMenuTrigger({
  className,
  ...props
}: WithStringClassName<MenuPrimitive.Trigger.Props>) {
  return (
    <MenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      className={cn("select-none", className)}
      {...props}
    />
  )
}

type PositionerOptions = Pick<
  MenuPrimitive.Positioner.Props,
  "align" | "alignOffset" | "side" | "sideOffset" | "anchor" | "collisionPadding"
>

export type DropdownMenuContentProps = WithStringClassName<MenuPrimitive.Popup.Props> &
  PositionerOptions & {
    /** Extra classes for the positioner (stacking layer overrides). */
    positionerClassName?: string
  }

function DropdownMenuContent({
  className,
  positionerClassName,
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  anchor,
  collisionPadding = 8,
  ...props
}: DropdownMenuContentProps) {
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
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            "z-50 max-h-(--available-height) max-w-(--available-width) min-w-44 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-[0.3rem] border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function DropdownMenuGroup({
  className,
  ...props
}: WithStringClassName<MenuPrimitive.Group.Props>) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" className={className} {...props} />
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: WithStringClassName<MenuPrimitive.GroupLabel.Props> & { inset?: boolean }) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset || undefined}
      className={cn(
        "px-2 pt-1.5 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase data-inset:ps-8",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: WithStringClassName<MenuPrimitive.Item.Props> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset || undefined}
      data-variant={variant}
      className={cn(
        ITEM_BASE,
        "[&_svg:not([class*='text-'])]:text-muted-foreground data-highlighted:*:[svg]:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive/10 data-[variant=destructive]:data-highlighted:text-destructive data-[variant=destructive]:*:[svg]:text-destructive dark:data-[variant=destructive]:data-highlighted:bg-destructive/20",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSub(props: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: WithStringClassName<MenuPrimitive.SubmenuTrigger.Props> & { inset?: boolean }) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset || undefined}
      className={cn(
        ITEM_BASE,
        "data-popup-open:bg-accent data-popup-open:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon aria-hidden className="ms-auto size-3.5 rtl:rotate-180" />
    </MenuPrimitive.SubmenuTrigger>
  )
}

function DropdownMenuSubContent({
  side = "inline-end",
  align = "start",
  alignOffset = -5,
  sideOffset = 2,
  className,
  ...props
}: DropdownMenuContentProps) {
  return (
    <DropdownMenuContent
      data-slot="dropdown-menu-sub-content"
      side={side}
      align={align}
      alignOffset={alignOffset}
      sideOffset={sideOffset}
      className={cn("min-w-40", className)}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  inset,
  ...props
}: WithStringClassName<MenuPrimitive.CheckboxItem.Props> & { inset?: boolean }) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset || undefined}
      className={cn(ITEM_BASE, "pe-8", className)}
      {...props}
    >
      <span aria-hidden className="pointer-events-none absolute end-2 flex size-4 items-center justify-center">
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon className="size-3.5" />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup(props: WithStringClassName<MenuPrimitive.RadioGroup.Props>) {
  return <MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: WithStringClassName<MenuPrimitive.RadioItem.Props> & { inset?: boolean }) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset || undefined}
      className={cn(ITEM_BASE, "pe-8", className)}
      {...props}
    >
      <span aria-hidden className="pointer-events-none absolute end-2 flex size-4 items-center justify-center">
        <MenuPrimitive.RadioItemIndicator>
          <CheckIcon className="size-3.5" />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: WithStringClassName<MenuPrimitive.Separator.Props>) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      // Shortcut labels ("⌥⇧T", "Alt+Shift+T") must not reorder in RTL locales.
      dir="ltr"
      className={cn(
        "ms-auto shrink-0 ps-4 font-mono text-[11px] tracking-normal text-muted-foreground group-data-highlighted/dropdown-menu-item:text-accent-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
