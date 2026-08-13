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

test("keeps audio local and provides explicit cache removal", async () => {
  const [client, audio, worker, models] = await Promise.all([
    read("app/LocalWhisper.tsx"),
    read("app/lib/audio.ts"),
    read("app/workers/whisper.worker.ts"),
    read("app/lib/whisper.ts"),
  ]);
  const productSource = `${client}\n${audio}\n${worker}`;

  assert.doesNotMatch(productSource, /FormData|XMLHttpRequest|sendBeacon/);
  assert.doesNotMatch(productSource, /localStorage|sessionStorage/);
  assert.match(client, /window\.caches\.delete\(MODEL_CACHE_NAME\)/);
  assert.match(client, /spellCheck=\{false\}/);
  assert.match(client, /requestConfigRef/);
  assert.match(client, /destroyWorker\(currentWorker\)/);
  assert.match(audio, /readAudioDuration\(file\)/);
  assert.ok(
    audio.indexOf("readAudioDuration(file)") <
      audio.indexOf("context.decodeAudioData"),
    "duration preflight must run before full PCM decoding",
  );
  assert.match(worker, /shouldSkipGpuFallback/);
  assert.match(models, /MODEL_CACHE_NAME = "transformers-cache"/);
  assert.match(client, /音声ファイルと文字起こし結果はサーバーへ送信せず、保存もしません/);
});

test("ships one local ONNX runtime and a dedicated inference worker", async () => {
  const files = await readdir(new URL("dist/client/assets/", root));
  const wasmFiles = files.filter((file) => file.endsWith(".wasm"));
  const workerFiles = files.filter((file) => /^whisper\.worker-.*\.js$/.test(file));

  assert.equal(wasmFiles.length, 1);
  assert.equal(workerFiles.length, 1);
});
