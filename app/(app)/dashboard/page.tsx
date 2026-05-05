"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { usePermissions } from "@/lib/context/permissions";
import { useT } from "@/lib/i18n/context";
import { Settings2, X, Plus, Check, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  WIDGET_REGISTRY,
  DEFAULT_WIDGET_ORDER,
  type WidgetId,
} from "@/components/dashboard-widgets";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ── Layout persistence ───────────────────────────────────────────────────────

interface DashboardLayout {
  visible: WidgetId[];
  order: WidgetId[];
}

function getStorageKey(orgId: string | null): string {
  return `dashboard_layout_${orgId ?? "default"}`;
}

function loadLayout(orgId: string | null): DashboardLayout {
  try {
    const raw = localStorage.getItem(getStorageKey(orgId));
    if (raw) {
      const parsed = JSON.parse(raw) as DashboardLayout;
      const knownIds = new Set(WIDGET_REGISTRY.map((w) => w.id));
      const validOrder = parsed.order.filter((id) => knownIds.has(id));
      const validVisible = parsed.visible.filter((id) => knownIds.has(id));
      const missing = DEFAULT_WIDGET_ORDER.filter((id) => !validOrder.includes(id));
      return {
        order: [...validOrder, ...missing],
        visible: [...validVisible, ...missing],
      };
    }
  } catch {}
  return {
    order: [...DEFAULT_WIDGET_ORDER],
    visible: [...DEFAULT_WIDGET_ORDER],
  };
}

function saveLayout(orgId: string | null, layout: DashboardLayout): void {
  try {
    localStorage.setItem(getStorageKey(orgId), JSON.stringify(layout));
  } catch {}
}

// ── Sortable Widget Wrapper ──────────────────────────────────────────────────

function SortableWidget({
  widget,
  customizing,
  onRemove,
}: {
  widget: { id: WidgetId; component: React.ComponentType };
  customizing: boolean;
  onRemove: (id: WidgetId) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: widget.id, disabled: !customizing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? "transform 400ms cubic-bezier(0.25, 1, 0.5, 1)",
  };

  const Component = widget.component;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative h-full",
        customizing && "widget-jiggle select-none",
        isSortableDragging && "opacity-30 scale-[0.97] transition-all duration-200"
      )}
    >
      {customizing && (
        <>
          <button
            onClick={() => onRemove(widget.id)}
            className="absolute -top-1.5 -right-1.5 z-10 h-5 w-5 flex items-center justify-center rounded-full bg-red-500 text-white shadow-sm hover:bg-red-600 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
          <div
            {...attributes}
            {...listeners}
            className="absolute top-2 left-2 z-10 cursor-grab active:cursor-grabbing p-0.5 rounded-[0.3rem] hover:bg-muted/80 text-muted-foreground"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </div>
        </>
      )}
      <Component />
    </div>
  );
}

