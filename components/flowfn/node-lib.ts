import type { NodeDef, FlowNode, PortType } from "./types";

const T: Record<string, PortType> = {
  number: "number",
  string: "string",
  bool: "bool",
  any: "any",
  array: "array",
  object: "object",
  flow: "flow",
};

export function safeIdent(s: string | undefined): string {
  let v = String(s || "").trim();
  if (!v) return "_";
  v = v.replace(/[^A-Za-z0-9_$]/g, "_");
  if (/^[0-9]/.test(v)) v = "_" + v;
  return v;
}

export const NODE_LIB: Record<string, NodeDef> = {
  // ── INPUTS ──
  param: {
    cat: "Inputs",
    label: "Parameter",
    icon: "input",
    iconClass: "input",
    desc: "Function input",
    inputs: [],
    outputs: [{ id: "out", label: "value", type: T.any }],
    controls: [
      { id: "name", kind: "text", placeholder: "name", default: "x" },
      { id: "type", kind: "select", options: ["any", "number", "string", "bool", "array", "object"], default: "any" },
    ],
    expr: (n) => safeIdent(n.data.name as string),
  },
  "const-num": {
    cat: "Inputs",
    label: "Number",
    icon: "number",
    iconClass: "input",
    desc: "Numeric literal",
    inputs: [],
    outputs: [{ id: "out", label: "value", type: T.number }],
    controls: [{ id: "value", kind: "number", default: 0 }],
    expr: (n) => JSON.stringify(Number(n.data.value) || 0),
  },
  "const-str": {
    cat: "Inputs",
    label: "Text",
    icon: "string",
    iconClass: "input",
    desc: "String literal",
    inputs: [],
    outputs: [{ id: "out", label: "value", type: T.string }],
    controls: [{ id: "value", kind: "text", default: "hello" }],
    expr: (n) => JSON.stringify(String(n.data.value ?? "")),
  },
  "const-bool": {
    cat: "Inputs",
    label: "Boolean",
    icon: "bool",
    iconClass: "input",
    desc: "true / false",
    inputs: [],
    outputs: [{ id: "out", label: "value", type: T.bool }],
    controls: [{ id: "value", kind: "bool", default: true }],
    expr: (n) => (n.data.value ? "true" : "false"),
  },
  "const-arr": {
    cat: "Inputs",
    label: "Array",
    icon: "array",
    iconClass: "input",
    desc: "JSON array literal",
    inputs: [],
    outputs: [{ id: "out", label: "value", type: T.array }],
    controls: [{ id: "value", kind: "textarea", default: "[1, 2, 3]" }],
    expr: (n) => {
      try { return JSON.stringify(JSON.parse(n.data.value as string)); }
      catch { return "[]"; }
    },
  },
  "const-obj": {
    cat: "Inputs",
    label: "Object",
    icon: "object",
    iconClass: "input",
    desc: "JSON object literal",
    inputs: [],
    outputs: [{ id: "out", label: "value", type: T.object }],
    controls: [{ id: "value", kind: "textarea", default: '{ "a": 1 }' }],
    expr: (n) => {
      try { return JSON.stringify(JSON.parse(n.data.value as string)); }
      catch { return "{}"; }
    },
  },

  // ── MATH ──
  "math-bin": {
    cat: "Math",
    label: "Math",
    icon: "number",
    iconClass: "logic",
    desc: "a op b",
    inputs: [
      { id: "a", label: "a", type: T.number },
      { id: "b", label: "b", type: T.number },
    ],
    outputs: [{ id: "out", label: "result", type: T.number }],
    controls: [{ id: "op", kind: "select", options: ["+", "-", "*", "/", "%", "**"], default: "+" }],
    expr: (n, get) => `(${get("a", "0")} ${n.data.op || "+"} ${get("b", "0")})`,
  },
  "math-fn": {
    cat: "Math",
    label: "Math fn",
    icon: "number",
    iconClass: "logic",
    desc: "Math.x()",
    inputs: [{ id: "x", label: "x", type: T.number }],
    outputs: [{ id: "out", label: "result", type: T.number }],
    controls: [{ id: "fn", kind: "select", options: ["abs", "floor", "ceil", "round", "sqrt", "log", "sign", "min", "max"], default: "round" }],
    expr: (n, get) => `Math.${n.data.fn || "round"}(${get("x", "0")})`,
  },
  compare: {
    cat: "Math",
    label: "Compare",
    icon: "number",
    iconClass: "logic",
    desc: "a vs b",
    inputs: [
      { id: "a", label: "a", type: T.any },
      { id: "b", label: "b", type: T.any },
    ],
    outputs: [{ id: "out", label: "bool", type: T.bool }],
    controls: [{ id: "op", kind: "select", options: ["===", "!==", ">", "<", ">=", "<="], default: "===" }],
    expr: (n, get) => `(${get("a", "0")} ${n.data.op || "==="} ${get("b", "0")})`,
  },
  logic: {
    cat: "Math",
    label: "Logic",
    icon: "number",
    iconClass: "logic",
    desc: "and / or / not",
    inputs: [
      { id: "a", label: "a", type: T.bool },
      { id: "b", label: "b", type: T.bool },
    ],
    outputs: [{ id: "out", label: "bool", type: T.bool }],
    controls: [{ id: "op", kind: "select", options: ["&&", "||", "xor", "! a"], default: "&&" }],
    expr: (n, get) => {
      const a = get("a", "false"), b = get("b", "false");
      const op = n.data.op || "&&";
      if (op === "! a") return `(!${a})`;
      if (op === "xor") return `((!!${a}) !== (!!${b}))`;
      return `(${a} ${op} ${b})`;
    },
  },

  // ── STRINGS ──
  "str-concat": {
    cat: "Strings",
    label: "Concat",
    icon: "string",
    iconClass: "data",
    desc: "a + b",
    inputs: [
      { id: "a", label: "a", type: T.string },
      { id: "b", label: "b", type: T.string },
    ],
    outputs: [{ id: "out", label: "result", type: T.string }],
    expr: (_, get) => `String(${get("a", '""')}) + String(${get("b", '""')})`,
  },
  "str-template": {
    cat: "Strings",
    label: "Template",
    icon: "string",
    iconClass: "data",
    desc: "Interpolated text",
    inputs: [
      { id: "a", label: "a", type: T.any },
      { id: "b", label: "b", type: T.any },
      { id: "c", label: "c", type: T.any },
    ],
    outputs: [{ id: "out", label: "result", type: T.string }],
    controls: [{ id: "tpl", kind: "text", default: "Hello {a} you are {b}", placeholder: "use {a} {b} {c}" }],
    expr: (n, get) => {
      const tpl = String(n.data.tpl || "");
      const escaped = tpl.replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
      const interp = escaped.replace(/\{([abc])\}/g, (_, k: string) => "${" + get(k, '""') + "}");
      return "`" + interp + "`";
    },
  },
  "str-method": {
    cat: "Strings",
    label: "String method",
    icon: "string",
    iconClass: "data",
    desc: "transform",
    inputs: [{ id: "s", label: "str", type: T.string }],
    outputs: [{ id: "out", label: "result", type: T.string }],
    controls: [{ id: "fn", kind: "select", options: ["toUpperCase", "toLowerCase", "trim", "length"], default: "toUpperCase" }],
    expr: (n, get) =>
      n.data.fn === "length"
        ? `String(${get("s", '""')}).length`
        : `String(${get("s", '""')}).${n.data.fn || "toUpperCase"}()`,
  },

  // ── ARRAYS / OBJECTS ──
  "arr-map": {
    cat: "Arrays",
    label: "Map",
    icon: "array",
    iconClass: "data",
    desc: "arr.map(item => expr)",
    inputs: [
      { id: "arr", label: "array", type: T.array },
      { id: "expr", label: "item→", type: T.any },
    ],
    outputs: [{ id: "out", label: "array", type: T.array }],
    controls: [{ id: "iter", kind: "text", default: "item", placeholder: "item name" }],
    iter: true,
    expr: (n, get, ctx) => {
      const itName = safeIdent(n.data.iter as string);
      const inner = ctx.exprWithIterator(n.id, "expr", itName, itName);
      return `(${get("arr", "[]")}).map((${itName}) => ${inner})`;
    },
  },
  "arr-filter": {
    cat: "Arrays",
    label: "Filter",
    icon: "array",
    iconClass: "data",
    desc: "arr.filter(item => bool)",
    inputs: [
      { id: "arr", label: "array", type: T.array },
      { id: "expr", label: "keep?", type: T.bool },
    ],
    outputs: [{ id: "out", label: "array", type: T.array }],
    controls: [{ id: "iter", kind: "text", default: "item" }],
    iter: true,
    expr: (n, get, ctx) => {
      const it = safeIdent(n.data.iter as string);
      const inner = ctx.exprWithIterator(n.id, "expr", it, it);
      return `(${get("arr", "[]")}).filter((${it}) => ${inner})`;
    },
  },
  "arr-reduce": {
    cat: "Arrays",
    label: "Sum",
    icon: "array",
    iconClass: "data",
    desc: "arr.reduce((a,b)=>a+b)",
    inputs: [{ id: "arr", label: "array", type: T.array }],
    outputs: [{ id: "out", label: "number", type: T.number }],
    expr: (_, get) => `(${get("arr", "[]")}).reduce((a,b)=>a+Number(b),0)`,
  },
  "arr-len": {
    cat: "Arrays",
    label: "Length",
    icon: "array",
    iconClass: "data",
    desc: "arr.length",
    inputs: [{ id: "arr", label: "array", type: T.array }],
    outputs: [{ id: "out", label: "count", type: T.number }],
    expr: (_, get) => `(${get("arr", "[]")}).length`,
  },
  "arr-index": {
    cat: "Arrays",
    label: "At index",
    icon: "array",
    iconClass: "data",
    desc: "arr[i]",
    inputs: [
      { id: "arr", label: "array", type: T.array },
      { id: "i", label: "index", type: T.number },
    ],
    outputs: [{ id: "out", label: "item", type: T.any }],
    expr: (_, get) => `(${get("arr", "[]")})[${get("i", "0")}]`,
  },
  "obj-get": {
    cat: "Arrays",
    label: "Get property",
    icon: "object",
    iconClass: "data",
    desc: "obj[key]",
    inputs: [{ id: "obj", label: "object", type: T.object }],
    outputs: [{ id: "out", label: "value", type: T.any }],
    controls: [{ id: "key", kind: "text", default: "name" }],
    expr: (n, get) => `(${get("obj", "{}")})[${JSON.stringify(n.data.key || "")}]`,
  },

  // ── FLOW ──
  ternary: {
    cat: "Flow",
    label: "If / else",
    icon: "branch",
    iconClass: "logic",
    desc: "cond ? a : b",
    inputs: [
      { id: "cond", label: "if", type: T.bool },
      { id: "a", label: "then", type: T.any },
      { id: "b", label: "else", type: T.any },
    ],
    outputs: [{ id: "out", label: "value", type: T.any }],
    expr: (_, get) => `((${get("cond", "false")}) ? (${get("a", "undefined")}) : (${get("b", "undefined")}))`,
  },

  // ── I/O ──
  fetch: {
    cat: "I/O",
    label: "Fetch JSON",
    icon: "globe",
    iconClass: "io",
    desc: "await fetch(url).json()",
    inputs: [{ id: "url", label: "url", type: T.string }],
    outputs: [{ id: "out", label: "data", type: T.any }],
    controls: [{ id: "method", kind: "select", options: ["GET", "POST"], default: "GET" }],
    async: true,
    expr: (n, get) => `(await (await fetch(${get("url", '""')}, { method: ${JSON.stringify(n.data.method || "GET")} })).json())`,
  },
  "id-sel": {
    cat: "I/O",
    label: "ID Selector",
    icon: "dom",
    iconClass: "io",
    desc: "#id CSS selector",
    inputs: [],
    outputs: [{ id: "out", label: "selector", type: T.string }],
    controls: [{ id: "id", kind: "text", default: "", placeholder: "element-id" }],
    expr: (n) => JSON.stringify("#" + String(n.data.id || "")),
  },
  "dom-set": {
    cat: "I/O",
    label: "Set DOM text",
    icon: "dom",
    iconClass: "io",
    desc: "set element text",
    inputs: [
      { id: "sel", label: "selector", type: T.any },
      { id: "text", label: "text", type: T.string },
    ],
    outputs: [{ id: "out", label: "ok", type: T.bool }],
    side: true,
    expr: (_, get) => `((function(){ const s = ${get("sel", '""')}; const el = (s instanceof HTMLElement) ? s : document.querySelector(s); if (el) el.textContent = String(${get("text", '""')}); return !!el; })())`,
  },
  "dom-get": {
    cat: "I/O",
    label: "Get DOM text",
    icon: "dom",
    iconClass: "io",
    desc: "get element text",
    inputs: [{ id: "sel", label: "selector", type: T.any }],
    outputs: [{ id: "out", label: "text", type: T.string }],
    expr: (_, get) => `((function(s){ const el = (s instanceof HTMLElement) ? s : document.querySelector(s); return el ? el.textContent || "" : ""; })(${get("sel", '""')}))`,
  },
  "dom-style": {
    cat: "I/O",
    label: "Set Style",
    icon: "dom",
    iconClass: "io",
    desc: "el.style[prop] = value",
    inputs: [
      { id: "sel", label: "selector", type: T.any },
      { id: "value", label: "value", type: T.string },
    ],
    outputs: [{ id: "out", label: "ok", type: T.bool }],
    controls: [{ id: "prop", kind: "select", options: [
      "color", "backgroundColor", "opacity", "display", "visibility",
      "width", "height", "maxWidth", "maxHeight", "minWidth", "minHeight",
      "margin", "marginTop", "marginRight", "marginBottom", "marginLeft",
      "padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
      "border", "borderRadius", "borderColor",
      "fontSize", "fontWeight", "fontStyle", "textAlign", "textDecoration", "lineHeight", "letterSpacing",
      "position", "top", "right", "bottom", "left", "zIndex",
      "transform", "transition", "boxShadow", "overflow", "cursor", "pointerEvents",
      "flex", "gap", "gridTemplateColumns",
    ], default: "color" }],
    side: true,
    expr: (n, get) => `((function(){ const s = ${get("sel", '""')}; const el = (s instanceof HTMLElement) ? s : document.querySelector(s); if (el) el.style[${JSON.stringify(n.data.prop || "color")}] = String(${get("value", '""')}); return !!el; })())`,
  },
  "dom-children": {
    cat: "I/O",
    label: "Get Children",
    icon: "dom",
    iconClass: "io",
    desc: "child elements as array",
    inputs: [{ id: "sel", label: "selector", type: T.any }],
    outputs: [{ id: "out", label: "children", type: T.array }],
    expr: (_, get) => `((function(s){ const el = (s instanceof HTMLElement) ? s : document.querySelector(s); return el ? Array.from(el.children) : []; })(${get("sel", '""')}))`,
  },
  "dom-parent": {
    cat: "I/O",
    label: "Get Parent",
    icon: "dom",
    iconClass: "io",
    desc: "parent element",
    inputs: [{ id: "sel", label: "selector", type: T.any }],
    outputs: [{ id: "out", label: "parent", type: T.object }],
    expr: (_, get) => `((function(s){ const el = (s instanceof HTMLElement) ? s : document.querySelector(s); return el ? el.parentElement : null; })(${get("sel", '""')}))`,
  },
  "mouse-pos": {
    cat: "I/O",
    label: "Mouse Position",
    icon: "dom",
    iconClass: "io",
    desc: "{ x, y } cursor coords",
    inputs: [],
    outputs: [{ id: "out", label: "pos", type: T.object }],
    expr: () => `((function(){ const e = window.__lastMouseEvent; return e ? { x: e.clientX, y: e.clientY } : { x: 0, y: 0 }; })())`,
  },
  "trigger-el": {
    cat: "I/O",
    label: "Triggered Element",
    icon: "dom",
    iconClass: "io",
    desc: "DOM element that fired the event",
    inputs: [],
    outputs: [{ id: "out", label: "element", type: T.object }],
    expr: () => `__triggerEl`,
  },
  log: {
    cat: "I/O",
    label: "Log",
    icon: "log",
    iconClass: "io",
    desc: "console.log",
    inputs: [
      { id: "label", label: "label", type: T.string },
      { id: "value", label: "value", type: T.any },
    ],
    outputs: [{ id: "out", label: "value", type: T.any }],
    side: true,
    expr: (_, get) => `((function(){ const v = ${get("value", "undefined")}; __log(${get("label", '""')}, v); return v; })())`,
  },

  // ── CUSTOM CALL ──
  "call-fn": {
    cat: "Functions",
    label: "Call function",
    icon: "call",
    iconClass: "logic",
    desc: "call saved function",
    inputs: [
      { id: "a", label: "arg 1", type: T.any },
      { id: "b", label: "arg 2", type: T.any },
      { id: "c", label: "arg 3", type: T.any },
    ],
    outputs: [{ id: "out", label: "result", type: T.any }],
    controls: [{ id: "fn", kind: "fn-select", default: "" }],
    expr: (n, get, ctx) => {
      const name = ctx.fnExists(n.data.fn as string) ? safeIdent(n.data.fn as string) : "undefined";
      const args = (["a", "b", "c"] as const)
        .map((k) => (ctx.isConnected(n.id, k) ? get(k, "undefined") : null))
        .filter(Boolean);
      return `${name}(${args.join(", ")})`;
    },
  },

  // ── OUTPUT ──
  return: {
    cat: "Output",
    label: "Return",
    icon: "ret",
    iconClass: "output",
    desc: "function output",
    inputs: [{ id: "value", label: "value", type: T.any }],
    outputs: [],
    isReturn: true,
  },
};

export function makeNode(typeId: string, x: number, y: number, overrides: Partial<FlowNode> & { data?: Record<string, string | number | boolean> } = {}): FlowNode {
  const def = NODE_LIB[typeId];
  if (!def) throw new Error("unknown node " + typeId);
  const data: Record<string, string | number | boolean> = {};
  (def.controls || []).forEach((c) => {
    data[c.id] = c.default;
  });
  return {
    id: "n_" + Math.random().toString(36).slice(2, 9),
    type: typeId,
    x,
    y,
    data: { ...data, ...(overrides.data || {}) },
  };
}

export function nodeCategories(): Record<string, (NodeDef & { id: string })[]> {
  const groups: Record<string, (NodeDef & { id: string })[]> = {};
  Object.entries(NODE_LIB).forEach(([id, def]) => {
    if (!groups[def.cat]) groups[def.cat] = [];
    groups[def.cat].push({ id, ...def });
  });
  return groups;
}
