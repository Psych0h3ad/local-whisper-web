# Local Whisper Web

Install-free, privacy-first speech-to-text in the browser. Audio files, video audio tracks, microphone recordings, and transcripts are processed on the device and are not uploaded to an application server.

> This is STT / ASR (speech to text), not TTS (text to speech).

[日本語 README](README.md)

## Features

- Transcribe audio files up to 90 seconds and 25 MB
- Extract and transcribe the audio track of a video up to 90 seconds and 100 MB, entirely on the device
- Record up to 90 seconds from the microphone in the browser
- Explicit Japanese, English, or Chinese selection
- Prefer WebGPU on supported Chrome / Edge installations
- Fall back to WASM / CPU where WebGPU is unavailable
- Edit, copy, or export results as UTF-8 TXT and versioned JSON
- Choose Whisper base for quality or Whisper tiny for lower resource use
- Remove cached model files from the UI

There is no audio, video, or microphone-recording upload, account, analytics tag, or cloud transcript storage.

## How data moves

```text
Audio file / video audio track / microphone recording
  → Decode in the browser and convert to 16 kHz mono with AudioContext
  → Run Whisper in a Web Worker with ONNX Runtime Web
  → Return text to the page
```

The application does not persist or send input data or transcripts. During processing, the browser may hold media in memory or its own temporary storage. On first use, model files are downloaded from Hugging Face and may be stored in the browser Cache API. Requests to `huggingface.co` can redirect to Hugging Face CDN hosts (currently including `*.cdn.hf.co`), so managed networks may need to allow the redirect destination as well.

The site hosting/CDN provider may process or retain ordinary access metadata while serving the page and assets, such as IP address, User-Agent, requested URL, and timestamp. Those requests do not contain audio, video, microphone recordings, or transcript data. Application analytics and Workers Observability are disabled.

Choosing “Copy” moves the transcript outside the application to the operating-system clipboard. From that point, clipboard history or sync, DLP software, remote-desktop software, and the OS are separate data boundaries. Downloaded TXT/JSON files likewise become ordinary local files. See [PRIVACY.md](PRIVACY.md).

## First-run downloads

Approximate model, tokenizer, and configuration totals:

| Model | CPU / WASM | GPU / WebGPU | Best for |
| --- | ---: | ---: | --- |
| Whisper base | ~80 MB | ~209 MB | Better Japanese accuracy |
| Whisper tiny | ~44 MB | ~123 MB | Lower-end PCs and speed |

The ONNX Runtime WASM (~22 MB) and application assets are served from the same origin. Model retrieval requires access to `huggingface.co` and its Hugging Face CDN redirect destination.

## Browser support

- Recommended: current Chrome or Edge on Windows and macOS
- Firefox and Safari use the WASM / CPU path; speed, recording support, and codec support vary
- Audio: WAV and MP3 are officially supported. M4A, AAC, WebM, and OGG work when the browser can decode the codec
- Video: MP4 (H.264 / AAC) and WebM (VP9 / Opus) have been tested in current Chrome. In Edge and other browsers, MOV and all other container/codec combinations depend on browser support
- Microphone recording requires HTTPS, a user click on the record button, and browser permission. The application requests audio input only, never the camera or screen sharing

Managed computers may restrict the microphone, WebGPU, Web Workers, WebAssembly, browser caches, or access to `huggingface.co`. “No installation” does not automatically mean “approved by your organization.” Obtain consent from everyone being recorded and confirm your organization’s policy before use.

## Development

Requires Node.js 22.13 or later and npm.

```bash
npm ci
npm run dev
```

Run all checks:

```bash
npm test
```

Generate a complete CycloneDX SBOM from `package-lock.json`, including runtime, development, transitive, and optional dependencies. The default output is `artifacts/local-whisper-web.cdx.json`.

```bash
npm run sbom
```

Use `npm run sbom -- path/to/sbom.cdx.json` for another destination. The generator validates the root identity and every direct dependency, including Next.js, React, React DOM, and Transformers.js.

## Implementation

- React with an App Router compatible runtime (`vinext`)
- `@huggingface/transformers` pinned to `3.8.1`
- ONNX Runtime Web
- Module Web Worker
- WebGPU with a fresh-worker WASM fallback
- Cloudflare Workers-compatible output

The Transformers.js version is intentionally pinned. During validation, the Whisper WASM q8 path in 4.x either failed to create a session or degraded on roughly one-minute audio. Re-test real audio on both GPU and CPU before upgrading it.

Model revisions are fixed in `app/lib/whisper.ts`. Model weights are downloaded at runtime and are not committed to this repository.

## Known limitations

- Speech recognition can be wrong or hallucinate text
- No speaker diarization, live transcription, or translation. Microphone audio is transcribed after recording stops
- No direct capture of system audio or browser-tab audio
- For video, only the audio track is transcribed. Container and codec support depend on the browser, and the application does not export an extracted audio file
- Subtitle timestamps are not exported
- Corporate proxies may block the first model download
- WASM speed depends on the device and organizational browser policy and is slower than GPU
- Users remain responsible for recording consent, confidential data, and organizational policy

Do not use the output as the sole basis for high-risk medical, legal, employment, or safety decisions.

## Contributing and license

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request. Never attach sensitive audio to a public report.

Application code is available under the [MIT License](LICENSE). Models and dependencies have their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the [major bundled license texts](public/third-party-licenses/README.txt), which are also copied into the deployment artifact.
