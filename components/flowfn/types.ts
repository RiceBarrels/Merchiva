export type PortType = "number" | "string" | "bool" | "any" | "array" | "object" | "flow";

export interface PortDef {
  id: string;
  label: string;
  type: PortType;
}

export type ControlKind = "text" | "number" | "bool" | "select" | "textarea" | "fn-select";

export interface ControlDef {
  id: string;
  kind: ControlKind;
  placeholder?: string;
  options?: string[];
  default: string | number | boolean;
}

export interface CodegenContext {
  fnExists: (name: string) => boolean;
  isConnected: (nodeId: string, port: string) => boolean;
  exprWithIterator: (nodeId: string, portId: string, iterName: string, fallbackExpr: string) => string;
}

export interface NodeDef {
  cat: string;
  label: string;
  icon: string;
  iconClass?: string;
  desc: string;
  inputs: PortDef[];
  outputs: PortDef[];
  controls?: ControlDef[];
  expr?: (node: FlowNode, get: (port: string, fallback?: string) => string, ctx: CodegenContext) => string;
  iter?: boolean;
  async?: boolean;
  side?: boolean;
  isReturn?: boolean;
}

export interface FlowNode {
  id: string;
  type: string;
  x: number;
  y: number;
  data: Record<string, string | number | boolean>;
  _isPreview?: boolean;
}

export interface FlowEdge {
  from: { node: string; port: string };
  to: { node: string; port: string };
}

export interface TestCase {
  args: string[];
  expect: string;
}

export interface FlowFunction {
  id: string;
  name: string;
  desc: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  tests: TestCase[];
}

export interface LogEntry {
  ts: string;
  level: "info" | "ok" | "err" | "warn";
  msg: string;
}

export interface NodeResult {
  value?: unknown;
  err?: string;
}

export interface ViewState {
  x: number;
  y: number;
  k: number;
}

export interface AddMenuState {
  x: number;
  y: number;
  world: { x: number; y: number };
  query: string;
  activeIdx: number;
}

export interface DragState {
  kind: "pan" | "node" | "wire" | "select";
  sx?: number;
  sy?: number;
  ox?: number;
  oy?: number;
  startWorld?: { x: number; y: number };
  initial?: Record<string, { x: number; y: number }>;
  from?: { node: FlowNode; side: "in" | "out"; portId: string };
  start?: { x: number; y: number };
  cur?: { x: number; y: number };
}

export interface ConnectorState {
  from: { node: FlowNode; side: "in" | "out"; portId: string };
  x: number;
  y: number;
}

export interface GeneratedCode {
  code: string;
  isAsync: boolean;
  fnName: string;
  paramList: { name: string; type: string }[];
}

export interface ExecutionResult {
  ok: boolean;
  result?: unknown;
  error?: string;
  logs: { label: string; value: unknown }[];
}
