import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { admin, json, readJson } from "@/lib/server/http";
import { importBackup } from "@/lib/server/store";

const rec = z.record(z.string(), z.record(z.string(), z.unknown()));
const body = z.object({
  data: z.object({ products: rec, orders: rec, coupons: rec.optional(), settings: rec.optional() }),
});

/** Eski "Yedek al (JSON)" dosyasını veritabanına geri yükler */
export const Route = createFileRoute("/api/admin/import")({
  server: {
    handlers: {
      POST: admin(async ({ request }) =>
        json(await importBackup(body.parse(await readJson(request)).data)),
      ),
    },
  },
});
