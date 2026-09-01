import type { Config, Context } from "@netlify/functions";
import { and, asc, count, desc, eq, gt, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  conversationMembers,
  conversationReads,
  conversations,
  friendships,
  messageReports,
  messages,
  profiles,
  userBlocks,
} from "../../db/schema.js";
import { consumeRateLimit } from "../../lib/rate-limit.js";
import { getSessionProfile } from "../../lib/session.js";

const json = (data: unknown, status = 200, headers?: HeadersInit) => Response.json(data, { status, headers });

/* Quante persone diverse devono segnalare lo stesso messaggio perche' sparisca
   da solo. L'indice unico su (reporter_id, message_id) garantisce che siano
   davvero persone diverse e non la stessa che insiste. */
const REPORT_HIDE_THRESHOLD = 2;

/* Le soglie sono larghe di proposito: qui dentro ci sono amici e parenti, non
   traffico anonimo. Servono a impedire che uno script lasciato girare tutta la
   notte riempia il database, non a contare i messaggi di nessuno. */
const throttle = async (context: Context, profileId: string, scope: string, limit: number, minutes: number) => {
  const result = await consumeRateLimit(scope, `${context.ip || "unknown"}:${profileId}`, limit, minutes * 60_000);
  if (result.allowed) return null;
  return json(
    { error: "Stai andando troppo veloce. Riprova fra un momento." },
    429,
    { "Retry-After": String(result.retryAfter) },
  );
};

async function requireMember(conversationId: string, profileId: string) {
  const [membership] = await db.select().from(conversationMembers).where(and(
    eq(conversationMembers.conversationId, conversationId),
    eq(conversationMembers.profileId, profileId),
  )).limit(1);
  return Boolean(membership);
}

async function blockRelations(profileId: string) {
  return db.select().from(userBlocks).where(or(
    eq(userBlocks.ownerId, profileId),
    eq(userBlocks.blockedId, profileId),
  ));
}

async function isBlockedBetween(firstId: string, secondId: string) {
  const [blocked] = await db.select().from(userBlocks).where(or(
    and(eq(userBlocks.ownerId, firstId), eq(userBlocks.blockedId, secondId)),
    and(eq(userBlocks.ownerId, secondId), eq(userBlocks.blockedId, firstId)),
  )).limit(1);
  return Boolean(blocked);
}

/* Tutti i blocchi fra un profilo e un gruppo di altri, in una query sola.
   Chiamare isBlockedBetween dentro un ciclo significava una query per ogni
   membro, in fila una dopo l'altra, prima di poter spedire un messaggio. */
async function blockedAmong(profileId: string, others: string[]) {
  const targets = [...new Set(others.filter((id) => id && id !== profileId))];
  if (!targets.length) return new Set<string>();
  const rows = await db.select().from(userBlocks).where(or(
    and(eq(userBlocks.ownerId, profileId), inArray(userBlocks.blockedId, targets)),
    and(inArray(userBlocks.ownerId, targets), eq(userBlocks.blockedId, profileId)),
  ));
  return new Set(rows.map((row) => (row.ownerId === profileId ? row.blockedId : row.ownerId)));
}

