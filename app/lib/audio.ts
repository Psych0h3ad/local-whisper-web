import { MAX_AUDIO_SECONDS, MAX_FILE_BYTES } from "./whisper";

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

async function readAudioDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  const audio = document.createElement("audio");
  audio.preload = "metadata";

  try {
    return await new Promise<number>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new AudioValidationError("音声の長さを確認できませんでした。"));
      }, 15_000);
      const cleanup = () => {
        window.clearTimeout(timeout);
        audio.onloadedmetadata = null;
        audio.onerror = null;
        audio.removeAttribute("src");
        audio.load();
      };

      audio.onloadedmetadata = () => {
        const duration = audio.duration;
        cleanup();
        if (!Number.isFinite(duration) || duration <= 0) {
          reject(new AudioValidationError("この音声の長さを確認できません。"));
          return;
        }
        resolve(duration);
      };
      audio.onerror = () => {
        cleanup();
        reject(
          new AudioValidationError(
            "この音声を読み込めません。WAVまたはMP3で試してください。",
          ),
        );
      };
      audio.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function decodeAudioFile(file: File): Promise<DecodedAudio> {
  if (file.size === 0) {
    throw new AudioValidationError("空のファイルは読み込めません。");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new AudioValidationError("25 MB以下の音声ファイルを選んでください。");
  }

  const metadataDuration = await readAudioDuration(file);
  if (metadataDuration > MAX_AUDIO_SECONDS + 0.05) {
    throw new AudioValidationError(
      `90秒を超える音声は処理できません（現在 ${formatDuration(metadataDuration)}）。`,
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

  const context = new AudioContextClass({ sampleRate: 16_000 });
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    if (buffer.duration > MAX_AUDIO_SECONDS + 0.05) {
      throw new AudioValidationError(
        `90秒を超える音声は処理できません（現在 ${formatDuration(buffer.duration)}）。`,
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
      "この音声を読み込めません。WAVまたはMP3で試してください。",
    );
  } finally {
    await context.close().catch(() => undefined);
  }
}
