import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { handle, json, readJson } from "@/lib/server/http";
import { askQuestion, publicAnswers, questionSchema } from "@/lib/server/store";

/**
 * Müşteri soruları.
 * POST { name, contact, pid?, question } → satıcıya soru gönder
 * GET  ?pid=urun-kodu                    → o ürünün yayınlanmış soru-cevapları
 */
export const Route = createFileRoute("/api/questions")({
  server: {
    handlers: {
      GET: handle(async ({ request }) => {
        const pid = z.string().min(1).max(80).parse(new URL(request.url).searchParams.get("pid"));
        return json({ ok: true, items: await publicAnswers(pid) });
      }),
      POST: handle(async ({ request }) => {
        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "local";
        const q = questionSchema.parse(await readJson(request));
        return json(await askQuestion(q, ip), 201);
      }),
    },
  },
});
