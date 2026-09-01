import type { Config, Context } from "@netlify/functions";
import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { profiles } from "../../db/schema.js";
import { consumeRateLimit } from "../../lib/rate-limit.js";
import {
  createRecoveryCode,
  hashPassword,
  hashSecret,
  normalizeName,
  normalizeRecoveryCode,
  passwordError,
  secretsMatch,
  verifyPassword,
} from "../../lib/security.js";
import { createSession, deleteProfileSessions, deleteSession, getSessionProfile } from "../../lib/session.js";

const json = (data: unknown, status = 200, headers?: HeadersInit) => Response.json(data, { status, headers });

const createFriendCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  const value = Array.from(bytes, (byte) => chars[byte % chars.length]).join("");
  return `CRF-${value.slice(0, 4)}-${value.slice(4)}`;
};

const publicProfile = (profile: typeof profiles.$inferSelect) => ({
  identityId: profile.identityId,
  displayName: profile.displayName,
  friendCode: profile.friendCode,
});

/*
 * Due contatori per ogni tentativo, non uno.
 *
 * Quello su "indirizzo + nome utente" ferma chi insiste su un singolo account,
 * ma non vede chi prova la stessa password su mille account diversi: ogni
 * tentativo ha una chiave sua e nessuna arriva mai al limite. Il contatore sul
 * solo indirizzo chiude quella strada.
 *
 * Le soglie per indirizzo sono volutamente larghe: una famiglia dietro la
 * stessa connessione di casa condivide un solo indirizzo pubblico, e nessuno
 * deve restare fuori perche' i fratelli hanno giocato prima.
 */
const limited = async (
  context: Context,
  scope: string,
  identity: string,
  limit: number,
  ipLimit: number,
  minutes: number,
) => {
  const ip = context.ip || "unknown";
  const windowMs = minutes * 60_000;
  const perAccount = await consumeRateLimit(scope, `${ip}:${identity}`, limit, windowMs);
  const perAddress = await consumeRateLimit(`${scope}:ip`, ip, ipLimit, windowMs);
  const blocked = !perAccount.allowed ? perAccount : !perAddress.allowed ? perAddress : null;
  if (!blocked) return null;
  return json(
    { error: `Troppi tentativi. Riprova tra ${blocked.retryAfter} secondi.` },
    429,
    { "Retry-After": String(blocked.retryAfter) },
  );
};

export default async (request: Request, context: Context) => {
  const action = new URL(request.url).pathname.split("/").filter(Boolean).at(-1);

  try {
    if (request.method === "GET" && action === "session") {
      const session = await getSessionProfile(request);
      return json({ profile: session ? publicProfile(session.profile) : null });
    }

    if (request.method !== "POST") return json({ error: "Metodo non consentito." }, 405);

    if (action === "signup") {
      const { name, password } = await request.json();
      // Il controllo va fatto sul nome intero: applicarlo alla copia gia'
      // tagliata a 24 caratteri rendeva il limite di lunghezza sempre vero, e
      // un nome di 200 caratteri finiva comunque nel database come username.
      const displayName = String(name || "").trim();
      const username = normalizeName(displayName);
      const passwordValidation = passwordError(password);
      if (!/^[a-z0-9_]{3,24}$/i.test(displayName)) return json({ error: "Usa 3-24 caratteri: lettere, numeri o _." }, 400);
      if (passwordValidation) return json({ error: passwordValidation }, 400);
      const rateResponse = await limited(context, "signup", username, 5, 12, 60);
      if (rateResponse) return rateResponse;

      const [existing] = await db.select({ id: profiles.identityId }).from(profiles).where(eq(profiles.username, username)).limit(1);
      if (existing) return json({ error: "Questo nome è già utilizzato." }, 409);

      const recoveryCode = createRecoveryCode();
      let profile: typeof profiles.$inferSelect | undefined;
      for (let attempt = 0; attempt < 5 && !profile; attempt += 1) {
        try {
          [profile] = await db.insert(profiles).values({
            identityId: randomUUID(),
            username,
            passwordHash: hashPassword(String(password)),
            recoveryCodeHash: hashSecret(recoveryCode),
            displayName,
            friendCode: createFriendCode(),
          }).returning();
        } catch (error) {
          if ((error as { code?: string }).code === "23505" && attempt < 4) continue;
          throw error;
        }
      }
      if (!profile) return json({ error: "Impossibile creare l’account." }, 500);
      const session = await createSession(profile.identityId);
      return json({ token: session.token, profile: publicProfile(profile), recoveryCode }, 201);
    }

    if (action === "login") {
      const { name, password } = await request.json();
      const username = normalizeName(name);
      const rateResponse = await limited(context, "login", username, 8, 60, 15);
      if (rateResponse) return rateResponse;
      const [profile] = await db.select().from(profiles).where(eq(profiles.username, username)).limit(1);
      if (!profile?.passwordHash || !verifyPassword(String(password || ""), profile.passwordHash)) {
        return json({ error: "Nome o password non validi." }, 401);
      }
      const session = await createSession(profile.identityId);
      return json({ token: session.token, profile: publicProfile(profile) });
    }

    if (action === "recover") {
      const { name, recoveryCode, password } = await request.json();
      const username = normalizeName(name);
      const passwordValidation = passwordError(password);
      if (passwordValidation) return json({ error: passwordValidation }, 400);
      const rateResponse = await limited(context, "recover", username, 5, 15, 30);
      if (rateResponse) return rateResponse;
      const [profile] = await db.select().from(profiles).where(eq(profiles.username, username)).limit(1);
      const submittedHash = hashSecret(normalizeRecoveryCode(recoveryCode));
      if (!profile?.recoveryCodeHash || !secretsMatch(submittedHash, profile.recoveryCodeHash)) {
        return json({ error: "Nome o codice di recupero non sono validi." }, 401);
      }

      const nextRecoveryCode = createRecoveryCode();
      await db.update(profiles).set({
        passwordHash: hashPassword(String(password)),
        recoveryCodeHash: hashSecret(nextRecoveryCode),
        passwordUpdatedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(profiles.identityId, profile.identityId));
      await deleteProfileSessions(profile.identityId);
      const session = await createSession(profile.identityId);
      return json({ token: session.token, profile: publicProfile(profile), recoveryCode: nextRecoveryCode });
    }

    if (action === "change-password") {
      const session = await getSessionProfile(request);
      if (!session) return json({ error: "Accedi prima di cambiare password." }, 401);
      const { currentPassword, password } = await request.json();
      const passwordValidation = passwordError(password);
      if (passwordValidation) return json({ error: passwordValidation }, 400);
      if (!session.profile.passwordHash || !verifyPassword(String(currentPassword || ""), session.profile.passwordHash)) {
        return json({ error: "La password attuale non è corretta." }, 401);
      }
      const recoveryCode = createRecoveryCode();
      await db.update(profiles).set({
        passwordHash: hashPassword(String(password)),
        recoveryCodeHash: hashSecret(recoveryCode),
        passwordUpdatedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(profiles.identityId, session.profile.identityId));
      await deleteProfileSessions(session.profile.identityId);
      const nextSession = await createSession(session.profile.identityId);
      return json({ token: nextSession.token, profile: publicProfile(session.profile), recoveryCode });
    }

    if (action === "logout") {
      await deleteSession(request);
      return json({ ok: true });
    }

    return json({ error: "Azione non trovata." }, 404);
  } catch (error) {
    console.error("[auth]", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Servizio account temporaneamente non disponibile." }, 500);
  }
};

export const config: Config = { path: "/api/auth/*" };
