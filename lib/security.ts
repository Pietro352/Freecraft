import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const normalizeName = (name: unknown) => String(name || "").trim().toLowerCase();

export const passwordError = (password: unknown) => {
  const value = String(password || "");
  if (value.length < 8) return "La password deve avere almeno 8 caratteri.";
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return "Usa almeno una lettera e un numero.";
  return null;
};

export const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

export const verifyPassword = (password: string, stored: string) => {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const storedBuffer = Buffer.from(hash, "hex");
  const candidate = scryptSync(password, salt, storedBuffer.length);
  return storedBuffer.length === candidate.length && timingSafeEqual(storedBuffer, candidate);
};

export const hashSecret = (value: string) => createHash("sha256").update(value).digest("hex");

/* Confronto a tempo costante fra due segreti gia' passati da hashSecret.
   Con "!==" JavaScript si ferma al primo carattere diverso, quindi il tempo di
   risposta racconta quanti caratteri iniziali erano giusti. */
export const secretsMatch = (left: string, right: string) => {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
};

export const createRecoveryCode = () => {
  const bytes = randomBytes(12);
  const value = Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]).join("");
  return `RCV-${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8)}`;
};

export const normalizeRecoveryCode = (value: unknown) => String(value || "").trim().toUpperCase();
