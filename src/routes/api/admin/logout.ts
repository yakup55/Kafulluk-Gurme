import { createFileRoute } from "@tanstack/react-router";
import { handle, json } from "@/lib/server/http";
import { clearCookie } from "@/lib/server/auth";

export const Route = createFileRoute("/api/admin/logout")({
  server: {
    handlers: {
      POST: handle(async () => json({ ok: true }, 200, { "set-cookie": clearCookie() })),
    },
  },
});
