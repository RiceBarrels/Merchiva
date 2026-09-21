"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bug, Send, X, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { toast } from "sonner";
import { usePermissions } from "@/lib/context/permissions";
import { hapticHeavy } from "@/lib/haptics";
import { useT } from "@/lib/i18n/context";

// ─── Shake Detection ────────────────────────────────────────────────────────

const SHAKE_THRESHOLD = 25;
const SHAKE_TIMEOUT = 1000;
const SHAKE_COUNT_NEEDED = 2;

function useShakeDetection(onShake: () => void) {
  const lastX = useRef(0);
  const lastY = useRef(0);
  const lastZ = useRef(0);
  const lastTime = useRef(0);
  const shakeCount = useRef(0);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onShakeRef = useRef(onShake);
  // Assigning a ref during render is not safe under concurrent rendering —
  // React may render this component without ever committing it.
  useEffect(() => {
    onShakeRef.current = onShake;
  }, [onShake]);

  useEffect(() => {
    function handleMotion(e: DeviceMotionEvent) {
      const acc = e.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

      const now = Date.now();
      if (now - lastTime.current < 100) return;

      const dx = Math.abs(acc.x - lastX.current);
      const dy = Math.abs(acc.y - lastY.current);
      const dz = Math.abs(acc.z - lastZ.current);
      const force = dx + dy + dz;

      lastX.current = acc.x;
      lastY.current = acc.y;
      lastZ.current = acc.z;
      lastTime.current = now;

      if (force > SHAKE_THRESHOLD) {
        shakeCount.current++;
        if (shakeTimer.current) clearTimeout(shakeTimer.current);
        shakeTimer.current = setTimeout(() => { shakeCount.current = 0; }, SHAKE_TIMEOUT);

        if (shakeCount.current >= SHAKE_COUNT_NEEDED) {
          shakeCount.current = 0;
          onShakeRef.current();
        }
      }
    }

    if (typeof window !== "undefined" && "DeviceMotionEvent" in window) {
      window.addEventListener("devicemotion", handleMotion);
    }
    return () => {
      window.removeEventListener("devicemotion", handleMotion);
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
    };
  }, []);
}

// ─── Bug Report Drawer ──────────────────────────────────────────────────────

interface BugReport {
  title: string;
  description: string;
  screenshot: string | null;
  page: string;
  userAgent: string;
  timestamp: string;
  orgId: string | null;
}

export function ShakeBugReport() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { organizationId } = usePermissions();
  const t = useT();

  const handleShake = useCallback(() => {
    hapticHeavy();
    setOpen(true);
  }, []);

  useShakeDetection(handleShake);

  const captureScreenshot = useCallback(async () => {
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(document.body, {
        scale: 0.5,
        useCORS: true,
        logging: false,
      });
      setScreenshot(canvas.toDataURL("image/jpeg", 0.6));
      toast.success(t("bugReport.screenshotCaptured"));
    } catch {
      toast.error(t("bugReport.screenshotFailed"));
    }
  }, [t]);

  const handleSubmit = useCallback(() => {
    if (!title.trim()) {
      toast.error(t("bugReport.titleRequired"));
      return;
    }

    const report: BugReport = {
      title: title.trim(),
      description: description.trim(),
      screenshot,
      page: window.location.pathname,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      orgId: organizationId,
    };

    // Store locally (could be sent to API later)
    try {
      const existing = JSON.parse(localStorage.getItem("bug_reports") || "[]");
      existing.push(report);
      localStorage.setItem("bug_reports", JSON.stringify(existing));
    } catch {}

    toast.success(t("bugReport.saved"));
    setOpen(false);
    setTitle("");
    setDescription("");
    setScreenshot(null);
  }, [title, description, screenshot, organizationId, t]);

  return (
    <Drawer open={open} onOpenChange={setOpen} direction="bottom">
      <DrawerContent className="z-[201] max-h-[85vh] bg-background">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 pt-3 border-b border-border">
          <DrawerTitle className="flex items-center gap-2 text-[14px] font-semibold">
            <Bug className="h-4 w-4 text-destructive" />
            {t("bugReport.title")}
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            {t("bugReport.drawerDescription")}
          </DrawerDescription>
          <DrawerClose asChild>
            <Button variant="ghost" size="icon-xs">
              <X className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DrawerClose>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <Field label={t("bugReport.whatWentWrong")} htmlFor="bug-report-title">
            <Input
              id="bug-report-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("bugReport.titlePlaceholder")}
              className="text-[14px]"
              autoFocus
            />
          </Field>

          <Field label={t("bugReport.detailsLabel")} htmlFor="bug-report-details">
            <Textarea
              id="bug-report-details"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("bugReport.detailsPlaceholder")}
              rows={3}
              className="text-[13px] resize-none"
            />
          </Field>

          {/* Screenshot */}
          <Field label={t("bugReport.screenshotLabel")}>
            {screenshot ? (
              <div className="relative">
                <img src={screenshot} alt={t("bugReport.screenshotAlt")} className="w-full rounded-lg border border-border" />
                <button
                  onClick={() => setScreenshot(null)}
                  className="absolute top-1 right-1 h-5 w-5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={captureScreenshot}
                className="w-full border-dashed text-xs text-muted-foreground"
              >
                <Camera className="h-3.5 w-3.5" />
                {t("bugReport.captureScreenshot")}
              </Button>
            )}
          </Field>

          {/* Context */}
          <div className="flex gap-2 text-[10px] text-muted-foreground font-mono tabular-nums">
            <span className="px-1.5 py-0.5 bg-muted rounded">{window.location.pathname}</span>
            <span className="px-1.5 py-0.5 bg-muted rounded">{new Date().toLocaleTimeString()}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border">
          <Button onClick={handleSubmit} disabled={submitting} className="w-full gap-2">
            <Send className="h-3.5 w-3.5" />
            {t("bugReport.submit")}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
