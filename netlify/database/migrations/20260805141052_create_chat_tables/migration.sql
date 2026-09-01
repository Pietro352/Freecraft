CREATE TABLE "conversation_members" (
	"conversation_id" uuid,
	"profile_id" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_members_pkey" PRIMARY KEY("conversation_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text,
	"is_group" boolean DEFAULT false NOT NULL,
	"direct_key" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"owner_id" text,
	"friend_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_pkey" PRIMARY KEY("owner_id","friend_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"conversation_id" uuid NOT NULL,
	"sender_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"identity_id" text PRIMARY KEY,
	"friend_code" text NOT NULL UNIQUE,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_direct_key_unique" ON "conversations" ("direct_key");--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_profile_id_profiles_identity_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("identity_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_profiles_identity_id_fkey" FOREIGN KEY ("created_by") REFERENCES "profiles"("identity_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_owner_id_profiles_identity_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("identity_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_friend_id_profiles_identity_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "profiles"("identity_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_profiles_identity_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "profiles"("identity_id") ON DELETE CASCADE;