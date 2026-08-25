-- P2 · a tenant carrying estado = 'encerrado', deliberately unmapped: the
-- target requires a non-null closed_at and legacy records no closure instant.
\ir valid.sql
update public.tenants set estado = 'encerrado'
 where id = 'cb563908-7939-494e-bbe4-1e83af4d693a';
