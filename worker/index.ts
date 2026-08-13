/** Cloudflare Worker entry point for the application. */
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co https://*.xethub.hf.co",
  "font-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "img-src 'self' data: blob:",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  // Next.js currently emits inline bootstrap data. wasm-unsafe-eval permits
  // ONNX Runtime's WebAssembly compilation without enabling general eval().
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
].join("; ");

const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=()",
  "camera=()",
  "clipboard-write=(self)",
  "display-capture=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=(self)",
  "payment=()",
  "publickey-credentials-get=()",
  "usb=()",
  "xr-spatial-tracking=()",
].join(", ");

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "Permissions-Policy": PERMISSIONS_POLICY,
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const response = await handler.fetch(request, env, ctx);
    return withSecurityHeaders(response);
  },
};

export default worker;
