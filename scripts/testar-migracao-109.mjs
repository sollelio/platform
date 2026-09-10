// Testa a migração 109 num Postgres real (PGlite/WASM), sem tocar em
// nenhuma BD verdadeira — o mesmo método do testar-migracoes.mjs.
// Esquema-réplica PÓS-105 (notas_evento SEM autor, COM criado_por: foi
// exatamente aí que a revisão adversarial apanhou o insert errado), a
// 109 corre por cima, e os fluxos verificam-se de ponta a ponta.
//
// Correr:
//   npm install --no-save @electric-sql/pglite
//   node scripts/testar-migracao-109.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = fileURLToPath(new URL("../docs/migracoes/", import.meta.url));
const db = new PGlite();

let falhas = 0;
const ok = (cond, nome, extra = "") => {
  console.log(`${cond ? "✓" : "✗"} ${nome}${extra ? ` — ${extra}` : ""}`);
  if (!cond) falhas++;
};

// ---------- 1. Esquema-réplica (o mínimo de que a 109 depende) ----------
await db.exec(`
create role anon nologin;
create role authenticated nologin;

create schema auth;
-- Porta pública por omissão (sem sessão). Os testes internos trocam-na.
create or replace function auth.uid() returns uuid
language sql as 'select null::uuid';

create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null
);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nome text, contacto text,
  tenant_id uuid
);

create table event_types (
  id uuid primary key default gen_random_uuid(),
  nome text, tenant_id uuid
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cliente_id uuid references clientes(id),
  fase text not null default 'interessado'
    check (fase in ('interessado','orcamento','sinal','cliente','projecto','contrato','perdido')),
  status text default 'Recebido',
  event_type_id uuid,
  data_evento date,
  numero_convidados integer,
  respostas jsonb default '{}'::jsonb,
  tenant_id uuid
);

-- notas_evento na forma PÓS-105: sem coluna autor, com criado_por.
create table notas_evento (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  tipo text not null default 'interna'
    check (tipo in ('chamada','mensagem','alteracao','interna')),
  corpo text not null check (btrim(corpo) <> ''),
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- Os ajudantes dlm_* de que a captacao_submeter depende.
create or replace function dlm_txt(p jsonb, k text) returns text
language sql immutable as $$ select nullif(btrim(p ->> k), '') $$;

create or replace function dlm_safe_date(t text) returns date
language plpgsql immutable as $$
begin
  return t::date;
exception when others then
  return null;
end $$;

create or replace function dlm_safe_int(t text) returns integer
language plpgsql immutable as $$
begin
  return t::integer;
exception when others then
  return null;
end $$;

create or replace function dlm_safe_uuid(t text) returns uuid
language plpgsql immutable as $$
begin
  return t::uuid;
exception when others then
  return null;
end $$;

create or replace function tenant_actual() returns uuid
language sql as 'select null::uuid';

create or replace function tenant_por_slug(p_slug text) returns uuid
language sql as $$ select id from tenants where slug = p_slug $$;

create or replace function tenant_do_pedido(p_slug text) returns uuid
language sql as $$ select id from tenants where slug = p_slug $$;

-- Réplica do captacao_dedupe (043 + tenant): mesmo telefone → cliente
-- mais antigo; mesma data + evento vivo → o evento absorve.
create or replace function captacao_dedupe(p_digitos text, p_data date, p_tenant uuid)
returns table(cliente_id uuid, evento_id uuid)
language plpgsql as $$
declare
  v_digitos text := right(regexp_replace(coalesce(p_digitos,''), '\\D', '', 'g'), 9);
  v_cliente uuid; v_evento uuid;
begin
  if length(v_digitos) < 9 then return; end if;
  select c.id into v_cliente from clientes c
   where c.tenant_id = p_tenant
     and right(regexp_replace(coalesce(c.contacto,''), '\\D', '', 'g'), 9) = v_digitos
   order by c.created_at asc, c.id asc limit 1;
  if v_cliente is null then return; end if;
  if p_data is not null then
    select s.id into v_evento from submissions s
     where s.cliente_id = v_cliente and s.data_evento = p_data
       and coalesce(s.fase,'') <> 'perdido'
       and coalesce(s.status,'') <> 'Concluído'
     order by s.created_at asc, s.id asc limit 1;
  end if;
  cliente_id := v_cliente; evento_id := v_evento; return next;
end $$;

insert into tenants (slug) values ('demo');
`);

// ---------- 2. Fotografia ANTES (o que a 109 nunca pode mexer) ----------
await db.exec(`
insert into clientes (nome, contacto, tenant_id)
select 'Pré-existente', '960000000', id from tenants where slug='demo';
insert into submissions (cliente_id, fase, data_evento, respostas, tenant_id)
select c.id, 'interessado', date '2026-11-11', '{"localEvento":"Sintra"}'::jsonb, c.tenant_id
from clientes c;
`);
const antes = (
  await db.query(`select
    (select count(*)::int from submissions) as subs,
    (select count(*)::int from submissions where fase='interessado') as interessados,
    (select count(*)::int from notas_evento) as notas,
    (select count(*)::int from clientes) as clientes`)
).rows[0];

