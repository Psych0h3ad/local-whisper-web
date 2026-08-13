import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const sourceUrl = new URL("../app/lib/recording.ts", import.meta.url);

async function loadHelpers() {
  const source = await readFile(sourceUrl, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "recording.ts",
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`
  );
}

test("chooses the first supported recording format and falls back safely", async () => {
  const { chooseRecordingMimeType } = await loadHelpers();
  assert.equal(
    chooseRecordingMimeType((mimeType) => mimeType === "audio/mp4"),
    "audio/mp4",
  );
  assert.equal(chooseRecordingMimeType(() => false), "");
  assert.equal(
    chooseRecordingMimeType(() => {
      throw new Error("unsupported probe");
    }),
    "",
  );
});

test("builds portable recording names for browser-selected formats", async () => {
  const { recordingExtension, recordingFileName } = await loadHelpers();
  assert.equal(recordingExtension("audio/webm;codecs=opus"), "webm");
  assert.equal(recordingExtension("audio/mp4"), "m4a");
  assert.equal(recordingExtension("audio/ogg;codecs=opus"), "ogg");
  assert.equal(
    recordingFileName(new Date(2026, 7, 13, 9, 5, 7), "audio/mp4"),
    "recording-20260813-090507.m4a",
  );
});

test("explains microphone failures without exposing raw browser errors", async () => {
  const { microphoneErrorMessage } = await loadHelpers();
  assert.match(
    microphoneErrorMessage({ name: "NotAllowedError" }),
    /サイト設定.*会社のマイク利用ポリシー/,
  );
  assert.match(
    microphoneErrorMessage({ name: "NotFoundError" }),
    /マイクが見つかりません/,
  );
  assert.match(microphoneErrorMessage(null), /録音を開始できません/);
});
