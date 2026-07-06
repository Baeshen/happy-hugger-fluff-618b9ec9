-- Integration tests for RLS policies on public.appointments
-- Runs inside a single transaction that is ROLLED BACK at the end.
-- Simulates PostgREST role + JWT via SET LOCAL role / request.jwt.claims.
--
-- Usage: psql -v ON_ERROR_STOP=1 -f tests/rls/appointments.rls.sql

\set QUIET on
\pset pager off
BEGIN;

-- ── Test fixtures ────────────────────────────────────────────────────────────
-- Temporarily drop the FK on user_roles so we can seed synthetic role rows
-- without creating real auth.users (all changes rolled back at end).
ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_user_id_fkey;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'reception');

-- Seed one existing appointment (as service role / superuser) to test read/update/delete paths.
INSERT INTO public.appointments (id, patient_name, patient_phone, appointment_date, appointment_time, status)
VALUES ('44444444-4444-4444-4444-444444444444', 'Seed Patient', '0500000000',
        current_date + 1, '10:00', 'new');

-- ── Helper: pretty assertions ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.assert(cond boolean, label text) RETURNS void AS $$
BEGIN
  IF cond THEN
    RAISE NOTICE '  ✓ %', label;
  ELSE
    RAISE EXCEPTION '  ✗ FAIL: %', label;
  END IF;
END $$ LANGUAGE plpgsql;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1) ANON role
-- ═════════════════════════════════════════════════════════════════════════════
\echo '── anon ──'
SET LOCAL role = 'anon';

-- 1a. valid INSERT succeeds; status forced to 'new' and notes wiped by trigger
DO $$
DECLARE new_id uuid;
BEGIN
  INSERT INTO public.appointments
    (patient_name, patient_phone, appointment_date, appointment_time, status, notes)
  VALUES ('Ali', '0512345678', current_date + 2, '11:00', 'confirmed', 'staff-only note')
  RETURNING id INTO new_id;
  PERFORM pg_temp.assert(new_id IS NOT NULL, 'anon can INSERT valid appointment');
  PERFORM pg_temp.assert(
    (SELECT status::text FROM public.appointments WHERE id = new_id) = 'new',
    'trigger forces status=new for anon insert');
  PERFORM pg_temp.assert(
    (SELECT notes FROM public.appointments WHERE id = new_id) IS NULL,
    'trigger clears notes for anon insert');
END $$;

-- 1b. INSERT with invalid phone rejected by policy WITH CHECK
DO $$
BEGIN
  BEGIN
    INSERT INTO public.appointments (patient_name, patient_phone, appointment_date, appointment_time)
    VALUES ('X', '12', current_date + 2, '11:00');
    PERFORM pg_temp.assert(false, 'anon INSERT with short phone must fail');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    PERFORM pg_temp.assert(true, 'anon INSERT with short phone rejected');
  END;
END $$;

-- 1c. INSERT with past date rejected
DO $$
BEGIN
  BEGIN
    INSERT INTO public.appointments (patient_name, patient_phone, appointment_date, appointment_time)
    VALUES ('Ali', '0512345678', current_date - 1, '11:00');
    PERFORM pg_temp.assert(false, 'anon INSERT with past date must fail');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    PERFORM pg_temp.assert(true, 'anon INSERT with past date rejected');
  END;
END $$;

-- 1d. anon SELECT returns 0 rows (RLS blocks staff-only policy)
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.appointments;
  PERFORM pg_temp.assert(n = 0, 'anon SELECT returns 0 rows');
END $$;

-- 1e. anon UPDATE affects 0 rows
DO $$
DECLARE n int;
BEGIN
  UPDATE public.appointments SET status = 'cancelled' WHERE true;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.assert(n = 0, 'anon UPDATE affects 0 rows');
END $$;

-- 1f. anon DELETE affects 0 rows
DO $$
DECLARE n int;
BEGIN
  DELETE FROM public.appointments;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.assert(n = 0, 'anon DELETE affects 0 rows');
END $$;

RESET role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2) AUTHENTICATED without staff role (regular patient)
-- ═════════════════════════════════════════════════════════════════════════════
\echo '── authenticated (no staff role) ──'
SET LOCAL role = 'authenticated';
SET LOCAL "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.appointments;
  PERFORM pg_temp.assert(n = 0, 'patient SELECT returns 0 rows');

  UPDATE public.appointments SET status = 'cancelled' WHERE true;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.assert(n = 0, 'patient UPDATE affects 0 rows');

  DELETE FROM public.appointments;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.assert(n = 0, 'patient DELETE affects 0 rows');
END $$;

RESET role;
RESET "request.jwt.claims";

-- ═════════════════════════════════════════════════════════════════════════════
-- 3) RECEPTION role
-- ═════════════════════════════════════════════════════════════════════════════
\echo '── reception ──'
SET LOCAL role = 'authenticated';
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.appointments;
  PERFORM pg_temp.assert(n >= 1, 'reception can SELECT appointments');

  UPDATE public.appointments SET status = 'confirmed'
   WHERE id = '44444444-4444-4444-4444-444444444444';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.assert(n = 1, 'reception can UPDATE appointment');

  -- Reception is NOT allowed to delete
  DELETE FROM public.appointments WHERE id = '44444444-4444-4444-4444-444444444444';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.assert(n = 0, 'reception DELETE affects 0 rows (admin-only)');
END $$;

RESET role;
RESET "request.jwt.claims";

-- ═════════════════════════════════════════════════════════════════════════════
-- 4) ADMIN role
-- ═════════════════════════════════════════════════════════════════════════════
\echo '── admin ──'
SET LOCAL role = 'authenticated';
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.appointments;
  PERFORM pg_temp.assert(n >= 1, 'admin can SELECT appointments');

  UPDATE public.appointments SET status = 'completed'
   WHERE id = '44444444-4444-4444-4444-444444444444';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.assert(n = 1, 'admin can UPDATE appointment');

  DELETE FROM public.appointments WHERE id = '44444444-4444-4444-4444-444444444444';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.assert(n = 1, 'admin can DELETE appointment');
END $$;

RESET role;
RESET "request.jwt.claims";

\echo ''
\echo '✅ All RLS tests passed for public.appointments'

ROLLBACK;
