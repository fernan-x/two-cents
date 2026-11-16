CREATE TYPE "public"."identity_provider" AS ENUM('apple', 'google');--> statement-breakpoint
CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "identity_provider" NOT NULL,
	"provider_subject" text NOT NULL,
	"provider_email" text,
	"is_private_relay" boolean DEFAULT false NOT NULL,
	"apple_refresh_token_enc" "bytea",
	"created_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_identities_provider_subject_uq" UNIQUE("provider","provider_subject"),
	CONSTRAINT "auth_identities_user_provider_uq" UNIQUE("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "pending_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "identity_provider" NOT NULL,
	"provider_subject" text NOT NULL,
	"provider_email" text NOT NULL,
	"is_private_relay" boolean DEFAULT false NOT NULL,
	"apple_refresh_token_enc" "bytea",
	"link_token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pending_links_link_token_hash_unique" UNIQUE("link_token_hash")
);
--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_links" ADD CONSTRAINT "pending_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_pending_link_id_pending_links_id_fk" FOREIGN KEY ("pending_link_id") REFERENCES "public"."pending_links"("id") ON DELETE cascade ON UPDATE no action;