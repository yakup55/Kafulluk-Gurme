import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { admin, json, readJson } from "@/lib/server/http";
import { sessionCookie } from "@/lib/server/auth";
import { changeOwnPassword } from "@/lib/server/store";

const body = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(8, "en az 8 karakter").max(200),
});

/** Kendi şifreni değiştir. Diğer cihazlardaki oturumlar kapanır, bu cihazınki yenilenir. */
export const Route = createFileRoute("/api/admin/password")({
  server: {
    handlers: {
      POST: admin(async ({ request, user }) => {
        const b = body.parse(await readJson(request));
        const u = await changeOwnPassword(user.id, b.current, b.next);
        return json({ ok: true }, 200, { "set-cookie": await sessionCookie(request, u) });
      }),
    },
  },
});