async function bootstrap(profileId: string) {
  const [profile] = await db.select().from(profiles).where(eq(profiles.identityId, profileId)).limit(1);
  const relations = await blockRelations(profileId);
  const blockedEitherWay = new Set(relations.map((item) => item.ownerId === profileId ? item.blockedId : item.ownerId));
  const ownBlockedIds = relations.filter((item) => item.ownerId === profileId).map((item) => item.blockedId);

  const friendsRaw = await db
    .select({ id: profiles.identityId, displayName: profiles.displayName, friendCode: profiles.friendCode })
    .from(friendships)
    .innerJoin(profiles, eq(friendships.friendId, profiles.identityId))
    .where(eq(friendships.ownerId, profileId))
    .orderBy(asc(profiles.displayName));
  const friends = friendsRaw.filter((friend) => !blockedEitherWay.has(friend.id));

  const blockedUsers = ownBlockedIds.length
    ? await db.select({ id: profiles.identityId, displayName: profiles.displayName })
      .from(profiles).where(inArray(profiles.identityId, ownBlockedIds)).orderBy(asc(profiles.displayName))
    : [];

  const memberships = await db.select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.profileId, profileId));
  const ids = memberships.map((membership) => membership.conversationId);
  if (!ids.length) return { profile, friends, blockedUsers, conversations: [] };

  const rows = await db.select().from(conversations).where(inArray(conversations.id, ids)).orderBy(desc(conversations.updatedAt));
  const members = await db
    .select({ conversationId: conversationMembers.conversationId, id: profiles.identityId, displayName: profiles.displayName })
    .from(conversationMembers)
    .innerJoin(profiles, eq(conversationMembers.profileId, profiles.identityId))
    .where(inArray(conversationMembers.conversationId, ids));

  const visibleRows = rows.filter((conversation) => {
    if (conversation.isGroup) return true;
    const other = members.find((member) => member.conversationId === conversation.id && member.id !== profileId);
    return !other || !blockedEitherWay.has(other.id);
  });

  const visibleIds = visibleRows.map((conversation) => conversation.id);
  if (!visibleIds.length) return { profile, friends, blockedUsers, conversations: [] };

  /* Prima qui c'erano tre query per ogni conversazione: con venti chat aperte
     erano sessanta viaggi al database ogni volta che si apriva il pannello, e
     il conto cresceva con l'uso. Adesso sono due query in tutto, qualunque sia
     il numero di conversazioni. */
  const [latestMessages, unreadCounts] = await Promise.all([
    db.selectDistinctOn([messages.conversationId], {
      conversationId: messages.conversationId,
      body: messages.body,
      senderId: messages.senderId,
      senderName: profiles.displayName,
      createdAt: messages.createdAt,
      deletedAt: messages.deletedAt,
      hiddenAt: messages.hiddenAt,
    })
      .from(messages)
      .innerJoin(profiles, eq(messages.senderId, profiles.identityId))
      .where(inArray(messages.conversationId, visibleIds))
      .orderBy(messages.conversationId, desc(messages.createdAt)),

    db.select({ conversationId: messages.conversationId, value: count() })
      .from(messages)
      .leftJoin(conversationReads, and(
        eq(conversationReads.conversationId, messages.conversationId),
        eq(conversationReads.profileId, profileId),
      ))
      .where(and(
        inArray(messages.conversationId, visibleIds),
        ne(messages.senderId, profileId),
        isNull(messages.deletedAt),
        isNull(messages.hiddenAt),
        // Chi non ha mai aperto la chat non ha una riga in conversation_reads:
        // 'epoch' fa contare tutto come non letto, come faceva new Date(0).
        sql`${messages.createdAt} > coalesce(${conversationReads.lastReadAt}, 'epoch'::timestamptz)`,
      ))
      .groupBy(messages.conversationId),
  ]);

  const latestByConversation = new Map(latestMessages.map((message) => [message.conversationId, message]));
  const unreadByConversation = new Map(unreadCounts.map((row) => [row.conversationId, Number(row.value || 0)]));

  const enriched = visibleRows.map((conversation) => {
    const latestMessage = latestByConversation.get(conversation.id);
    return {
      ...conversation,
      members: members.filter((member) => member.conversationId === conversation.id),
      unreadCount: unreadByConversation.get(conversation.id) || 0,
      latestMessage: latestMessage ? {
        ...latestMessage,
        body: latestMessage.deletedAt
          ? "Messaggio eliminato"
          : latestMessage.hiddenAt
            ? "Messaggio nascosto dopo le segnalazioni"
            : latestMessage.body,
      } : null,
    };
  });

  return { profile, friends, blockedUsers, conversations: enriched };
}

