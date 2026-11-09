// Encrypts learners' provider tokens and pending secret values at rest (AES-256-GCM).
// TOKEN_KEY is a base64 32-byte key, a Worker secret shared by the MCP server and the platform.
// The AAD binds each ciphertext to its owner and purpose, so a row can't be copied to another learner.
//
//   sealed = "v1." + base64url(iv) + "." + base64url(ciphertext+tag)

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const fromB64 = (s: string) => Uint8Array.from(atob(s.trim()), (c) => c.charCodeAt(0));

const keys = new Map<string, Promise<CryptoKey>>();
function key(keyB64: string) {
  let k = keys.get(keyB64);
  if (!k) {
    const raw = fromB64(keyB64);
    if (raw.length !== 32) throw new Error("TOKEN_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)");
    k = crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    keys.set(keyB64, k);
  }
  return k;
}

export async function seal(plaintext: string, keyB64: string, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, await key(keyB64), enc.encode(plaintext)));
  return `v1.${b64url(iv)}.${b64url(ct)}`;
}

export async function unseal(sealed: string, keyB64: string, aad: string): Promise<string> {
  const [v, iv, ct] = sealed.split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("not a sealed value");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(iv), additionalData: enc.encode(aad) }, await key(keyB64), fromB64url(ct));
  return dec.decode(pt);
}

// AAD helpers so both apps build them the same way.
export const connectionAad = (githubId: number, provider: string) => `connection:${githubId}:${provider}`;
export const secretRequestAad = (githubId: number, requestId: string) => `secret:${githubId}:${requestId}`;