// ── Dashboard Page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { organizationId, currentOrg } = usePermissions();
  const tr = useT();
  const [customizing, setCustomizing] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [layout, setLayout] = useState<DashboardLayout>(() => loadLayout(organizationId));

  const [activeId, setActiveId] = useState<WidgetId | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    setLayout(loadLayout(organizationId));
  }, [organizationId]);

  useEffect(() => {
    saveLayout(organizationId, layout);
  }, [layout, organizationId]);

  const handleRemove = useCallback((id: WidgetId) => {
    setLayout((prev) => ({
      ...prev,
      visible: prev.visible.filter((v) => v !== id),
    }));
  }, []);

  const handleAdd = useCallback((id: WidgetId) => {
    setLayout((prev) => ({
      ...prev,
      visible: [...prev.visible, id],
    }));
    setAddMenuOpen(false);
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as WidgetId);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLayout((prev) => {
      const oldIndex = prev.order.indexOf(active.id as WidgetId);
      const newIndex = prev.order.indexOf(over.id as WidgetId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return prev;
      return { ...prev, order: arrayMove(prev.order, oldIndex, newIndex) };
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    setActiveId(null);
  }, []);

  const widgetMap = useMemo(() => new Map(WIDGET_REGISTRY.map((w) => [w.id, w])), []);

  const visibleWidgets = useMemo(
    () =>
      layout.order
        .filter((id) => layout.visible.includes(id))
        .map((id) => widgetMap.get(id))
        .filter(Boolean),
    [layout, widgetMap]
  );

  const hiddenWidgets = useMemo(
    () => WIDGET_REGISTRY.filter((w) => !layout.visible.includes(w.id)),
    [layout]
  );

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return tr("dashboard.greeting.morning");
    if (h < 17) return tr("dashboard.greeting.afternoon");
    return tr("dashboard.greeting.evening");
  }, [tr]);

  const userName = currentOrg?.name ?? "";

  return (
    <div className="space-y-4 sm:space-y-6">
      <style>{`
        @keyframes jiggle {
          0% { transform: rotate(-0.7deg); }
          25% { transform: rotate(0.7deg); }
          50% { transform: rotate(-0.5deg); }
          75% { transform: rotate(0.5deg); }
          100% { transform: rotate(-0.7deg); }
        }
        .widget-jiggle {
          animation: jiggle 0.3s ease-in-out infinite;
        }
        .widget-jiggle:nth-child(2n) {
          animation-delay: 0.05s;
        }
        .widget-jiggle:nth-child(3n) {
          animation-delay: 0.1s;
          animation-duration: 0.35s;
        }
      `}</style>

      <PageHeader
        title={`${greeting}${userName ? `, ${userName}` : ""}`}
        subtitle={new Date().toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
        right={
          <div className="flex items-center gap-1.5">
            {customizing && hiddenWidgets.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setAddMenuOpen((v) => !v)}
                  className="h-7 flex items-center gap-1 px-2 rounded-[0.3rem] border border-border hover:bg-muted transition-colors text-xs font-medium"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
                {addMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setAddMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-[0.3rem] border border-border bg-card shadow-lg py-1">
                      {hiddenWidgets.map((w) => (
                        <button
                          key={w.id}
                          onClick={() => handleAdd(w.id)}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                        >
                          {w.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <button
              onClick={() => {
                setCustomizing((v) => !v);
                setAddMenuOpen(false);
              }}
              className={cn(
                "h-7 flex items-center gap-1 px-2 rounded-[0.3rem] border border-border hover:bg-muted transition-colors text-xs font-medium",
                customizing && "bg-foreground text-background hover:bg-foreground/90"
              )}
            >
              {customizing ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Done
                </>
              ) : (
                <Settings2 className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        }
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={visibleWidgets.map((w) => w!.id)}
          strategy={rectSortingStrategy}
          disabled={!customizing}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 grid-rows-[repeat(auto-fill,minmax(0,1fr))]" style={{ gridAutoRows: "260px" }}>
            {visibleWidgets.map((widget) => {
              if (!widget) return null;
              return (
                <SortableWidget
                  key={widget.id}
                  widget={widget}
                  customizing={customizing}
                  onRemove={handleRemove}
                />
              );
            })}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={{
          duration: 500,
          easing: "cubic-bezier(0.25, 1, 0.5, 1)",
        }}>
          {activeId && widgetMap.get(activeId) ? (() => {
            const OverlayComponent = widgetMap.get(activeId)!.component;
            return (
              <div className="opacity-90 shadow-lg ring-1 ring-border rounded-[0.3rem] scale-[1.02] h-[260px] overflow-hidden">
                <OverlayComponent />
              </div>
            );
          })() : null}
        </DragOverlay>
      </DndContext>

      {visibleWidgets.length === 0 && (
        <div className="rounded-[0.3rem] border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No widgets visible.{" "}
            {customizing
              ? 'Click "Add" to add widgets.'
              : "Click the settings icon to customize your dashboard."}
          </p>
        </div>
      )}
    </div>
  );
}
