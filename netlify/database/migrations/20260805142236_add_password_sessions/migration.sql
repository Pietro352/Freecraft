CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"token_hash" text NOT NULL UNIQUE,
	"profile_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_username_key" UNIQUE("username");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_profile_id_profiles_identity_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("identity_id") ON DELETE CASCADE;