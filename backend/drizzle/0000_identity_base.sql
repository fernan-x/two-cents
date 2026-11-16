CREATE TYPE "public"."auth_method" AS ENUM('password', 'apple', 'google');--> statement-breakpoint
CREATE TYPE "public"."device_platform" AS ENUM('ios', 'android', 'web');--> statement-breakpoint
CREATE TYPE "public"."email_token_purpose" AS ENUM('confirm_email', 'reset_password', 'link_account', 'cancel_deletion');--> statement-breakpoint
CREATE TYPE "public"."security_event_type" AS ENUM('signup', 'login_succeeded', 'login_failed', 'account_locked', 'password_reset_requested', 'password_reset', 'email_confirmed', 'session_revoked', 'identity_linked', 'deletion_requested', 'deletion_cancelled', 'account_deleted', 'breach_check_unavailable', 'email_delivery_failed');--> statement-breakpoint
CREATE TYPE "public"."session_revoked_reason" AS ENUM('logout', 'revoked_by_user', 'password_changed', 'reuse_detected', 'provider_revoked', 'account_deletion');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'pending_deletion');--> statement-breakpoint
CREATE TABLE "email_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "email_token_purpose" NOT NULL,
	"token_hash" text NOT NULL,
	"pending_link_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "email_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"session_id" uuid,
	"type" "security_event_type" NOT NULL,
	"ip_hash" text,
	"user_agent_family" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"auth_method" "auth_method" NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"previous_refresh_token_hash" text,
	"device_name" text NOT NULL,
	"device_platform" "device_platform" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone NOT NULL,
	"reauth_token_hash" text,
	"reauth_expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_reason" "session_revoked_reason",
	CONSTRAINT "sessions_refresh_token_hash_unique" UNIQUE("refresh_token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_normalized" text NOT NULL,
	"email_confirmed_at" timestamp with time zone,
	"email_deliverable" boolean DEFAULT true NOT NULL,
	"first_name" text NOT NULL,
	"avatar_key" text NOT NULL,
	"color_key" text NOT NULL,
	"locale" text NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"password_hash" text,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"deletion_requested_at" timestamp with time zone,
	"deletion_scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "users_email_normalized_unique" UNIQUE("email_normalized")
);
--> statement-breakpoint
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_tokens_user_purpose_idx" ON "email_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "security_events_user_idx" ON "security_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_active_user_idx" ON "sessions" USING btree ("user_id") WHERE "sessions"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "sessions_previous_refresh_idx" ON "sessions" USING btree ("previous_refresh_token_hash");