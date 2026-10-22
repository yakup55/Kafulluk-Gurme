/**
 * Satıcı paneli girişi.
 * ADMIN_PASSWORD  : panel şifresi (zorunlu)
 * SESSION_SECRET  : oturum imzalama anahtarı (önerilir; yoksa şifreden türetilir)
 * Oturum, HMAC ile imzalanmış HttpOnly bir çerezde tutulur (Web Crypto — Node ve Cloudflare'de çalışır).
 */
const COOKIE = "kg_admin";
const TTL_SEC = 60 * 60 * 24 * 7; // 7 gün
const enc = new TextEncoder();

function b64url(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function key() {
  const pw = process.env["ADMIN_PASSWORD"];
  if (!pw) throw new Error("ADMIN_PASSWORD tanımlı değil");
  const secret = process.env["SESSION_SECRET"] || "kg-derived:" + pw;
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(payload: string) {
  return b64url(await crypto.subtle.sign("HMAC", await key(), enc.encode(payload)));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function adminConfigured() {
  return !!process.env["ADMIN_PASSWORD"];
}

export async function checkPassword(input: string) {
  const pw = process.env["ADMIN_PASSWORD"];
  if (!pw) return false;
  // Uzunluk sızdırmamak için iki tarafı da özetleyip karşılaştır
  const [a, b] = await Promise.all([sign("pw:" + input), sign("pw:" + pw)]);
  return safeEqual(a, b);
}

export async function sessionCookie(request: Request) {
  const exp = Math.floor(Date.now() / 1000) + TTL_SEC;
  const payload = "v1." + exp;
  const token = payload + "." + (await sign(payload));
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${token}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${TTL_SEC}${secure}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export async function isAdmin(request: Request) {
  if (!adminConfigured()) return false;
  const raw = request.headers.get("cookie") ?? "";
  const m = raw.match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
  if (!m) return false;
  const parts = (m[1] ?? "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  return safeEqual(parts[2] ?? "", await sign(parts[0] + "." + parts[1]));
}

/* Basit kaba-kuvvet koruması (sunucu örneği başına, bellek içi) */
const fails = new Map<string, { n: number; until: number }>();
export function loginBlocked(ip: string) {
  const f = fails.get(ip);
  return !!f && f.until > Date.now();
}
export function loginFailed(ip: string) {
  const f = fails.get(ip) ?? { n: 0, until: 0 };
  f.n++;
  if (f.n >= 5) {
    f.until = Date.now() + 5 * 60_000;
    f.n = 0;
  }
  fails.set(ip, f);
}
export function loginOk(ip: string) {
  fails.delete(ip);
}
