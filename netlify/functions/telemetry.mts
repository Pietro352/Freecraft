import type { Config, Context } from "@netlify/functions";
import { db } from "../../db/index.js";
import { clientEvents } from "../../db/schema.js";
import { consumeRateLimit } from "../../lib/rate-limit.js";

export default async (request: Request, context: Context) => {
  if (request.method !== "POST") return Response.json({ error: "Metodo non consentito." }, { status: 405 });
  try {
    const rate = await consumeRateLimit("telemetry", context.ip || "unknown", 20, 60_000);
    if (!rate.allowed) return new Response(null, { status: 204 });
    const body = await request.json();
    const kind = String(body.kind || "error").slice(0, 32);
    const message = String(body.message || "Errore sconosciuto").replace(/[\r\n]+/g, " ").slice(0, 500);
    const path = String(body.path || "/").split("?")[0].slice(0, 200);
    await db.insert(clientEvents).values({ kind, message, path });
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 204 });
  }
};

export const config: Config = { path: "/api/telemetry" };
