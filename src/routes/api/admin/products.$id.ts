import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, owner, readJson } from "@/lib/server/http";
import { deleteProduct, patchProduct, productSchema, putProduct } from "@/lib/server/store";

/** Ürün kaydetme, satışa açma/kapama ve silme yalnızca yöneticide */
export const Route = createFileRoute("/api/admin/products/$id")({
  server: {
    handlers: {
      PUT: owner(async ({ request, params, user }) =>
        json(
          await putProduct(params.id, productSchema.parse(await readJson(request)), user.username),
        ),
      ),
      PATCH: owner(async ({ request, params }) =>
        json(
          await patchProduct(
            params.id,
            z.object({ active: z.boolean() }).parse(await readJson(request)),
          ),
        ),
      ),
      DELETE: owner(async ({ params }) => json(await deleteProduct(params.id))),
    },
  },
});
