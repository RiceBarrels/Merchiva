"use client"

import * as React from "react"
import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Calendar, Clock, X, Sunrise, Sun, Moon } from "lucide-react"
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const INPUT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80"

function useIsMobile() {
  const [m, setM] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    setM(mq.matches)
    const h = (e: MediaQueryListEvent) => setM(e.matches)
    mq.addEventListener("change", h)
    return () => mq.removeEventListener("change", h)
  }, [])
  return m
}

function useScaleDialogOnDrawer(triggerRef: React.RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    const el = triggerRef.current
    if (!el) return
    const dialogContainer = el.closest("[id^='mobile-dialog-']") as HTMLElement | null
    if (!dialogContainer) return

    if (open) {
      dialogContainer.style.transition = "transform 500ms cubic-bezier(0.32, 0.72, 0, 1), border-radius 500ms cubic-bezier(0.32, 0.72, 0, 1)"
      dialogContainer.style.transform = "scale(0.94)"
      dialogContainer.style.borderRadius = "12px"
      dialogContainer.style.overflow = "hidden"
    } else {
      dialogContainer.style.transition = "transform 500ms cubic-bezier(0.32, 0.72, 0, 1), border-radius 500ms cubic-bezier(0.32, 0.72, 0, 1)"
      dialogContainer.style.transform = ""
      dialogContainer.style.borderRadius = ""
      dialogContainer.style.overflow = ""
    }

    return () => {
      dialogContainer.style.transform = ""
      dialogContainer.style.borderRadius = ""
      dialogContainer.style.overflow = ""
    }
  }, [open, triggerRef])
}

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  if (type === "date") return <DateInput className={className} {...props} />
  if (type === "time") return <TimeInput className={className} {...props} />

  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

// ─── Desktop dropdown shell ────────────────────────────────────────────────

function DesktopDropdown({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [open, onClose])
  if (!open) return null
  return (
    <div ref={ref} className="absolute left-0 top-full z-50 mt-1 rounded-[0.3rem] border border-border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
      {children}
    </div>
  )
}

// ─── Shared helpers ────────────────────────────────────────────────────────

function pad2(n: number) { return String(n).padStart(2, "0") }
function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }
function getFirstDayOfWeek(y: number, m: number) { return new Date(y, m, 1).getDay() }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }

