-- P3 · a membership carrying papel = 'equipa', which has no v2 role.
\ir valid.sql
update public.memberships set papel = 'equipa'
 where user_id = 'c0000000-0000-4000-8000-0000000000d2';
