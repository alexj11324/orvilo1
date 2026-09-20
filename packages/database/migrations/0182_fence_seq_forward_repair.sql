-- Controlled forward repair for `integration_leases.fence_seq`.
--
-- 0179 adds this column, but databases that saw the pre-fix journal (where
-- 0179's `when` preceded 0178's) may have skipped it forever: a deploy that
-- applied 0180/0181 raised `created_at` past 0179's timestamp, so the
-- migrator never selects 0179 again on those environments. This entry
-- converges them — it adds the column only when absent, and when the column
-- already exists it verifies the definition itself rather than trusting the
-- name. A column with the right name but a divergent shape fails loudly
-- instead of masquerading as applied (see
-- docs/development/migration-journal-integrity.md for the field matrix).
DO $$
DECLARE
  col record;
BEGIN
  SELECT data_type, is_nullable, column_default
    INTO col
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'integration_leases'
     AND column_name = 'fence_seq';
  IF NOT FOUND THEN
    ALTER TABLE "integration_leases" ADD COLUMN "fence_seq" bigint DEFAULT 0 NOT NULL;
  ELSIF col.data_type <> 'bigint' OR col.is_nullable <> 'NO' OR col.column_default <> '0' THEN
    RAISE EXCEPTION
      'integration_leases.fence_seq diverges from the schema definition (type=%, nullable=%, default=%) — repair it deliberately before migrating further',
      col.data_type, col.is_nullable, col.column_default;
  END IF;
END $$;
