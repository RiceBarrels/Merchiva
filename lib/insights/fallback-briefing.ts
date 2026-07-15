// Deterministic fallback briefing — shared by the hourly cron
// (app/api/cron/morning-briefing) and the dashboard card's client-side safety
// net. The hourly snapshot must exist for EVERY hour, even when the LLM call
// fails (provider outage, bad model, quota): this renders the already-computed
// problem keys into the same {summary, content} shape without any AI.

function fallbackLocale(locale: string): string {
  const key = locale.toLowerCase().split(/[-_]/)[0];
  return key in FALLBACK_COPY ? key : "en";
}

const FALLBACK_COPY: Record<
  string,
  {
    summary: (n: number) => string;
    allClear: string;
    aiDown: string;
    tasksProgress: (done: number, total: number) => string;
    labels: Record<string, (a: string, b: string, c: string) => string>;
  }
> = {
  en: {
    summary: (n) => (n === 0 ? "All clear — nothing needs attention" : `${n} ${n === 1 ? "issue needs" : "issues need"} attention`),
    allClear: "Patrol found nothing that needs attention right now.",
    aiDown: "AI summary unavailable this hour — showing auto-detected issues.",
    tasksProgress: (done, total) => `Today's tasks: ${done}/${total} completed`,
    labels: {
      out: (a) => `Out of stock: ${a}`,
      low: (a) => `Low stock: ${a}`,
      "coverage:none": () => "Store is open today but no shifts are scheduled",
      overdue: (a, b) => `Overdue task: ${a} (${b})`,
      "today-task-overdue": (a, b, c) => `Task overdue today: ${a} — ${b}${c ? `, due ${c}` : ""}`,
      evidence: (a, b) => `Missing required task evidence: ${a} (${b})`,
      late: (a) => `Late arrival: ${a}`,
      absent: (a) => `Scheduled but not clocked in: ${a}`,
      overtime: (a) => `Still clocked in past scheduled end: ${a}`,
      lateout: (a) => `Clocked out late: ${a}`,
      "overdue-out": (a) => `Still clocked in over 1h past shift end — likely forgot to punch out: ${a}`,
      "stale-punch": (a) => `Punch open 12h+ with no scheduled shift: ${a}`,
      timeoff: (a, b) => `Pending time-off request: ${a}${b ? ` (from ${b})` : ""}`,
      trade: (a) => `Pending shift trade/cover: ${a}`,
      coupon: (a) => `Coupon expiring soon: ${a}`,
      insight: (a) => a,
    },
  },
  zh: {
    summary: (n) => (n === 0 ? "一切正常 — 暂无需要处理的事项" : `发现 ${n} 个需要关注的异常`),
    allClear: "本次巡查未发现需要处理的事项。",
    aiDown: "本小时 AI 摘要不可用 — 以下为自动检测结果。",
    tasksProgress: (done, total) => `今日任务：已完成 ${done}/${total}`,
    labels: {
      out: (a) => `缺货：${a}`,
      low: (a) => `库存偏低：${a}`,
      "coverage:none": () => "今天营业但没有任何排班",
      overdue: (a, b) => `任务逾期：${a}（${b}）`,
      "today-task-overdue": (a, b, c) => `今日任务逾期：${a} — ${b}${c ? `，应于 ${c} 完成` : ""}`,
      evidence: (a, b) => `缺少必需的任务凭证：${a}（${b}）`,
      late: (a) => `迟到：${a}`,
      absent: (a) => `已排班但未打卡：${a}`,
      overtime: (a) => `超过排班时间仍在岗：${a}`,
      lateout: (a) => `晚打下班卡：${a}`,
      "overdue-out": (a) => `超过下班时间 1 小时以上仍未打下班卡（可能忘记打卡）：${a}`,
      "stale-punch": (a) => `无排班但打卡已持续 12 小时以上未下班：${a}`,
      timeoff: (a, b) => `待审批请假：${a}${b ? `（${b} 起）` : ""}`,
      trade: (a) => `待处理换班/顶班：${a}`,
      coupon: (a) => `优惠券即将到期：${a}`,
      insight: (a) => a,
    },
  },
  es: {
    summary: (n) => (n === 0 ? "Todo en orden — nada requiere atención" : `${n} ${n === 1 ? "problema requiere" : "problemas requieren"} atención`),
    allClear: "La revisión no encontró nada que requiera atención ahora.",
    aiDown: "Resumen de IA no disponible esta hora — mostrando problemas autodetectados.",
    tasksProgress: (done, total) => `Tareas de hoy: ${done}/${total} completadas`,
    labels: {
      out: (a) => `Sin stock: ${a}`,
      low: (a) => `Stock bajo: ${a}`,
      "coverage:none": () => "La tienda abre hoy pero no hay turnos programados",
      overdue: (a, b) => `Tarea vencida: ${a} (${b})`,
      "today-task-overdue": (a, b, c) => `Tarea de hoy vencida: ${a} — ${b}${c ? `, para las ${c}` : ""}`,
      evidence: (a, b) => `Falta evidencia requerida: ${a} (${b})`,
      late: (a) => `Llegada tarde: ${a}`,
      absent: (a) => `Programado pero sin fichar: ${a}`,
      overtime: (a) => `Sigue fichado tras el fin de turno: ${a}`,
      lateout: (a) => `Salida fichada tarde: ${a}`,
      "overdue-out": (a) => `Sigue fichado más de 1 h tras el fin del turno — probablemente olvidó fichar la salida: ${a}`,
      "stale-punch": (a) => `Fichaje abierto 12 h+ sin turno programado: ${a}`,
      timeoff: (a, b) => `Solicitud de permiso pendiente: ${a}${b ? ` (desde ${b})` : ""}`,
      trade: (a) => `Cambio/cobertura de turno pendiente: ${a}`,
      coupon: (a) => `Cupón por expirar: ${a}`,
      insight: (a) => a,
    },
  },
  fr: {
    summary: (n) => (n === 0 ? "Tout va bien — rien à signaler" : `${n} ${n === 1 ? "problème nécessite" : "problèmes nécessitent"} votre attention`),
    allClear: "La ronde n'a rien trouvé qui nécessite votre attention.",
    aiDown: "Résumé IA indisponible cette heure — problèmes détectés automatiquement.",
    tasksProgress: (done, total) => `Tâches du jour : ${done}/${total} terminées`,
    labels: {
      out: (a) => `Rupture de stock : ${a}`,
      low: (a) => `Stock faible : ${a}`,
      "coverage:none": () => "Le magasin est ouvert aujourd'hui mais aucun créneau n'est planifié",
      overdue: (a, b) => `Tâche en retard : ${a} (${b})`,
      "today-task-overdue": (a, b, c) => `Tâche du jour en retard : ${a} — ${b}${c ? `, prévue à ${c}` : ""}`,
      evidence: (a, b) => `Preuve requise manquante : ${a} (${b})`,
      late: (a) => `Arrivée en retard : ${a}`,
      absent: (a) => `Planifié mais non pointé : ${a}`,
      overtime: (a) => `Toujours pointé après la fin prévue : ${a}`,
      lateout: (a) => `Départ pointé en retard : ${a}`,
      "overdue-out": (a) => `Toujours pointé plus d'1 h après la fin du service — sortie probablement oubliée : ${a}`,
      "stale-punch": (a) => `Pointage ouvert depuis 12 h+ sans service prévu : ${a}`,
      timeoff: (a, b) => `Demande de congé en attente : ${a}${b ? ` (à partir du ${b})` : ""}`,
      trade: (a) => `Échange/remplacement en attente : ${a}`,
      coupon: (a) => `Coupon bientôt expiré : ${a}`,
      insight: (a) => a,
    },
  },
  ar: {
    summary: (n) => (n === 0 ? "كل شيء على ما يرام — لا شيء يحتاج انتباهك" : `${n} مشكلة تحتاج انتباهك`),
    allClear: "لم يجد الفحص أي شيء يحتاج إلى اهتمام الآن.",
    aiDown: "ملخص الذكاء الاصطناعي غير متاح هذه الساعة — هذه المشاكل المكتشفة تلقائياً.",
    tasksProgress: (done, total) => `مهام اليوم: اكتمل ${done}/${total}`,
    labels: {
      out: (a) => `نفد المخزون: ${a}`,
      low: (a) => `مخزون منخفض: ${a}`,
      "coverage:none": () => "المتجر مفتوح اليوم دون أي ورديات مجدولة",
      overdue: (a, b) => `مهمة متأخرة: ${a} (${b})`,
      "today-task-overdue": (a, b, c) => `مهمة اليوم متأخرة: ${a} — ${b}${c ? `، الموعد ${c}` : ""}`,
      evidence: (a, b) => `إثبات المهمة المطلوب مفقود: ${a} (${b})`,
      late: (a) => `وصول متأخر: ${a}`,
      absent: (a) => `مجدول ولم يسجل حضوره: ${a}`,
      overtime: (a) => `ما زال مسجلاً بعد نهاية الوردية: ${a}`,
      lateout: (a) => `سجل الانصراف متأخراً: ${a}`,
      "overdue-out": (a) => `ما زال مسجلاً بعد أكثر من ساعة من نهاية الوردية — ربما نسي تسجيل الانصراف: ${a}`,
      "stale-punch": (a) => `تسجيل حضور مفتوح منذ أكثر من 12 ساعة دون وردية مجدولة: ${a}`,
      timeoff: (a, b) => `طلب إجازة معلق: ${a}${b ? ` (من ${b})` : ""}`,
      trade: (a) => `تبديل/تغطية وردية معلقة: ${a}`,
      coupon: (a) => `قسيمة على وشك الانتهاء: ${a}`,
      insight: (a) => a,
    },
  },
  hi: {
    summary: (n) => (n === 0 ? "सब ठीक है — किसी चीज़ पर ध्यान देने की ज़रूरत नहीं" : `${n} समस्याओं पर ध्यान देने की ज़रूरत है`),
    allClear: "जाँच में अभी कुछ भी ध्यान देने योग्य नहीं मिला।",
    aiDown: "इस घंटे AI सारांश उपलब्ध नहीं — स्वतः पहचानी गई समस्याएँ दिखाई जा रही हैं।",
    tasksProgress: (done, total) => `आज के कार्य: ${done}/${total} पूर्ण`,
    labels: {
      out: (a) => `स्टॉक खत्म: ${a}`,
      low: (a) => `स्टॉक कम: ${a}`,
      "coverage:none": () => "दुकान आज खुली है लेकिन कोई शिफ्ट निर्धारित नहीं है",
      overdue: (a, b) => `कार्य लंबित: ${a} (${b})`,
      "today-task-overdue": (a, b, c) => `आज का कार्य लंबित: ${a} — ${b}${c ? `, नियत ${c}` : ""}`,
      evidence: (a, b) => `आवश्यक कार्य प्रमाण गायब: ${a} (${b})`,
      late: (a) => `देर से आगमन: ${a}`,
      absent: (a) => `शेड्यूल्ड लेकिन पंच-इन नहीं: ${a}`,
      overtime: (a) => `शिफ्ट खत्म होने के बाद भी पंच-इन: ${a}`,
      lateout: (a) => `देर से पंच-आउट: ${a}`,
      "overdue-out": (a) => `शिफ्ट खत्म होने के 1 घंटे+ बाद भी क्लॉक-इन — शायद क्लॉक-आउट करना भूल गए: ${a}`,
      "stale-punch": (a) => `बिना निर्धारित शिफ्ट के 12+ घंटे से पंच खुला: ${a}`,
      timeoff: (a, b) => `लंबित छुट्टी अनुरोध: ${a}${b ? ` (${b} से)` : ""}`,
      trade: (a) => `लंबित शिफ्ट अदला-बदली/कवर: ${a}`,
      coupon: (a) => `कूपन जल्द समाप्त: ${a}`,
      insight: (a) => a,
    },
  },
};

