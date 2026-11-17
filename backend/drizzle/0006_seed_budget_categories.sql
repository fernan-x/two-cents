-- Every new budget starts with the 10 default categories (FR-014). A trigger keeps spec 002's
-- CreateBudget independent of the planning module.
CREATE FUNCTION budget_seed_categories() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO budget_category (id, budget_id, system_key, name, position)
  SELECT gen_random_uuid(), NEW.id, k.key::category_system_key, NULL, k.pos
  FROM (VALUES ('housing', 0), ('food', 1), ('transport', 2), ('pets', 3), ('leisure', 4),
               ('health', 5), ('subscriptions', 6), ('savings', 7), ('gifts', 8), ('other', 9)) AS k(key, pos);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER budget_seed_categories AFTER INSERT ON budget
  FOR EACH ROW EXECUTE FUNCTION budget_seed_categories();
