"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  AudioValidationError,
  decodeAudioFile,
  formatBytes,
  formatDuration,
  type DecodedAudio,
} from "./lib/audio";
import {
  LANGUAGE_OPTIONS,
  MODEL_CACHE_NAME,
  MODEL_OPTIONS,
  type Backend,
  type LanguageKey,
  type ModelKey,
  type TranscriptExport,
} from "./lib/whisper";

type Stage =
  | "idle"
  | "decoding"
  | "loading-model"
  | "transcribing"
  | "complete"
  | "error"
  | "cancelled";

interface SelectedAudio extends DecodedAudio {
  file: File;
  url: string;
}

interface ResultMeta {
  backend: Backend;
  language: LanguageKey;
  model: ModelKey;
  modelId: string;
  revision: string;
  elapsedMs: number;
  createdAt: string;
}

interface RequestConfig {
  language: LanguageKey;
  model: ModelKey;
}

interface WorkerEvent {
  type:
    | "backend"
    | "backend-failed"
    | "model-progress"
    | "model-ready"
    | "complete"
    | "error";
  requestId: number;
  backend?: Backend;
  loaded?: number;
  total?: number;
  text?: string;
  modelId?: string;
  elapsedMs?: number;
  message?: string;
}

const REPOSITORY_URL = "https://github.com/psych0h3ad/local-whisper-web";

function cleanFileStem(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  return (
    withoutExtension.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() ||
    "transcript"
  );
}

