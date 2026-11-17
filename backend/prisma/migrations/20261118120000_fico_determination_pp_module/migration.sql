-- FICO: account determination covers every module that posts automatically.
-- Widen the module guard from (MM, SD) to (MM, SD, PP). Existing rows stay valid.

ALTER TABLE "fico_account_determination_rules"
    DROP CONSTRAINT "fico_determination_rules_module_check";

ALTER TABLE "fico_account_determination_rules"
    ADD CONSTRAINT "fico_determination_rules_module_check"
    CHECK ("sourceModule" IN ('MM', 'SD', 'PP'));
