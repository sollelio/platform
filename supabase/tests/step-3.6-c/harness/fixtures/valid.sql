-- Step 3.6-C · Layer B fixture — a VALID synthetic legacy source.
-- One activo tenant carrying the id the contract's §4.2 closed time-zone map is
-- keyed by; two auth users with metadata name keys and past created_at values;
-- two memberships, one dono and one gestor; two app_config keys.
-- Synthetic values only. No PII.
insert into auth.users (id, raw_user_meta_data, created_at) values
  ('c0000000-0000-4000-8000-0000000000d1',
   '{"nome": "Sintetico Dono", "full_name": "Sintetico Dono Completo"}'::jsonb,
   timestamptz '2020-01-02 03:04:05+00'),
  ('c0000000-0000-4000-8000-0000000000d2',
   '{"full_name": "Sintetico Gestor Completo"}'::jsonb,
   timestamptz '2021-06-07 08:09:10+00');

insert into public.tenants
  (id, slug, nome, prefixo, locale, moeda, estado, criado_em,
   titular, morada, nif, iban, mbway, foro, dominio, whatsapp, logo_url,
   linha_actividade, linha_by, slogan)
values
  ('cb563908-7939-494e-bbe4-1e83af4d693a', 'casa-sintetica', 'Casa Sintetica',
   'SYN', 'pt-PT', 'EUR', 'activo', timestamptz '2019-03-04 05:06:07+00',
   'Titular Sintetico', 'Morada Sintetica', 'NIF-SYN', 'IBAN-SYN', 'MBWAY-SYN',
   'Foro Sintetico', 'sintetico.example', 'WA-SYN',
   'https://storage.example/identidade/sintetico-logo.png',
   'Linha Actividade Sintetica', 'Linha By Sintetica', 'Slogan Sintetico');

insert into public.memberships (user_id, tenant_id, papel, criado_em) values
  ('c0000000-0000-4000-8000-0000000000d1', 'cb563908-7939-494e-bbe4-1e83af4d693a',
   'dono',   timestamptz '2019-03-04 05:06:08+00'),
  ('c0000000-0000-4000-8000-0000000000d2', 'cb563908-7939-494e-bbe4-1e83af4d693a',
   'gestor', timestamptz '2019-05-06 07:08:09+00');

insert into public.app_config (tenant_id, chave, valor, descricao) values
  ('cb563908-7939-494e-bbe4-1e83af4d693a', 'buffer_dias_antes',  '2', 'sintetico'),
  ('cb563908-7939-494e-bbe4-1e83af4d693a', 'buffer_dias_depois', '3', 'sintetico');
