import { createFileRoute } from "@tanstack/react-router";
import { json, owner, readJson } from "@/lib/server/http";
import { createUser, listUsers, newUserSchema } from "@/lib/server/store";

/** Panel kullanıcıları — yalnızca yönetici */
export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      GET: owner(async () => json({ ok: true, users: await listUsers() })),
      POST: owner(async ({ request }) =>
        json(await createUser(newUserSchema.parse(await readJson(request))), 201),
      ),
    },
  },
});
