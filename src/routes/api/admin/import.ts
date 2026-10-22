import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, owner, readJson } from "@/lib/server/http";
import { importBackup } from "@/lib/server/store";

const rec = z.record(z.string(), z.record(z.string(), z.unknown()));
const body = z.object({
  data: z.object({ products: rec, orders: rec, coupons: rec.optional(), settings: rec.optional() }),
});

/** Eski "Yedek al (JSON)" dosyasını veritabanına geri yükler */
export const Route = createFileRoute("/api/admin/import")({
  server: {
    handlers: {
      POST: owner(async ({ request }) =>
        json(await importBackup(body.parse(await readJson(request)).data)),
      ),
    },
  },
});
