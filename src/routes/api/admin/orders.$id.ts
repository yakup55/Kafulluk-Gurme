import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { admin, json, readJson } from "@/lib/server/http";
import {
  adminOrderSchema,
  createAdminOrder,
  deleteOrder,
  orderPatchSchema,
  patchOrder,
} from "@/lib/server/store";

const orderId = z.string().regex(/^[A-Za-z0-9-]{1,80}$/);

export const Route = createFileRoute("/api/admin/orders/$id")({
  server: {
    handlers: {
      PUT: admin(async ({ request, params }) =>
        json(
          await createAdminOrder(
            orderId.parse(params.id),
            adminOrderSchema.parse(await readJson(request)),
          ),
          201,
        ),
      ),
      PATCH: admin(async ({ request, params }) =>
        json(await patchOrder(params.id, orderPatchSchema.parse(await readJson(request)))),
      ),
      DELETE: admin(async ({ params }) => json(await deleteOrder(params.id))),
    },
  },
});
