# Changelog

All notable changes are documented here.

## 0.2.0-beta.1 — 2026-08-13

- Added microphone recording for clips up to 90 seconds, with explicit audio-only permission and track cleanup
- Added local transcription of video audio tracks up to 90 seconds and 100 MB
- Verified MP4 (H.264 / AAC) and WebM (VP9 / Opus) input in current Chrome
- Documented codec-dependent formats, recording consent, managed-device policy, and temporary browser buffering boundaries

## 0.1.0-beta.1 — 2026-08-13

- Initial public beta
- Local Whisper base/tiny transcription for audio up to 90 seconds
- Explicit Japanese, English, and Chinese language selection
- WebGPU acceleration with clean-worker WASM fallback
- Local ONNX Runtime assets and pinned remote model revisions
- Editable results with clipboard, TXT, and JSON export
- Explicit privacy explanation and model cache deletion
- Hosting, CDN redirect, and clipboard privacy boundaries documented
- Complete lockfile-based CycloneDX SBOM and bundled major license texts
- Responsive, keyboard-accessible Japanese interface
