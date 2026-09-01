ALTER TABLE "messages" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "client_events_created_idx" ON "client_events" ("created_at");--> statement-breakpoint
CREATE INDEX "conversation_members_profile_idx" ON "conversation_members" ("profile_id");--> statement-breakpoint
CREATE INDEX "friendships_friend_idx" ON "friendships" ("friend_id");--> statement-breakpoint
CREATE INDEX "message_reports_message_idx" ON "message_reports" ("message_id");--> statement-breakpoint
CREATE INDEX "messages_sender_idx" ON "messages" ("sender_id");--> statement-breakpoint
CREATE INDEX "rate_limits_window_idx" ON "rate_limits" ("window_started_at");--> statement-breakpoint
CREATE INDEX "sessions_profile_idx" ON "sessions" ("profile_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" ("expires_at");--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_idx" ON "user_blocks" ("blocked_id");