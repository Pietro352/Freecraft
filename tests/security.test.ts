import assert from "node:assert/strict";
import test from "node:test";
import { createRecoveryCode, hashPassword, hashSecret, normalizeRecoveryCode, passwordError, verifyPassword } from "../lib/security.ts";

test("password policy rejects weak values", () => {
  assert.match(passwordError("short1") || "", /8 caratteri/);
  assert.match(passwordError("sololetttere") || "", /lettera e un numero/);
  assert.equal(passwordError("Roccia42!"), null);
});

test("password hashes verify without storing plaintext", () => {
  const hash = hashPassword("Roccia42!");
  assert.notEqual(hash, "Roccia42!");
  assert.equal(verifyPassword("Roccia42!", hash), true);
  assert.equal(verifyPassword("Sbagliata42!", hash), false);
});

test("recovery codes are normalized and hashable", () => {
  const code = createRecoveryCode();
  assert.match(code, /^RCV-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(hashSecret(normalizeRecoveryCode(code.toLowerCase())), hashSecret(code));
});
