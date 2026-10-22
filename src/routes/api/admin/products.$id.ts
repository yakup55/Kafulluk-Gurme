import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { admin, json, readJson } from "@/lib/server/http";
import { deleteProduct, patchProduct, productSchema, putProduct } from "@/lib/server/store";

export const Route = createFileRoute("/api/admin/products/$id")({
  server: {
    handlers: {
      PUT: admin(async ({ request, params }) =>
        json(await putProduct(params.id, productSchema.parse(await readJson(request)))),
      ),
      PATCH: admin(async ({ request, params }) =>
        json(
          await patchProduct(
            params.id,
            z.object({ active: z.boolean() }).parse(await readJson(request)),
          ),
        ),
      ),
      DELETE: admin(async ({ params }) => json(await deleteProduct(params.id))),
    },
  },
});
