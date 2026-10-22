import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { HttpError } from "@/lib/server/db";
import { handle, json, readJson } from "@/lib/server/http";
import { authenticate, loginBlocked, loginFailed, loginOk, sessionCookie } from "@/lib/server/auth";

const body = z.object({
  username: z.string().trim().min(1).max(40),
  password: z.string().min(1).max(200),
});

export const Route = createFileRoute("/api/admin/login")({
  server: {
    handlers: {
      POST: handle(async ({ request }) => {
        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "local";
        const { username, password } = body.parse(await readJson(request));
        const key = ip + "|" + username.toLowerCase();
        if (loginBlocked(key) || loginBlocked(ip))
          throw new HttpError(429, "Çok fazla hatalı deneme. 5 dakika sonra tekrar deneyin.");
        const u = await authenticate(username, password);
        if (!u) {
          loginFailed(key);
          await new Promise((r) => setTimeout(r, 400));
          throw new HttpError(401, "Kullanıcı adı ya da şifre hatalı.");
        }
        loginOk(key);
        return json(
          { ok: true, user: { id: u.id, username: u.username, name: u.name, role: u.role } },
          200,
          { "set-cookie": await sessionCookie(request, u) },
        );
      }),
    },
  },
});
