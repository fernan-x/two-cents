CREATE TYPE "public"."category_system_key" AS ENUM('housing', 'food', 'transport', 'pets', 'leisure', 'health', 'subscriptions', 'savings', 'gifts', 'other');--> statement-breakpoint
CREATE TYPE "public"."change_action" AS ENUM('created', 'updated', 'deleted', 'reordered', 'activated', 'closed', 'reopened', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."change_cause" AS ENUM('user', 'propagation', 'recompute', 'import', 'system');--> statement-breakpoint
CREATE TYPE "public"."change_entity" AS ENUM('line', 'income', 'month', 'order');--> statement-breakpoint
CREATE TYPE "public"."line_group" AS ENUM('personal', 'recurring_shared', 'one_off_shared');--> statement-breakpoint
CREATE TYPE "public"."line_kind" AS ENUM('expense', 'savings');--> statement-breakpoint
CREATE TYPE "public"."month_created_from" AS ENUM('previous', 'month', 'template', 'scratch', 'import', 'income');--> statement-breakpoint
CREATE TYPE "public"."month_status" AS ENUM('draft', 'active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."split_mode" AS ENUM('custom', 'equal', 'proportional', 'one_payer');--> statement-breakpoint
CREATE TABLE "budget_category" (
	"id" uuid PRIMARY KEY NOT NULL,
	"budget_id" uuid NOT NULL,
	"system_key" "category_system_key",
	"name" text,
	"position" integer NOT NULL,
	CONSTRAINT "budget_category_named" CHECK ("budget_category"."system_key" IS NOT NULL OR "budget_category"."name" IS NOT NULL),
	CONSTRAINT "budget_category_name_length" CHECK ("budget_category"."name" IS NULL OR char_length(btrim("budget_category"."name")) BETWEEN 1 AND 40)
);
--> statement-breakpoint
CREATE TABLE "budget_line_share" (
	"line_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	CONSTRAINT "budget_line_share_line_id_membership_id_pk" PRIMARY KEY("line_id","membership_id"),
	CONSTRAINT "budget_line_share_non_negative" CHECK ("budget_line_share"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "budget_line" (
	"id" uuid PRIMARY KEY NOT NULL,
	"month_id" uuid NOT NULL,
	"budget_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"group" "line_group" NOT NULL,
	"kind" "line_kind" DEFAULT 'expense' NOT NULL,
	"label" text NOT NULL,
	"category_id" uuid,
	"is_envelope" boolean DEFAULT false NOT NULL,
	"owner_membership_id" uuid,
	"is_private" boolean DEFAULT false NOT NULL,
	"split_mode" "split_mode",
	"payer_membership_id" uuid,
	"total_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"formula" jsonb,
	"position" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"hand_edited" boolean DEFAULT false NOT NULL,
	"usual" jsonb,
	"needs_review" boolean DEFAULT false NOT NULL,
	"needs_income" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "budget_line_personal_owner" CHECK (("budget_line"."group" = 'personal') = ("budget_line"."owner_membership_id" IS NOT NULL)),
	CONSTRAINT "budget_line_personal_split" CHECK (("budget_line"."group" = 'personal') = ("budget_line"."split_mode" IS NULL)),
	CONSTRAINT "budget_line_private_personal" CHECK (NOT "budget_line"."is_private" OR "budget_line"."group" = 'personal'),
	CONSTRAINT "budget_line_one_payer" CHECK (("budget_line"."split_mode" IS NOT DISTINCT FROM 'one_payer') = ("budget_line"."payer_membership_id" IS NOT NULL)),
	CONSTRAINT "budget_line_label_length" CHECK (char_length(btrim("budget_line"."label")) BETWEEN 1 AND 60),
	CONSTRAINT "budget_line_total_range" CHECK ("budget_line"."total_minor" BETWEEN 0 AND 100000000)
);
--> statement-breakpoint
CREATE TABLE "budget_month" (
	"id" uuid PRIMARY KEY NOT NULL,
	"budget_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" "month_status" DEFAULT 'draft' NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"created_from" "month_created_from" NOT NULL,
	"source_month_id" uuid,
	"source_template_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"activated_at" timestamp with time zone,
	"activated_by" uuid,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"closed_summary" jsonb,
	CONSTRAINT "budget_month_period_order" CHECK ("budget_month"."period_end" >= "budget_month"."period_start"),
	CONSTRAINT "budget_month_closed_summary" CHECK (("budget_month"."status" = 'closed') = ("budget_month"."closed_summary" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "envelope_sub_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"line_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount_minor" bigint,
	"position" integer NOT NULL,
	CONSTRAINT "envelope_sub_item_label_length" CHECK (char_length(btrim("envelope_sub_item"."label")) BETWEEN 1 AND 40),
	CONSTRAINT "envelope_sub_item_non_negative" CHECK ("envelope_sub_item"."amount_minor" IS NULL OR "envelope_sub_item"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "income_line" (
	"id" uuid PRIMARY KEY NOT NULL,
	"month_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"label" text,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"counts_toward_household" boolean DEFAULT true NOT NULL,
	"to_confirm" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "income_line_amount_range" CHECK ("income_line"."amount_minor" BETWEEN 0 AND 100000000),
	CONSTRAINT "income_line_label_length" CHECK ("income_line"."label" IS NULL OR char_length(btrim("income_line"."label")) BETWEEN 1 AND 40)
);
--> statement-breakpoint
CREATE TABLE "month_change" (
	"id" uuid PRIMARY KEY NOT NULL,
	"month_id" uuid NOT NULL,
	"actor_membership_id" uuid,
	"cause" "change_cause" NOT NULL,
	"entity" "change_entity" NOT NULL,
	"entity_id" uuid,
	"action" "change_action" NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"owner_membership_id" uuid,
	"label_snapshot" text,
	"changes" jsonb NOT NULL,
	"month_status" "month_status" NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "month_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"budget_id" uuid NOT NULL,
	"name" text NOT NULL,
	"lines" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "month_template_name_length" CHECK (char_length(btrim("month_template"."name")) BETWEEN 1 AND 60)
);
--> statement-breakpoint
ALTER TABLE "budget_category" ADD CONSTRAINT "budget_category_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line_share" ADD CONSTRAINT "budget_line_share_line_id_budget_line_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."budget_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line_share" ADD CONSTRAINT "budget_line_share_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_month_id_budget_month_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."budget_month"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_category_id_budget_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."budget_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_owner_membership_id_membership_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_payer_membership_id_membership_id_fk" FOREIGN KEY ("payer_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_created_by_membership_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_updated_by_membership_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_month" ADD CONSTRAINT "budget_month_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_month" ADD CONSTRAINT "budget_month_source_template_id_month_template_id_fk" FOREIGN KEY ("source_template_id") REFERENCES "public"."month_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_month" ADD CONSTRAINT "budget_month_created_by_membership_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_month" ADD CONSTRAINT "budget_month_activated_by_membership_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_month" ADD CONSTRAINT "budget_month_closed_by_membership_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envelope_sub_item" ADD CONSTRAINT "envelope_sub_item_line_id_budget_line_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."budget_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_line" ADD CONSTRAINT "income_line_month_id_budget_month_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."budget_month"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_line" ADD CONSTRAINT "income_line_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_line" ADD CONSTRAINT "income_line_created_by_membership_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_line" ADD CONSTRAINT "income_line_updated_by_membership_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_change" ADD CONSTRAINT "month_change_month_id_budget_month_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."budget_month"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_change" ADD CONSTRAINT "month_change_actor_membership_id_membership_id_fk" FOREIGN KEY ("actor_membership_id") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_template" ADD CONSTRAINT "month_template_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_template" ADD CONSTRAINT "month_template_created_by_membership_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_category_budget_idx" ON "budget_category" USING btree ("budget_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_category_name_unique" ON "budget_category" USING btree ("budget_id",lower("name")) WHERE "budget_category"."name" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "budget_line_month_idx" ON "budget_line" USING btree ("month_id","group","position");--> statement-breakpoint
CREATE INDEX "budget_line_series_idx" ON "budget_line" USING btree ("budget_id","series_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_month_period_unique" ON "budget_month" USING btree ("budget_id","period_start");--> statement-breakpoint
CREATE INDEX "envelope_sub_item_line_idx" ON "envelope_sub_item" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "income_line_month_idx" ON "income_line" USING btree ("month_id");--> statement-breakpoint
CREATE UNIQUE INDEX "income_line_one_primary" ON "income_line" USING btree ("month_id","membership_id") WHERE "income_line"."is_primary";--> statement-breakpoint
CREATE INDEX "month_change_month_idx" ON "month_change" USING btree ("month_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "month_template_name_unique" ON "month_template" USING btree ("budget_id",lower("name"));--> statement-breakpoint
-- Σ shares = line total, checked at commit (research R6, Principle I). Last line of defence behind the domain check.
CREATE FUNCTION budget_line_check_shares_sum() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target uuid;
  line_total bigint;
  shares_total bigint;
BEGIN
  IF TG_TABLE_NAME = 'budget_line' THEN
    target := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    target := OLD.line_id;
  ELSE
    target := NEW.line_id;
  END IF;
  SELECT total_minor INTO line_total FROM budget_line WHERE id = target;
  IF line_total IS NULL THEN
    RETURN NULL; -- the line itself was deleted
  END IF;
  SELECT coalesce(sum(amount_minor), 0) INTO shares_total FROM budget_line_share WHERE line_id = target;
  IF shares_total <> line_total THEN
    RAISE EXCEPTION 'budget_line % shares do not add up to its total', target -- no amounts in messages (Principle III)
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER budget_line_share_sum
  AFTER INSERT OR UPDATE OR DELETE ON budget_line_share
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION budget_line_check_shares_sum();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER budget_line_total_sum
  AFTER INSERT OR UPDATE OF total_minor ON budget_line
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION budget_line_check_shares_sum();
--> statement-breakpoint
-- Default categories for every existing budget (FR-014); new budgets are seeded by CreateBudget.
INSERT INTO budget_category (id, budget_id, system_key, name, position)
SELECT gen_random_uuid(), b.id, k.key::category_system_key, NULL, k.pos
FROM budget b
CROSS JOIN (VALUES ('housing', 0), ('food', 1), ('transport', 2), ('pets', 3), ('leisure', 4),
                   ('health', 5), ('subscriptions', 6), ('savings', 7), ('gifts', 8), ('other', 9)) AS k(key, pos);
