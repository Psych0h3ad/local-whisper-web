import assert from "node:assert/strict";
import test from "node:test";

let renderSequence = 0;

async function render(extraHeaders = {}, configuredOrigin) {
  const previousPublicOrigin = process.env.PUBLIC_SITE_ORIGIN;
  const previousNextPublicUrl = process.env.NEXT_PUBLIC_SITE_URL;
  renderSequence += 1;

  if (configuredOrigin === undefined) {
    delete process.env.PUBLIC_SITE_ORIGIN;
  } else {
    process.env.PUBLIC_SITE_ORIGIN = configuredOrigin;
  }
  delete process.env.NEXT_PUBLIC_SITE_URL;

  try {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("test", `${process.pid}-${renderSequence}`);
    const { default: worker } = await import(workerUrl.href);

    return await worker.fetch(
      new Request("http://localhost/", {
        headers: { accept: "text/html", ...extraHeaders },
      }),
      {
        ASSETS: {
          fetch: async () => new Response("Not found", { status: 404 }),
        },
      },
      {
        waitUntil() {},
        passThroughOnException() {},
      },
    );
  } finally {
    if (previousPublicOrigin === undefined) {
      delete process.env.PUBLIC_SITE_ORIGIN;
    } else {
      process.env.PUBLIC_SITE_ORIGIN = previousPublicOrigin;
    }
    if (previousNextPublicUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = previousNextPublicUrl;
    }
  }
}

test("renders the Local Whisper product page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]+lang="ja"/i);
  assert.match(html, /<title>Local Whisper — 音声を、外に出さず文字にする<\/title>/i);
  assert.match(html, /声を、/);
  assert.match(html, /音声と文字は、このブラウザの外へ出ません/);
  assert.match(html, /文字起こしを開始/);
  assert.match(html, /PRIVACY &amp; LIMITS/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("does not inject remote scripts or font stylesheets", async () => {
  const response = await render();
  const html = await response.text();

  assert.doesNotMatch(html, /<script[^>]+src=["']https?:\/\//i);
  assert.doesNotMatch(
    html,
    /<link[^>]+rel=["']stylesheet["'][^>]+href=["']https?:\/\//i,
  );
  assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/i);
  assert.match(
    html,
    /<meta property="og:image" content="http:\/\/localhost:3000\/og-preview\.png"\/>/i,
  );
});

test("does not trust forwarded or Host headers for canonical metadata", async () => {
  const response = await render({
    host: "metadata-attacker.example",
    "x-forwarded-host": "forwarded-attacker.example",
    "x-forwarded-proto": "https",
  });
  const html = await response.text();

  assert.match(
    html,
    /<link rel="canonical" href="http:\/\/localhost:3000\/"\/>/i,
  );
  assert.match(
    html,
    /<meta property="og:url" content="http:\/\/localhost:3000\/"\/>/i,
  );
  assert.doesNotMatch(html, /metadata-attacker|forwarded-attacker/i);
});

test("uses only a validated, fixed public origin in production metadata", async () => {
  const configuredResponse = await render(
    { "x-forwarded-host": "forwarded-attacker.example" },
    "https://local-whisper.example",
  );
  const configuredHtml = await configuredResponse.text();
  assert.match(
    configuredHtml,
    /<link rel="canonical" href="https:\/\/local-whisper\.example\/"\/>/i,
  );
  assert.doesNotMatch(configuredHtml, /forwarded-attacker/i);

  const invalidResponse = await render({}, "http://local-whisper.example/path");
  const invalidHtml = await invalidResponse.text();
  assert.match(
    invalidHtml,
    /<link rel="canonical" href="http:\/\/localhost:3000\/"\/>/i,
  );
});

test("adds browser hardening headers without blocking model downloads", async () => {
  const response = await render();
  const csp = response.headers.get("content-security-policy") ?? "";
  const permissions = response.headers.get("permissions-policy") ?? "";

  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /script-src[^;]*'wasm-unsafe-eval'/);
  assert.match(csp, /worker-src 'self' blob:/);
  assert.match(csp, /connect-src[^;]*https:\/\/huggingface\.co/);
  assert.match(csp, /connect-src[^;]*https:\/\/\*\.hf\.co/);
  assert.match(permissions, /camera=\(\)/);
  assert.match(permissions, /microphone=\(\)/);
  assert.match(permissions, /clipboard-write=\(self\)/);
});
