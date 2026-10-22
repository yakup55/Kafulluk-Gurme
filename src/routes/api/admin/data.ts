import { createFileRoute } from "@tanstack/react-router";
import { admin, json } from "@/lib/server/http";
import { adminData } from "@/lib/server/store";

/** Panelin ihtiyaç duyduğu tüm veri: ürünler, siparişler, kuponlar, ayarlar */
export const Route = createFileRoute("/api/admin/data")({
  server: {
    handlers: {
      GET: admin(async () => json({ ok: true, ...(await adminData()) })),
    },
  },
});
