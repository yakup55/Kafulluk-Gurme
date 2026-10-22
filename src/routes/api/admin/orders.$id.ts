import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { admin, json, owner, readJson } from "@/lib/server/http";
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
      // elle sipariş girme ve durum/kargo/not güncelleme: personel de yapabilir
      PUT: admin(async ({ request, params, user }) =>
        json(
          await createAdminOrder(
            orderId.parse(params.id),
            adminOrderSchema.parse(await readJson(request)),
            user.username,
          ),
          201,
        ),
      ),
      PATCH: admin(async ({ request, params, user }) =>
        json(
          await patchOrder(
            params.id,
            orderPatchSchema.parse(await readJson(request)),
            user.username,
          ),
        ),
      ),
      // sipariş silme: yalnızca yönetici
      DELETE: owner(async ({ params, user }) => json(await deleteOrder(params.id, user.username))),
    },
  },
});
