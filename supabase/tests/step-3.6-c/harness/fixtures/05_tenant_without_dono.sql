-- P12 · a tenant whose every membership is gestor: nobody would hold owner.
\ir valid.sql
update public.memberships set papel = 'gestor'
 where user_id = 'c0000000-0000-4000-8000-0000000000d1';
