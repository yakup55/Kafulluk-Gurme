import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getRecommendations = createServerFn({ method: "POST" })
  .inputValidator(z.object({ taste: z.string().max(500), purpose: z.string().max(500) }))
  .handler(async ({ data }) => {
    const { recommend } = await import("./recommend.server");
    try {
      return { ok: true as const, ...(await recommend(data.taste, data.purpose)) };
    } catch (e) {
      console.error(e);
      const status = (e as { statusCode?: number }).statusCode;
      const msg =
        status === 429 ? "Şu an çok yoğunuz, birazdan tekrar deneyin." :
        status === 402 ? "Öneri servisinin kredisi doldu." :
        "Öneri alınamadı, lütfen tekrar deneyin.";
      return { ok: false as const, error: msg };
    }
  });
