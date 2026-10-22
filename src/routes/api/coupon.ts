import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { handle, json, readJson } from "@/lib/server/http";
import { checkCoupon } from "@/lib/server/store";

const body = z.object({ code: z.string().trim().min(1).max(40), sub: z.number().min(0) });

export const Route = createFileRoute("/api/coupon")({
  server: {
    handlers: {
      POST: handle(async ({ request }) => {
        const b = body.parse(await readJson(request));
        const c = await checkCoupon(b.code, b.sub);
        return json({ ok: true, code: c.code, pct: c.pct, min: c.min });
      }),
    },
  },
});
