import { createFileRoute } from "@tanstack/react-router";
import { admin, json } from "@/lib/server/http";

/** Giriş yapmış kullanıcı (panel rolüne göre arayüzü ayarlar) */
export const Route = createFileRoute("/api/admin/me")({
  server: {
    handlers: {
      GET: admin(async ({ user }) => json({ ok: true, user })),
    },
  },
});
