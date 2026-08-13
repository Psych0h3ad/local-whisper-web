const RECORDING_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

export function chooseRecordingMimeType(
  isTypeSupported: (mimeType: string) => boolean,
): string {
  return (
    RECORDING_MIME_CANDIDATES.find((mimeType) => {
      try {
        return isTypeSupported(mimeType);
      } catch {
        return false;
      }
    }) ?? ""
  );
}

export function recordingExtension(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("mp4")) return "m4a";
  if (normalized.includes("ogg")) return "ogg";
  return "webm";
}

export function recordingFileName(date: Date, mimeType: string): string {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");
  return `recording-${stamp}.${recordingExtension(mimeType)}`;
}

export function microphoneErrorMessage(error: unknown): string {
  const name =
    error && typeof error === "object" && "name" in error
      ? String(error.name)
      : "";

  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "マイクの使用が許可されませんでした。サイト設定と会社のマイク利用ポリシーを確認してください。";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "利用できるマイクが見つかりませんでした。マイクの接続を確認してください。";
    case "NotReadableError":
    case "TrackStartError":
      return "マイクを開始できませんでした。ほかのアプリが使用していないか確認してください。";
    case "SecurityError":
      return "この環境ではマイクを利用できません。HTTPSで開き直してください。";
    default:
      return "マイク録音を開始できませんでした。ブラウザや会社のマイク利用ポリシーを確認してください。";
  }
}
