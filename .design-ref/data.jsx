// Mock data — modeled on the staffing page's shape
const { useState, useMemo, useEffect, useRef, useCallback, createContext, useContext } = React;

// ─── Icon helper ─────────────────────────────────────────────
function Icon({ name, size = 16, className = "", strokeWidth = 1.75, style }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current && window.lucide) {
      ref.current.innerHTML = "";
      const svg = window.lucide.createElement(window.lucide.icons[camelCase(name)] ?? window.lucide.icons.Circle);
      svg.setAttribute("width", size);
      svg.setAttribute("height", size);
      svg.setAttribute("stroke-width", strokeWidth);
      ref.current.appendChild(svg);
    }
  }, [name, size, strokeWidth]);
  return <span ref={ref} className={`inline-flex items-center justify-center ${className}`} style={style} aria-hidden />;
}
function camelCase(s) {
  return s.split("-").map((p, i) => i === 0 ? p[0].toUpperCase() + p.slice(1) : p[0].toUpperCase() + p.slice(1)).join("");
}

// ─── Team ────────────────────────────────────────────────────
const TEAM = [
  { id: "m1",  name: "Amelia Chen",    roleTitle: "Manager",    email: "amelia@maple.co",  status: "active", color: "bg-stone-200 text-stone-800" },
  { id: "m2",  name: "Marcus Lee",     roleTitle: "Barista",    email: "marcus@maple.co",  status: "active", color: "bg-cyan-100 text-cyan-800" },
  { id: "m3",  name: "Priya Nair",     roleTitle: "Shift Lead", email: "priya@maple.co",   status: "active", color: "bg-violet-100 text-violet-800" },
  { id: "m4",  name: "Jordan Pham",    roleTitle: "Barista",    email: "jordan@maple.co",  status: "active", color: "bg-rose-100 text-rose-800" },
  { id: "m5",  name: "Sofia Rossi",    roleTitle: "Cashier",    email: "sofia@maple.co",   status: "active", color: "bg-emerald-100 text-emerald-800" },
  { id: "m6",  name: "Noah Becker",    roleTitle: "Kitchen",    email: "noah@maple.co",    status: "active", color: "bg-amber-100 text-amber-800" },
  { id: "m7",  name: "Elena Park",     roleTitle: "Barista",    email: "elena@maple.co",   status: "active", color: "bg-stone-200 text-stone-800" },
  { id: "m8",  name: "Devon Ray",      roleTitle: "Cashier",    email: "devon@maple.co",   status: "invited", color: "bg-cyan-100 text-cyan-800" },
];

const ROLES = [
  { id: "r1", name: "Barista",    color: "#0891b2", icon: "coffee" },
  { id: "r2", name: "Shift Lead", color: "#7c3aed", icon: "star" },
  { id: "r3", name: "Cashier",    color: "#16a34a", icon: "banknote" },
  { id: "r4", name: "Kitchen",    color: "#ea580c", icon: "chef-hat" },
  { id: "r5", name: "Cleaning",   color: "#0891b2", icon: "sparkles" },
];

// ─── Week utilities ─────────────────────────────────────────
function mondayOf(base) {
  const d = new Date(base);
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  mon.setHours(0, 0, 0, 0);
  return mon;
}
function weekDates(base) {
  const mon = mondayOf(base);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i); return d;
  });
}
function isoDate(d) { return d.toISOString().split("T")[0]; }

// Pin "today" to Tue Apr 22 2026 so grid is deterministic
const TODAY = new Date(2026, 3, 22); // month 3 = April
const THIS_WEEK = weekDates(TODAY);

