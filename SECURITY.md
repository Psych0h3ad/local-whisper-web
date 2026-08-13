# Security Policy

## Supported version

Security fixes are provided for the latest release on the default branch.

## Reporting a vulnerability

Use the repository’s private GitHub Security Advisory form. Do not open a public Issue for an unpatched vulnerability.

Never attach confidential audio, personal data, access tokens, internal URLs, or complete browser profiles to a report. A minimal synthetic reproduction is preferred.

## Security boundaries

The application intentionally has no media upload endpoint, account system, or transcript database. Audio files, video files, microphone recordings, decoded samples, and transcripts remain under browser/device control and are not included in application network requests.

Microphone access is requested only after an explicit record action, over a secure context, and with audio-only constraints. The application does not request camera, screen-capture, system-audio, or browser-tab-audio access. It stops acquired microphone tracks after recording finishes, is cancelled, fails, or the relevant page component closes. Browser and operating-system permissions, extensions, device-management software, and temporary media buffers remain outside the application’s security boundary.

The application still depends on the browser and its media decoders, the hosting origin, Hugging Face model delivery, npm dependencies, and the user’s device security. Review `package-lock.json`, pinned model revisions, and `THIRD_PARTY_NOTICES.md` when updating the supply chain.
