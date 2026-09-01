import { boolean, index, integer, primaryKey, text, timestamp, uniqueIndex, uuid, pgTable } from "drizzle-orm/pg-core";

export const profiles = pgTable("profiles", {
  identityId: text("identity_id").primaryKey(),
  username: text("username").unique(),
  passwordHash: text("password_hash"),
  recoveryCodeHash: text("recovery_code_hash"),
  friendCode: text("friend_code").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordUpdatedAt: timestamp("password_updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* Gli indici sulle chiavi esterne non sono decorativi: senza, ogni "onDelete:
   cascade" costringe Postgres a scandire per intero la tabella figlia, e la
   pulizia periodica delle sessioni scadute fa lo stesso su expires_at. */
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  profileId: text("profile_id").notNull().references(() => profiles.identityId, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("sessions_profile_idx").on(table.profileId),
  index("sessions_expires_at_idx").on(table.expiresAt),
]);

export const friendships = pgTable(
  "friendships",
  {
    ownerId: text("owner_id").notNull().references(() => profiles.identityId, { onDelete: "cascade" }),
    friendId: text("friend_id").notNull().references(() => profiles.identityId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.friendId] }),
    index("friendships_friend_idx").on(table.friendId),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name"),
    isGroup: boolean("is_group").notNull().default(false),
    directKey: text("direct_key"),
    createdBy: text("created_by").notNull().references(() => profiles.identityId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("conversations_direct_key_unique").on(table.directKey)],
);

export const conversationMembers = pgTable(
  "conversation_members",
  {
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    profileId: text("profile_id").notNull().references(() => profiles.identityId, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.profileId] }),
    // La chiave primaria ordina prima per conversazione: per cercare "tutte le
    // conversazioni di questo profilo" non serve, come un elenco telefonico
    // ordinato per cognome non aiuta a trovare tutti i Marco.
    index("conversation_members_profile_idx").on(table.profileId),
  ],
);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull().references(() => profiles.identityId, { onDelete: "cascade" }),
  body: text("body").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  // Valorizzata quando abbastanza persone diverse segnalano lo stesso
  // messaggio. Separata da deleted_at perche' li' significa "l'autore l'ha
  // ritirato", e le due cose vanno distinte se qualcuno le rilegge.
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("messages_conversation_created_idx").on(table.conversationId, table.createdAt),
  index("messages_sender_idx").on(table.senderId),
]);

export const userBlocks = pgTable(
  "user_blocks",
  {
    ownerId: text("owner_id").notNull().references(() => profiles.identityId, { onDelete: "cascade" }),
    blockedId: text("blocked_id").notNull().references(() => profiles.identityId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.blockedId] }),
    index("user_blocks_blocked_idx").on(table.blockedId),
  ],
);

export const conversationReads = pgTable(
  "conversation_reads",
  {
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    profileId: text("profile_id").notNull().references(() => profiles.identityId, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.conversationId, table.profileId] })],
);

export const messageReports = pgTable(
  "message_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
    reporterId: text("reporter_id").notNull().references(() => profiles.identityId, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("message_reports_reporter_message_unique").on(table.reporterId, table.messageId),
    index("message_reports_message_idx").on(table.messageId),
  ],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("rate_limits_window_idx").on(table.windowStartedAt)]);

export const clientEvents = pgTable("client_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
  path: text("path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("client_events_created_idx").on(table.createdAt)]);