function formatDateDisplay(value: string): string {
  if (!value) return ""
  const [y, m, d] = value.split("-").map(Number)
  if (!y || !m || !d) return value
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function formatTimeDisplay(value: string): string {
  if (!value) return ""
  const [h, m] = value.split(":").map(Number)
  if (h == null || m == null) return value
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${pad2(m)} ${ampm}`
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"]
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

// ═══════════════════════════════════════════════════════════════════════════
// DATE PICKER
// ═══════════════════════════════════════════════════════════════════════════

function DateInput({
  className, value, defaultValue, onChange, placeholder, disabled, name, ...rest
}: Omit<React.ComponentProps<"input">, "type">) {
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()
  const controlled = value !== undefined
  const [internal, setInternal] = useState((value ?? defaultValue ?? "") as string)
  const current = controlled ? (value as string) : internal

  const today = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  }, [])

  const fire = useCallback((iso: string) => {
    if (!controlled) setInternal(iso)
    onChange?.({ target: { value: iso } } as React.ChangeEvent<HTMLInputElement>)
  }, [controlled, onChange])

  const triggerRef = useRef<HTMLDivElement>(null)
  useScaleDialogOnDrawer(triggerRef, open && isMobile)

  const content = <DatePickerContent current={current} today={today} onSelect={(iso) => { fire(iso); setOpen(false) }} onClose={() => setOpen(false)} />

  return (
    <div className="relative" ref={triggerRef}>
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn("h-8 w-full justify-start gap-2 font-normal", !current && "text-muted-foreground", className)}
      >
        <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="flex-1 truncate text-left text-sm">
          {current ? formatDateDisplay(current) : (placeholder as string) || "Select date"}
        </span>
      </Button>

      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen} shouldScaleBackground>
          <DrawerContent className="max-h-[85vh]">
            <DrawerTitle className="sr-only">Pick date</DrawerTitle>
            <DrawerDescription className="sr-only">Select a date</DrawerDescription>
            {content}
          </DrawerContent>
        </Drawer>
      ) : (
        <DesktopDropdown open={open} onClose={() => setOpen(false)}>
          {content}
        </DesktopDropdown>
      )}
      <input type="hidden" name={name} value={current} />
    </div>
  )
}

function DatePickerContent({ current, today, onSelect, onClose }: {
  current: string; today: string; onSelect: (iso: string) => void; onClose: () => void
}) {
  const parsed = useMemo(() => {
    if (!current) return new Date()
    const [y, m, d] = current.split("-").map(Number)
    return new Date(y, m - 1, d)
  }, [current])

  const [viewYear, setViewYear] = useState(parsed.getFullYear())
  const [viewMonth, setViewMonth] = useState(parsed.getMonth())

  useEffect(() => {
    if (current) {
      const [y, m] = current.split("-").map(Number)
      setViewYear(y); setViewMonth(m - 1)
    }
  }, [current])

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1) }
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1) }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth)

  const selectedDay = current ? (() => { const [y, m, d] = current.split("-").map(Number); return y === viewYear && m - 1 === viewMonth ? d : -1 })() : -1
  const todayDay = (() => { const [y, m, d] = today.split("-").map(Number); return y === viewYear && m - 1 === viewMonth ? d : -1 })()

  const selectDay = (day: number) => {
    onSelect(`${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`)
  }

  const todayDate = useMemo(() => {
    const [y, m, d] = today.split("-").map(Number)
    return new Date(y, m - 1, d)
  }, [today])

  return (
    <div className="p-3 min-w-xs">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold">Pick date</span>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between mb-2.5">
        <Button variant="outline" size="icon-xs" onClick={prevMonth}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-semibold">{MONTHS[viewMonth]}</span>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">{viewYear}</span>
        </div>
        <Button variant="outline" size="icon-xs" onClick={nextMonth}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Calendar */}
      <div className="border border-border rounded-lg overflow-hidden">
        {/* DOW header */}
        <div className="grid grid-cols-7 bg-muted border-b border-border">
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{d}</div>
          ))}
        </div>
        {/* Days */}
        <div className="grid grid-cols-7 p-1 gap-0.5">
          {Array.from({ length: firstDay }, (_, i) => <div key={`e-${i}`} className="h-[38px]" />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1
            const isSelected = day === selectedDay
            const isToday = day === todayDay
            return (
              <button
                key={day}
                type="button"
                onClick={() => selectDay(day)}
                className={cn(
                  "h-[38px] w-full flex items-center justify-center font-mono tabular-nums text-[13px] rounded-md transition-colors relative",
                  isSelected ? "bg-foreground text-background font-semibold" : isToday ? "bg-muted font-semibold" : "hover:bg-accent"
                )}
              >
                {day}
                {isToday && !isSelected && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-[3px] h-[3px] rounded-full bg-foreground" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Summary footer */}
      {current && (
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Selected</div>
            <div className="font-mono text-[13px] tabular-nums font-medium mt-0.5">{current}</div>
          </div>
          <Button size="sm" onClick={() => onSelect(current)}>Done</Button>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TIME PICKER — Numeric stepper (design: BZTimeStepper)
// ═══════════════════════════════════════════════════════════════════════════

function TimeInput({
  className, value, defaultValue, onChange, placeholder, disabled, name, ...rest
}: Omit<React.ComponentProps<"input">, "type">) {
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()
  const controlled = value !== undefined
  const [internal, setInternal] = useState((value ?? defaultValue ?? "") as string)
  const current = controlled ? (value as string) : internal

  const fire = useCallback((iso: string) => {
    if (!controlled) setInternal(iso)
    onChange?.({ target: { value: iso } } as React.ChangeEvent<HTMLInputElement>)
  }, [controlled, onChange])

  const triggerRef = useRef<HTMLDivElement>(null)
  useScaleDialogOnDrawer(triggerRef, open && isMobile)

  const content = <TimePickerContent current={current} onSelect={(iso) => { fire(iso); setOpen(false) }} onClose={() => setOpen(false)} />

  return (
    <div className="relative" ref={triggerRef}>
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn("h-8 w-full justify-start gap-2 font-normal", !current && "text-muted-foreground", className)}
      >
        <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="flex-1 truncate text-left text-sm">
          {current ? formatTimeDisplay(current) : (placeholder as string) || "Select time"}
        </span>
      </Button>

      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen} shouldScaleBackground>
          <DrawerContent className="max-h-[85vh]">
            <DrawerTitle className="sr-only">Pick time</DrawerTitle>
            <DrawerDescription className="sr-only">Select a time</DrawerDescription>
            {content}
          </DrawerContent>
        </Drawer>
      ) : (
        <DesktopDropdown open={open} onClose={() => setOpen(false)}>
          {content}
        </DesktopDropdown>
      )}
      <input type="hidden" name={name} value={current} />
    </div>
  )
}

function TimePickerContent({ current, onSelect, onClose }: {
  current: string; onSelect: (iso: string) => void; onClose: () => void
}) {
  const [h, m] = useMemo(() => {
    if (!current) return [7, 0]
    const parts = current.split(":").map(Number)
    return [parts[0] ?? 7, parts[1] ?? 0]
  }, [current])

  const [h12, setH12] = useState(() => { const v = h % 12; return v === 0 ? 12 : v })
  const [min, setMin] = useState(() => Math.round(m / 5) * 5)
  const [ap, setAp] = useState<"AM" | "PM">(() => h >= 12 ? "PM" : "AM")

  const to24 = (h12v: number, apv: string) => {
    if (apv === "AM") return h12v === 12 ? 0 : h12v
    return h12v === 12 ? 12 : h12v + 12
  }

  const HOURS = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), [])
  const MINUTES = useMemo(() => Array.from({ length: 12 }, (_, i) => i * 5), [])
  const AMPM: ("AM" | "PM")[] = useMemo(() => ["AM", "PM"], [])

  return (
    <div className="p-3 min-w-xs">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold">Pick time</span>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Scroll wheels */}
      <div className="border border-border rounded-lg overflow-hidden relative">
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-9 bg-muted border-y border-border pointer-events-none z-0" />
        <div className="flex relative z-10">
          <ScrollWheel items={HOURS} value={h12} onChange={setH12} format={(v) => pad2(v)} circular />
          <div className="w-px bg-border shrink-0" />
          <ScrollWheel items={MINUTES} value={min} onChange={setMin} format={(v) => pad2(v)} circular />
          <div className="w-px bg-border shrink-0" />
          <ScrollWheel items={AMPM} value={ap} onChange={(v) => setAp(v as "AM" | "PM")} format={(v) => String(v)} />
        </div>
      </div>

      {/* Common times */}
      <div className="mt-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Common</div>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            { l: "Open", t: "07:00", icon: Sunrise },
            { l: "Lunch", t: "12:00", icon: Sun },
            { l: "Close", t: "21:00", icon: Moon },
          ]).map((c) => {
            const Icon = c.icon
            return (
              <button key={c.l} type="button" onClick={() => {
                const [hh, mm] = c.t.split(":").map(Number)
                setH12(hh === 0 ? 12 : hh > 12 ? hh - 12 : hh)
                setMin(Math.round(mm / 5) * 5)
                setAp(hh >= 12 ? "PM" : "AM")
              }} className="h-14 px-2.5 border border-border rounded-[0.3rem] text-left flex flex-col justify-between py-2 hover:bg-accent transition-colors">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Icon className="h-3 w-3" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider">{c.l}</span>
                </div>
                <div className="font-mono text-[13px] font-medium tabular-nums">{c.t}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Summary footer */}
      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Selected</div>
          <div className="font-mono text-[13px] tabular-nums font-medium mt-0.5">
            {pad2(h12)}:{pad2(min)} {ap}
            <span className="text-muted-foreground ml-1.5">· {pad2(to24(h12, ap))}:{pad2(min)}</span>
          </div>
        </div>
        <Button size="sm" onClick={() => {
          onSelect(`${pad2(to24(h12, ap))}:${pad2(min)}`)
        }}>Set</Button>
      </div>
    </div>
  )
}

// ─── iOS-style flat scroll wheel ───────────────────────────────────────────

const ITEM_H = 36
const VISIBLE = 5
const WHEEL_H = ITEM_H * VISIBLE

function ScrollWheel<T>({ items, value, onChange, format, circular = false }: {
  items: T[]; value: T; onChange: (v: T) => void; format: (v: T) => string; circular?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const settling = useRef(false)
  const [centerIdx, setCenterIdx] = useState(0)
  const len = items.length
  const copies = circular ? 3 : 1
  const padSlots = Math.floor(VISIBLE / 2)

  const valueIdx = items.indexOf(value)

  const scrollTo = useCallback((idx: number, smooth: boolean) => {
    const el = ref.current
    if (!el) return
    settling.current = true
    const top = idx * ITEM_H
    if (smooth) {
      el.scrollTo({ top, behavior: "smooth" })
      setTimeout(() => { settling.current = false }, 300)
    } else {
      el.scrollTop = top
      requestAnimationFrame(() => { settling.current = false })
    }
    setCenterIdx(idx)
  }, [])

  const mounted = useRef(false)
  useEffect(() => {
    if (settling.current) return
    const idx = circular ? len + valueIdx : valueIdx
    scrollTo(idx, mounted.current)
    mounted.current = true
  }, [value, valueIdx, len, circular, scrollTo])

  const snap = useCallback(() => {
    const el = ref.current
    if (!el) return
    settling.current = true
    const raw = Math.round(el.scrollTop / ITEM_H)
    const idx = ((raw % len) + len) % len
    onChange(items[idx])
    // Only recenter if near the edges of the tripled list
    if (circular && (raw < len * 0.5 || raw >= len * 2.5)) {
      el.scrollTop = (len + idx) * ITEM_H
    }
    // Smooth snap to nearest cell
    const target = Math.round(el.scrollTop / ITEM_H) * ITEM_H
    el.scrollTo({ top: target, behavior: "smooth" })
    setTimeout(() => { settling.current = false }, 200)
  }, [items, len, onChange, circular])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout>
    let raf: number
    const onScroll = () => {
      raf = requestAnimationFrame(() => setCenterIdx(el.scrollTop / ITEM_H))
      clearTimeout(timer)
      timer = setTimeout(snap, 120)
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => { el.removeEventListener("scroll", onScroll); clearTimeout(timer); cancelAnimationFrame(raf) }
  }, [snap])

  const allItems = useMemo(() => {
    const r: { value: T; key: string }[] = []
    for (let c = 0; c < copies; c++)
      for (let i = 0; i < len; i++)
        r.push({ value: items[i], key: `${c}-${i}` })
    return r
  }, [items, len, copies])

  return (
    <div
      ref={ref}
      className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden"
      style={{ height: WHEEL_H, scrollbarWidth: "none" }}
    >
      <div style={{ height: ITEM_H * padSlots }} />
      {allItems.map((item, i) => {
        const dist = Math.abs(i - centerIdx)
        const scale = Math.max(0.75, 1 - dist * 0.12)
        const opacity = Math.max(0.15, 1 - dist * 0.35)
        return (
          <div
            key={item.key}
            onClick={() => { scrollTo(i, true); onChange(item.value) }}
            className="flex items-center justify-center font-mono tabular-nums select-none cursor-pointer"
            style={{
              height: ITEM_H,
              transform: `scale(${scale})`,
              opacity,
              fontWeight: dist < 0.6 ? 600 : 400,
              fontSize: dist < 0.6 ? 15 : 13,
            }}
          >
            {format(item.value)}
          </div>
        )
      })}
      <div style={{ height: ITEM_H * padSlots }} />
    </div>
  )
}

export { Input }
