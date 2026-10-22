/**
 * Satıcı paneli kullanıcıları ve oturumları.
 *
 * Roller:
 *   yonetici : her şey (ürün/fiyat, kupon, ayarlar, yedek, kullanıcı yönetimi, sipariş silme)
 *   personel : siparişleri görür, durum/kargo/not günceller, elle sipariş girer, stok ekler/çıkarır
 *
 * İlk kurulum: admin_users tablosu boşken "admin" kullanıcı adı ve ADMIN_PASSWORD ile giriş yapılır;
 * bu giriş "admin" adlı yönetici hesabını oluşturur. Sonrasında ADMIN_PASSWORD girişte kullanılmaz.
 *
 * Oturum: HMAC imzalı HttpOnly çerez (Web Crypto — Node ve Cloudflare'de çalışır).
 * Her istekte kullanıcı veritabanından okunur; pasife alınan, silinen ya da şifresi değişen
 * kullanıcının açık oturumları hemen geçersiz olur (session_ver).
 */
import { db, HttpError } from "./db";

export type Role = "yonetici" | "personel";
export type AdminUser = { id: number; username: string; name: string; role: Role };

const COOKIE = "kg_admin";
const TTL_SEC = 60 * 60 * 24 * 7; // 7 gün
const PBKDF2_ITER = 100_000; // Cloudflare Workers üst sınırı
const enc = new TextEncoder();

function b64url(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function sessionSecret() {
  const s =
    process.env["SESSION_SECRET"] ||
    (process.env["ADMIN_PASSWORD"] ? "kg-derived:" + process.env["ADMIN_PASSWORD"] : "");
  if (!s) throw new HttpError(503, "Sunucuda SESSION_SECRET tanımlanmamış.");
  return s;
}

async function hmac(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/* ---------- şifre özeti (PBKDF2-SHA256) ---------- */

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iter: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  return b64url(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: iter },
      key,
      256,
    ),
  );
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITER}$${b64url(salt)}$${await pbkdf2(password, salt, PBKDF2_ITER)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, iter, salt, hash] = stored.split("$");
  if (alg !== "pbkdf2" || !iter || !salt || !hash) return false;
  return safeEqual(await pbkdf2(password, fromB64url(salt), Number(iter)), hash);
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Şifre en az 8 karakter olmalı.";
  if (pw.length > 200) return "Şifre çok uzun.";
  return null;
}

/* ---------- giriş ---------- */

type UserRow = AdminUser & { pass_hash: string; active: boolean; session_ver: number };

// Sahte özet: kullanıcı yoksa da aynı süre harcansın (kullanıcı adı tahminini zorlaştırır)
let dummyHash: Promise<string> | undefined;

export async function authenticate(username: string, password: string): Promise<UserRow | null> {
  const sql = await db();
  const uname = username.trim().toLocaleLowerCase("tr");
  const [{ n } = { n: 0 }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM admin_users`;

  // İlk kurulum: hiç kullanıcı yokken ADMIN_PASSWORD ile "admin" yönetici hesabı açılır
  if (n === 0) {
    const boot = process.env["ADMIN_PASSWORD"];
    if (!boot) throw new HttpError(503, "İlk giriş için sunucuda ADMIN_PASSWORD tanımlanmalı.");
    if (uname !== "admin" || !safeEqual(await hmac("pw:" + password), await hmac("pw:" + boot)))
      return null;
    const rows = await sql<UserRow[]>`
      INSERT INTO admin_users (username, name, pass_hash, role)
      VALUES ('admin', 'Yönetici', ${await hashPassword(password)}, 'yonetici')
      ON CONFLICT (username) DO NOTHING
      RETURNING id, username, name, role, pass_hash, active, session_ver`;
    return rows[0] ?? null;
  }

  const u = (
    await sql<UserRow[]>`
    SELECT id, username, name, role, pass_hash, active, session_ver FROM admin_users WHERE username = ${uname}`
  )[0];
  if (!u) {
    dummyHash ??= hashPassword("x");
    await verifyPassword(password, await dummyHash);
    return null;
  }
  if (!(await verifyPassword(password, u.pass_hash)) || !u.active) return null;
  await sql`UPDATE admin_users SET last_login = now() WHERE id = ${u.id}`;
  return u;
}

/* ---------- oturum çerezi ---------- */

export async function sessionCookie(request: Request, u: { id: number; session_ver: number }) {
  const exp = Math.floor(Date.now() / 1000) + TTL_SEC;
  const payload = `v2.${u.id}.${u.session_ver}.${exp}`;
  const token = payload + "." + (await hmac(payload));
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${token}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${TTL_SEC}${secure}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0`;
}

/** Çerezdeki oturumu doğrular ve güncel kullanıcıyı döndürür. */
export async function currentUser(request: Request): Promise<AdminUser | null> {
  const raw = request.headers.get("cookie") ?? "";
  const m = raw.match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
  if (!m) return null;
  const parts = (m[1] ?? "").split(".");
  if (parts.length !== 5 || parts[0] !== "v2") return null;
  const [, uid, ver, exp, sig] = parts;
  if (!(Number(exp) > Date.now() / 1000)) return null;
  if (!safeEqual(sig ?? "", await hmac(`v2.${uid}.${ver}.${exp}`))) return null;
  const sql = await db();
  const u = (
    await sql<(AdminUser & { active: boolean; session_ver: number })[]>`
    SELECT id, username, name, role, active, session_ver FROM admin_users WHERE id = ${Number(uid)}`
  )[0];
  if (!u || !u.active || u.session_ver !== Number(ver)) return null;
  return { id: u.id, username: u.username, name: u.name, role: u.role };
}

/* ---------- kaba kuvvet koruması (sunucu örneği başına, bellek içi) ---------- */
const fails = new Map<string, { n: number; until: number }>();
export function loginBlocked(key: string) {
  const f = fails.get(key);
  return !!f && f.until > Date.now();
}
export function loginFailed(key: string) {
  const f = fails.get(key) ?? { n: 0, until: 0 };
  f.n++;
  if (f.n >= 5) {
    f.until = Date.now() + 5 * 60_000;
    f.n = 0;
  }
  fails.set(key, f);
}
export function loginOk(key: string) {
  fails.delete(key);
}
