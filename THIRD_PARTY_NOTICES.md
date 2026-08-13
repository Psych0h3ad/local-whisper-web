# Third-Party Notices

Local Whisper Web application code is licensed under MIT. The following components and remotely downloaded model files retain their own licenses and notices.

## Runtime libraries

| Component | Version | License | Source |
| --- | --- | --- | --- |
| Transformers.js | 3.8.1 | Apache-2.0 | https://github.com/huggingface/transformers.js |
| ONNX Runtime Web | 1.22.0-dev.20250409-89f8206ba4 | MIT | https://github.com/microsoft/onnxruntime |
| Hugging Face Jinja | 0.5.9 | MIT | https://github.com/huggingface/huggingface.js/tree/main/packages/jinja |
| React / React DOM | 19.2.8 | MIT | https://github.com/facebook/react |
| Next.js | 16.3.0 | MIT | https://github.com/vercel/next.js |
| vinext | 0.0.45 | MIT | https://github.com/cloudflare/vinext |

The ONNX Runtime WebAssembly binary and its JavaScript factory are copied into the application build from the installed Transformers.js package so they can be served from the application origin.

Full license texts and copyright notices for these major browser-delivered components are stored under [`public/third-party-licenses/`](public/third-party-licenses/README.txt). That directory is copied into the deployment artifact and is available at `/third-party-licenses/` on a deployed site. The installed Transformers.js package contains no separate `NOTICE` file.

- [Apache License 2.0 — Transformers.js and upstream Whisper model weights](public/third-party-licenses/Apache-2.0.txt)
- [MIT — ONNX Runtime](public/third-party-licenses/MIT-ONNX-Runtime.txt)
- [MIT — Hugging Face Jinja](public/third-party-licenses/MIT-Hugging-Face-Jinja.txt)
- [MIT — React and React DOM](public/third-party-licenses/MIT-React.txt)
- [MIT — Next.js](public/third-party-licenses/MIT-Next.js.txt)
- [MIT — vinext](public/third-party-licenses/MIT-vinext.txt)

## Whisper models

Model weights are not included in this Git repository. The browser downloads one of these pinned ONNX conversions at runtime:

- `onnx-community/whisper-base`, revision `1846881b6b3a3024392c1eea3ad983695bc23925`
- `onnx-community/whisper-tiny`, revision `ff4177021cc41f7db950912b73ea4fdf7d01d8e7`

Conversion repositories:

- https://huggingface.co/onnx-community/whisper-base
- https://huggingface.co/onnx-community/whisper-tiny

They are derived from OpenAI Whisper models:

- https://huggingface.co/openai/whisper-base
- https://huggingface.co/openai/whisper-tiny
- https://github.com/openai/whisper

The upstream `openai/whisper-base` and `openai/whisper-tiny` model cards identify the weights as Apache-2.0. The pinned `onnx-community` conversion repositories do not currently declare a license in their repository metadata. Review both the conversion and upstream model pages before redistributing model files. This application downloads them at runtime; this repository and its deployment artifact do not redistribute the weights or grant additional rights to them.

## Complete dependency information

`package-lock.json` is the authoritative version lock for transitive npm packages. Each package’s license file remains available in its source distribution. Generate the complete runtime, development, transitive, and optional CycloneDX inventory with `npm run sbom`; by default it writes `artifacts/local-whisper-web.cdx.json` and validates the root component, every locked component, and all direct dependencies.
