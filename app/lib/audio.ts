import {
  MAX_AUDIO_FILE_BYTES,
  MAX_AUDIO_SECONDS,
  MAX_VIDEO_FILE_BYTES,
} from "./whisper";

export type MediaKind = "audio" | "video";

export interface DecodedAudio {
  samples: Float32Array;
  duration: number;
}

export class AudioValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioValidationError";
  }
}

export function getMediaKind(
  file: Pick<File, "name" | "type">,
): MediaKind {
  if (file.type.toLowerCase().startsWith("video/")) return "video";
  if (file.type.toLowerCase().startsWith("audio/")) return "audio";
  return /\.(?:mp4|m4v|mov|webm)$/i.test(file.name) ? "video" : "audio";
}

export function getMediaFileLimit(kind: MediaKind): number {
  return kind === "video" ? MAX_VIDEO_FILE_BYTES : MAX_AUDIO_FILE_BYTES;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function mixChannels(audioBuffer: AudioBuffer): Float32Array {
  const channels = audioBuffer.numberOfChannels;
  const mono = new Float32Array(audioBuffer.length);

  for (let channel = 0; channel < channels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      mono[index] += data[index] / channels;
    }
  }

  return mono;
}

export function resampleLinear(
  input: Float32Array,
  inputRate: number,
  outputRate = 16_000,
): Float32Array {
  if (inputRate === outputRate) return input;

  const outputLength = Math.max(1, Math.round((input.length * outputRate) / inputRate));
  const output = new Float32Array(outputLength);
  const ratio = inputRate / outputRate;

  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const fraction = position - left;
    output[index] = input[left] * (1 - fraction) + input[right] * fraction;
  }

  return output;
}

async function readMediaDuration(
  file: File,
  kind: MediaKind,
): Promise<number> {
  const url = URL.createObjectURL(file);
  const media = document.createElement(kind === "video" ? "video" : "audio");
  media.preload = "metadata";

  try {
    return await new Promise<number>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(
          new AudioValidationError(
            kind === "video"
              ? "動画の長さを確認できませんでした。"
              : "音声の長さを確認できませんでした。",
          ),
        );
      }, 15_000);
      const cleanup = () => {
        window.clearTimeout(timeout);
        media.onloadedmetadata = null;
        media.onerror = null;
        media.removeAttribute("src");
        media.load();
      };

      media.onloadedmetadata = () => {
        const duration = media.duration;
        cleanup();
        if (!Number.isFinite(duration) || duration <= 0) {
          reject(
            new AudioValidationError(
              kind === "video"
                ? "この動画の長さを確認できません。"
                : "この音声の長さを確認できません。",
            ),
          );
          return;
        }
        resolve(duration);
      };
      media.onerror = () => {
        cleanup();
        reject(
          new AudioValidationError(
            kind === "video"
              ? "この動画を読み込めません。MP4、WebM、MOVで試してください。"
              : "この音声を読み込めません。WAV、MP3、M4A、WebMで試してください。",
          ),
        );
      };
      media.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function decodeAudioFile(
  file: File,
  knownDuration?: number,
): Promise<DecodedAudio> {
  const kind = getMediaKind(file);
  if (file.size === 0) {
    throw new AudioValidationError("空のファイルは読み込めません。");
  }
  if (file.size > getMediaFileLimit(kind)) {
    throw new AudioValidationError(
      kind === "video"
        ? "100 MB以下の動画ファイルを選んでください。"
        : "25 MB以下の音声ファイルを選んでください。",
    );
  }

  const hasKnownDuration =
    typeof knownDuration === "number" &&
    Number.isFinite(knownDuration) &&
    knownDuration > 0;
  const metadataDuration = hasKnownDuration
    ? knownDuration
    : await readMediaDuration(file, kind);
  if (metadataDuration > MAX_AUDIO_SECONDS + 0.05) {
    throw new AudioValidationError(
      `90秒を超える素材は処理できません（現在 ${formatDuration(metadataDuration)}）。`,
    );
  }

  const AudioContextClass =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextClass) {
    throw new AudioValidationError(
      "このブラウザでは音声を処理できません。最新版のChromeまたはEdgeを試してください。",
    );
  }

  let context: AudioContext;
  try {
    context = new AudioContextClass({ sampleRate: 16_000 });
  } catch {
    try {
      context = new AudioContextClass();
    } catch {
      throw new AudioValidationError(
        "このブラウザでは音声処理を開始できません。タブを閉じて再度試してください。",
      );
    }
  }
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    if (buffer.duration > MAX_AUDIO_SECONDS + 0.05) {
      throw new AudioValidationError(
        `90秒を超える素材は処理できません（現在 ${formatDuration(buffer.duration)}）。`,
      );
    }

    const mono = mixChannels(buffer);
    return {
      samples: resampleLinear(mono, buffer.sampleRate),
      duration: buffer.duration,
    };
  } catch (error) {
    if (error instanceof AudioValidationError) throw error;
    throw new AudioValidationError(
      kind === "video"
        ? "音声トラックがないか、コーデック非対応の動画です。MP4またはWebMで試してください。"
        : "この音声を読み込めません。WAV、MP3、M4A、WebMで試してください。",
    );
  } finally {
    await context.close().catch(() => undefined);
  }
}
