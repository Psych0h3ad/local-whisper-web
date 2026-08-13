/// <reference types="vite/client" />

import { env, pipeline } from "@huggingface/transformers";
import ortFactoryUrl from "../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs?url";
import ortWasmUrl from "../../node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm?url";
import {
  MODEL_OPTIONS,
  type Backend,
  type LanguageKey,
  type ModelKey,
} from "../lib/whisper";

interface TranscribeMessage {
  type: "transcribe";
  requestId: number;
  audio: Float32Array;
  model: ModelKey;
  language: LanguageKey;
  backend: Backend;
}

interface ProgressData {
  status?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

interface ASROutput {
  text?: string;
}

type Transcriber = ((
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<ASROutput>) & {
  dispose?: () => Promise<void>;
};

const workerScope = self as unknown as {
  crossOriginIsolated: boolean;
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<TranscribeMessage>) => void) | null;
};
const onnxEnvironment = env.backends.onnx as typeof env.backends.onnx & {
  wasm?: {
    numThreads?: number;
    wasmPaths?: string | { mjs: string; wasm: string };
  };
};

env.allowLocalModels = false;
env.useBrowserCache = true;

if (onnxEnvironment.wasm) {
  onnxEnvironment.wasm.wasmPaths = {
    mjs: ortFactoryUrl,
    wasm: ortWasmUrl,
  };
}

let transcriber: Transcriber | null = null;
let loadedModel: ModelKey | null = null;
let loadedBackend: Backend | null = null;

function post(type: string, requestId: number, detail: Record<string, unknown> = {}) {
  workerScope.postMessage({ type, requestId, ...detail });
}

function progressCallback(requestId: number) {
  return (data: ProgressData) => {
    if (data.status === "progress") {
      post("model-progress", requestId, {
        loaded: data.loaded,
        total: data.total,
      });
    }
  };
}

async function disposePipeline() {
  if (transcriber?.dispose) await transcriber.dispose().catch(() => undefined);
  transcriber = null;
  loadedModel = null;
  loadedBackend = null;
}

async function createPipeline(
  model: ModelKey,
  backend: Backend,
  requestId: number,
): Promise<Transcriber> {
  const selected = MODEL_OPTIONS[model];
  if (onnxEnvironment.wasm) {
    // WebGPU sessions do not benefit from WASM thread-pool startup. CPU
    // workers can use SharedArrayBuffer when the hosting headers permit it.
    onnxEnvironment.wasm.numThreads =
      backend === "wasm" && workerScope.crossOriginIsolated
        ? Math.min(4, Math.max(1, navigator.hardwareConcurrency || 1))
        : 1;
  }
  const dtype =
    backend === "webgpu"
      ? ({ encoder_model: "fp32", decoder_model_merged: "q4" } as const)
      : ("q8" as const);

  const instance = await pipeline(
    "automatic-speech-recognition",
    selected.modelId,
    {
      revision: selected.revision,
      device: backend,
      dtype,
      progress_callback: progressCallback(requestId),
    },
  );

  return instance as unknown as Transcriber;
}

async function getPipeline(model: ModelKey, backend: Backend, requestId: number) {
  if (transcriber && loadedModel === model && loadedBackend === backend) {
    return { transcriber, backend };
  }

  await disposePipeline();
  post("backend", requestId, { backend });
  transcriber = await createPipeline(model, backend, requestId);
  loadedModel = model;
  loadedBackend = backend;
  return { transcriber, backend };
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("memory") || message.includes("allocation")) {
    return "メモリが足りません。ほかのタブを閉じるか、軽量モデルで試してください。";
  }
  if (
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("403") ||
    message.includes("failed to load") ||
    message.includes("unable to load")
  ) {
    return "文字起こしエンジンを取得できませんでした。インターネット接続や社内ネットワークの制限を確認してください。";
  }
  return "文字起こし中にエラーが起きました。軽量モデルか最新版のChrome / Edgeで試してください。";
}

function shouldSkipGpuFallback(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return [
    "fetch",
    "network",
    "403",
    "401",
    "failed to load",
    "unable to load",
    "memory",
    "allocation",
  ].some((fragment) => message.includes(fragment));
}

workerScope.onmessage = async (event: MessageEvent<TranscribeMessage>) => {
  if (event.data.type !== "transcribe") return;
  const { requestId, audio, model, language, backend } = event.data;

  try {
    const active = await getPipeline(model, backend, requestId);
    post("model-ready", requestId, { backend: active.backend });

    const startedAt = performance.now();
    const output = await active.transcriber(audio, {
      language,
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: false,
    });

    post("complete", requestId, {
      text: (output.text ?? "").trim(),
      backend: active.backend,
      modelId: MODEL_OPTIONS[model].modelId,
      elapsedMs: performance.now() - startedAt,
    });
  } catch (error) {
    if (backend === "webgpu" && !shouldSkipGpuFallback(error)) {
      post("backend-failed", requestId, { backend: "webgpu" });
    } else {
      post("error", requestId, { message: friendlyError(error) });
    }
  }
};

export {};
