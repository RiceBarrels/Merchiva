// ─── Merchiva AI Forecast Client ─────────────────────────────────────────────
// Talks to /api/ai/* which proxies to the Python ML microservice.

export interface ItemPrediction {
  date: string;
  item: string;
  predicted_sales: number;
}

export interface PredictResponse {
  predictions: ItemPrediction[];
  model_version: string;
}

export interface TrainRequest {
  org_id: string;
  records: { date: string; item: string; quantity: number }[];
  location?: { lat: number; lon: number; timezone: string; country: string };
  min_days?: number;
}

export interface TrainResponse {
  status: string;
  items_count: number;
  days_count: number;
  metrics: {
    mae: number;
    r2: number;
    train_rows: number;
    test_rows: number;
    best_iteration: number;
  };
  model_version: string;
}

export async function predictItems(
  orgId: string,
  dates: string[],
  topN?: number,
): Promise<PredictResponse> {
  const resp = await fetch("/api/ai/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ org_id: orgId, dates, top_n: topN }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Prediction failed" }));
    throw new Error(err.error ?? `HTTP ${resp.status}`);
  }
  return resp.json();
}

export async function trainModel(req: TrainRequest): Promise<TrainResponse> {
  const resp = await fetch("/api/ai/train", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Training failed" }));
    throw new Error(err.error ?? `HTTP ${resp.status}`);
  }
  return resp.json();
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getNextNDates(n: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(toISO(d));
  }
  return dates;
}
