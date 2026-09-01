import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import { profiles, sessions } from "../db/schema.js";

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(profileId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  await db.delete(sessions).where(lte(sessions.expiresAt, new Date()));
  await db.insert(sessions).values({ tokenHash: hashToken(token), profileId, expiresAt });
  return { token, expiresAt };
}

export async function deleteProfileSessions(profileId: string) {
  await db.delete(sessions).where(eq(sessions.profileId, profileId));
}

export async function getSessionProfile(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return null;

  const [result] = await db
    .select({ profile: profiles, sessionId: sessions.id })
    .from(sessions)
    .innerJoin(profiles, eq(sessions.profileId, profiles.identityId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return result || null;
}

export async function deleteSession(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}
