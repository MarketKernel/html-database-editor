// EngineClient over the worker: started on the first request, each request numbered and answered by number.
// A worker that fails to start rejects every request "unavailable"; the next request starts a fresh one.

import type { EngineClient } from "./engineClient.js";
import { engineFailure } from "./engineFailure.js";
import type { EngineEnvelope } from "./engineMessages.js";
import type { EngineFailure } from "./engineMessages.js";
import type { EngineOp } from "./engineMessages.js";
import type { EngineReply } from "./engineMessages.js";
import type { EngineRequest } from "./engineMessages.js";
import type { EngineResults } from "./engineMessages.js";

interface PendingRequest {
  readonly resolve: (result: EngineResults[EngineOp]) => void;
  readonly reject: (failure: EngineFailure) => void;
}

export const buildWorkerEngineClient = (workerSource: string): EngineClient => new WorkerEngineClient(workerSource);

class WorkerEngineClient {
  private worker: Worker | null = null;
  private readonly pending = new Map<number, PendingRequest>();
  private lastId = 0;

  constructor(private readonly workerSource: string) {}

  send<Op extends EngineOp>(request: Extract<EngineRequest, { readonly op: Op }>): Promise<EngineResults[Op]> {
    const worker = this.obtainWorker();
    this.lastId += 1;
    const envelope: EngineEnvelope = { id: this.lastId, request };
    return new Promise<EngineResults[Op]>((resolve, reject) => {
      this.pending.set(envelope.id, { resolve: resolve as (result: EngineResults[EngineOp]) => void, reject });
      worker.postMessage(envelope);
    });
  }

  private obtainWorker(): Worker {
    if (this.worker !== null) return this.worker;
    const url = URL.createObjectURL(new Blob([this.workerSource], { type: "text/javascript" }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.addEventListener("message", (event: MessageEvent<EngineReply>) => this.settle(event.data));
    worker.addEventListener("error", (event) => this.fail(worker, event.message));
    this.worker = worker;
    return worker;
  }

  private settle(reply: EngineReply): void {
    const request = this.pending.get(reply.id);
    if (request === undefined) return;
    this.pending.delete(reply.id);
    if ("failure" in reply) request.reject(reply.failure);
    else request.resolve(reply.result);
  }

  private fail(worker: Worker, message: string): void {
    worker.terminate();
    if (this.worker === worker) this.worker = null;
    const failure = engineFailure("unavailable", `SQLite could not start: ${message}`);
    for (const request of this.pending.values()) request.reject(failure);
    this.pending.clear();
  }
}
