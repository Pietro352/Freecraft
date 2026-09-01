CREATE TABLE "client_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_reads" (
	"conversation_id" uuid,
	"profile_id" text,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_reads_pkey" PRIMARY KEY("conversation_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "message_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"message_id" uuid NOT NULL,
	"reporter_id" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY,
	"attempts" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"owner_id" text,
	"blocked_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_pkey" PRIMARY KEY("owner_id","blocked_id")
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "recovery_code_hash" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "password_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "message_reports_reporter_message_unique" ON "message_reports" ("reporter_id","message_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" ("conversation_id","created_at");--> statement-breakpoint
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_profile_id_profiles_identity_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("identity_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_message_id_messages_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_reporter_id_profiles_identity_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "profiles"("identity_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_owner_id_profiles_identity_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("identity_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_profiles_identity_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "profiles"("identity_id") ON DELETE CASCADE;