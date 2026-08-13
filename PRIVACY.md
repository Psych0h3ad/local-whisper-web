# Privacy

Local Whisper Web is designed to transcribe audio files, video audio tracks, and microphone recordings on the user’s device.

## What the application does not send

- Audio and video file bytes
- Microphone recording bytes
- Decoded audio samples
- Transcript text
- File names
- Usage analytics or crash reports

The application has no media upload endpoint and does not store input files, microphone recordings, decoded audio, or transcripts in Local Storage, Session Storage, IndexedDB, or Cache Storage.

## Microphone access

The application requests microphone access only after the user explicitly chooses the record action. It requests audio input only; it does not request camera or screen-capture access. Microphone tracks are stopped when recording finishes, is cancelled, fails, or the page component closes.

The browser temporarily buffers recording data while recording and processing it, potentially using memory or browser-managed temporary storage. The application does not deliberately persist or upload that data. Browser and operating-system permission indicators and controls remain separate security boundaries.

The microphone feature does not capture system audio or browser-tab audio and does not perform live transcription. The completed recording is decoded and transcribed after recording stops.

## Network requests that do occur

- Application JavaScript, CSS, and the ONNX Runtime WASM are loaded from the site origin.
- On first use, the selected Whisper model and tokenizer files are requested from `huggingface.co`. Hugging Face can redirect large files to its CDN/object-delivery hosts, currently including hosts under `*.cdn.hf.co`. These delivery domains can change independently of this application.
- Cached model files may be reused by the browser on later visits.

The Hugging Face and CDN requests reveal ordinary connection metadata such as IP address and browser request headers to those providers. They do not contain the selected audio or video, microphone recording, file name, or transcript. Managed networks may need an allow-list rule that follows Hugging Face redirects; review the final destination instead of assuming that allowing only `huggingface.co` is sufficient.

The hosting/CDN provider may process or retain ordinary access and security-log metadata when serving this page and its same-origin assets, including IP address, User-Agent, request URL, status, and timestamp. The application does not add analytics or crash reporting, and its Worker configuration disables Workers Observability. Provider-level delivery or security logs are a separate boundary and may still exist. Because audio, video, microphone recordings, and transcript data never enter application requests, they are not present in those access logs.

## Storage and deletion

Model files may be stored in the browser cache named `transformers-cache`. Use “モデルキャッシュを削除” in the privacy section to remove it. Browser policies, private browsing, or storage cleanup may remove the cache automatically.

The application keeps selected audio, video, and completed microphone recordings only for the current page and releases its references when media is replaced or the page closes. The browser may manage temporary buffers independently. Exported TXT and JSON files are saved only when the user explicitly downloads them.

## Clipboard and exported-file boundary

When the user chooses “Copy,” the browser writes the transcript to the operating-system clipboard. The application does not read the clipboard. After the write succeeds, the data is outside this application and may be retained or transferred by clipboard history/sync, device-management or DLP software, remote-desktop software, browser extensions, or the operating system.

Downloaded TXT and JSON files are also outside the application after the explicit save. Their backup, synchronization, indexing, sharing, and deletion are controlled by the user and the device environment.

## Organizational policy

Local processing reduces data exposure but does not override recording consent, confidentiality duties, data classification rules, or employer policies. Obtain the consent required from everyone being recorded, and confirm that both recording and local AI processing are permitted before using sensitive material, especially on a managed or company device.
