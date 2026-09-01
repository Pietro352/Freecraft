import type { Config } from "@netlify/functions";
import { lt, lte, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { clientEvents, rateLimits, sessions } from "../../db/schema.js";

/*
 * Pulizia notturna.
 *
 * Tre tabelle crescevano senza che nulla le svuotasse mai: le sessioni erano
 * ripulite solo quando qualcuno faceva login (quindi mai, nei periodi tranquilli),
 * le finestre dei tentativi restavano anche dopo essere scadute, e ogni errore
 * JavaScript di ogni visita si accumulava per sempre.
 *
 * Un sito usato fra amici non se ne accorgerebbe per anni, ma nel frattempo ogni
 * scansione di quelle tabelle diventa un po' piu' lenta e i backup un po' piu'
 * grossi, senza che nessuno stia guardando.
 */
export default async () => {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [expiredSessions, staleWindows, oldEvents] = await Promise.all([
    db.delete(sessions).where(lte(sessions.expiresAt, now)).returning({ id: sessions.id }),
    db.delete(rateLimits).where(lt(rateLimits.windowStartedAt, dayAgo)).returning({ key: rateLimits.key }),
    db.delete(clientEvents).where(lt(clientEvents.createdAt, monthAgo)).returning({ id: clientEvents.id }),
  ]);

  // Le tabelle appena sfoltite tornano a dare stime corrette al planner.
  await db.execute(sql`analyze sessions, rate_limits, client_events`);

  console.log(
    `[cleanup] sessioni scadute: ${expiredSessions.length}, finestre: ${staleWindows.length}, eventi: ${oldEvents.length}`,
  );
};

export const config: Config = { schedule: "27 4 * * *" };
