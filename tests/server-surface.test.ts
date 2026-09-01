import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Questi controlli guardano la forma del codice, non il suo comportamento: le
// funzioni parlano con il database e qui una connessione non c'e'. Non provano
// che la chat funzioni, ma bloccano il ritorno di tre difetti che ci sono
// gia' stati, e che dal solo controllo dei tipi non si vedrebbero.

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("every chat action sits behind the session check", async () => {
  const source = await read("netlify/functions/chat.mts");
  const guard = source.indexOf("if (!session) return json");
  assert.ok(guard > 0, "the session check is gone");

  // Se qualcuno aggiungesse un'azione nuova sopra il controllo, quell'azione
  // sarebbe raggiungibile senza aver fatto l'accesso.
  const actions = [...source.matchAll(/action === "([a-z-]+)"/g)];
  assert.ok(actions.length >= 10, `ho riconosciuto solo ${actions.length} azioni: il controllo qui sotto non starebbe verificando niente`);
  for (const match of actions) {
    assert.ok(match.index! > guard, `l'azione "${match[1]}" e' scritta prima del controllo di sessione`);
  }
});

test("a message can only be deleted by whoever wrote it", async () => {
  const source = await read("netlify/functions/chat.mts");
  const branch = source.slice(source.indexOf('if (action === "delete-message")'));
  const body = branch.slice(0, branch.indexOf("\n    }"));

  // Senza il confronto sul mittente, chiunque conoscesse l'identificativo di un
  // messaggio potrebbe cancellare quello di un altro.
  assert.match(body, /message\.senderId !== profile\.identityId/);
  assert.match(body, /403/);
});

test("login, signup and recovery each count attempts per account and per address", async () => {
  const source = await read("netlify/functions/auth.mts");

  // Contare solo per account lascia passare chi prova una password su mille
  // account diversi; contare solo per indirizzo blocca un'intera famiglia che
  // condivide la stessa linea. Servono entrambi, e infatti limited() prende due
  // soglie: una per il nome utente, una per la provenienza.
  assert.match(source, /const limited = async \([^)]*ipLimit: number/s);
  const calls = [...source.matchAll(/await limited\(([^;]*?)\);/gs)];
  assert.equal(calls.length, 3, `mi aspettavo tre punti d'ingresso protetti, ne ho trovati ${calls.length}`);
  for (const [, args] of calls) {
    const numbers = args.match(/\b\d+\b/g) ?? [];
    assert.equal(numbers.length, 3, `questa chiamata non passa soglia account, soglia indirizzo e minuti: ${args.trim()}`);
  }
});

test("the attempt counter stays a single atomic statement", async () => {
  const source = await read("lib/rate-limit.ts");

  // Leggere il contatore e riscriverlo con due query lascia in mezzo l'istante
  // in cui cento richieste parallele leggono tutte lo stesso valore e passano
  // tutte. Il conteggio deve avvenire dentro il database, in un colpo solo.
  assert.match(source, /onConflictDoUpdate/);
  assert.match(source, /attempts: sql`case when/);
  assert.ok(!/await db[\s\S]*await db/.test(source), "ci sono due query: il conteggio non e' piu' atomico");

  // now() del database, non l'orologio della funzione: istanze diverse hanno
  // orologi diversi e uno scarto basta a far ripartire la finestra in anticipo.
  assert.ok(!source.includes("new Date()"), "la finestra usa l'orologio della funzione invece di quello del database");
});

test("the launcher policy is identical on both its paths and never reaches the game page", async () => {
  const config = await read("netlify.toml");

  // La stessa policy e' scritta due volte, per "/" e per "/index.html", perche'
  // in netlify.toml non esistono variabili. Se le due copie divergessero, la
  // stessa pagina avrebbe regole diverse a seconda di come viene aperta.
  const policies = [...config.matchAll(/^Content-Security-Policy = "(.*)"$/gm)].map(([, value]) => value);
  assert.equal(policies.length, 2, `mi aspettavo due copie della policy, ne ho trovate ${policies.length}`);
  assert.equal(policies[0], policies[1], "le due copie della Content-Security-Policy sono diverse");

  // E soprattutto: nessuna delle due deve finire su /freecraft/*. Il client di
  // gioco e' un unico file generato pieno di script scritti dentro la pagina, e
  // "script-src 'self'" lo bloccherebbe in partenza, schermo nero.
  const blocks = config.split(/^\[\[headers\]\]$/m).slice(1);
  for (const block of blocks) {
    const target = /^for = "(.*)"$/m.exec(block)?.[1] ?? "";
    // La riga di assegnazione, non una menzione qualsiasi: i commenti che
    // spiegano la policy vivono sopra il blocco a cui si riferiscono.
    if (!/^Content-Security-Policy = /m.test(block)) continue;
    assert.ok(
      target === "/" || target === "/index.html",
      `la Content-Security-Policy e' applicata a "${target}", che non e' la pagina del launcher`,
    );
  }
});
