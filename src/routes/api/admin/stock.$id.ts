import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { admin, json, readJson } from "@/lib/server/http";
import { adjustStock } from "@/lib/server/store";

const body = z.object({ delta: z.number().int().min(-100000).max(100000) });

/** Stoğa göreli ekleme/çıkarma: { delta: 10 } veya { delta: -1 }. Personel de yapabilir. */
export const Route = createFileRoute("/api/admin/stock/$id")({
  server: {
    handlers: {
      POST: admin(async ({ request, params, user }) => {
        const { delta } = body.parse(await readJson(request));
        return json(await adjustStock(params.id, delta, user.username));
      }),
    },
  },
});
