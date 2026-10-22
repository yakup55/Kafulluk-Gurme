import { createFileRoute } from "@tanstack/react-router";
import { handle, json, readJson } from "@/lib/server/http";
import { customerReply, messageSchema, threadFor, tokenSchema } from "@/lib/server/store";

/**
 * Müşterinin soru konuşması (gizli takip anahtarı ile).
 * GET  ?t=ANAHTAR          → konuşma
 * POST { t, body }         → müşteri yanıtı
 */
export const Route = createFileRoute("/api/question-thread")({
  server: {
    handlers: {
      GET: handle(async ({ request }) => {
        const t = tokenSchema.parse(new URL(request.url).searchParams.get("t"));
        return json({ ok: true, thread: await threadFor(t) });
      }),
      POST: handle(async ({ request }) => {
        const b = messageSchema.extend({ t: tokenSchema }).parse(await readJson(request));
        await customerReply(b.t, b.body);
        return json({ ok: true, thread: await threadFor(b.t) }, 201);
      }),
    },
  },
});
