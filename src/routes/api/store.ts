import { createFileRoute } from "@tanstack/react-router";
import { handle, json } from "@/lib/server/http";
import { publicStore } from "@/lib/server/store";

/** Vitrin: satıştaki ürünler (güncel stokla) ve mağaza ayarları */
export const Route = createFileRoute("/api/store")({
  server: {
    handlers: {
      GET: handle(async () => json({ ok: true, ...(await publicStore()) })),
    },
  },
});
