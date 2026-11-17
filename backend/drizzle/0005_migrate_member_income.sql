-- 002's single monthly income becomes one primary income line per month (003 research R13).
-- Period end mirrors budgetMonthFor() in packages/shared/src/domain/budget-month.ts.
CREATE FUNCTION tmp_next_occurrence(d date, day int) RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN make_date(extract(year FROM d)::int, extract(month FROM d)::int, day) >= d
              THEN make_date(extract(year FROM d)::int, extract(month FROM d)::int, day)
              ELSE (make_date(extract(year FROM d)::int, extract(month FROM d)::int, day) + interval '1 month')::date END
$$;
--> statement-breakpoint
CREATE FUNCTION tmp_period_end(p_budget uuid, p_start date) RETURNS date LANGUAGE plpgsql AS $$
DECLARE
  first_rule date;
  rule record;
  next_from date;
  result date;
BEGIN
  SELECT min(effective_from) INTO first_rule FROM budget_month_start_rule WHERE budget_id = p_budget;
  SELECT * INTO rule FROM budget_month_start_rule
    WHERE budget_id = p_budget AND (effective_from <= p_start OR effective_from = first_rule)
    ORDER BY (effective_from <= p_start) DESC, effective_from DESC LIMIT 1;
  SELECT min(effective_from) INTO next_from FROM budget_month_start_rule
    WHERE budget_id = p_budget AND effective_from > rule.effective_from;
  IF rule.effective_from <> first_rule AND p_start = rule.effective_from THEN
    result := tmp_next_occurrence(p_start + 15, rule.start_day) - 1; -- transition month
  ELSE
    result := (p_start + interval '1 month')::date - 1;
  END IF;
  IF next_from IS NOT NULL AND result >= next_from THEN
    result := next_from - 1;
  END IF;
  RETURN result;
END;
$$;
--> statement-breakpoint
INSERT INTO budget_month (id, budget_id, period_start, period_end, status, revision, created_from, created_at, created_by)
SELECT gen_random_uuid(), m.budget_id, mi.month_start, tmp_period_end(m.budget_id, mi.month_start),
       'draft', 0, 'income', min(mi.updated_at), NULL
FROM member_income mi
JOIN membership m ON m.id = mi.membership_id
GROUP BY m.budget_id, mi.month_start
ON CONFLICT (budget_id, period_start) DO NOTHING;
--> statement-breakpoint
INSERT INTO income_line (id, month_id, membership_id, label, amount_minor, currency, counts_toward_household,
                         to_confirm, is_primary, position, version, created_at, created_by, updated_at, updated_by)
SELECT gen_random_uuid(), bm.id, mi.membership_id, NULL, mi.amount_minor, mi.currency, true,
       false, true, 0, 1, mi.updated_at, mi.membership_id, mi.updated_at, mi.membership_id
FROM member_income mi
JOIN membership m ON m.id = mi.membership_id
JOIN budget_month bm ON bm.budget_id = m.budget_id AND bm.period_start = mi.month_start;
--> statement-breakpoint
DROP FUNCTION tmp_period_end(uuid, date);
--> statement-breakpoint
DROP FUNCTION tmp_next_occurrence(date, int);
--> statement-breakpoint
DROP TABLE "member_income" CASCADE;