function triggerDownload(content: BlobPart, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function LocalWhisper() {
  const [selectedAudio, setSelectedAudio] = useState<SelectedAudio | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [model, setModel] = useState<ModelKey>("base");
  const [language, setLanguage] = useState<LanguageKey>("japanese");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [downloaded, setDownloaded] = useState({ loaded: 0, total: 0 });
  const [backend, setBackend] = useState<Backend | null>(null);
  const [fellBack, setFellBack] = useState(false);
  const [resultMeta, setResultMeta] = useState<ResultMeta | null>(null);
  const [copyLabel, setCopyLabel] = useState("コピー");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [gpuAvailable, setGpuAvailable] = useState<boolean | null>(null);
  const [cacheMessage, setCacheMessage] = useState("");
  const [isClearingCache, setIsClearingCache] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const decodeIdRef = useRef(0);
  const objectUrlRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingAudioRef = useRef<Float32Array | null>(null);
  const requestConfigRef = useRef<RequestConfig | null>(null);
  const requestedBackendRef = useRef<Backend>("wasm");
  const workerBackendRef = useRef<Backend | null>(null);
  const workerMessageRef = useRef<(event: MessageEvent<WorkerEvent>) => void>(
    () => undefined,
  );
  const workerCrashRef = useRef<(worker: Worker, requestId: number) => void>(
    () => undefined,
  );
  const spawnWorkerRef = useRef<
    (backend: Backend, requestId: number) => Worker | null
  >(() => null);

  const isBusy =
    stage === "decoding" ||
    stage === "loading-model" ||
    stage === "transcribing";
  const isLocked = isBusy || isClearingCache;

  useEffect(() => {
    let active = true;
    const detectGpu = async () => {
      const gpu = (
        navigator as Navigator & {
          gpu?: { requestAdapter: () => Promise<unknown | null> };
        }
      ).gpu;
      if (!gpu) {
        if (active) setGpuAvailable(false);
        return;
      }
      try {
        const adapter = await gpu.requestAdapter();
        if (active) setGpuAvailable(Boolean(adapter));
      } catch {
        if (active) setGpuAvailable(false);
      }
    };

    void detectGpu();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isBusy) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)),
      );
    }, 500);
    return () => window.clearInterval(timer);
  }, [isBusy]);

  useEffect(() => {
    if (stage !== "complete") return;
    const frame = window.requestAnimationFrame(() => textareaRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [stage]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const destroyWorker = useCallback((target?: Worker | null) => {
    const worker = target ?? workerRef.current;
    if (!worker) return;
    worker.terminate();
    if (workerRef.current === worker) {
      workerRef.current = null;
      workerBackendRef.current = null;
    }
  }, []);

  const postTranscription = useCallback(
    (
      worker: Worker,
      requestId: number,
      samples: Float32Array,
      requestedBackend: Backend,
      config: RequestConfig,
    ) => {
      const transferable = samples.slice();
      worker.postMessage(
        {
          type: "transcribe",
          requestId,
          audio: transferable,
          model: config.model,
          language: config.language,
          backend: requestedBackend,
        },
        [transferable.buffer],
      );
    },
    [],
  );

  const failWorker = useCallback(
    (worker: Worker, requestId: number, message?: string) => {
      if (
        workerRef.current !== worker ||
        requestIdRef.current !== requestId
      ) {
        return;
      }
      pendingAudioRef.current = null;
      requestConfigRef.current = null;
      destroyWorker(worker);
      setError(
        message ??
          "文字起こしエンジンを起動できませんでした。最新版のChromeまたはEdgeで試してください。",
      );
      setStage("error");
    },
    [destroyWorker],
  );

  const handleWorkerEvent = useCallback(
    (event: MessageEvent<WorkerEvent>) => {
      const message = event.data;
      if (message.requestId !== requestIdRef.current) return;

      switch (message.type) {
        case "backend":
          setBackend(message.backend ?? null);
          break;
        case "backend-failed": {
          const samples = pendingAudioRef.current;
          const config = requestConfigRef.current;
          const currentWorker = workerRef.current;
          if (!samples || !config || !currentWorker) return;

          requestedBackendRef.current = "wasm";
          setBackend("wasm");
          setFellBack(true);
          setGpuAvailable(false);
          setDownloaded({ loaded: 0, total: 0 });
          destroyWorker(currentWorker);

          const fallbackWorker = spawnWorkerRef.current(
            "wasm",
            requestIdRef.current,
          );
          if (fallbackWorker) {
            postTranscription(
              fallbackWorker,
              requestIdRef.current,
              samples,
              "wasm",
              config,
            );
          }
          break;
        }
        case "model-progress":
          setDownloaded({
            loaded: message.loaded ?? 0,
            total: message.total ?? 0,
          });
          break;
        case "model-ready":
          setBackend(message.backend ?? null);
          setStage("transcribing");
          break;
        case "complete": {
          const config = requestConfigRef.current;
          if (!config) return;
          setTranscript(message.text ?? "");
          setResultMeta({
            backend: message.backend ?? "wasm",
            language: config.language,
            model: config.model,
            modelId:
              message.modelId ?? MODEL_OPTIONS[config.model].modelId,
            revision: MODEL_OPTIONS[config.model].revision,
            elapsedMs: message.elapsedMs ?? 0,
            createdAt: new Date().toISOString(),
          });
          setStage("complete");
          pendingAudioRef.current = null;
          requestConfigRef.current = null;
          break;
        }
        case "error": {
          const currentWorker = workerRef.current;
          pendingAudioRef.current = null;
          requestConfigRef.current = null;
          if (currentWorker) destroyWorker(currentWorker);
          setError(message.message ?? "文字起こしに失敗しました。");
          setStage("error");
          break;
        }
      }
    },
    [destroyWorker, postTranscription],
  );

  useEffect(() => {
    workerMessageRef.current = handleWorkerEvent;
  }, [handleWorkerEvent]);

  const handleWorkerCrash = useCallback(
    (worker: Worker, requestId: number) => {
      if (
        workerRef.current !== worker ||
        requestIdRef.current !== requestId
      ) {
        return;
      }

      const samples = pendingAudioRef.current;
      const config = requestConfigRef.current;
      if (requestedBackendRef.current === "webgpu" && samples && config) {
        requestedBackendRef.current = "wasm";
        setBackend("wasm");
        setFellBack(true);
        setGpuAvailable(false);
        setDownloaded({ loaded: 0, total: 0 });
        destroyWorker(worker);

        const fallbackWorker = spawnWorkerRef.current("wasm", requestId);
        if (fallbackWorker) {
          postTranscription(
            fallbackWorker,
            requestId,
            samples,
            "wasm",
            config,
          );
        }
        return;
      }

      failWorker(worker, requestId);
    },
    [destroyWorker, failWorker, postTranscription],
  );

  useEffect(() => {
    workerCrashRef.current = handleWorkerCrash;
  }, [handleWorkerCrash]);

  const spawnWorker = useCallback(
    (workerBackend: Backend, requestId: number): Worker | null => {
      try {
        const worker = new Worker(
          new URL("./workers/whisper.worker.ts", import.meta.url),
          {
            type: "module",
            name:
              workerBackend === "webgpu"
                ? "local-whisper-engine-gpu"
                : "local-whisper-engine-cpu",
          },
        );
        worker.onmessage = (event) => {
          if (
            workerRef.current === worker &&
            requestIdRef.current === requestId
          ) {
            workerMessageRef.current(event);
          }
        };
        worker.onerror = () => workerCrashRef.current(worker, requestId);
        workerRef.current = worker;
        workerBackendRef.current = workerBackend;
        return worker;
      } catch {
        pendingAudioRef.current = null;
        requestConfigRef.current = null;
        setError(
          "文字起こしエンジンを起動できませんでした。最新版のChromeまたはEdgeで試してください。",
        );
        setStage("error");
        return null;
      }
    },
    [],
  );

  useEffect(() => {
    spawnWorkerRef.current = spawnWorker;
  }, [spawnWorker]);

  const getWorker = useCallback(
    (workerBackend: Backend, requestId: number) => {
      const existing = workerRef.current;
      if (existing) {
        existing.onmessage = (event) => {
          if (
            workerRef.current === existing &&
            requestIdRef.current === requestId
          ) {
            workerMessageRef.current(event);
          }
        };
        existing.onerror = () =>
          workerCrashRef.current(existing, requestId);
        return existing;
      }
      return spawnWorker(workerBackend, requestId);
    },
    [spawnWorker],
  );

  const resetOutput = useCallback(() => {
    setTranscript("");
    setResultMeta(null);
    setDownloaded({ loaded: 0, total: 0 });
    setBackend(null);
    setFellBack(false);
    setCopyLabel("コピー");
    setError("");
  }, []);

  const loadFile = useCallback(
    async (file?: File) => {
      if (!file || isLocked) return;
      const decodeId = ++decodeIdRef.current;
      setStage("decoding");
      resetOutput();

      try {
        const decoded = await decodeAudioFile(file);
        if (decodeId !== decodeIdRef.current) return;

        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        const url = URL.createObjectURL(file);
        objectUrlRef.current = url;
        setSelectedAudio({ file, url, ...decoded });
        setStage("idle");
      } catch (caught) {
        if (decodeId !== decodeIdRef.current) return;
        const message =
          caught instanceof AudioValidationError
            ? caught.message
            : "音声ファイルを読み込めませんでした。";
        setError(message);
        setStage("error");
      }
    },
    [isLocked, resetOutput],
  );

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    void loadFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void loadFile(event.dataTransfer.files?.[0]);
  };

  const removeFile = () => {
    if (isLocked) return;
    decodeIdRef.current += 1;
    pendingAudioRef.current = null;
    requestConfigRef.current = null;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setSelectedAudio(null);
    resetOutput();
    setStage("idle");
  };

  const startTranscription = () => {
    if (!selectedAudio || isLocked || gpuAvailable === null) return;
    const requestId = ++requestIdRef.current;
    const samples = selectedAudio.samples;
    const requestedBackend: Backend = gpuAvailable ? "webgpu" : "wasm";
    const requestConfig: RequestConfig = { language, model };
    if (
      workerRef.current &&
      workerBackendRef.current !== null &&
      workerBackendRef.current !== requestedBackend
    ) {
      destroyWorker();
    }
    pendingAudioRef.current = samples;
    requestConfigRef.current = requestConfig;
    requestedBackendRef.current = requestedBackend;
    workerBackendRef.current = requestedBackend;

    resetOutput();
    setStage("loading-model");
    setElapsedSeconds(0);
    startedAtRef.current = Date.now();

    const worker = getWorker(requestedBackend, requestId);
    if (worker) {
      postTranscription(
        worker,
        requestId,
        samples,
        requestedBackend,
        requestConfig,
      );
    }
  };

  const cancelTranscription = () => {
    requestIdRef.current += 1;
    destroyWorker();
    pendingAudioRef.current = null;
    requestConfigRef.current = null;
    setStage("cancelled");
    setBackend(null);
  };

  const copyTranscript = async () => {
    if (!transcript) return;
    try {
      await navigator.clipboard.writeText(transcript);
    } catch {
      textareaRef.current?.focus();
      textareaRef.current?.select();
      document.execCommand("copy");
    }
    setCopyLabel("コピー済み");
    window.setTimeout(() => setCopyLabel("コピー"), 1800);
  };

  const downloadTxt = () => {
    if (!selectedAudio || !transcript) return;
    triggerDownload(
      `\uFEFF${transcript}\n`,
      `${cleanFileStem(selectedAudio.file.name)}.txt`,
      "text/plain;charset=utf-8",
    );
  };

  const exportData = useMemo<TranscriptExport | null>(() => {
    if (!selectedAudio || !resultMeta) return null;
    return {
      schemaVersion: "1.0",
      source: {
        fileName: selectedAudio.file.name,
        durationSeconds: Number(selectedAudio.duration.toFixed(3)),
      },
      transcription: { language: resultMeta.language, text: transcript },
      engine: {
        model: resultMeta.modelId,
        revision: resultMeta.revision,
        backend: resultMeta.backend,
      },
      createdAt: resultMeta.createdAt,
    };
  }, [resultMeta, selectedAudio, transcript]);

  const downloadJson = () => {
    if (!selectedAudio || !exportData) return;
    triggerDownload(
      JSON.stringify(exportData, null, 2),
      `${cleanFileStem(selectedAudio.file.name)}.json`,
      "application/json;charset=utf-8",
    );
  };

  const clearModelCache = async () => {
    if (isLocked) return;
    setIsClearingCache(true);
    setCacheMessage("");
    requestIdRef.current += 1;
    pendingAudioRef.current = null;
    requestConfigRef.current = null;
    destroyWorker();
    try {
      if (!("caches" in window)) {
        setCacheMessage("このブラウザではキャッシュを操作できません。");
        return;
      }
      const deleted = await window.caches.delete(MODEL_CACHE_NAME);
      setCacheMessage(
        deleted
          ? "保存済みのモデルを削除しました。"
          : "保存済みのモデルはありません。",
      );
    } catch {
      setCacheMessage(
        "モデルを削除できませんでした。ブラウザや会社の保存ポリシーを確認してください。",
      );
    } finally {
      setIsClearingCache(false);
    }
  };

  const modelDownload =
    gpuAvailable === true
      ? MODEL_OPTIONS[model].gpuDownload
      : MODEL_OPTIONS[model].cpuDownload;

  const statusMessage =
    stage === "decoding"
      ? "音声ファイルを読み込んでいます。"
      : stage === "loading-model"
        ? "文字起こしエンジンを準備しています。"
        : stage === "transcribing"
          ? "端末内で文字起こししています。"
          : stage === "complete"
            ? "文字起こしが完了しました。結果欄に移動します。"
            : stage === "cancelled"
              ? "文字起こしを中止しました。"
              : "";

  const renderResultPanel = () => {
    if (stage === "complete") {
      return (
        <div className="result-view">
          <div className="result-heading">
            <div>
              <span className="section-kicker">OUTPUT / 03</span>
              <h2>文字起こし完了</h2>
            </div>
            <span className="done-badge">DONE</span>
          </div>

          <label className="sr-only" htmlFor="transcript-result">
            文字起こし結果
          </label>
          <textarea
            id="transcript-result"
            ref={textareaRef}
            className="result-textarea"
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />

          <div className="result-meta" aria-label="処理情報">
            <span>{MODEL_OPTIONS[resultMeta?.model ?? model].label}モデル</span>
            <span>{resultMeta?.backend === "webgpu" ? "GPU" : "CPU"}</span>
            <span>{((resultMeta?.elapsedMs ?? 0) / 1000).toFixed(1)}秒</span>
            <span>{transcript.length.toLocaleString("ja-JP")}文字</span>
          </div>

          <div className="result-actions">
            <button className="button button-primary" onClick={copyTranscript}>
              {copyLabel}
            </button>
            <button className="button button-secondary" onClick={downloadTxt}>
              TXT保存
            </button>
            <button className="button button-ghost" onClick={downloadJson}>
              JSON
            </button>
          </div>

          <p className="result-warning">
            AIの結果には誤りが含まれることがあります。重要な内容は音声と照合してください。
          </p>
        </div>
      );
    }

    if (isBusy && stage !== "decoding") {
      const preparing = stage === "loading-model";
      return (
        <div className="process-view">
          <div className="process-orbit" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <span className="section-kicker">PROCESS / 02</span>
          <h2>
            {preparing ? "エンジンを準備中" : "文字起こし中"}
            <span className="animated-dots" aria-hidden="true">
              …
            </span>
          </h2>
          <p>
            {preparing
              ? "初回だけモデルを取得します。音声は送信していません。"
              : "この端末内でWhisperが音声を読んでいます。"}
          </p>

          {preparing && (
            <div className="progress-wrap">
              <progress aria-label="文字起こしモデルを準備中" />
              <div className="progress-caption">
                <span>モデルを確認中</span>
                <span>
                  {downloaded.total > 0
                    ? `${formatBytes(downloaded.loaded)} / ${formatBytes(downloaded.total)}`
                    : modelDownload}
                </span>
              </div>
            </div>
          )}

          <div className="process-status">
            <span className="live-dot" />
            {backend === "webgpu" ? "GPUで処理" : backend === "wasm" ? "CPUで処理" : "最適な処理方法を確認中"}
            <span className="process-time" aria-hidden="true">
              {elapsedSeconds}秒
            </span>
          </div>
          {fellBack && (
            <p className="fallback-note">GPUを利用できなかったため、CPUへ切り替えました。</p>
          )}
          <button className="text-button danger" onClick={cancelTranscription}>
            中止する
          </button>
        </div>
      );
    }

    if (stage === "error") {
      return (
        <div className="message-view error-view" role="alert">
          <span className="message-mark">!</span>
          <span className="section-kicker">CHECK REQUIRED</span>
          <h2>うまく処理できませんでした</h2>
          <p>{error}</p>
          {selectedAudio && (
            <button className="button button-secondary" onClick={startTranscription}>
              もう一度試す
            </button>
          )}
        </div>
      );
    }

    if (stage === "cancelled") {
      return (
        <div className="message-view">
          <span className="message-mark neutral">×</span>
          <span className="section-kicker">STOPPED</span>
          <h2>文字起こしを中止しました</h2>
          <p>音声や途中の結果は保存していません。</p>
          <button className="button button-secondary" onClick={startTranscription}>
            最初からやり直す
          </button>
        </div>
      );
    }

    return (
      <div className="empty-view">
        <div className="wave-bars" aria-hidden="true">
          {[18, 34, 54, 78, 46, 68, 88, 56, 38, 66, 48, 26].map(
            (height, index) => (
              <span key={`${height}-${index}`} style={{ height }} />
            ),
          )}
        </div>
        <span className="section-kicker">READY / 02</span>
        <h2>{selectedAudio ? "準備できました" : "ここに結果が表示されます"}</h2>
        <p>
          {selectedAudio
            ? "言語とモデルを選び、文字起こしを開始してください。"
            : "左側から音声ファイルを選んでください。"}
        </p>
        <div className="empty-specs" aria-label="機能概要">
          <span>90 SEC MAX</span>
          <span>NO UPLOAD</span>
          <span>EDITABLE</span>
        </div>
      </div>
    );
  };

  return (
    <main className="site-shell">
      <p className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </p>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Local Whisper トップ">
          <span className="brand-wave" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>LOCAL WHISPER</span>
        </a>
        <nav aria-label="メインナビゲーション">
          <a href="#how-it-works">仕組み</a>
          <a href="#privacy">プライバシー</a>
          <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
            GitHub <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">
            <span /> PRIVATE BY DESIGN — BROWSER STT
          </p>
          <h1>
            声を、<em>外に出さず</em>
            <br />
            文字にする。
          </h1>
          <p className="hero-lead">
            1分前後の音声を、ブラウザ内のWhisperで文字起こし。
            <br />
            インストールもログインも、音声のアップロードも不要です。
          </p>
        </div>
        <div className="hero-stats" aria-label="特徴">
          <div>
            <strong>01</strong>
            <span>INSTALL</span>
            <b>不要</b>
          </div>
          <div>
            <strong>02</strong>
            <span>AUDIO UPLOAD</span>
            <b>なし</b>
          </div>
          <div>
            <strong>03</strong>
            <span>LICENSE</span>
            <b>MIT</b>
          </div>
        </div>
      </section>

      <div className="privacy-ribbon" role="note">
        <span className="shield-mark" aria-hidden="true">✓</span>
        <strong>音声と文字は、このブラウザの外へ出ません。</strong>
        <span>初回のみ文字起こしモデルをダウンロードします。</span>
      </div>

      <section className="workbench" aria-label="文字起こしツール">
        <div className="input-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">INPUT / 01</span>
              <h2>音声を選ぶ</h2>
            </div>
            <span className="format-hint">WAV · MP3 · M4A · WEBM</span>
          </div>

          {!selectedAudio ? (
            <label
              className={`drop-zone ${isDragging ? "is-dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
            >
              <input
                type="file"
                accept="audio/*,.wav,.mp3,.m4a,.aac,.webm,.ogg"
                onChange={onFileInput}
                disabled={isLocked}
              />
              <span className="add-mark" aria-hidden="true">＋</span>
              <strong>
                {stage === "decoding" ? "音声を読み込み中…" : "音声ファイルをドロップ"}
              </strong>
              <span>またはクリックして選ぶ</span>
              <small>90秒以内 · 25 MBまで</small>
            </label>
          ) : (
            <div className="selected-file">
              <div className="file-topline">
                <div className="file-icon" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="file-name">
                  <strong title={selectedAudio.file.name}>{selectedAudio.file.name}</strong>
                  <span>
                    {formatDuration(selectedAudio.duration)} · {formatBytes(selectedAudio.file.size)}
                  </span>
                </div>
                <button
                  className="remove-file"
                  onClick={removeFile}
                  disabled={isLocked}
                  aria-label="音声ファイルを外す"
                >
                  ×
                </button>
              </div>
              <audio controls preload="metadata" src={selectedAudio.url}>
                お使いのブラウザは音声再生に対応していません。
              </audio>
            </div>
          )}

          <div className="control-grid">
            <label className="field">
              <span>音声の言語</span>
              <select
                value={language}
                onChange={(event) => {
                  setLanguage(event.target.value as LanguageKey);
                  resetOutput();
                  if (stage !== "idle") setStage("idle");
                }}
                disabled={isLocked}
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="model-field" disabled={isLocked}>
              <legend>モデル</legend>
              <div className="model-options">
                {(Object.keys(MODEL_OPTIONS) as ModelKey[]).map((key) => (
                  <label key={key} className={model === key ? "selected" : ""}>
                    <input
                      type="radio"
                      name="model"
                      value={key}
                      checked={model === key}
                      onChange={() => {
                        setModel(key);
                        resetOutput();
                        if (stage !== "idle") setStage("idle");
                      }}
                    />
                    <span>
                      <strong>{MODEL_OPTIONS[key].label}</strong>
                      <small>{MODEL_OPTIONS[key].helper}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="engine-note">
            <span className={`capability-dot ${gpuAvailable ? "gpu" : "cpu"}`} />
            <span>
              {gpuAvailable === null
                ? "処理環境を確認中"
                : gpuAvailable
                  ? `GPU対応 · 初回 ${modelDownload}`
                  : `CPU互換モード · 初回 ${modelDownload}`}
            </span>
            <span className="engine-note-tail">2回目からキャッシュ</span>
          </div>

          <button
            className="start-button"
            onClick={startTranscription}
            disabled={!selectedAudio || isLocked || gpuAvailable === null}
          >
            <span>文字起こしを開始</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>

        <div className="output-panel">{renderResultPanel()}</div>
      </section>

      <section className="explainer" id="how-it-works">
        <div className="explainer-title">
          <span className="section-kicker">HOW IT WORKS</span>
          <h2>送らない。それが一番シンプル。</h2>
        </div>
        <ol>
          <li>
            <span>01</span>
            <strong>ブラウザで読み込む</strong>
            <p>選んだ音声は端末のメモリ上だけで開きます。</p>
          </li>
          <li>
            <span>02</span>
            <strong>端末内で推論</strong>
            <p>WebGPU、またはCPU版Whisperで文字にします。</p>
          </li>
          <li>
            <span>03</span>
            <strong>結果だけ手元へ</strong>
            <p>編集してコピー、TXT、JSONで保存できます。</p>
          </li>
        </ol>
      </section>

      <section className="privacy-section" id="privacy">
        <div>
          <span className="section-kicker">PRIVACY & LIMITS</span>
          <h2>ローカル処理を、正直に。</h2>
        </div>
        <div className="privacy-copy">
          <p>
            音声ファイルと文字起こし結果はサーバーへ送信せず、保存もしません。初回のみHugging
            FaceからWhisperモデルを取得し、モデルだけをブラウザにキャッシュします。
          </p>
          <p>
            社内ネットワークがモデル取得を制限する場合があります。また、録音対象者の同意や会社の情報管理ルールは利用前に確認してください。
          </p>
          <details>
            <summary>端末に保存したモデルを管理</summary>
            <p>削除すると、次回の文字起こし時にモデルを再ダウンロードします。</p>
            <button className="text-button danger" onClick={clearModelCache} disabled={isLocked}>
              {isClearingCache ? "削除中…" : "モデルキャッシュを削除"}
            </button>
            {cacheMessage && <span className="cache-message" role="status">{cacheMessage}</span>}
          </details>
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top">
          <span className="brand-wave" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>LOCAL WHISPER</span>
        </a>
        <p>Open source · MIT License · Powered by Whisper & Transformers.js</p>
        <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">SOURCE CODE ↗</a>
      </footer>
    </main>
  );
}
