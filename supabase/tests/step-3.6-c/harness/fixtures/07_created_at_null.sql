-- P15 · an auth user whose created_at is explicitly NULL.
-- The auth schema is NEVER altered to build this fixture: only a row is written.
\ir valid.sql
update auth.users set created_at = null
 where id = 'c0000000-0000-4000-8000-0000000000d2';
