-- P13 · a tenant whose id is absent from the explicit §4.2 time-zone mapping.
insert into auth.users (id, raw_user_meta_data, created_at) values
  ('c0000000-0000-4000-8000-0000000000e1',
   '{"nome": "Sintetico Nao Mapeado"}'::jsonb, timestamptz '2020-01-02 03:04:05+00');
insert into public.tenants
  (id, slug, nome, prefixo, locale, moeda, estado, criado_em)
values
  ('cb563908-7939-494e-bbe4-1e83af4d6999', 'casa-nao-mapeada', 'Casa Nao Mapeada',
   'SYNX', 'pt-PT', 'EUR', 'activo', timestamptz '2019-03-04 05:06:07+00');
insert into public.memberships (user_id, tenant_id, papel, criado_em) values
  ('c0000000-0000-4000-8000-0000000000e1', 'cb563908-7939-494e-bbe4-1e83af4d6999',
   'dono', timestamptz '2019-03-04 05:06:08+00');
