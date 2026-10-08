// SVG path data: parse, scale and print (slides.md §3). Imported custom geometry is stored as a path "d" in its
// own view box; the renderer scales it to the element box and the .pptx export turns it into custGeom points.
// Everything is reduced to absolute M / L / C / Q / Z, so arcs become cubic Béziers.
import { SLIDES_MAX_PATH_CHARS } from "@/lib/slides/constants";

export type PathCommand =
  | { c: "M" | "L"; x: number; y: number }
  | { c: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { c: "Q"; x1: number; y1: number; x: number; y: number }
  | { c: "Z" };

const ARG_COUNT: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
/** One token (a command letter or a number) with the SVG whitespace around it and an optional comma after it. */
const TOKEN_RE = /[ \t\n\f\r]*([MLHVCSQTAZmlhvcsqtaz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)[ \t\n\f\r]*(,)?/y;
/** Coordinates beyond this are rejected (a path is in its own view box, not slide pt). */
const PATH_COORD_LIMIT = 1e7;

/**
 * The command and number tokens of `d`, or null when anything else is in it: a stray "e", "." or "+-", a comma after
 * a command letter or a doubled comma. The tokens then cover every character and nothing is skipped silently: a
 * browser's parser stops drawing at the first error, so a skipped token would make the canvas and the export differ.
 */
function tokenize(d: string): string[] | null {
  const tokens: string[] = [];
  let pos = 0;
  while (pos < d.length) {
    TOKEN_RE.lastIndex = pos;
    const m = TOKEN_RE.exec(d);
    if (!m) return /^[ \t\n\f\r]*$/.test(d.slice(pos)) ? tokens : null;
    if (m[2] !== undefined && /^[a-zA-Z]$/.test(m[1])) return null; // commas separate numbers only
    tokens.push(m[1]);
    pos = TOKEN_RE.lastIndex;
  }
  return tokens;
}

/** Cubic segments approximating the SVG arc from (x0, y0) (endpoint parameterization, SVG 1.1 F.6.5). */
function arcToCubics(
  x0: number, y0: number, rxIn: number, ryIn: number, angleDeg: number, largeArc: boolean, sweep: boolean,
  x: number, y: number,
): PathCommand[] {
  if (x0 === x && y0 === y) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [{ c: "L", x, y }];
  const phi = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x0 - x) / 2;
  const dy = (y0 - y) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x0 + x) / 2;
  const cy = sin * cxp + cos * cyp + (y0 + y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  else if (sweep && delta < 0) delta += 2 * Math.PI;
  const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
  const step = delta / segments;
  const k = (4 / 3) * Math.tan(step / 4);
  const point = (t: number) => ({
    x: cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
    y: cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
  });
  const deriv = (t: number) => ({
    x: -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin,
    y: -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos,
  });
  const out: PathCommand[] = [];
  for (let i = 0; i < segments; i++) {
    const t1 = theta1 + i * step;
    const t2 = t1 + step;
    const p1 = point(t1);
    const p2 = i === segments - 1 ? { x, y } : point(t2);
    const d1 = deriv(t1);
    const d2 = deriv(t2);
    out.push({ c: "C", x1: p1.x + k * d1.x, y1: p1.y + k * d1.y, x2: p2.x - k * d2.x, y2: p2.y - k * d2.y, x: p2.x, y: p2.y });
  }
  return out;
}

/**
 * Parses SVG path data (M/L/H/V/C/S/Q/T/A/Z, absolute and relative) into absolute M/L/C/Q/Z commands. Null when
 * the data is malformed (any character that is not part of a command, a number or a separator), has a non-finite
 * or huge number, or is longer than SLIDES_MAX_PATH_CHARS.
 */
export function parsePath(d: string): PathCommand[] | null {
  if (typeof d !== "string" || d.length > SLIDES_MAX_PATH_CHARS) return null;
  const tokens = tokenize(d);
  if (tokens === null) return null;
  const out: PathCommand[] = [];
  let i = 0;
  let cmd = "";
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let lastCtrl: { x: number; y: number } | null = null;
  let lastCtrlKind: "C" | "Q" | null = null;
  const isCommand = (t: string | undefined) => t !== undefined && /^[a-zA-Z]$/.test(t);
  while (i < tokens.length) {
    if (isCommand(tokens[i])) cmd = tokens[i++];
    else if (cmd === "" || cmd === "Z" || cmd === "z") return null; // numbers with no command
    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;
    const count = ARG_COUNT[upper];
    if (count === undefined) return null;
    if (count === 0) {
      out.push({ c: "Z" });
      x = startX;
      y = startY;
      lastCtrl = null;
      lastCtrlKind = null;
      continue;
    }
    const args: number[] = [];
    for (let k = 0; k < count; k++) {
      const token = tokens[i++];
      if (token === undefined || isCommand(token)) return null;
      const n = Number(token);
      if (!Number.isFinite(n) || Math.abs(n) > PATH_COORD_LIMIT) return null;
      args.push(n);
    }
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    let ctrl: { x: number; y: number } | null = null;
    let ctrlKind: "C" | "Q" | null = null;
    switch (upper) {
      case "M":
        x = args[0] + ox;
        y = args[1] + oy;
        startX = x;
        startY = y;
        out.push({ c: "M", x, y });
        cmd = rel ? "l" : "L"; // extra pairs after M are line-tos
        break;
      case "L":
        x = args[0] + ox;
        y = args[1] + oy;
        out.push({ c: "L", x, y });
        break;
      case "H":
        x = args[0] + ox;
        out.push({ c: "L", x, y });
        break;
      case "V":
        y = args[0] + oy;
        out.push({ c: "L", x, y });
        break;
      case "C":
      case "S": {
        const [x1, y1]: [number, number] =
          upper === "C" ? [args[0] + ox, args[1] + oy]
          : lastCtrlKind === "C" && lastCtrl ? [2 * x - lastCtrl.x, 2 * y - lastCtrl.y] : [x, y];
        const rest = upper === "C" ? args.slice(2) : args;
        const x2 = rest[0] + ox;
        const y2 = rest[1] + oy;
        x = rest[2] + ox;
        y = rest[3] + oy;
        out.push({ c: "C", x1, y1, x2, y2, x, y });
        ctrl = { x: x2, y: y2 };
        ctrlKind = "C";
        break;
      }
      case "Q":
      case "T": {
        const [x1, y1]: [number, number] =
          upper === "Q" ? [args[0] + ox, args[1] + oy]
          : lastCtrlKind === "Q" && lastCtrl ? [2 * x - lastCtrl.x, 2 * y - lastCtrl.y] : [x, y];
        const rest = upper === "Q" ? args.slice(2) : args;
        x = rest[0] + ox;
        y = rest[1] + oy;
        out.push({ c: "Q", x1, y1, x, y });
        ctrl = { x: x1, y: y1 };
        ctrlKind = "Q";
        break;
      }
      case "A": {
        const [rx, ry, rotation, large, sweepFlag, ex, ey] = args;
        const endX = ex + ox;
        const endY = ey + oy;
        out.push(...arcToCubics(x, y, rx, ry, rotation, large !== 0, sweepFlag !== 0, endX, endY));
        x = endX;
        y = endY;
        break;
      }
    }
    lastCtrl = ctrl;
    lastCtrlKind = ctrlKind;
  }
  if (out.length === 0 || out[0].c !== "M") return null;
  return out;
}

/** Every coordinate multiplied by (sx, sy). */
export function scalePath(cmds: readonly PathCommand[], sx: number, sy: number): PathCommand[] {
  return cmds.map((cmd) => {
    switch (cmd.c) {
      case "Z":
        return cmd;
      case "M":
      case "L":
        return { c: cmd.c, x: cmd.x * sx, y: cmd.y * sy };
      case "C":
        return { c: "C", x1: cmd.x1 * sx, y1: cmd.y1 * sy, x2: cmd.x2 * sx, y2: cmd.y2 * sy, x: cmd.x * sx, y: cmd.y * sy };
      case "Q":
        return { c: "Q", x1: cmd.x1 * sx, y1: cmd.y1 * sy, x: cmd.x * sx, y: cmd.y * sy };
    }
  });
}

/** Up to 3 decimals, no trailing zeros, no "-0". */
export function formatPathNumber(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** Absolute path data for the commands. */
export function toSvgD(cmds: readonly PathCommand[]): string {
  const f = formatPathNumber;
  return cmds
    .map((cmd) => {
      switch (cmd.c) {
        case "Z":
          return "Z";
        case "M":
        case "L":
          return `${cmd.c}${f(cmd.x)} ${f(cmd.y)}`;
        case "C":
          return `C${f(cmd.x1)} ${f(cmd.y1)} ${f(cmd.x2)} ${f(cmd.y2)} ${f(cmd.x)} ${f(cmd.y)}`;
        case "Q":
          return `Q${f(cmd.x1)} ${f(cmd.y1)} ${f(cmd.x)} ${f(cmd.y)}`;
      }
    })
    .join(" ");
}
