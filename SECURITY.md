# Security Policy

## Supported version

Security fixes are provided for the latest release on the default branch.

## Reporting a vulnerability

Use the repository’s private GitHub Security Advisory form. Do not open a public Issue for an unpatched vulnerability.

Never attach confidential audio, personal data, access tokens, internal URLs, or complete browser profiles to a report. A minimal synthetic reproduction is preferred.

## Security boundaries

The application intentionally has no audio upload endpoint, account system, or transcript database. It still depends on the browser, the hosting origin, Hugging Face model delivery, npm dependencies, and the user’s device security. Review `package-lock.json`, pinned model revisions, and `THIRD_PARTY_NOTICES.md` when updating the supply chain.