// ─── Generate shifts for the demo week ───────────────────────
function buildShifts() {
  const out = [];
  let idc = 1;
  const push = (memberId, dayIdx, startTime, endTime, roleNames, shiftType) => {
    const member = TEAM.find(m => m.id === memberId);
    out.push({
      id: `s${idc++}`, memberId, staffName: member.name,
      date: isoDate(THIS_WEEK[dayIdx]),
      startTime, endTime, shiftType, staffRoles: roleNames,
    });
  };
  // Mon 0
  push("m1", 0, "07:00", "15:00", ["Shift Lead"], "morning");
  push("m2", 0, "07:00", "14:00", ["Barista"], "morning");
  push("m5", 0, "09:00", "17:00", ["Cashier"], "morning");
  push("m6", 0, "10:00", "18:00", ["Kitchen"], "afternoon");
  push("m3", 0, "13:00", "21:00", ["Shift Lead"], "evening");
  // Tue 1 (today)
  push("m1", 1, "07:00", "15:00", ["Shift Lead"], "morning");
  push("m4", 1, "07:00", "14:00", ["Barista"], "morning");
  push("m2", 1, "11:00", "19:00", ["Barista"], "afternoon");
  push("m6", 1, "10:00", "18:00", ["Kitchen"], "afternoon");
  push("m7", 1, "14:00", "22:00", ["Barista"], "evening");
  // Wed 2
  push("m2", 2, "07:00", "14:00", ["Barista"], "morning");
  push("m5", 2, "08:00", "16:00", ["Cashier"], "morning");
  push("m3", 2, "13:00", "21:00", ["Shift Lead"], "evening");
  push("m4", 2, "14:00", "22:00", ["Barista"], "evening");
  // Thu 3
  push("m1", 3, "07:00", "15:00", ["Shift Lead"], "morning");
  push("m7", 3, "07:00", "14:00", ["Barista"], "morning");
  push("m6", 3, "10:00", "18:00", ["Kitchen"], "afternoon");
  push("m2", 3, "14:00", "22:00", ["Barista"], "evening");
  // Fri 4
  push("m3", 4, "07:00", "15:00", ["Shift Lead"], "morning");
  push("m4", 4, "07:00", "14:00", ["Barista"], "morning");
  push("m5", 4, "09:00", "17:00", ["Cashier"], "morning");
  push("m6", 4, "10:00", "18:00", ["Kitchen"], "afternoon");
  push("m2", 4, "14:00", "22:00", ["Barista"], "evening");
  push("m7", 4, "16:00", "23:00", ["Barista"], "closing");
  // Sat 5
  push("m1", 5, "07:00", "15:00", ["Shift Lead"], "morning");
  push("m2", 5, "07:00", "14:00", ["Barista"], "morning");
  push("m4", 5, "09:00", "17:00", ["Barista"], "morning");
  push("m5", 5, "09:00", "17:00", ["Cashier"], "morning");
  push("m3", 5, "13:00", "21:00", ["Shift Lead"], "evening");
  push("m6", 5, "10:00", "18:00", ["Kitchen"], "afternoon");
  push("m7", 5, "16:00", "23:00", ["Barista", "Cleaning"], "closing");
  // Sun 6
  push("m2", 6, "08:00", "15:00", ["Barista"], "morning");
  push("m5", 6, "09:00", "17:00", ["Cashier"], "morning");
  push("m6", 6, "10:00", "16:00", ["Kitchen"], "afternoon");
  return out;
}

const SHIFTS_SEED = buildShifts();

// ─── Requests ───────────────────────────────────────────────
const TIME_OFF_SEED = [
  { id: "t1", userId: "m4", staffName: "Jordan Pham", startDate: isoDate(THIS_WEEK[5]), endDate: isoDate(THIS_WEEK[6]), fullDays: true, comments: "Family wedding out of town.", status: "pending" },
  { id: "t2", userId: "m7", staffName: "Elena Park",  startDate: isoDate(new Date(THIS_WEEK[6].getTime()+86400000*3)), endDate: isoDate(new Date(THIS_WEEK[6].getTime()+86400000*3)), fullDays: false, startTime: "14:00", endTime: "17:00", comments: "Doctor appointment.", status: "pending" },
  { id: "t3", userId: "m5", staffName: "Sofia Rossi", startDate: isoDate(new Date(THIS_WEEK[6].getTime()+86400000*10)), endDate: isoDate(new Date(THIS_WEEK[6].getTime()+86400000*14)), fullDays: true, comments: "", status: "pending" },
];

const TRADES_SEED = [
  { id: "td1", type: "trade", requesterId: "m2", targetId: "m7", shiftId: "s8", status: "pending" }, // Tue 11-19 Marcus → Elena
  { id: "td2", type: "cover", requesterId: "m5", targetId: null,  shiftId: "s12", status: "pending" }, // Wed 8-16 Sofia cover
];

// ─── Shared helpers ─────────────────────────────────────────
function formatTime(t) {
  const [h, m] = t.split(":").map(Number);
  const p = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${m.toString().padStart(2,"0")} ${p}`;
}
function formatTimeShort(t) {
  const [h, m] = t.split(":").map(Number);
  const p = h >= 12 ? "p" : "a";
  const hr = h % 12 || 12;
  return m === 0 ? `${hr}${p}` : `${hr}:${m.toString().padStart(2,"0")}${p}`;
}
function initials(name) { return name.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase(); }
function dayMonth(d) { return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }); }
function shortDate(iso) { const d = new Date(iso+"T00:00:00"); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); }

const SHIFT_COLORS = {
  morning:   "#57534e",
  afternoon: "#0891b2",
  evening:   "#7c3aed",
  closing:   "#dc2626",
};
const SHIFT_LABELS = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", closing: "Closing" };

const DAY_ABBR = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

Object.assign(window, {
  Icon, TEAM, ROLES, THIS_WEEK, TODAY, SHIFTS_SEED, TIME_OFF_SEED, TRADES_SEED,
  formatTime, formatTimeShort, initials, dayMonth, shortDate, isoDate, weekDates, mondayOf,
  SHIFT_COLORS, SHIFT_LABELS, DAY_ABBR,
});
