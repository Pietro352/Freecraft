import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { rateLimits } from "../db/schema.js";
import { rateLimitKey, rateLimitVerdict } from "./rate-limit-policy.js";
import type { RateLimitResult } from "./rate-limit-policy.js";

export type { RateLimitResult };

/*
 * Conteggio dei tentativi su una finestra scorrevole.
 *
 * Tutta la logica sta dentro una sola istruzione SQL, e non e' un vezzo:
 * leggere il contatore e riscriverlo con due query lascia in mezzo un istante
 * in cui decine di richieste parallele leggono tutte lo stesso valore, lo
 * giudicano tutte sotto il limite e si sovrascrivono a vicenda. Il limite
 * scattava contro chi provava una password alla volta, non contro chi ne
 * provava cinquecento insieme, che e' esattamente il caso da fermare.
 *
 * Le finestre usano now() del database invece dell'orologio della funzione:
 * le istanze serverless non condividono un orologio e uno scarto di pochi
 * secondi basterebbe a far ripartire la finestra in anticipo.
 */
export async function consumeRateLimit(
  scope: string,
  identity: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const key = rateLimitKey(scope, identity);
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const expired = sql`${rateLimits.windowStartedAt} <= now() - make_interval(secs => ${windowSeconds}::double precision)`;

  const [row] = await db
    .insert(rateLimits)
    .values({ key, attempts: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        attempts: sql`case when ${expired} then 1 else ${rateLimits.attempts} + 1 end`,
        windowStartedAt: sql`case when ${expired} then now() else ${rateLimits.windowStartedAt} end`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ attempts: rateLimits.attempts, windowStartedAt: rateLimits.windowStartedAt });

  return rateLimitVerdict(Number(row?.attempts ?? 1), row?.windowStartedAt, limit, windowMs);
}
