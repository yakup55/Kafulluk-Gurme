import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { HttpError } from "@/lib/server/db";
import { handle, json, readJson } from "@/lib/server/http";
import {
  adminConfigured,
  checkPassword,
  loginBlocked,
  loginFailed,
  loginOk,
  sessionCookie,
} from "@/lib/server/auth";

const body = z.object({ password: z.string().min(1).max(200) });

export const Route = createFileRoute("/api/admin/login")({
  server: {
    handlers: {
      POST: handle(async ({ request }) => {
        if (!adminConfigured())
          throw new HttpError(503, "Panel şifresi sunucuda tanımlanmamış (ADMIN_PASSWORD).");
        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "local";
        if (loginBlocked(ip))
          throw new HttpError(429, "Çok fazla hatalı deneme. 5 dakika sonra tekrar deneyin.");
        const { password } = body.parse(await readJson(request));
        if (!(await checkPassword(password))) {
          loginFailed(ip);
          await new Promise((r) => setTimeout(r, 500));
          throw new HttpError(401, "Şifre hatalı.");
        }
        loginOk(ip);
        return json({ ok: true }, 200, { "set-cookie": await sessionCookie(request) });
      }),
    },
  },
});