export default async (request: Request, context: Context) => {
  const session = await getSessionProfile(request);
  if (!session) return json({ error: "Accedi per usare la chat." }, 401);

  try {
    const profile = session.profile;
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "bootstrap";

    if (request.method === "GET" && action === "bootstrap") return json(await bootstrap(profile.identityId));

    if (request.method === "GET" && action === "updates") {
      const checkedAt = new Date();
      const afterValue = url.searchParams.get("after");
      const after = afterValue ? new Date(afterValue) : null;
      if (!after || Number.isNaN(after.getTime())) return json({ messages: [], checkedAt: checkedAt.toISOString() });
      const ownBlocks = await db.select({ id: userBlocks.blockedId }).from(userBlocks).where(eq(userBlocks.ownerId, profile.identityId));
      const blockedIds = new Set(ownBlocks.map((item) => item.id));

      // Ne chiediamo 21 per sapere se ce n'erano piu' di 20: in quel caso il
      // segnaposto si ferma sull'ultimo messaggio davvero consegnato invece di
      // saltare a "adesso", altrimenti quelli rimasti in mezzo non sarebbero
      // mai stati annunciati a nessuno.
      const rows = await db
        .select({
          id: messages.id,
          conversationId: messages.conversationId,
          body: messages.body,
          createdAt: messages.createdAt,
          senderId: messages.senderId,
          senderName: profiles.displayName,
        })
        .from(messages)
        .innerJoin(conversationMembers, and(
          eq(conversationMembers.conversationId, messages.conversationId),
          eq(conversationMembers.profileId, profile.identityId),
        ))
        .innerJoin(profiles, eq(messages.senderId, profiles.identityId))
        .where(and(
          gt(messages.createdAt, after),
          lte(messages.createdAt, checkedAt),
          ne(messages.senderId, profile.identityId),
          isNull(messages.deletedAt),
          isNull(messages.hiddenAt),
        ))
        .orderBy(asc(messages.createdAt))
        .limit(21);
      const truncated = rows.length > 20;
      const page = rows.slice(0, 20);
      const cursor = truncated && page.length ? page[page.length - 1]!.createdAt : checkedAt;
      return json({
        messages: page.filter((message) => !blockedIds.has(message.senderId)),
        checkedAt: cursor.toISOString(),
        more: truncated,
      });
    }

    if (request.method === "GET" && action === "messages") {
      const conversationId = url.searchParams.get("conversationId") || "";
      if (!conversationId || !(await requireMember(conversationId, profile.identityId))) return json({ error: "Chat non accessibile." }, 403);
      const beforeValue = url.searchParams.get("before");
      const before = beforeValue ? new Date(beforeValue) : null;
      const conditions = [eq(messages.conversationId, conversationId)];
      if (before && !Number.isNaN(before.getTime())) conditions.push(lt(messages.createdAt, before));
      const rows = await db.select({
        id: messages.id,
        body: messages.body,
        createdAt: messages.createdAt,
        senderId: messages.senderId,
        senderName: profiles.displayName,
        deletedAt: messages.deletedAt,
        hiddenAt: messages.hiddenAt,
      }).from(messages)
        .innerJoin(profiles, eq(messages.senderId, profiles.identityId))
        .where(and(...conditions))
        .orderBy(desc(messages.createdAt))
        .limit(51);
      const ownBlocks = await db.select({ id: userBlocks.blockedId }).from(userBlocks).where(eq(userBlocks.ownerId, profile.identityId));
      const blockedIds = new Set(ownBlocks.map((item) => item.id));
      const page = rows.slice(0, 50).reverse().map((message) => ({
        ...message,
        body: message.deletedAt
          ? "Messaggio eliminato"
          : message.hiddenAt
            ? "Messaggio nascosto dopo le segnalazioni"
            : blockedIds.has(message.senderId)
              ? "Messaggio nascosto: utente bloccato"
              : message.body,
        hidden: blockedIds.has(message.senderId) || Boolean(message.hiddenAt),
      }));
      return json({ messages: page, hasMore: rows.length > 50, nextCursor: page[0]?.createdAt || null });
    }

    if (request.method !== "POST") return json({ error: "Metodo non consentito." }, 405);
    const body = await request.json();

    if (action === "friend") {
      const throttled = await throttle(context, profile.identityId, "chat-friend", 20, 5);
      if (throttled) return throttled;
      const code = String(body.friendCode || "").trim().toUpperCase();
      const [target] = await db.select().from(profiles).where(eq(profiles.friendCode, code)).limit(1);
      if (!target) return json({ error: "Nessun Crafter trovato con questo ID." }, 404);
      if (target.identityId === profile.identityId) return json({ error: "Non puoi aggiungere te stesso." }, 400);
      if (await isBlockedBetween(profile.identityId, target.identityId)) return json({ error: "Non puoi aggiungere questo utente." }, 403);
      await db.transaction(async (tx) => {
        await tx.insert(friendships).values([
          { ownerId: profile.identityId, friendId: target.identityId },
          { ownerId: target.identityId, friendId: profile.identityId },
        ]).onConflictDoNothing();
      });
      return json({ friend: { id: target.identityId, displayName: target.displayName, friendCode: target.friendCode } }, 201);
    }

    if (action === "direct") {
      const throttled = await throttle(context, profile.identityId, "chat-direct", 30, 5);
      if (throttled) return throttled;
      const targetId = String(body.friendId || "");
      if (await isBlockedBetween(profile.identityId, targetId)) return json({ error: "Chat non disponibile con questo utente." }, 403);
      const [friendship] = await db.select().from(friendships).where(and(
        eq(friendships.ownerId, profile.identityId),
        eq(friendships.friendId, targetId),
      )).limit(1);
      if (!friendship) return json({ error: "Aggiungi prima questo utente agli amici." }, 403);
      const directKey = [profile.identityId, targetId].sort().join(":");
      let [conversation] = await db.select().from(conversations).where(eq(conversations.directKey, directKey)).limit(1);
      if (!conversation) {
        const [created] = await db.insert(conversations).values({ createdBy: profile.identityId, directKey })
          .onConflictDoNothing({ target: conversations.directKey }).returning();
        if (created) {
          conversation = created;
          await db.insert(conversationMembers).values([
            { conversationId: created.id, profileId: profile.identityId },
            { conversationId: created.id, profileId: targetId },
          ]).onConflictDoNothing();
        } else {
          [conversation] = await db.select().from(conversations).where(eq(conversations.directKey, directKey)).limit(1);
        }
      }
      return json({ conversation }, 201);
    }

    if (action === "group") {
      const throttled = await throttle(context, profile.identityId, "chat-group", 10, 60);
      if (throttled) return throttled;
      const name = String(body.name || "").trim().slice(0, 40);
      const requestedIds = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
      if (name.length < 2) return json({ error: "Dai un nome al gruppo." }, 400);
      if (!requestedIds.length) return json({ error: "Seleziona almeno un amico." }, 400);
      const allowed = await db.select({ id: friendships.friendId }).from(friendships).where(and(
        eq(friendships.ownerId, profile.identityId),
        inArray(friendships.friendId, requestedIds),
      ));
      const blocked = await blockedAmong(profile.identityId, allowed.map((item) => item.id));
      const allowedUnblocked = allowed.map((item) => item.id).filter((id) => !blocked.has(id));
      const memberIds = [...new Set([profile.identityId, ...allowedUnblocked])];
      const [conversation] = await db.transaction(async (tx) => {
        const [created] = await tx.insert(conversations).values({ name, isGroup: true, createdBy: profile.identityId }).returning();
        await tx.insert(conversationMembers).values(memberIds.map((profileId) => ({ conversationId: created.id, profileId })));
        return [created];
      });
      return json({ conversation }, 201);
    }

    if (action === "message") {
      const rate = await consumeRateLimit("chat-message", `${context.ip || "unknown"}:${profile.identityId}`, 30, 60_000);
      if (!rate.allowed) return json({ error: "Stai inviando troppi messaggi. Aspetta qualche secondo." }, 429, { "Retry-After": String(rate.retryAfter) });
      const conversationId = String(body.conversationId || "");
      const messageBody = String(body.body || "").trim().slice(0, 1000);
      if (!messageBody) return json({ error: "Scrivi un messaggio." }, 400);
      if (!(await requireMember(conversationId, profile.identityId))) return json({ error: "Chat non accessibile." }, 403);
      const members = await db.select({ profileId: conversationMembers.profileId }).from(conversationMembers)
        .where(eq(conversationMembers.conversationId, conversationId));
      const blockedMembers = await blockedAmong(profile.identityId, members.map((member) => member.profileId));
      if (blockedMembers.size) {
        return json({ error: "Non puoi scrivere in questa chat perché contiene un utente bloccato." }, 403);
      }
      const now = new Date();
      const [message] = await db.transaction(async (tx) => {
        const inserted = await tx.insert(messages).values({ conversationId, senderId: profile.identityId, body: messageBody }).returning();
        await tx.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, conversationId));
        return inserted;
      });
      return json({ message: { ...message, senderName: profile.displayName } }, 201);
    }

    if (action === "read") {
      const conversationId = String(body.conversationId || "");
      if (!(await requireMember(conversationId, profile.identityId))) return json({ error: "Chat non accessibile." }, 403);
      const lastReadAt = new Date();
      await db.insert(conversationReads).values({ conversationId, profileId: profile.identityId, lastReadAt })
        .onConflictDoUpdate({
          target: [conversationReads.conversationId, conversationReads.profileId],
          set: { lastReadAt },
        });
      return json({ ok: true, lastReadAt });
    }

    if (action === "delete-message") {
      const messageId = String(body.messageId || "");
      const [message] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
      if (!message || message.senderId !== profile.identityId) return json({ error: "Puoi eliminare solo i tuoi messaggi." }, 403);
      await db.update(messages).set({ body: "", deletedAt: new Date() }).where(eq(messages.id, messageId));
      return json({ ok: true });
    }

    if (action === "report") {
      const throttled = await throttle(context, profile.identityId, "chat-report", 20, 60);
      if (throttled) return throttled;
      const messageId = String(body.messageId || "");
      const reason = String(body.reason || "Altro").trim().slice(0, 120);
      const [message] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
      if (!message || !(await requireMember(message.conversationId, profile.identityId))) return json({ error: "Messaggio non accessibile." }, 403);
      if (message.senderId === profile.identityId) return json({ error: "Non puoi segnalare un tuo messaggio." }, 400);
      await db.insert(messageReports).values({ messageId, reporterId: profile.identityId, reason }).onConflictDoNothing();

      /* Le segnalazioni finivano in una tabella che nessuno legge: per chi
         segnalava, il pulsante non faceva niente. Al secondo segnalatore
         diverso il messaggio sparisce per tutti, senza aspettare che qualcuno
         apra il database. */
      const [reports] = await db.select({ value: count() }).from(messageReports)
        .where(eq(messageReports.messageId, messageId));
      const total = Number(reports?.value || 0);
      const hide = total >= REPORT_HIDE_THRESHOLD && !message.hiddenAt;
      if (hide) await db.update(messages).set({ hiddenAt: new Date() }).where(eq(messages.id, messageId));
      return json({ ok: true, hidden: hide || Boolean(message.hiddenAt), reports: total }, 201);
    }

    if (action === "block") {
      const throttled = await throttle(context, profile.identityId, "chat-block", 30, 60);
      if (throttled) return throttled;
      const targetId = String(body.profileId || "");
      if (!targetId || targetId === profile.identityId) return json({ error: "Utente non valido." }, 400);
      await db.transaction(async (tx) => {
        await tx.insert(userBlocks).values({ ownerId: profile.identityId, blockedId: targetId }).onConflictDoNothing();
        await tx.delete(friendships).where(or(
          and(eq(friendships.ownerId, profile.identityId), eq(friendships.friendId, targetId)),
          and(eq(friendships.ownerId, targetId), eq(friendships.friendId, profile.identityId)),
        ));
      });
      return json({ ok: true }, 201);
    }

    if (action === "unblock") {
      const targetId = String(body.profileId || "");
      await db.delete(userBlocks).where(and(eq(userBlocks.ownerId, profile.identityId), eq(userBlocks.blockedId, targetId)));
      return json({ ok: true });
    }

    return json({ error: "Azione non trovata." }, 404);
  } catch (error) {
    console.error("[chat]", error instanceof Error ? error.message : "unknown error");
    return json({ error: "La chat non è disponibile in questo momento." }, 500);
  }
};

export const config: Config = { path: "/api/chat" };
