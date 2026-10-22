import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText } from "ai";
import { z } from "zod";
import { publicStore } from "./server/store";

const schema = z.object({
  intro: z.string(),
  picks: z.array(z.object({ id: z.string(), reason: z.string() })),
});

export async function recommend(taste: string, purpose: string) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Öneri servisi şu an yapılandırılmamış.");
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  // Katalog veritabanından: yalnızca satışta ve stokta olan ürünler önerilir
  const PRODUCTS = (await publicStore()).products.filter((p) => p.stock > 0);
  const catalog = PRODUCTS.map((p) => `${p.id} | ${p.cat} | ${p.name} ${p.w} | ${p.price} TL | ${p.desc}`).join("\n");
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    output: Output.object({ schema }),
    system:
      "Sen Kafulluk Gurme'nin samimi gurme danışmanısın. Müşterinin damak zevkine ve kullanım amacına göre yalnızca aşağıdaki katalogdan 2-4 ürün öner (mümkünse farklı kategorilerden, birbirini tamamlayan). id alanına katalogdaki id'yi aynen yaz. reason: 1-2 cümle, Türkçe, neden uygun olduğunu ve nasıl eşleştirileceğini anlat. intro: tek kısa, sıcak cümle.\n\nKATALOG:\n" + catalog,
    prompt: `Damak zevki: ${taste || "belirtilmedi"}\nKullanım amacı: ${purpose || "belirtilmedi"}`,
    providerOptions: {
      openai: { store: false, forceReasoning: true, reasoningEffort: "low", include: ["reasoning.encrypted_content"] },
    },
  });
  const out = await result.output;
  const byId = new Map(PRODUCTS.map((p) => [p.id, p]));
  const picks = out.picks.flatMap((pk) => {
    const p = byId.get(pk.id);
    return p ? [{ id: p.id, reason: pk.reason, name: p.name, cat: p.cat, w: p.w, price: p.price }] : [];
  });
  return { intro: out.intro, picks };
}
