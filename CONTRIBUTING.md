# Contributing

Thanks for helping improve Local Whisper Web.

## Before opening an Issue

- Search existing Issues.
- Include OS, browser name/version, selected model, GPU/CPU path, audio format, duration, and the exact error message.
- Reproduce with synthetic or non-sensitive audio.
- Never upload confidential recordings, personal data, or audio you do not have permission to share.

## Pull requests

1. Fork the repository and create a focused branch.
2. Install with `npm ci`.
3. Keep audio local; do not add analytics, uploads, or remote logging without an explicit design discussion.
4. Run `npm test`.
5. If dependencies changed, run `npm run sbom` and review `THIRD_PARTY_NOTICES.md` plus bundled license texts.
6. Explain behavior changes, browser coverage, and privacy impact in the pull request.

Changes to Transformers.js, ONNX Runtime, model IDs, revisions, dtype, chunking, or audio preprocessing require a real-audio regression test on both WebGPU and WASM. Test files must be self-recorded, consented, or openly licensed.

## Style

- Keep the interface usable by keyboard and screen readers.
- Prefer platform APIs and small dependencies.
- Do not log file names, transcripts, or audio contents.
- Keep Japanese and English documentation aligned.
