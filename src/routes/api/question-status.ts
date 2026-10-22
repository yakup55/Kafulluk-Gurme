import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { handle, json, readJson } from "@/lib/server/http";
import { threadStatus, tokenSchema } from "@/lib/server/store";

/** "Sorularım" listesi ve okunmamış yanıt rozeti: { tokens: [...] } */
export const Route = createFileRoute("/api/question-status")({
  server: {
    handlers: {
      POST: handle(async ({ request }) => {
        const { tokens } = z
          .object({ tokens: z.array(tokenSchema).max(30) })
          .parse(await readJson(request));
        return json({ ok: true, items: await threadStatus(tokens) });
      }),
    },
  },
});
