import { createFileRoute } from "@tanstack/react-router";
import { handle, json, readJson } from "@/lib/server/http";
import { placeWebOrder, webOrderSchema } from "@/lib/server/store";

/** Müşteri siparişi oluşturur; stok aynı veritabanı işleminde düşülür. */
export const Route = createFileRoute("/api/orders")({
  server: {
    handlers: {
      POST: handle(async ({ request }) => {
        const input = webOrderSchema.parse(await readJson(request));
        return json({ ok: true, order: await placeWebOrder(input) }, 201);
      }),
    },
  },
});
