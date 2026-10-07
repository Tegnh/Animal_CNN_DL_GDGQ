// onnxruntime-web, loaded on demand. Only the /test and /selftest pages import
// this file, and the runtime itself arrives through a dynamic import.
//
// Written for iOS Safari: no threads, no worker proxy, no for-await, no AbortSignal.timeout,
// and every failure ends in a ModelLoadError the UI can explain.
import type { InferenceSession } from 'onnxruntime-web';
import { INPUT_SIZE } from './preprocess';
import type { ClientModel } from './types';

type Ort = typeof import('onnxruntime-web');

export const LOAD_TIMEOUT_MS = 30_000;

export type LoadErrorKind = 'timeout' | 'network' | 'unsupported' | 'runtime';

export class ModelLoadError extends Error {
  readonly kind: LoadErrorKind;
  constructor(kind: LoadErrorKind, detail: string) {
    super(detail);
    this.name = 'ModelLoadError';
    this.kind = kind;
  }
}

export type LoadPhase = 'connecting' | 'downloading' | 'preparing';

export interface LoadProgress {
  phase: LoadPhase;
  fraction: number;
}

// Smallest wasm module that uses a SIMD instruction (i8x16.splat, then i8x16.popcnt).
// onnxruntime-web 1.30 only ships SIMD builds, so a browser without it cannot run the models.
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
]);

function assertWasmSupport() {
  if (typeof WebAssembly === 'undefined') {
    throw new ModelLoadError('unsupported', 'WebAssembly is not available');
  }
  let simd = false;
  try {
    simd = WebAssembly.validate(SIMD_PROBE);
  } catch {
    simd = false;
  }
  if (!simd) throw new ModelLoadError('unsupported', 'WebAssembly SIMD is not supported');
}

let runtime: Promise<Ort> | null = null;

function loadRuntime(): Promise<Ort> {
  if (!runtime) {
    runtime = (async () => {
      assertWasmSupport();
      let ort: Ort;
      try {
        ort = (await import('onnxruntime-web/wasm')) as Ort;
      } catch (cause) {
        throw new ModelLoadError('runtime', `runtime import failed: ${describe(cause)}`);
      }
      ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${process.env.NEXT_PUBLIC_ORT_VERSION}/dist/`;
      ort.env.wasm.numThreads = 1; // no SharedArrayBuffer without cross-origin isolation
      ort.env.wasm.proxy = false; // no worker; it is one more thing that can fail on iOS
      return ort;
    })();
    // A failed runtime load must not be remembered, so "retry" can work.
    runtime.catch(() => {
      runtime = null;
    });
  }
  return runtime;
}

function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message || cause.name;
  return String(cause);
}

/**
 * Downloads a file with real progress. `timeoutMs` is a stall limit: it restarts whenever a
 * chunk arrives, so a slow but moving connection is never cut off, and a dead one never
 * stays at 0%.
 */
async function download(
  url: string,
  expectedBytes: number,
  onProgress: (progress: LoadProgress) => void,
  timeoutMs = LOAD_TIMEOUT_MS,
): Promise<Uint8Array> {
  const controller = new AbortController();
  let timedOut = false;
  let timer = 0;
  const arm = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  };

  onProgress({ phase: 'connecting', fraction: 0 });
  arm();
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new ModelLoadError('network', `HTTP ${response.status}`);
    const total = Number(response.headers.get('Content-Length')) || expectedBytes;

    if (!response.body || typeof response.body.getReader !== 'function') {
      const whole = new Uint8Array(await response.arrayBuffer());
      onProgress({ phase: 'downloading', fraction: 1 });
      return whole;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      arm();
      chunks.push(value);
      received += value.length;
      // Never show 100% before the last byte is in, even if the size estimate is low.
      onProgress({ phase: 'downloading', fraction: Math.min(0.99, total > 0 ? received / total : 0) });
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    onProgress({ phase: 'downloading', fraction: 1 });
    return bytes;
  } catch (cause) {
    if (timedOut) {
      throw new ModelLoadError('timeout', `no data for ${timeoutMs / 1000} s: ${url.split('?')[0]}`);
    }
    if (cause instanceof ModelLoadError) throw cause;
    throw new ModelLoadError('network', describe(cause));
  } finally {
    clearTimeout(timer);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new ModelLoadError('timeout', `${what} took over ${ms / 1000} s`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause) => {
        clearTimeout(timer);
        reject(cause);
      },
    );
  });
}

// One session per model for the lifetime of the tab. Several callers (strict-mode
// remounts, retry, the first classification) share one load and all hear its progress.
interface Entry {
  session: Promise<InferenceSession>;
  listeners: Set<(progress: LoadProgress) => void>;
  last: LoadProgress;
}
const entries = new Map<string, Entry>();

export function loadModel(
  model: ClientModel,
  onProgress?: (progress: LoadProgress) => void,
): Promise<InferenceSession> {
  let entry = entries.get(model.key);
  if (!entry) {
    const created: Entry = {
      listeners: new Set(),
      last: { phase: 'connecting', fraction: 0 },
      session: undefined as unknown as Promise<InferenceSession>,
    };
    const report = (progress: LoadProgress) => {
      created.last = progress;
      created.listeners.forEach((listener) => listener(progress));
    };
    created.session = (async () => {
      const ort = await loadRuntime();
      const bytes = await download(model.url, model.sizeMb * 1e6, report);
      report({ phase: 'preparing', fraction: 1 });
      try {
        return await withTimeout(
          ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] }),
          LOAD_TIMEOUT_MS,
          'preparing the model',
        );
      } catch (cause) {
        if (cause instanceof ModelLoadError) throw cause;
        throw new ModelLoadError('runtime', describe(cause));
      }
    })();
    // A failed load must not be remembered, so "retry" can work.
    created.session.catch(() => entries.delete(model.key));
    entries.set(model.key, created);
    entry = created;
  }
  if (onProgress) {
    entry.listeners.add(onProgress);
    onProgress(entry.last);
    const done = () => entry.listeners.delete(onProgress);
    entry.session.then(done, done);
  }
  return entry.session;
}

export interface ModelOutput {
  probs: Float32Array;
  /** Sum of the raw model output, before any correction. */
  rawSum: number;
  softmaxApplied: boolean;
  ms: number;
}

export async function runModel(model: ClientModel, data: Float32Array): Promise<ModelOutput> {
  const [ort, session] = await Promise.all([loadRuntime(), loadModel(model)]);
  const input = new ort.Tensor('float32', data, [1, INPUT_SIZE, INPUT_SIZE, 3]);
  const start = performance.now();
  let result: Awaited<ReturnType<InferenceSession['run']>>;
  try {
    result = await session.run({ [model.inputName]: input });
  } catch (cause) {
    throw new ModelLoadError('runtime', describe(cause));
  }
  const ms = performance.now() - start;

  let probs = Float32Array.from(result[model.outputName].data as Float32Array);
  const rawSum = probs.reduce((a, b) => a + b, 0);
  // The exported models end in softmax. If a replacement model returns logits, finish the job.
  const softmaxApplied = Math.abs(rawSum - 1) > 0.01;
  if (softmaxApplied) {
    const max = Math.max(...probs);
    const exp = probs.map((v) => Math.exp(v - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    probs = exp.map((v) => v / sum);
  }
  return { probs, rawSum, softmaxApplied, ms };
}

export function topK(probs: ArrayLike<number>, k: number): { index: number; prob: number }[] {
  return Array.from(probs, (prob, index) => ({ index, prob }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, k);
}
