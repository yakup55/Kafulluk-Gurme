import { createFileRoute } from "@tanstack/react-router";
import { json, owner, readJson } from "@/lib/server/http";
import { putSettings, settingsSchema } from "@/lib/server/store";

export const Route = createFileRoute("/api/admin/settings")({
  server: {
    handlers: {
      PUT: owner(async ({ request }) =>
        json(await putSettings(settingsSchema.parse(await readJson(request)))),
      ),
    },
  },
});
