CREATE TYPE "public"."payment_method" AS ENUM('personal_card', 'joint_card', 'meal_voucher', 'cash', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."recurring_skip_reason" AS ENUM('month_closed');--> statement-breakpoint
CREATE TYPE "public"."txn_origin" AS ENUM('quick_add', 'edit_form', 'paid_as_planned', 'recurring', 'import');--> statement-breakpoint
ALTER TYPE "public"."change_cause" ADD VALUE 'recurring';--> statement-breakpoint
ALTER TYPE "public"."change_cause" ADD VALUE 'paid_as_planned';--> statement-breakpoint
ALTER TYPE "public"."change_entity" ADD VALUE 'transaction';--> statement-breakpoint
ALTER TYPE "public"."change_entity" ADD VALUE 'settlement';--> statement-breakpoint
ALTER TYPE "public"."change_entity" ADD VALUE 'recurring_rule';--> statement-breakpoint
CREATE TABLE "bank_csv_mapping" (
	"id" uuid PRIMARY KEY NOT NULL,
	"budget_id" uuid NOT NULL,
	"header_fingerprint" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "recurring_skip" (
	"rule_id" uuid NOT NULL,
	"scheduled_date" date NOT NULL,
	"reason" "recurring_skip_reason" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "recurring_skip_rule_id_scheduled_date_pk" PRIMARY KEY("rule_id","scheduled_date")
);
--> statement-breakpoint
CREATE TABLE "recurring_txn_rule" (
	"id" uuid PRIMARY KEY NOT NULL,
	"budget_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"day_of_month" smallint NOT NULL,
	"payer_membership_id" uuid,
	"payment_method" "payment_method" NOT NULL,
	"series_id" uuid,
	"is_shared" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"starts_on" date NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "recurring_txn_rule_label_length" CHECK (char_length(btrim("recurring_txn_rule"."label")) BETWEEN 1 AND 60),
	CONSTRAINT "recurring_txn_rule_amount_range" CHECK ("recurring_txn_rule"."amount_minor" BETWEEN 1 AND 100000000),
	CONSTRAINT "recurring_txn_rule_day" CHECK ("recurring_txn_rule"."day_of_month" BETWEEN 1 AND 31),
	CONSTRAINT "recurring_txn_rule_joint_card" CHECK ("recurring_txn_rule"."payment_method" <> 'joint_card' OR "recurring_txn_rule"."payer_membership_id" IS NULL),
	CONSTRAINT "recurring_txn_rule_member_methods" CHECK ("recurring_txn_rule"."payment_method" NOT IN ('personal_card', 'meal_voucher') OR "recurring_txn_rule"."payer_membership_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "settlement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"budget_id" uuid NOT NULL,
	"month_id" uuid NOT NULL,
	"from_membership_id" uuid NOT NULL,
	"to_membership_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	CONSTRAINT "settlement_positive" CHECK ("settlement"."amount_minor" > 0),
	CONSTRAINT "settlement_distinct" CHECK ("settlement"."from_membership_id" <> "settlement"."to_membership_id")
);
--> statement-breakpoint
CREATE TABLE "suggestion_stat" (
	"budget_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"day" date NOT NULL,
	"kept" integer DEFAULT 0 NOT NULL,
	"changed" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "suggestion_stat_budget_id_membership_id_day_pk" PRIMARY KEY("budget_id","membership_id","day")
);
--> statement-breakpoint
CREATE TABLE "txn_part" (
	"id" uuid PRIMARY KEY NOT NULL,
	"txn_id" uuid NOT NULL,
	"line_id" uuid,
	"sub_item_id" uuid,
	"amount_minor" bigint NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "txn_part_non_zero" CHECK ("txn_part"."amount_minor" <> 0)
);
--> statement-breakpoint
CREATE TABLE "txn_receipt" (
	"id" uuid PRIMARY KEY NOT NULL,
	"txn_id" uuid NOT NULL,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	CONSTRAINT "txn_receipt_type" CHECK ("txn_receipt"."content_type" = 'image/jpeg'),
	CONSTRAINT "txn_receipt_size" CHECK (octet_length("txn_receipt"."bytes") <= 1048576)
);
--> statement-breakpoint
CREATE TABLE "txn" (
	"id" uuid PRIMARY KEY NOT NULL,
	"budget_id" uuid NOT NULL,
	"month_id" uuid NOT NULL,
	"date" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"is_refund" boolean DEFAULT false NOT NULL,
	"label" text NOT NULL,
	"label_normalized" text NOT NULL,
	"payer_membership_id" uuid,
	"payment_method" "payment_method" NOT NULL,
	"is_planned" boolean NOT NULL,
	"planned_set_by_hand" boolean DEFAULT false NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"note" text,
	"origin" "txn_origin" NOT NULL,
	"recurring_rule_id" uuid,
	"scheduled_date" date,
	"import_key" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "txn_amount_non_zero" CHECK ("txn"."amount_minor" <> 0),
	CONSTRAINT "txn_amount_range" CHECK ("txn"."amount_minor" BETWEEN -100000000 AND 100000000),
	CONSTRAINT "txn_refund_sign" CHECK (("txn"."amount_minor" < 0) = "txn"."is_refund"),
	CONSTRAINT "txn_label_length" CHECK (char_length(btrim("txn"."label")) BETWEEN 1 AND 60),
	CONSTRAINT "txn_note_length" CHECK ("txn"."note" IS NULL OR char_length("txn"."note") <= 500),
	CONSTRAINT "txn_joint_card" CHECK ("txn"."payment_method" <> 'joint_card' OR "txn"."payer_membership_id" IS NULL),
	CONSTRAINT "txn_member_methods" CHECK ("txn"."payment_method" NOT IN ('personal_card', 'meal_voucher') OR "txn"."payer_membership_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "income_line" ADD COLUMN "is_meal_voucher" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_csv_mapping" ADD CONSTRAINT "bank_csv_mapping_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_csv_mapping" ADD CONSTRAINT "bank_csv_mapping_updated_by_membership_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_skip" ADD CONSTRAINT "recurring_skip_rule_id_recurring_txn_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."recurring_txn_rule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_txn_rule" ADD CONSTRAINT "recurring_txn_rule_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_txn_rule" ADD CONSTRAINT "recurring_txn_rule_payer_membership_id_membership_id_fk" FOREIGN KEY ("payer_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_txn_rule" ADD CONSTRAINT "recurring_txn_rule_created_by_membership_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_txn_rule" ADD CONSTRAINT "recurring_txn_rule_updated_by_membership_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_month_id_budget_month_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."budget_month"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_from_membership_id_membership_id_fk" FOREIGN KEY ("from_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_to_membership_id_membership_id_fk" FOREIGN KEY ("to_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement" ADD CONSTRAINT "settlement_created_by_membership_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_stat" ADD CONSTRAINT "suggestion_stat_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_stat" ADD CONSTRAINT "suggestion_stat_membership_id_membership_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."membership"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "txn_part" ADD CONSTRAINT "txn_part_txn_id_txn_id_fk" FOREIGN KEY ("txn_id") REFERENCES "public"."txn"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "txn_part" ADD CONSTRAINT "txn_part_line_id_budget_line_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."budget_line"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "txn_part" ADD CONSTRAINT "txn_part_sub_item_id_envelope_sub_item_id_fk" FOREIGN KEY ("sub_item_id") REFERENCES "public"."envelope_sub_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "txn_receipt" ADD CONSTRAINT "txn_receipt_txn_id_txn_id_fk" FOREIGN KEY ("txn_id") REFERENCES "public"."txn"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "txn_receipt" ADD CONSTRAINT "txn_receipt_created_by_membership_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "txn" ADD CONSTRAINT "txn_budget_id_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "txn" ADD CONSTRAINT "txn_month_id_budget_month_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."budget_month"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "txn" ADD CONSTRAINT "txn_payer_membership_id_membership_id_fk" FOREIGN KEY ("payer_membership_id") REFERENCES "public"."membership"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "txn" ADD CONSTRAINT "txn_recurring_rule_id_recurring_txn_rule_id_fk" FOREIGN KEY ("recurring_rule_id") REFERENCES "public"."recurring_txn_rule"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "txn" ADD CONSTRAINT "txn_created_by_membership_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "txn" ADD CONSTRAINT "txn_updated_by_membership_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."membership"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_csv_mapping_unique" ON "bank_csv_mapping" USING btree ("budget_id","header_fingerprint");--> statement-breakpoint
CREATE INDEX "recurring_txn_rule_budget_idx" ON "recurring_txn_rule" USING btree ("budget_id");--> statement-breakpoint
CREATE INDEX "settlement_month_idx" ON "settlement" USING btree ("month_id");--> statement-breakpoint
CREATE INDEX "txn_part_txn_idx" ON "txn_part" USING btree ("txn_id");--> statement-breakpoint
CREATE INDEX "txn_part_line_idx" ON "txn_part" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "txn_receipt_txn_idx" ON "txn_receipt" USING btree ("txn_id");--> statement-breakpoint
CREATE INDEX "txn_month_idx" ON "txn" USING btree ("month_id","date","id");--> statement-breakpoint
CREATE INDEX "txn_budget_created_idx" ON "txn" USING btree ("budget_id","created_at");--> statement-breakpoint
CREATE INDEX "txn_budget_label_idx" ON "txn" USING btree ("budget_id","label_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "txn_recurring_once" ON "txn" USING btree ("recurring_rule_id","scheduled_date") WHERE "txn"."recurring_rule_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "txn_import_key_unique" ON "txn" USING btree ("budget_id","import_key") WHERE "txn"."import_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "income_line" ADD CONSTRAINT "income_line_meal_voucher_not_counted" CHECK (NOT "income_line"."is_meal_voucher" OR NOT "income_line"."counts_toward_household");--> statement-breakpoint
-- Σ parts = transaction amount, and at most one unassigned part, checked at commit
-- (spec 004 FR-006, Principle I). Last line of defence behind the shared domain check.
CREATE FUNCTION txn_check_parts_sum() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target uuid;
  txn_amount bigint;
  parts_count integer;
  parts_total bigint;
  unassigned_count integer;
BEGIN
  IF TG_TABLE_NAME = 'txn' THEN
    target := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    target := OLD.txn_id;
  ELSE
    target := NEW.txn_id;
  END IF;
  SELECT amount_minor INTO txn_amount FROM txn WHERE id = target;
  IF txn_amount IS NULL THEN
    RETURN NULL; -- the transaction itself was deleted
  END IF;
  SELECT count(*), coalesce(sum(amount_minor), 0), count(*) FILTER (WHERE line_id IS NULL)
    INTO parts_count, parts_total, unassigned_count
    FROM txn_part WHERE txn_id = target;
  IF parts_count > 0 AND parts_total <> txn_amount THEN
    RAISE EXCEPTION 'txn % parts do not add up to its amount', target -- no amounts in messages (Principle III)
      USING ERRCODE = 'check_violation';
  END IF;
  IF unassigned_count > 1 AND TG_TABLE_NAME = 'txn_part' AND TG_OP = 'INSERT' THEN
    -- A line deleted later may leave several unassigned parts (ON DELETE SET NULL); only new rows are refused.
    RAISE EXCEPTION 'txn % has more than one unassigned part', target
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER txn_part_sum
  AFTER INSERT OR UPDATE OR DELETE ON txn_part
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION txn_check_parts_sum();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER txn_amount_sum
  AFTER INSERT OR UPDATE OF amount_minor ON txn
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION txn_check_parts_sum();
