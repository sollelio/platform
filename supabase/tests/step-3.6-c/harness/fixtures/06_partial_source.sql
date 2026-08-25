-- P0 · a partial legacy source: a tenant present, memberships absent.
insert into public.tenants
  (id, slug, nome, prefixo, locale, moeda, estado, criado_em)
values
  ('cb563908-7939-494e-bbe4-1e83af4d693a', 'casa-sintetica', 'Casa Sintetica',
   'SYN', 'pt-PT', 'EUR', 'activo', timestamptz '2019-03-04 05:06:07+00');
