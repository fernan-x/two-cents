CREATE TYPE "public"."invitation_kind" AS ENUM('email', 'code');--> statement-breakpoint
CREATE TYPE "public"."invitation_role" AS ENUM('admin', 'member', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'declined', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."membership_event_type" AS ENUM('budget_created', 'joined', 'role_changed', 'ownership_transferred', 'removed', 'left', 'invitation_sent', 'invitation_revoked', 'settings_changed', 'budget_deleted', 'budget_restored');--> statement-breakpoint
CREATE TYPE "public"."membership_left_reason" AS ENUM('left', 'removed', 'account_deleted');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'admin', 'member', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."push_platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TABLE "budget_month_start_rule" (
	"budget_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"start_day" smallint NOT NULL,
	CONSTRAINT "budget_month_start_rule_budget_id_effective_from_pk" PRIMARY KEY("budget_id","effective_from"),
	CONSTRAINT "start_day_range" CHECK ("budget_month_start_rule"."start_day" BETWEEN 1 AND 28)
);
--> statement-breakpoint
CREATE TABLE "budget" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"currency" char(3) NOT NULL,
	"time_zone" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "budget_name_length" CHECK (char_length(btrim("budget"."name")) BETWEEN 1 AND 60),
	CONSTRAINT "budget_currency_iso" CHECK ("budget"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"budget_id" uuid NOT NULL,
	"kind" "invitation_kind" NOT NULL,
	"email_normalized" text,
	"role" "invitation_role" DEFAULT 'member' NOT NULL,
	"code_hash" "bytea" NOT NULL,
	"invited_by" uuid,
	"inviter_name_snapshot" text NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"last_sent_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"send_count" integer DEFAULT 1 NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	CONSTRAINT "invitation_email_required" CHECK ("invitation"."kind" = 'code' OR "invitation"."email_normalized" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "invite_code_failure" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"failed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_income" (
	"membership_id" uuid NOT NULL,
	"month_start" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "member_income_membership_id_month_start_pk" PRIMARY KEY("membership_id","month_start"),
	CONSTRAINT "member_income_non_negative" CHECK ("member_income"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "membership_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"budget_id" uuid NOT NULL,
	"type" "membership_event_type" NOT NULL,
	"actor_user_id" uuid,
	"target_membership_id" uuid,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY NOT NULL,
	"budget_id" uuid NOT NULL,
	"user_id" uuid,
	"display_name_snapshot" text,
	"role" "membership_role" NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"left_at" timestamp with time zone,
	"left_reason" "membership_left_reason",
	"last_opened_at" timestamp with time zone,
	CONSTRAINT "membership_owner_is_current" CHECK ("membership"."role" <> 'owner' OR "membership"."left_at" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "push_device" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"expo_push_token" text NOT NULL,
	"platform" "push_platform" NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "push_device_session_id_unique" UNIQUE("session_id"),
	CONSTRAINT "push_device_expo_push_token_unique" UNIQUE("expo_push_token")
);
--> statement-breakpoint
ALTER TABLE "budget_month_start_rule" ADD CONSTRAINT "budget_month_start_rule_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_code_failure" ADD CONSTRAINT "invite_code_failure_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_income" ADD CONSTRAINT "member_income_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_income" ADD CONSTRAINT "member_income_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_event" ADD CONSTRAINT "membership_event_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_event" ADD CONSTRAINT "membership_event_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_event" ADD CONSTRAINT "membership_event_target_membership_id_membership_id_fk" FOREIGN KEY ("target_membership_id") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_device" ADD CONSTRAINT "push_device_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_device" ADD CONSTRAINT "push_device_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_deleted_at_idx" ON "budget" USING btree ("deleted_at") WHERE "budget"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_one_pending_email" ON "invitation" USING btree ("budget_id","email_normalized") WHERE "invitation"."status" = 'pending' AND "invitation"."kind" = 'email';--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_pending_code" ON "invitation" USING btree ("code_hash") WHERE "invitation"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "invitation_budget_idx" ON "invitation" USING btree ("budget_id");--> statement-breakpoint
CREATE INDEX "invitation_invited_by_idx" ON "invitation" USING btree ("invited_by");--> statement-breakpoint
CREATE INDEX "invite_code_failure_user_idx" ON "invite_code_failure" USING btree ("user_id","failed_at");--> statement-breakpoint
CREATE INDEX "membership_event_budget_idx" ON "membership_event" USING btree ("budget_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_one_owner" ON "membership" USING btree ("budget_id") WHERE "membership"."role" = 'owner' AND "membership"."left_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_one_current_per_user" ON "membership" USING btree ("budget_id","user_id") WHERE "membership"."left_at" IS NULL;--> statement-breakpoint
CREATE INDEX "membership_user_idx" ON "membership" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_device_user_idx" ON "push_device" USING btree ("user_id");