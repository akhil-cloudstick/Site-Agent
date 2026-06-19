-- Verifies the one-active-ChangeSet-per-Site DB guarantee
-- (partial unique index one_blocking_changeset_per_tenant).
-- Runs entirely inside a transaction that is ROLLED BACK, so it leaves no data.
-- Usage: psql "<DATABASE_URL>" -f scripts/verify-changeset-index.sql
BEGIN;
DO $$
DECLARE tid integer;
BEGIN
  INSERT INTO tenants (name, slug, status, updated_at, created_at)
    VALUES ('ZZ_verify', 'zz_verify_tenant', 'active', now(), now())
    RETURNING id INTO tid;

  -- First active ChangeSet for the tenant: allowed.
  INSERT INTO changesets (tenant_id, status, kind, updated_at, created_at)
    VALUES (tid, 'active', 'content', now(), now());
  RAISE NOTICE 'PASS: first active changeset accepted';

  -- Second blocking (active) ChangeSet for the SAME tenant: must be rejected.
  BEGIN
    INSERT INTO changesets (tenant_id, status, kind, updated_at, created_at)
      VALUES (tid, 'active', 'content', now(), now());
    RAISE EXCEPTION 'FAIL: a second active changeset was allowed — the partial unique index is not enforcing';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS: second active changeset rejected by the partial unique index';
  END;

  -- A terminal (published) ChangeSet for the same tenant: allowed (not in blocking set).
  INSERT INTO changesets (tenant_id, status, kind, updated_at, created_at)
    VALUES (tid, 'published', 'content', now(), now());
  RAISE NOTICE 'PASS: published (terminal) changeset allowed alongside an active one';
END $$;
ROLLBACK;
