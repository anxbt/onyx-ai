import type { Context, Next } from "hono";
import type { HonoEnv } from "./index";
import { supabaseUrl } from "./env";

// Module-level cache — survives across requests within the same Worker instance
let cachedKeys: Map<string, CryptoKey> | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getJwks(baseUrl: string): Promise<Map<string, CryptoKey>> {
  if (cachedKeys && Date.now() < cacheExpiry) return cachedKeys;

  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/auth/v1/.well-known/jwks.json`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);

  type JwkWithKid = JsonWebKey & { kid?: string };
  const { keys } = (await res.json()) as { keys: JwkWithKid[] };
  const keyMap = new Map<string, CryptoKey>();

  for (const jwk of keys) {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    keyMap.set(jwk.kid ?? "default", key);
  }

  cachedKeys = keyMap;
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return keyMap;
}

function base64urlToBytes(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64urlDecode(str: string): string {
  return atob(str.replace(/-/g, "+").replace(/_/g, "/"));
}

async function verifyJwt(token: string, keys: Map<string, CryptoKey>): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;

  try {
    const header = JSON.parse(base64urlDecode(headerB64)) as { kid?: string };
    const key = header.kid ? keys.get(header.kid) : keys.values().next().value;
    if (!key) return null;

    const sig = base64urlToBytes(sigB64);
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      sig.buffer.slice(sig.byteOffset, sig.byteOffset + sig.byteLength) as ArrayBuffer,
      new TextEncoder().encode(`${headerB64}.${payloadB64}`),
    );

    if (!valid) return null;

    const payload = JSON.parse(base64urlDecode(payloadB64)) as { sub?: string; exp?: number };
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    if (!payload.sub) return null;

    return payload.sub;
  } catch {
    return null;
  }
}

export async function authMiddleware(c: Context<HonoEnv>, next: Next) {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "missing_bearer_token" }, 401);
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return c.json({ error: "empty_bearer_token" }, 401);
  }

  const url = supabaseUrl(c.env);
  if (!url) {
    return c.json({ error: "missing_supabase_url" }, 500);
  }

  let keys: Map<string, CryptoKey>;
  try {
    keys = await getJwks(url);
  } catch (err) {
    return c.json({ error: `jwks_fetch_failed`, detail: String(err) }, 500);
  }

  const userId = await verifyJwt(token, keys);
  if (!userId) {
    return c.json({ error: "invalid_token" }, 401);
  }

  c.set("userId", userId);
  await next();
}
