import { HttpError } from "./db";
import { isAdmin } from "./auth";

type Params = { id: string; code: string };

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
        // zod doğrulama hatası
        const issue = (e as { issues: { path: (string | number)[]; message: string }[] }).issues[0];
        return json(
          { ok: false, error: "Geçersiz veri: " + issue?.path.join(".") + " " + issue?.message },
          400,
        );
      }
      console.error(e);
      return json({ ok: false, error: "Sunucu hatası. Birazdan tekrar deneyin." }, 500);
    }
  };
}

/**
 * Satıcı uçları: oturum çerezi + (yazma işlemlerinde) aynı köken kontrolü.
 * Çerez SameSite=Strict olduğu için CSRF'e karşı ikinci bir katman.
 */
export function admin(fn: (ctx: { request: Request; params: Params }) => Promise<Response>) {
  return handle(async (ctx) => {
    const { request } = ctx;
    if (request.method !== "GET") {
      const origin = request.headers.get("origin");
      if (origin && new URL(origin).host !== new URL(request.url).host) {
        throw new HttpError(403, "Geçersiz istek kaynağı.");
      }
    }
    if (!(await isAdmin(request))) throw new HttpError(401, "Oturum açmanız gerekiyor.");
    return fn(ctx);
  });
}
