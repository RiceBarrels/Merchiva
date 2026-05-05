"use client";

import { useState, useEffect, useRef, useMemo, createContext, useContext } from "react";
import {
  Bell,
  Sparkles,
  PanelRightClose,
  PanelRightOpen,
  ArrowLeftRight,
  CalendarX,
  Check,
  X,
  Send,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useSpacetimeDB } from "spacetimedb/react";
import { usePermissions } from "@/lib/context/permissions";
import {
  useNotifications,
  useShiftTrades,
  useTimeOffRequests,
  useShifts,
  useOrgMembers,
  useInventoryItems,
  useSalesRecords,
  useStaffMembers,
  useWasteLogs,
} from "@/lib/spacetimedb/hooks";
import {
  dismissNotification,
  updateTradeStatus,
  managerApproveShiftTrade,
  updateTimeOffStatus,
} from "@/lib/spacetimedb/actions";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function parseTimestamp(ts: unknown): string {
  if (typeof ts === "object" && ts !== null && "seconds" in (ts as object)) {
    return new Date((ts as { seconds: number }).seconds * 1000).toISOString();
  }
  return String(ts);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h, 10);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${suffix}`;
}

// ─── Chat Message Type ──────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ─── RightPanel Component ───────────────────────────────────────────────────

export function RightPanel() {
  const [open, setOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"inbox" | "ai">("inbox");

  // Load persisted state
  useEffect(() => {
    try {
      const stored = localStorage.getItem("right_panel_open");
      if (stored === "false") setOpen(false);
    } catch {}
  }, []);

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("right_panel_open", String(next));
      } catch {}
      return next;
    });
  };

  // Collapsed strip
  if (!open) {
    return (
      <div className="h-full shrink-0 w-11 lg:border-l lg:border-border bg-background flex flex-col items-center pt-3 gap-2">
        <button
          type="button"
          onClick={toggleOpen}
          className="p-1.5 rounded-[0.3rem] hover:bg-muted transition-colors"
          title="Expand panel"
        >
          <PanelRightOpen className="h-4 w-4 text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={() => { setOpen(true); setActiveTab("inbox"); }}
          className="p-1.5 rounded-[0.3rem] hover:bg-muted transition-colors"
          title="Inbox"
        >
          <Bell className="h-4 w-4 text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={() => { setOpen(true); setActiveTab("ai"); }}
          className="p-1.5 rounded-[0.3rem] hover:bg-muted transition-colors"
          title="Store AI"
        >
          <Sparkles className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="h-full shrink-0 w-[340px] lg:border-l lg:border-border bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab("inbox")}
            className={cn(
              "text-[13px] font-semibold px-2 py-1 rounded-[0.3rem] transition-colors",
              activeTab === "inbox" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Inbox
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ai")}
            className={cn(
              "text-[13px] font-semibold px-2 py-1 rounded-[0.3rem] transition-colors",
              activeTab === "ai" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            AI
          </button>
        </div>
        <button
          type="button"
          onClick={toggleOpen}
          className="p-1 rounded-[0.3rem] hover:bg-muted transition-colors"
          title="Collapse panel"
        >
          <PanelRightClose className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Content */}
      {activeTab === "inbox" ? <InboxSection /> : <AIChatSection />}
    </div>
  );
}

// ─── Inbox Section ──────────────────────────────────────────────────────────

function InboxSection() {
  const stdb = useSpacetimeDB();
  const { organizationId, role } = usePermissions();
  const identity = stdb?.identity;

  const [notifications] = useNotifications();
  const [shiftTrades] = useShiftTrades();
  const [timeOffRequests] = useTimeOffRequests();
  const [shifts] = useShifts();
  const [orgMembers] = useOrgMembers();

  const isManager = role === "owner" || role === "manager";

  // Build member name map
  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of orgMembers) {
      if (m.organizationId === organizationId) {
        map.set(m.userId?.toString() ?? "", m.displayName ?? "Unknown");
      }
    }
    return map;
  }, [orgMembers, organizationId]);

  // Pending shift trades
  const pendingTrades = useMemo(() => {
    if (!organizationId) return [];
    return shiftTrades.filter(
      (t) => t.organizationId === organizationId && t.status === "pending"
    );
  }, [shiftTrades, organizationId]);

  // Pending time-off requests
  const pendingTimeOff = useMemo(() => {
    if (!organizationId) return [];
    return timeOffRequests.filter(
      (r) => r.organizationId === organizationId && r.status === "pending"
    );
  }, [timeOffRequests, organizationId]);

  // Recent notifications (up to 10)
  const recentNotifications = useMemo(() => {
    if (!identity || !organizationId) return [];
    return notifications
      .filter(
        (n) =>
          n.organizationId === organizationId &&
          n.targetId?.toString() === identity.toString() &&
          !n.read
      )
      .sort((a, b) => {
        const ta = new Date(parseTimestamp(a.createdAt)).getTime();
        const tb = new Date(parseTimestamp(b.createdAt)).getTime();
        return tb - ta;
      })
      .slice(0, 10);
  }, [notifications, identity, organizationId]);

  const isEmpty = pendingTrades.length === 0 && pendingTimeOff.length === 0 && recentNotifications.length === 0;

  // Find shift details for a trade
  const getShiftForTrade = (shiftId: string) => {
    return shifts.find((s) => s.id?.toString() === shiftId);
  };

  const handleApproveTrade = async (tradeId: string) => {
    try {
      if (identity) {
        await managerApproveShiftTrade(tradeId, identity.toString(), true);
      }
      toast.success("Trade approved");
    } catch (err) {
      toast.error("Failed to approve trade");
      console.error(err);
    }
  };

  const handleDenyTrade = async (tradeId: string) => {
    try {
      await updateTradeStatus(tradeId, "denied");
      toast.success("Trade denied");
    } catch (err) {
      toast.error("Failed to deny trade");
      console.error(err);
    }
  };

  const handleApproveTimeOff = async (requestId: string) => {
    try {
      await updateTimeOffStatus(requestId, "approved");
      toast.success("Time off approved");
    } catch (err) {
      toast.error("Failed to approve request");
      console.error(err);
    }
  };

  const handleDenyTimeOff = async (requestId: string) => {
    try {
      await updateTimeOffStatus(requestId, "denied");
      toast.success("Time off denied");
    } catch (err) {
      toast.error("Failed to deny request");
      console.error(err);
    }
  };

  if (isEmpty) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground px-4">
        <Inbox className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-[13px] font-medium">No pending requests</p>
        <p className="text-[11px] mt-0.5 opacity-70">You&apos;re all caught up</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
      {/* Shift Trades */}
      {isManager && pendingTrades.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium px-1">
            Shift Trades
          </p>
          {pendingTrades.map((trade) => {
            const shift = getShiftForTrade(trade.shiftId?.toString() ?? "");
            const requesterName = memberNameMap.get(trade.requesterId?.toString() ?? "") ?? "Unknown";
            const targetName = trade.targetId
              ? memberNameMap.get(trade.targetId.toString()) ?? "Unknown"
              : "Anyone";

            return (
              <div
                key={trade.id.toString()}
                className="border border-border rounded-[0.3rem] p-3 space-y-2"
              >
                <div className="flex items-center gap-1.5">
                  <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] uppercase tracking-wide bg-muted px-1.5 py-0.5 rounded-[0.2rem] font-medium">
                    {trade.type}
                  </span>
                </div>
                <p className="text-[13px] font-medium">
                  {requesterName} → {targetName}
                </p>
                {shift && (
                  <p className="text-[12px] text-muted-foreground">
                    {formatDate(shift.date)} &middot; {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
                  </p>
                )}
                {trade.comments && (
                  <p className="text-[11px] text-muted-foreground italic line-clamp-2">
                    &ldquo;{trade.comments}&rdquo;
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleApproveTrade(trade.id.toString())}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium border border-emerald-200 text-emerald-700 rounded-[0.3rem] hover:bg-emerald-50 transition-colors dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                  >
                    <Check className="h-3 w-3" />
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDenyTrade(trade.id.toString())}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium border border-red-200 text-red-700 rounded-[0.3rem] hover:bg-red-50 transition-colors dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    <X className="h-3 w-3" />
                    Deny
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Time Off Requests */}
      {isManager && pendingTimeOff.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium px-1">
            Time Off Requests
          </p>
          {pendingTimeOff.map((req) => {
            const requesterName = memberNameMap.get(req.userId?.toString() ?? "") ?? "Unknown";

            return (
              <div
                key={req.id.toString()}
                className="border border-border rounded-[0.3rem] p-3 space-y-2"
              >
                <div className="flex items-center gap-1.5">
                  <CalendarX className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] uppercase tracking-wide bg-muted px-1.5 py-0.5 rounded-[0.2rem] font-medium">
                    Time Off
                  </span>
                </div>
                <p className="text-[13px] font-medium">{requesterName}</p>
                <p className="text-[12px] text-muted-foreground">
                  {formatDate(req.startDate)} - {formatDate(req.endDate)}
                  {!req.fullDays && req.startTime && req.endTime && (
                    <span> &middot; {formatTime(req.startTime)} - {formatTime(req.endTime)}</span>
                  )}
                </p>
                {req.comments && (
                  <p className="text-[11px] text-muted-foreground italic line-clamp-2">
                    &ldquo;{req.comments}&rdquo;
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleApproveTimeOff(req.id.toString())}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium border border-emerald-200 text-emerald-700 rounded-[0.3rem] hover:bg-emerald-50 transition-colors dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                  >
                    <Check className="h-3 w-3" />
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDenyTimeOff(req.id.toString())}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium border border-red-200 text-red-700 rounded-[0.3rem] hover:bg-red-50 transition-colors dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    <X className="h-3 w-3" />
                    Deny
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* General Notifications */}
      {recentNotifications.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium px-1">
            Notifications
          </p>
          {recentNotifications.map((notif) => {
            const createdStr = parseTimestamp(notif.createdAt);
            return (
              <div
                key={notif.id.toString()}
                className="border border-border rounded-[0.3rem] p-3 space-y-1"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium leading-tight">{notif.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{notif.body}</p>
                  </div>
                  <button
                    type="button"
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
                    onClick={() => dismissNotification(notif.id.toString()).catch(console.error)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground/70">{timeAgo(createdStr)}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── AI Chat Section ────────────────────────────────────────────────────────

function AIChatSection() {
  const { organizationId } = usePermissions();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Gather store context from hooks
  const [inventoryItems] = useInventoryItems();
  const [salesRecords] = useSalesRecords();
  const [staffMembers] = useStaffMembers();
  const [wasteLogs] = useWasteLogs();
  const [notifications] = useNotifications();
  const [shifts] = useShifts();

  const storeContext = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const orgInventory = inventoryItems.filter((i) => i.organizationId === organizationId);
    const orgSales = salesRecords.filter((s) => s.organizationId === organizationId);
    const orgStaff = staffMembers.filter((s) => s.organizationId === organizationId);
    const orgWaste = wasteLogs.filter((w) => w.organizationId === organizationId);
    const orgShifts = shifts.filter((s) => s.organizationId === organizationId);

    // Inventory summary
    const totalItems = orgInventory.length;
    const lowStockCount = orgInventory.filter(
      (i) => (i.currentStock ?? 0) <= (i.minStock ?? 0)
    ).length;
    const totalValue = orgInventory.reduce(
      (sum, i) => sum + (i.currentStock ?? 0) * (i.costPerUnit ?? 0),
      0
    );

    // Sales summary
    const todaySales = orgSales
      .filter((s) => s.date === today)
      .reduce((sum, s) => sum + (s.actual ?? 0), 0);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const weekSales = orgSales
      .filter((s) => s.date >= weekAgo)
      .reduce((sum, s) => sum + (s.actual ?? 0), 0);

    // Staff on duty today
    const todayShifts = orgShifts.filter((s) => s.date === today);
    const staffOnDuty = todayShifts.length;

    // Waste today
    const todayWaste = orgWaste
      .filter((w) => {
        const wDate = typeof w.date === "string" ? w.date : "";
        return wDate.startsWith(today);
      })
      .reduce((sum, w) => sum + (w.totalCost ?? 0), 0);

    // Notifications
    const unreadCount = notifications.filter(
      (n) => n.organizationId === organizationId && !n.read
    ).length;

    return {
      inventory: { totalItems, lowStockCount, totalValue: Math.round(totalValue * 100) / 100 },
      sales: { today: todaySales, thisWeek: weekSales, avgDaily: weekSales > 0 ? Math.round(weekSales / 7) : 0 },
      staff: { totalCount: orgStaff.length, onDutyToday: staffOnDuty },
      waste: { todayCost: Math.round(todayWaste * 100) / 100 },
      notifications: { unreadCount },
    };
  }, [inventoryItems, salesRecords, staffMembers, wasteLogs, notifications, shifts, organizationId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/store-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: messages.slice(-10), // last 10 messages for context
          context: storeContext,
          orgId: organizationId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `API error ${res.status}`);
      }

      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to get response";
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${errorMessage}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Sparkles className="h-6 w-6 mb-2 opacity-40" />
            <p className="text-[12px] text-center">Ask anything about your store data</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-[0.3rem] px-3 py-2 text-[13px] leading-relaxed",
                msg.role === "user"
                  ? "bg-muted text-foreground"
                  : "bg-transparent border border-border text-foreground"
              )}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-transparent border border-border rounded-[0.3rem] px-3 py-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border px-3 py-2">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your store..."
            rows={1}
            className="flex-1 resize-none bg-muted rounded-[0.3rem] px-3 py-2 text-[13px] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-border min-h-[36px] max-h-[100px]"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-9 w-9 p-0 shrink-0"
            onClick={handleSend}
            disabled={!input.trim() || loading}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Mobile Right Panel (swipe left to open, mirrors sidebar behavior) ──────

const RPANEL_WIDTH = 280;
const RPANEL_VELOCITY_THRESHOLD = 0.3;
const RPANEL_SNAP_THRESHOLD = 0.4;

const RightPanelMobileContext = createContext<{
  isOpen: boolean;
  open: () => void;
  close: () => void;
  progress: number;
  dragging: boolean;
  transitionStyle: string;
}>({ isOpen: false, open: () => {}, close: () => {}, progress: 0, dragging: false, transitionStyle: "none" });

export function useRightPanelMobile() {
  return useContext(RightPanelMobileContext);
}

export function RightPanelMobileProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const lastXRef = useRef(0);
  const isHorizRef = useRef<boolean | null>(null);
  const isOpenRef = useRef(false);
  const draggingRef = useRef(false);
  const leftSidebarOpenRef = useRef(false);

  isOpenRef.current = isOpen;
  draggingRef.current = dragging;

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      directionLocked = null;

      // Don't trigger if left sidebar is open (content is shifted right)
      const mobileContent = document.getElementById("mobile-content");
      if (mobileContent) {
        const transform = getComputedStyle(mobileContent).transform;
        if (transform && transform !== "none") {
          const match = transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([^,]+)/);
          if (match && parseFloat(match[1]) > 10) {
            leftSidebarOpenRef.current = true;
            return;
          }
        }
      }
      leftSidebarOpenRef.current = false;

      const t = e.touches[0];
      startXRef.current = t.clientX;
      startYRef.current = t.clientY;
      startTimeRef.current = Date.now();
      lastXRef.current = t.clientX;
      isHorizRef.current = null;
    }

    function getOrCreateOverlay(): HTMLDivElement {
      let overlay = document.getElementById("rpanel-overlay") as HTMLDivElement | null;
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "rpanel-overlay";
        overlay.style.position = "absolute";
        overlay.style.inset = "0";
        overlay.style.zIndex = "30";
        overlay.style.pointerEvents = "none";
        overlay.style.background = "rgba(0,0,0,0)";
        const el = document.getElementById("mobile-content");
        if (el) el.appendChild(overlay);
      }
      return overlay;
    }

    function applyContentShift(offset: number, useTransition: boolean) {
      const el = document.getElementById("mobile-content");
      if (!el) return;
      const progress = offset / RPANEL_WIDTH;
      const shift = -progress * RPANEL_WIDTH;
      const trans = useTransition ? "all 220ms cubic-bezier(0.4, 0, 0.2, 1)" : "none";
      el.style.transition = trans;
      const overlay = getOrCreateOverlay();
      overlay.style.transition = trans;
      if (offset > 0) {
        el.style.transform = `translateX(${shift}px)`;
        el.style.boxShadow = "4px 0 16px rgba(0, 0, 0, 0.15)";
        el.style.borderRadius = "0 38px 38px 0";
        overlay.style.background = `rgba(0, 0, 0, ${progress * 0.2})`;
        overlay.style.pointerEvents = "auto";
      } else {
        el.style.transform = "";
        el.style.boxShadow = "";
        el.style.borderRadius = "";
        overlay.style.background = "rgba(0,0,0,0)";
        overlay.style.pointerEvents = "none";
      }
    }

    let directionLocked: "left" | "right" | null = null;

    function onTouchMove(e: TouchEvent) {
      if (leftSidebarOpenRef.current) return;
      const t = e.touches[0];
      const dx = t.clientX - startXRef.current;
      const dy = t.clientY - startYRef.current;

      if (isHorizRef.current === null && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        isHorizRef.current = Math.abs(dx) > Math.abs(dy);
        if (isHorizRef.current) {
          // Lock direction on first meaningful horizontal movement
          directionLocked = dx < 0 ? "left" : "right";
        }
      }
      if (!isHorizRef.current) return;

      // Right panel only responds to: leftward swipe (open) or rightward swipe when open (close)
      if (!isOpenRef.current && directionLocked === "right") return;
      if (isOpenRef.current && directionLocked === "left") return;

      lastXRef.current = t.clientX;
      let offset: number;

      if (isOpenRef.current) {
        offset = Math.max(0, Math.min(RPANEL_WIDTH, RPANEL_WIDTH + dx));
      } else {
        offset = Math.max(0, Math.min(RPANEL_WIDTH, -dx));
      }

      if (offset > 8) {
        e.preventDefault();
        draggingRef.current = true;
        setDragging(true);
        setDragOffset(offset);
        applyContentShift(offset, false);
      } else if (draggingRef.current) {
        // Offset dropped back — user reversed direction, cancel drag
        draggingRef.current = false;
        setDragging(false);
        setDragOffset(0);
        applyContentShift(0, false);
      }
    }

    function onTouchEnd() {
      if (!draggingRef.current) return;

      const dx = lastXRef.current - startXRef.current;
      const dt = Math.max(1, Date.now() - startTimeRef.current);
      const velocity = dx / dt; // negative = leftward

      let currentOffset: number;
      if (isOpenRef.current) {
        currentOffset = Math.max(0, Math.min(RPANEL_WIDTH, RPANEL_WIDTH + dx));
      } else {
        currentOffset = Math.max(0, Math.min(RPANEL_WIDTH, -dx));
      }

      let shouldOpen: boolean;
      if (isOpenRef.current) {
        // Currently open → close if swiped right enough
        shouldOpen = !(
          currentOffset < RPANEL_WIDTH * (1 - RPANEL_SNAP_THRESHOLD) ||
          velocity > RPANEL_VELOCITY_THRESHOLD
        );
      } else {
        // Currently closed → open if swiped left enough
        shouldOpen =
          currentOffset > RPANEL_WIDTH * RPANEL_SNAP_THRESHOLD ||
          velocity < -RPANEL_VELOCITY_THRESHOLD;
      }

      applyContentShift(shouldOpen ? RPANEL_WIDTH : 0, true);
      setIsOpen(shouldOpen);
      setDragging(false);
      setDragOffset(0);
      draggingRef.current = false;
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const translateX = dragging ? dragOffset : isOpen ? RPANEL_WIDTH : 0;
  const progress = Math.min(1, Math.max(0, translateX / RPANEL_WIDTH));
  const transitionStyle = dragging ? "none" : "all 220ms cubic-bezier(0.4, 0, 0.2, 1)";

  return (
    <RightPanelMobileContext.Provider value={{
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      progress,
      dragging,
      transitionStyle,
    }}>
      {children}
    </RightPanelMobileContext.Provider>
  );
}

export function MobileRightPanel() {
  const { isOpen, close, progress, dragging, transitionStyle } = useRightPanelMobile();

  const panelScale = 0.92 + progress * 0.08;
  const panelTranslateX = 30 - progress * 30;
  const panelOpacity = progress;

  // Track if the right panel was recently active (to avoid interfering with sidebar)
  const wasActiveRef = useRef(false);

  // Sync content position + overlay on open/close state change
  useEffect(() => {
    const el = document.getElementById("mobile-content");
    if (!el || dragging) return;

    // Only manage content styles when right panel is open or was just closed
    if (!isOpen && !wasActiveRef.current) return;

    const trans = "all 220ms cubic-bezier(0.4, 0, 0.2, 1)";
    el.style.transition = trans;

    let overlay = document.getElementById("rpanel-overlay") as HTMLDivElement | null;
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "rpanel-overlay";
      overlay.style.position = "absolute";
      overlay.style.inset = "0";
      overlay.style.zIndex = "30";
      el.appendChild(overlay);
    }
    overlay.style.transition = trans;

    if (isOpen) {
      wasActiveRef.current = true;
      el.style.transform = `translateX(${-RPANEL_WIDTH}px)`;
      el.style.boxShadow = "4px 0 16px rgba(0, 0, 0, 0.15)";
      el.style.borderRadius = "0 38px 38px 0";
      overlay.style.background = "rgba(0, 0, 0, 0.2)";
      overlay.style.pointerEvents = "auto";
      overlay.onclick = () => close();
    } else {
      // Only reset if WE were the ones controlling the transform
      wasActiveRef.current = false;
      el.style.transform = "";
      el.style.boxShadow = "";
      el.style.borderRadius = "";
      overlay.style.background = "rgba(0,0,0,0)";
      overlay.style.pointerEvents = "none";
      overlay.onclick = null;
    }
  }, [isOpen, dragging, close]);

  if (progress === 0 && !isOpen) return null;

  return (
    <>
      {/* Panel behind content — fixed on the right side */}
      <div
        className="fixed inset-y-0 right-0 z-10 flex flex-col overflow-hidden bg-background"
        style={{
          width: RPANEL_WIDTH,
          transform: `translateX(${panelTranslateX}px) scale(${panelScale})`,
          opacity: panelOpacity,
          transformOrigin: "right center",
          transition: transitionStyle,
        }}
      >
        <RightPanel />
      </div>
    </>
  );
}
