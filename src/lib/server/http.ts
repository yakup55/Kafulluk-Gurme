import { HttpError } from "./db";
import { currentUser, type AdminUser, type Role } from "./auth";

type Params = { id: string; code: string };

/* ---------- doğrulama hatalarını Türkçe ve anlaşılır göster ---------- */
type ZodIssueLike = {
  path: (string | number)[];
  message: string;
  code?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  type?: string;
};
const FIELD: Record<string, string> = {
  name: "Ad",
  username: "Kullanıcı adı",
  password: "Şifre",
  next: "Yeni şifre",
  current: "Mevcut şifre",
  phone: "Telefon",
  email: "E-posta",
  city: "İl",
  dist: "İlçe",
  addr: "Açık adres",
  note: "Not",
  price: "Fiyat",
  stock: "Stok",
  cat: "Kategori",
  pct: "İndirim oranı",
  items: "Ürünler",
  qty: "Adet",
  role: "Rol",
  code: "Kupon kodu",
  contact: "E-posta / telefon",
  question: "Soru",
  answer: "Yanıt",
  vat: "KDV oranı",
  net: "KDV hariç fiyat",
  body: "Mesaj",
};
function zodMessage(i: ZodIssueLike | undefined) {
  if (!i) return "Geçersiz veri.";
  const key = [...i.path].reverse().find((p) => typeof p === "string") as string | undefined;
  const f = (key && FIELD[key]) || "Bir alan";
  // şemada Türkçe mesaj yazdıysak onu kullan
  if (i.message && /[çğıöşüÇĞİÖŞÜ]|en az|geçersiz|gerekli/.test(i.message))
    return `${f}: ${i.message}`;
  if (i.code === "too_small")
    return i.type === "string" ? `${f} en az ${i.minimum} karakter olmalı.` : `${f} çok küçük.`;
  if (i.code === "too_big")
    return i.type === "string"
      ? `${f} en fazla ${i.maximum} karakter olabilir.`
      : `${f} çok büyük.`;
  if (i.code === "invalid_string") return `${f} geçersiz.`;
  if (i.code === "invalid_type") return `${f} eksik ya da hatalı.`;
  return `${f} geçersiz.`;
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export async function readJson<T = unknown>(request: Request): Promise<T> {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) throw new HttpError(415, "İstek JSON olmalı.");
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "Geçersiz JSON.");
  }
}

/** Tüm API uçlarını aynı hata biçimiyle sarmalar. */
export function handle(fn: (ctx: { request: Request; params: Params }) => Promise<Response>) {
  return async (ctx: { request: Request; params: Params }) => {
    try {
      return await fn(ctx);
    } catch (e) {
      if (e instanceof HttpError)
        return json({ ok: false, error: e.message, ...e.extra }, e.status);
      if (e && typeof e === "object" && "issues" in e) {
        const issue = (e as { issues: ZodIssueLike[] }).issues[0];
        return json({ ok: false, error: zodMessage(issue) }, 400);
      }
      console.error(e);
      return json({ ok: false, error: "Sunucu hatası. Birazdan tekrar deneyin." }, 500);
    }
  };
}

/**
 * Satıcı uçları: oturum çerezi + rol kontrolü + (yazma işlemlerinde) aynı köken kontrolü.
 * Çerez SameSite=Strict olduğu için köken kontrolü CSRF'e karşı ikinci bir katman.
 * role verilmezse her giriş yapmış kullanıcı (yönetici ve personel) erişebilir.
 */
export function admin(
  fn: (ctx: { request: Request; params: Params; user: AdminUser }) => Promise<Response>,
  opts: { role?: Role } = {},
) {
  return handle(async (ctx) => {
    const { request } = ctx;
    if (request.method !== "GET") {
      const origin = request.headers.get("origin");
      if (origin && new URL(origin).host !== new URL(request.url).host) {
        throw new HttpError(403, "Geçersiz istek kaynağı.");
      }
    }
    const user = await currentUser(request);
    if (!user) throw new HttpError(401, "Oturum açmanız gerekiyor.");
    if (opts.role === "yonetici" && user.role !== "yonetici") {
      throw new HttpError(403, "Bu işlem için yönetici yetkisi gerekiyor.");
    }
    return fn({ ...ctx, user });
  });
}

/** Yalnızca yöneticinin yapabileceği işlemler */
export const owner = (fn: Parameters<typeof admin>[0]) => admin(fn, { role: "yonetici" });
