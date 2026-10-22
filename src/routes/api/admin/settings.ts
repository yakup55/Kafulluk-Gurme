import { createFileRoute } from "@tanstack/react-router";
import { admin, json, readJson } from "@/lib/server/http";
import { putSettings, settingsSchema } from "@/lib/server/store";

export const Route = createFileRoute("/api/admin/settings")({
  server: {
    handlers: {
      PUT: admin(async ({ request }) =>
        json(await putSettings(settingsSchema.parse(await readJson(request)))),
      ),
    },
  },
});
