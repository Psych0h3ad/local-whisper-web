import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

function moduleUrl(source, fileName) {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName,
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
}

async function loadAudioHelpers() {
  const [whisperSource, audioSource] = await Promise.all([
    readFile(new URL("../app/lib/whisper.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/audio.ts", import.meta.url), "utf8"),
  ]);
  const whisperUrl = moduleUrl(whisperSource, "whisper.ts");
  const linkedAudioSource = audioSource.replace(
    'from "./whisper"',
    `from "${whisperUrl}"`,
  );
  return import(moduleUrl(linkedAudioSource, "audio.ts"));
}

test("classifies browser media using MIME before the extension fallback", async () => {
  const { getMediaKind } = await loadAudioHelpers();
  assert.equal(getMediaKind({ name: "clip.webm", type: "audio/webm" }), "audio");
  assert.equal(getMediaKind({ name: "clip.bin", type: "video/mp4" }), "video");
  assert.equal(getMediaKind({ name: "CLIP.MOV", type: "" }), "video");
  assert.equal(getMediaKind({ name: "voice.mp3", type: "" }), "audio");
});

test("uses separate conservative limits for audio and video", async () => {
  const { getMediaFileLimit } = await loadAudioHelpers();
  assert.equal(getMediaFileLimit("audio"), 25 * 1024 * 1024);
  assert.equal(getMediaFileLimit("video"), 100 * 1024 * 1024);
});
