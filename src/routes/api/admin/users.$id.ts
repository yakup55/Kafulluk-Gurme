import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, owner, readJson } from "@/lib/server/http";
import { deleteUser, updateUser, userPatchSchema } from "@/lib/server/store";

const uid = z.coerce.number().int().positive();

export const Route = createFileRoute("/api/admin/users/$id")({
  server: {
    handlers: {
      PATCH: owner(async ({ request, params, user }) =>
        json(
          await updateUser(
            uid.parse(params.id),
            userPatchSchema.parse(await readJson(request)),
            user,
          ),
        ),
      ),
      DELETE: owner(async ({ params, user }) => json(await deleteUser(uid.parse(params.id), user))),
    },
  },
});
