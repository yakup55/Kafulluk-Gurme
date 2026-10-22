import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { admin, json, readJson } from "@/lib/server/http";
import { couponSchema, deleteCoupon, patchCoupon, putCoupon } from "@/lib/server/store";

export const Route = createFileRoute("/api/admin/coupons/$code")({
  server: {
    handlers: {
      PUT: admin(async ({ request, params }) =>
        json(await putCoupon(params.code, couponSchema.parse(await readJson(request)))),
      ),
      PATCH: admin(async ({ request, params }) =>
        json(
          await patchCoupon(
            params.code,
            z.object({ active: z.boolean() }).parse(await readJson(request)).active,
          ),
        ),
      ),
      DELETE: admin(async ({ params }) => json(await deleteCoupon(params.code))),
    },
  },
});
