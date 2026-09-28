// The .pptx parse worker (slides.md §10.1 step 2). Loaded by ./parse.ts with
// `new Worker(new URL("./pptx.worker.ts", import.meta.url), { type: "module" })`. It posts "ready" once its module
// graph (pptxtojson included) has loaded, so the main thread can tell a worker that never started from a slow parse.
// Each "parse" request runs the shared pipeline and posts the result with every image's bytes transferred.
import { runParsePipeline } from "./pipeline";
import type { PptxWorkerMessage, PptxWorkerRequest } from "./worker-protocol";

interface WorkerScope {
  postMessage(message: PptxWorkerMessage, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<PptxWorkerRequest>) => void) | null;
}

const scope = globalThis as unknown as WorkerScope;

scope.onmessage = (event) => {
  const request = event.data;
  if (!request || request.type !== "parse" || !(request.buf instanceof ArrayBuffer)) return;
  runParsePipeline(request.buf)
    .then((result) => {
      if (result.type === "parsed") scope.postMessage(result, result.assets.map((asset) => asset.bytes));
      else scope.postMessage(result);
    })
    .catch((err: unknown) => {
      scope.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
    });
};

scope.postMessage({ type: "ready" });
