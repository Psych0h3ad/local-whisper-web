import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("pins the browser inference stack and model revisions", async () => {
  const [packageJson, models, worker] = await Promise.all([
    read("package.json").then(JSON.parse),
    read("app/lib/whisper.ts"),
    read("app/workers/whisper.worker.ts"),
  ]);

  assert.equal(packageJson.dependencies["@huggingface/transformers"], "3.8.1");
  assert.match(models, /onnx-community\/whisper-base/);
  assert.match(models, /1846881b6b3a3024392c1eea3ad983695bc23925/);
  assert.match(models, /onnx-community\/whisper-tiny/);
  assert.match(models, /ff4177021cc41f7db950912b73ea4fdf7d01d8e7/);
  assert.match(worker, /device: backend/);
  assert.match(worker, /chunk_length_s: 30/);
  assert.match(worker, /stride_length_s: 5/);
  assert.match(worker, /return_timestamps: false/);
  assert.doesNotMatch(models, /自動判定|\"auto\"/);
});

test("keeps media local and provides explicit cache removal", async () => {
  const [client, audio, recording, worker, models, packageJson] = await Promise.all([
    read("app/LocalWhisper.tsx"),
    read("app/lib/audio.ts"),
    read("app/lib/recording.ts"),
    read("app/workers/whisper.worker.ts"),
    read("app/lib/whisper.ts"),
    read("package.json").then(JSON.parse),
  ]);
  const productSource = `${client}\n${audio}\n${recording}\n${worker}`;

  assert.doesNotMatch(productSource, /FormData|XMLHttpRequest|sendBeacon/);
  assert.doesNotMatch(productSource, /localStorage|sessionStorage/);
  assert.doesNotMatch(JSON.stringify(packageJson), /ffmpeg/i);
  assert.match(client, /window\.caches\.delete\(MODEL_CACHE_NAME\)/);
  assert.match(client, /spellCheck=\{false\}/);
  assert.match(client, /requestConfigRef/);
  assert.match(client, /destroyWorker\(currentWorker\)/);
  assert.match(client, /decodeIdRef\.current \+= 1;[\s\S]*?workerRef\.current\?\.terminate\(\)/);
  assert.match(audio, /readMediaDuration\(file, kind\)/);
  assert.ok(
    audio.indexOf("readMediaDuration(file, kind)") <
      audio.indexOf("context.decodeAudioData"),
    "duration preflight must run before full media decoding",
  );
  assert.match(audio, /MAX_AUDIO_FILE_BYTES/);
  assert.match(audio, /MAX_VIDEO_FILE_BYTES/);
  assert.match(audio, /音声トラックがないか/);
  assert.match(worker, /shouldSkipGpuFallback/);
  assert.match(models, /MODEL_CACHE_NAME = "transformers-cache"/);
  assert.match(client, /アプリは音声・動画・録音と文字起こし結果をサーバーへ送信・永続保存しません/);
});

test("records microphone audio only and releases every acquired track", async () => {
  const [client, recording, server] = await Promise.all([
    read("app/LocalWhisper.tsx"),
    read("app/lib/recording.ts"),
    read("worker/index.ts"),
  ]);

  assert.match(client, /navigator\.mediaDevices\.getUserMedia\(\{/);
  assert.match(client, /audio:\s*\{[\s\S]*?video:\s*false/);
  assert.doesNotMatch(client, /getDisplayMedia|enumerateDevices/);
  assert.match(client, /new MediaRecorder\(/);
  assert.match(client, /audioBitsPerSecond:\s*64_000/);
  assert.match(client, /MAX_AUDIO_SECONDS \* 1_000 - 250/);
  assert.match(client, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(client, /window\.addEventListener\("pagehide"/);
  assert.match(client, /void loadFile\(file, "recording", true, recordedDuration\)/);
  assert.match(recording, /MediaRecorder\.isTypeSupported|isTypeSupported/);
  assert.match(server, /"microphone=\(self\)"/);
  assert.match(server, /"camera=\(\)"/);
  assert.match(server, /"display-capture=\(\)"/);
});

test("ships one local ONNX runtime and a dedicated inference worker", async () => {
  const files = await readdir(new URL("dist/client/assets/", root));
  const wasmFiles = files.filter((file) => file.endsWith(".wasm"));
  const workerFiles = files.filter((file) => /^whisper\.worker-.*\.js$/.test(file));

  assert.equal(wasmFiles.length, 1);
  assert.equal(workerFiles.length, 1);
});
