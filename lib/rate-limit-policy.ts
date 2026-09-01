import { createHash } from "node:crypto";

export type RateLimitResult = { allowed: boolean; retryAfter: number };

/*
 * Le due decisioni del contatore dei tentativi, tenute separate dalla query.
 *
 * Stanno in un file loro perche' non toccano il database: cosi' i test possono
 * caricarle e verificarle senza una connessione, mentre lib/rate-limit.ts - che
 * importa il database - resta impossibile da provare qui. Sono anche le due
 * parti dove un errore non si vedrebbe: una chiave sbagliata fa condividere il
 * contatore a persone diverse, un conto sbagliato dei secondi tiene fuori
 * qualcuno molto piu' a lungo del previsto.
 */

/*
 * Il nome del contatore.
 *
 * Lo scope tiene separati conteggi che non c'entrano niente fra loro: i
 * tentativi di accesso di un indirizzo IP non devono consumare il budget delle
 * registrazioni fatte dallo stesso IP. L'hash serve a non scrivere in chiaro
 * nel database indirizzi IP e nomi utente, che sono dati personali e qui
 * servono solo come etichetta da confrontare.
 */
export function rateLimitKey(scope: string, identity: string) {
  return createHash("sha256").update(`${scope}:${identity}`).digest("hex");
}

/*
 * Quanto manca alla fine della finestra.
 *
 * retryAfter non e' mai 0: un "riprova fra 0 secondi" e' un invito a ripartire
 * subito in cerchio. Ed e' limitato alla durata della finestra, cosi' un
 * orologio storto non puo' produrre un'attesa piu' lunga di quella prevista.
 */
export function rateLimitVerdict(
  attempts: number,
  windowStartedAt: Date | null | undefined,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  if (attempts <= limit) return { allowed: true, retryAfter: 0 };
  const startedAt = windowStartedAt?.getTime() ?? now;
  const remaining = Math.min(windowMs, windowMs - (now - startedAt));
  return { allowed: false, retryAfter: Math.max(1, Math.ceil(remaining / 1000)) };
}
