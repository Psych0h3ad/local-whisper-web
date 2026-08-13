export const MAX_AUDIO_SECONDS = 90;
export const MAX_AUDIO_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_FILE_BYTES = 100 * 1024 * 1024;
export const MODEL_CACHE_NAME = "transformers-cache";

export type ModelKey = "base" | "tiny";
export type LanguageKey = "japanese" | "english" | "chinese";
export type Backend = "webgpu" | "wasm";

export interface ModelOption {
  key: ModelKey;
  label: string;
  helper: string;
  modelId: string;
  revision: string;
  cpuDownload: string;
  gpuDownload: string;
}

export const MODEL_OPTIONS: Record<ModelKey, ModelOption> = {
  base: {
    key: "base",
    label: "標準",
    helper: "日本語の精度を優先",
    modelId: "onnx-community/whisper-base",
    revision: "1846881b6b3a3024392c1eea3ad983695bc23925",
    cpuDownload: "約80 MB",
    gpuDownload: "約209 MB",
  },
  tiny: {
    key: "tiny",
    label: "軽量",
    helper: "低スペックPC・速度優先",
    modelId: "onnx-community/whisper-tiny",
    revision: "ff4177021cc41f7db950912b73ea4fdf7d01d8e7",
    cpuDownload: "約44 MB",
    gpuDownload: "約123 MB",
  },
};

export const LANGUAGE_OPTIONS: Array<{ value: LanguageKey; label: string }> = [
  { value: "japanese", label: "日本語" },
  { value: "english", label: "英語" },
  { value: "chinese", label: "中国語" },
];

export interface TranscriptExport {
  schemaVersion: "1.0";
  source: {
    fileName: string;
    durationSeconds: number;
  };
  transcription: {
    language: LanguageKey;
    text: string;
  };
  engine: {
    model: string;
    revision: string;
    backend: Backend;
  };
  createdAt: string;
}
