import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, owner, readJson } from "@/lib/server/http";
import { couponSchema, deleteCoupon, patchCoupon, putCoupon } from "@/lib/server/store";

export const Route = createFileRoute("/api/admin/coupons/$code")({
  server: {
    handlers: {
      PUT: owner(async ({ request, params }) =>
        json(await putCoupon(params.code, couponSchema.parse(await readJson(request)))),
      ),
      PATCH: owner(async ({ request, params }) =>
        json(
          await patchCoupon(
            params.code,
            z.object({ active: z.boolean() }).parse(await readJson(request)).active,
          ),
        ),
      ),
      DELETE: owner(async ({ params }) => json(await deleteCoupon(params.code))),
    },
  },
});