const FALLBACK_META: Record<string, { icon: string; tone: string }> = {
  out: { icon: "Package", tone: "critical" },
  low: { icon: "Package", tone: "warning" },
  "coverage:none": { icon: "Users", tone: "critical" },
  overdue: { icon: "Clock", tone: "warning" },
  "today-task-overdue": { icon: "Clock", tone: "critical" },
  evidence: { icon: "Camera", tone: "warning" },
  late: { icon: "Users", tone: "warning" },
  absent: { icon: "Users", tone: "critical" },
  overtime: { icon: "Clock", tone: "warning" },
  lateout: { icon: "Clock", tone: "info" },
  "overdue-out": { icon: "Clock", tone: "critical" },
  "stale-punch": { icon: "Clock", tone: "warning" },
  timeoff: { icon: "Calendar", tone: "info" },
  trade: { icon: "ArrowRightLeft", tone: "info" },
  coupon: { icon: "Bell", tone: "info" },
  insight: { icon: "AlertTriangle", tone: "critical" },
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildFallbackBriefing(
  problemKeys: string[],
  locale: string,
  todayTasks?: { done: number; total: number } | null,
): { summary: string; content: string } {
  const L = FALLBACK_COPY[fallbackLocale(locale)] ?? FALLBACK_COPY.en;
  const items: string[] = [];
  items.push(`<li data-icon="Bell" data-tone="neutral">${escapeHtml(L.aiDown)}</li>`);
  // Today's task progress is always part of the patrol snapshot.
  if (todayTasks && todayTasks.total > 0) {
    const complete = todayTasks.done >= todayTasks.total;
    items.push(
      `<li data-icon="${complete ? "CheckCheck" : "Clock"}" data-tone="${complete ? "success" : "info"}">${escapeHtml(
        L.tasksProgress(todayTasks.done, todayTasks.total),
      )}</li>`,
    );
  }
  if (problemKeys.length === 0) {
    items.push(`<li data-icon="CheckCheck" data-tone="success">${escapeHtml(L.allClear)}</li>`);
  } else {
    for (const key of problemKeys.slice(0, 20)) {
      const kind = key === "coverage:none" ? key : key.split(":")[0];
      const rest = key === "coverage:none" ? [] : key.split(":").slice(1);
      const label = L.labels[kind];
      const meta = FALLBACK_META[kind] ?? { icon: "AlertTriangle", tone: "warning" };
      // The third segment can itself contain ":" (e.g. a "09:00" due time in
      // today-task-overdue keys) — rejoin instead of truncating at the colon.
      const text = label ? label(rest[0] ?? "", rest[1] ?? "", rest.slice(2).join(":")) : key;
      items.push(`<li data-icon="${meta.icon}" data-tone="${meta.tone}">${escapeHtml(text)}</li>`);
    }
  }
  return { summary: L.summary(problemKeys.length), content: `<ul>${items.join("")}</ul>` };
}
