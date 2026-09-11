import { HttpError } from "./validation.js";

const encoder = new TextEncoder();
const PUBLIC_ORIGINS = ["https://learnatbillioncodes.com", "https://www.learnatbillioncodes.com"];

export function allowedOrigins(env) {
  const values = env.ALLOWED_ORIGINS === undefined ? PUBLIC_ORIGINS : String(env.ALLOWED_ORIGINS).split(",");
  return new Set(values.map(value => value.trim()).filter(value => {
    try {
      const url = new URL(value);
      return url.origin === value && !url.username && !url.password &&
        (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)));
    } catch { return false; }
  }));
}

export function checkOrigin(request, env, required = false) {
  const origin = request.headers.get("origin");
  if ((required && !origin) || (origin !== null && !allowedOrigins(env).has(origin))) {
    throw new HttpError(403, "This request origin is not permitted.");
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new HttpError(403, "Cross-site API requests are not permitted.");
  }
}

export function configuredSecret(value) {
  return typeof value === "string" && value.length >= 32 && value.length <= 256;
}

async function hmacKey(value, usages) {
  return crypto.subtle.importKey("raw", encoder.encode(value), { name: "HMAC", hash: "SHA-256" }, false, usages);
}

export async function hmacHex(secret, value) {
  const key = await hmacKey(secret, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256(value) {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function authenticateAdmin(request, env) {
  if (!configuredSecret(env.ADMIN_TOKEN)) throw new HttpError(503, "Private operations are not configured.");
  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer ([\x21-\x7e]{32,256})$/i.exec(authorization);
  if (!match) throw new HttpError(401, "Administrator authentication required.", undefined, { "WWW-Authenticate": "Bearer" });
  // Native HMAC verification compares the authentication tag, not a JS string.
  const challenge = encoder.encode("billioncodes-academy-admin-auth-v1");
  const expectedKey = await hmacKey(env.ADMIN_TOKEN, ["sign"]);
  const candidateKey = await hmacKey(match[1], ["verify"]);
  const tag = await crypto.subtle.sign("HMAC", expectedKey, challenge);
  if (!await crypto.subtle.verify("HMAC", candidateKey, tag, challenge)) {
    throw new HttpError(401, "Administrator authentication required.", undefined, { "WWW-Authenticate": "Bearer" });
  }
}

export function secureHeaders(response, request, env, { api = false, admin = false, nonce } = {}) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (new URL(request.url).protocol === "https:") headers.set("Strict-Transport-Security", "max-age=31536000");
  if (api || admin) {
    headers.set("Cache-Control", "no-store");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    headers.set("Vary", "Origin");
  }
  if (api) {
    headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    const origin = request.headers.get("origin");
    if (origin && allowedOrigins(env).has(origin)) headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Expose-Headers", "Retry-After");
  }
  if (admin && nonce) {
    headers.set("Content-Security-Policy", `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
