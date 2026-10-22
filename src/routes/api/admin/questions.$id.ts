import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { admin, json, owner, readJson } from "@/lib/server/http";
import { deleteQuestion, patchQuestion, questionPatchSchema } from "@/lib/server/store";

const qid = z.coerce.number().int().positive();

/** Soruyu yanıtlama ve yayınlama: personel de yapabilir. Silme: yalnızca yönetici. */
export const Route = createFileRoute("/api/admin/questions/$id")({
  server: {
    handlers: {
      PATCH: admin(async ({ request, params, user }) =>
        json(
          await patchQuestion(
            qid.parse(params.id),
            questionPatchSchema.parse(await readJson(request)),
            user.username,
          ),
        ),
      ),
      DELETE: owner(async ({ params }) => json(await deleteQuestion(qid.parse(params.id)))),
    },
  },
});