// ---------- 3. Correr a 109 ----------
await db.exec(readFileSync(base + "109_a_procura_nao_se_apaga.sql", "utf8"));
ok(true, "a 109 corre sem erros sobre o esquema pós-105");

const depois = (
  await db.query(`select
    (select count(*)::int from submissions) as subs,
    (select count(*)::int from submissions where fase='interessado') as interessados,
    (select count(*)::int from notas_evento) as notas,
    (select count(*)::int from clientes) as clientes,
    (select count(*)::int from submissions where perdido_em is not null) as carimbados,
    (select count(*)::int from submissions where motivo_perda is not null) as com_motivo`)
).rows[0];
ok(
  antes.subs === depois.subs &&
    antes.interessados === depois.interessados &&
    antes.notas === depois.notas &&
    antes.clientes === depois.clientes,
  "nenhum dado existente mudou (submissions/interessados/notas/clientes)",
  `antes ${JSON.stringify(antes)} = depois`,
);
ok(
  depois.carimbados === 0 && depois.com_motivo === 0,
  "as colunas novas nascem vazias",
);

const cols = (
  await db.query(`select column_name from information_schema.columns
    where table_name='submissions'
      and column_name in ('perdido_em','motivo_perda','motivo_perda_detalhe')`)
).rows;
ok(cols.length === 3, "perdido_em + motivo_perda + motivo_perda_detalhe existem");

// ---------- 4. O CHECK do motivo ----------
let rejeitou = false;
try {
  await db.query(`update submissions set motivo_perda = 'xpto'`);
} catch {
  rejeitou = true;
}
ok(rejeitou, "motivo_perda fora do vocabulário é recusado pelo CHECK");
await db.query(
  `update submissions set fase='perdido', perdido_em=now(), motivo_perda='preco'`,
);
ok(true, "perder com motivo válido escreve (fase+carimbo+motivo num update)");
await db.query(
  `update submissions set fase='interessado', perdido_em=null, motivo_perda=null`,
);

// ---------- 5. A captação: criar, repetir, nova ocorrência ----------
const chamar = async (payload) =>
  (
    await db.query(`select captacao_submeter($1::jsonb, 'demo') as r`, [
      JSON.stringify(payload),
    ])
  ).rows[0].r;

const p1 = await chamar({
  nome: "Teste Gate",
  contacto: "911222333",
  dataEvento: "2026-10-10",
  respostas: { localEvento: "Cascais" },
});
ok(p1.duplicado === false, "1.º pedido cria a submissão", `id ${p1.id}`);

const p2 = await chamar({
  nome: "Teste Gate",
  contacto: "911 222 333",
  dataEvento: "2026-10-10",
  respostas: { localEvento: "Cascais" },
});
ok(
  p2.duplicado === true && p2.id === p1.id,
  "mesmo telefone + mesma data → duplicado (identidade deduplicada)",
);
const nota = (
  await db.query(
    `select corpo, criado_por from notas_evento where submission_id = $1`,
    [p1.id],
  )
).rows;
ok(
  nota.length === 1 &&
    nota[0].corpo.includes("Contacto repetido") &&
    nota[0].corpo.includes("porta pública") &&
    nota[0].corpo.includes("ficha do contacto") &&
    nota[0].criado_por === null,
  "…MAS a ocorrência fica contada na nota interna (o fix do «autor»)",
);

const p3 = await chamar({
  nome: "Teste Gate",
  contacto: "911222333",
  dataEvento: "2026-12-24",
  respostas: { localEvento: "Sintra" },
});
ok(
  p3.duplicado === false && p3.clienteReutilizado === true,
  "mesma pessoa + OUTRA data → nova ocorrência de procura, mesma ficha",
);
const contas = (
  await db.query(`select
    (select count(*)::int from clientes where nome='Teste Gate') as clientes,
    (select count(*)::int from submissions s join clientes c on c.id=s.cliente_id
      where c.nome='Teste Gate') as pedidos`)
).rows[0];
ok(
  contas.clientes === 1 && contas.pedidos === 2,
  "1 pessoa, 2 pedidos registados",
);

// ---------- 6. Porta interna: a nota diz a porta certa ----------
await db.exec(`create or replace function auth.uid() returns uuid
language sql as $$ select '00000000-0000-4000-8000-000000000001'::uuid $$;`);
const p4 = await chamar({
  nome: "Teste Gate",
  contacto: "911222333",
  dataEvento: "2026-10-10",
});
const notas2 = (
  await db.query(
    `select corpo from notas_evento where submission_id=$1 order by created_at`,
    [p1.id],
  )
).rows;
ok(
  p4.duplicado === true &&
    notas2.length === 2 &&
    notas2[1].corpo.includes("porta interna"),
  "repetição pela porta interna também deixa nota, com a porta certa",
);

// ---------- 7. Re-executável ----------
await db.exec(readFileSync(base + "109_a_procura_nao_se_apaga.sql", "utf8"));
ok(true, "correr a 109 duas vezes não rebenta (add if not exists / or replace)");

console.log(
  falhas === 0
    ? "\nTudo verde — a 109 está pronta para o TEST real."
    : `\n${falhas} falha(s) — NÃO correr em TEST antes de resolver.`,
);
process.exit(falhas === 0 ? 0 : 1);
