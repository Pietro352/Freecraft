import assert from "node:assert/strict";
import test from "node:test";

import { rateLimitKey, rateLimitVerdict } from "../lib/rate-limit-policy.ts";
import { secretsMatch } from "../lib/security.ts";

test("counters in different scopes never share a budget", () => {
  // Un tentativo di accesso fallito non deve consumare il budget delle
  // registrazioni dello stesso indirizzo, altrimenti sbagliare la password tre
  // volte impedirebbe di creare un account.
  assert.notEqual(rateLimitKey("login", "1.2.3.4"), rateLimitKey("signup", "1.2.3.4"));
  assert.notEqual(rateLimitKey("login", "1.2.3.4"), rateLimitKey("login:ip", "1.2.3.4"));

  // Lo stesso tentativo, dalla stessa provenienza, deve invece finire sempre
  // nello stesso contatore: e' l'unico motivo per cui il limite funziona.
  assert.equal(rateLimitKey("login", "1.2.3.4"), rateLimitKey("login", "1.2.3.4"));
});

test("the counter key does not carry addresses or names in the clear", () => {
  const key = rateLimitKey("login", "1.2.3.4:mariorossi");
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.ok(!key.includes("1.2.3.4"));
  assert.ok(!key.includes("mariorossi"));
});

test("the limit allows exactly as many attempts as it promises", () => {
  const window = 15 * 60_000;
  const started = new Date(1_700_000_000_000);
  const now = started.getTime() + 1_000;

  for (let attempt = 1; attempt <= 8; attempt++) {
    const verdict = rateLimitVerdict(attempt, started, 8, window, now);
    assert.equal(verdict.allowed, true, `attempt ${attempt} should still pass`);
    assert.equal(verdict.retryAfter, 0);
  }
  assert.equal(rateLimitVerdict(9, started, 8, window, now).allowed, false);
});

test("a blocked attempt always names a wait longer than zero", () => {
  const window = 60_000;
  const started = new Date(1_700_000_000_000);

  // Un secondo prima della scadenza: resta poco, ma "riprova fra 0 secondi"
  // sarebbe un invito a ripartire subito in cerchio.
  const almostOver = rateLimitVerdict(99, started, 5, window, started.getTime() + 59_999);
  assert.equal(almostOver.allowed, false);
  assert.ok(almostOver.retryAfter >= 1, `retryAfter was ${almostOver.retryAfter}`);

  // Finestra gia' scaduta secondo l'orologio locale: non deve uscire un numero
  // negativo, che il browser mostrerebbe come "riprova tra -3 secondi".
  const stale = rateLimitVerdict(99, started, 5, window, started.getTime() + 5 * window);
  assert.ok(stale.retryAfter >= 1, `retryAfter was ${stale.retryAfter}`);
});

test("the wait never exceeds the window, even with a skewed clock", () => {
  const window = 30 * 60_000;
  const started = new Date(1_700_000_000_000);

  // Le funzioni serverless non condividono un orologio con il database. Se la
  // finestra risultasse iniziata nel futuro, senza il limite l'attesa
  // annunciata crescerebbe oltre la durata della finestra stessa.
  const skewed = rateLimitVerdict(99, new Date(started.getTime() + 10 * window), 5, window, started.getTime());
  assert.ok(skewed.retryAfter <= Math.ceil(window / 1000), `retryAfter was ${skewed.retryAfter}`);
});

test("secret comparison rejects a prefix of the right value", () => {
  // Il confronto e' a tempo costante e parte dalla lunghezza: passare un
  // prefisso non deve poter far dedurre quanti caratteri erano giusti.
  assert.equal(secretsMatch("abcdef", "abcdef"), true);
  assert.equal(secretsMatch("abcdef", "abcde"), false);
  assert.equal(secretsMatch("abcdef", "abcdeg"), false);
  assert.equal(secretsMatch("", ""), true);
  assert.equal(secretsMatch("abcdef", ""), false);
});
