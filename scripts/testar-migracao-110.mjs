// Testa a migração 110 num Postgres real (PGlite/WASM), sem tocar em
// nenhuma BD verdadeira — o mesmo método do testar-migracao-109.mjs.
// Esquema-réplica PÓS-109 (submissions COM criado_por da 105, a
// captacao_submeter da 109), a 110 corre por cima, e as três portas
// verificam-se de ponta a ponta: anónimo no /interesse, interno no
// /interesse (com e sem atalho), interno no «+ Registar pedido».
//
// Correr:
//   npm install --no-save @electric-sql/pglite
//   node scripts/testar-migracao-110.mjs
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
const recusa = async (sql, params = []) => {
  try {
    await db.query(sql, params);
    return null;
  } catch (e) {
    return e.message || String(e);
  }
};

const NADIA = "00000000-0000-4000-8000-000000000001";
const sessao = async (uid) =>
  db.exec(`create or replace function auth.uid() returns uuid
    language sql as $$ select ${uid ? `'${uid}'::uuid` : "null::uuid"} $$;`);

// ---------- 1. Esquema-réplica pós-109 ----------
await db.exec(`
create role anon nologin;
create role authenticated nologin;

create schema auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid
language sql as 'select null::uuid';

create table tenants (id uuid primary key default gen_random_uuid(), slug text unique not null);
create table clientes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nome text, contacto text, tenant_id uuid,
  criado_por uuid references auth.users(id) on delete set null default auth.uid()
);
create table event_types (id uuid primary key default gen_random_uuid(), nome text, tenant_id uuid);
create table submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cliente_id uuid references clientes(id),
  fase text not null default 'interessado',
  status text default 'Recebido',
  event_type_id uuid, data_evento date, numero_convidados integer,
  respostas jsonb default '{}'::jsonb, tenant_id uuid,
  criado_por uuid references auth.users(id) on delete set null default auth.uid()
);
create table notas_evento (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  tipo text not null default 'interna', corpo text not null,
  criado_por uuid default auth.uid(), created_at timestamptz not null default now()
);

create or replace function dlm_txt(p jsonb, k text) returns text
language sql immutable as $$ select nullif(btrim(p ->> k), '') $$;
create or replace function dlm_safe_date(t text) returns date language plpgsql immutable as $$
begin return t::date; exception when others then return null; end $$;
create or replace function dlm_safe_int(t text) returns integer language plpgsql immutable as $$
begin return t::integer; exception when others then return null; end $$;
create or replace function dlm_safe_uuid(t text) returns uuid language plpgsql immutable as $$
begin return t::uuid; exception when others then return null; end $$;
create or replace function tenant_actual() returns uuid language sql as 'select null::uuid';
create or replace function tenant_por_slug(p_slug text) returns uuid
language sql as $$ select id from tenants where slug = p_slug $$;
-- Réplica: com sessão, a casa só existe se o slug for de quem pede.
create or replace function tenant_do_pedido(p_slug text) returns uuid
language sql as $$ select id from tenants where slug = p_slug and auth.uid() is not null $$;
create or replace function captacao_dedupe(p_digitos text, p_data date, p_tenant uuid)
returns table(cliente_id uuid, evento_id uuid) language plpgsql as $$
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
     order by s.created_at asc, s.id asc limit 1;
  end if;
  cliente_id := v_cliente; evento_id := v_evento; return next;
end $$;

insert into tenants (slug) values ('demo');
insert into auth.users (id) values ('${NADIA}');
`);
await db.exec(readFileSync(base + "109_a_procura_nao_se_apaga.sql", "utf8"));

// ---------- 2. Histórico antes da 110 ----------
await db.exec(`
insert into clientes (nome, contacto, tenant_id)
select 'Histórica', '960000000', id from tenants where slug='demo';
insert into submissions (cliente_id, data_evento, respostas, tenant_id, criado_por)
select c.id, date '2026-11-11', '{"localEvento":"Sintra"}'::jsonb, c.tenant_id, '${NADIA}'
from clientes c;
`);
const antes = (await db.query(`select id, criado_por, respostas from submissions`)).rows;

// ---------- 3. Correr a 110 ----------
await db.exec(readFileSync(base + "110_quem_pediu_e_por_onde.sql", "utf8"));
ok(true, "a 110 corre sem erros sobre o esquema pós-109");

const hist = (
  await db.query(`select id, criado_por, respostas, submissao_superficie,
    submissao_autor_tipo, submissao_atribuicao from submissions`)
).rows;
ok(
  hist.length === antes.length &&
    hist[0].id === antes[0].id &&
    hist[0].criado_por === antes[0].criado_por &&
    JSON.stringify(hist[0].respostas) === JSON.stringify(antes[0].respostas),
  "o histórico fica intacto",
);
ok(
  hist[0].submissao_superficie === null &&
    hist[0].submissao_autor_tipo === null &&
    hist[0].submissao_atribuicao === null,
  "…e sem backfill: a linha antiga (mesmo com criado_por) fica a NULL nas três",
);

const chamar = async (payload) =>
  (
    await db.query(`select captacao_submeter($1::jsonb, 'demo') as r`, [
      JSON.stringify(payload),
    ])
  ).rows[0].r;
const linha = async (id) =>
  (
    await db.query(
      `select criado_por, submissao_superficie as s, submissao_autor_tipo as t,
              submissao_atribuicao as m from submissions where id = $1`,
      [id],
    )
  ).rows[0];
const confere = (l, s, t, m, quem) =>
  l.s === s && l.t === t && l.m === m && l.criado_por === quem;

// ---------- 4. Anónimo no /interesse ----------
await sessao(null);
const a = await chamar({ nome: "Anónima", contacto: "911000001", atribuicao: { superficie: "public_form" } });
ok(
  confere(await linha(a.id), "public_form", "unknown", "unidentified", null),
  "anónimo no /interesse → public_form · unknown · unidentified · sem utilizador",
);
ok(
  a.atribuicao?.superficie === "public_form" &&
    a.atribuicao?.autorTipo === "unknown" &&
    a.atribuicao?.metodo === "unidentified",
  "a resposta devolve a atribuição GRAVADA",
);
const a2 = await chamar({
  nome: "Impostora",
  contacto: "911000002",
  atribuicao: { superficie: "admin_form", entrada: "internal_entry_point" },
});
ok(
  confere(await linha(a2.id), "public_form", "unknown", "unidentified", null),
  "o anónimo NÃO se declara admin nem interno (a declaração é ignorada)",
);

// ---------- 5. Interno no /interesse ----------
await sessao(NADIA);
const i1 = await chamar({ nome: "Pela sessão", contacto: "911000003", atribuicao: { superficie: "public_form" } });
ok(
  confere(await linha(i1.id), "public_form", "internal_user", "authenticated_session", NADIA),
  "interno no /interesse → public_form · internal_user · authenticated_session · uuid da sessão",
);
const i2 = await chamar({
  nome: "Pelo atalho",
  contacto: "911000004",
  atribuicao: { superficie: "public_form", entrada: "internal_entry_point" },
});
ok(
  confere(await linha(i2.id), "public_form", "internal_user", "internal_entry_point", NADIA),
  "interno pelo atalho do backoffice → internal_entry_point",
);

// ---------- 6. Interno no «+ Registar pedido» ----------
const i3 = await chamar({ nome: "Pelo modal", contacto: "911000005", atribuicao: { superficie: "admin_form" } });
ok(
  confere(await linha(i3.id), "admin_form", "internal_user", "admin_form", NADIA),
  "«+ Registar pedido» → admin_form · internal_user · admin_form · uuid da sessão",
);

// ---------- 7. Browser antigo (sem atribuicao no payload) ----------
const i4 = await chamar({ nome: "Browser antigo", contacto: "911000006" });
ok(
  confere(await linha(i4.id), "other", "internal_user", "authenticated_session", NADIA),
  "sessão interna sem declaração → other (nunca inventa a superfície)",
);
await sessao(null);
const a3 = await chamar({ nome: "Antigo anónimo", contacto: "911000007" });
ok(
  confere(await linha(a3.id), "public_form", "unknown", "unidentified", null),
  "anónimo sem declaração → public_form · unknown",
);

// ---------- 8. Duplicado: nada criado, nada atribuído ----------
const antesDup = (await db.query(`select count(*)::int as n from submissions`)).rows[0].n;
const d1 = await chamar({ nome: "Repetida", contacto: "911000008", dataEvento: "2026-10-10" });
const d2 = await chamar({ nome: "Repetida", contacto: "911 000 008", dataEvento: "2026-10-10" });
const depoisDup = (await db.query(`select count(*)::int as n from submissions`)).rows[0].n;
ok(
  d1.duplicado === false &&
    d2.duplicado === true &&
    d2.id === d1.id &&
    d2.atribuicao === undefined &&
    depoisDup === antesDup + 1,
  "um duplicado não cria pedido nem devolve atribuição",
);

// ---------- 9. Imutável e coerente ----------
let erro = await recusa(`update submissions set submissao_autor_tipo = 'prospect' where id = $1`, [a.id]);
ok(erro?.includes("ATRIBUICAO_IMUTAVEL"), "reescrever a atribuição é recusado", erro || "");
erro = await recusa(`update submissions set submissao_superficie = 'import' where id = $1`, [hist[0].id]);
ok(erro?.includes("ATRIBUICAO_IMUTAVEL"), "…incluindo «preencher» a de uma linha antiga");
erro = await recusa(`update submissions set respostas = '{"x":1}'::jsonb where id = $1`, [a.id]);
ok(erro === null, "editar o resto do pedido continua livre");
erro = await recusa(
  `insert into submissions (cliente_id, tenant_id, submissao_superficie, submissao_autor_tipo, submissao_atribuicao)
   select cliente_id, tenant_id, 'public_form', 'xpto', 'unidentified' from submissions limit 1`,
);
ok(erro !== null, "valor fora do eixo é recusado pelo CHECK");
erro = await recusa(
  `insert into submissions (cliente_id, tenant_id, submissao_superficie)
   select cliente_id, tenant_id, 'public_form' from submissions limit 1`,
);
ok(erro !== null, "atribuição a meio é recusada (tudo ou nada)");
erro = await recusa(
  `insert into submissions (cliente_id, tenant_id, criado_por, submissao_superficie, submissao_autor_tipo, submissao_atribuicao)
   select cliente_id, tenant_id, '${NADIA}', 'public_form', 'unknown', 'unidentified' from submissions limit 1`,
);
ok(erro !== null, "unknown com utilizador é recusado (quem não é interno não tem uuid)");
// ---------- 9b. O autor (criado_por) não se reescreve ----------
const OUTRO = "00000000-0000-4000-8000-000000000002";
await db.exec(`insert into auth.users (id) values ('${OUTRO}')`);
await sessao(NADIA);
erro = await recusa(`update submissions set criado_por = '${OUTRO}' where id = $1`, [i3.id]);
ok(erro?.includes("AUTORIA_IMUTAVEL"), "um membro não reatribui o autor a outra conta existente", erro || "");
erro = await recusa(`update submissions set criado_por = null where id = $1`, [i3.id]);
ok(erro?.includes("AUTORIA_IMUTAVEL"), "…nem o apaga à mão (a conta ainda existe)");
erro = await recusa(`update submissions set criado_por = '${NADIA}' where id = $1`, [a.id]);
ok(erro?.includes("AUTORIA_IMUTAVEL"), "…nem «preenche» o autor de um pedido anónimo/histórico");
erro = await recusa(
  `insert into submissions (cliente_id, tenant_id, criado_por) select cliente_id, tenant_id, '${OUTRO}' from submissions limit 1`,
);
ok(erro?.includes("AUTORIA_IMUTAVEL"), "com sessão, um insert directo não forja outro autor");
const ins = (
  await db.query(`insert into submissions (cliente_id, tenant_id) select cliente_id, tenant_id from submissions limit 1 returning criado_por`)
).rows[0];
ok(ins.criado_por === NADIA, "o insert normal continua a gravar auth.uid() pelo default");
await sessao(null);
erro = await recusa(
  `insert into submissions (cliente_id, tenant_id, criado_por) select cliente_id, tenant_id, '${OUTRO}' from submissions limit 1`,
);
ok(erro === null, "sem sessão (serviço/migrações) o insert fica como estava");
const doOutro = (await db.query(`select id from submissions where criado_por = '${OUTRO}' limit 1`)).rows[0];
erro = await recusa(`delete from auth.users where id = '${OUTRO}'`);
const depoisApagar = (await db.query(`select criado_por from submissions where id = $1`, [doOutro.id])).rows[0];
ok(erro === null && depoisApagar.criado_por === null, "apagar uma conta limpa o autor pela FK (on delete set null passa no gatilho)");

erro = await recusa(`delete from auth.users where id = '${NADIA}'`);
ok(erro === null, "apagar a conta interna não é travado (criado_por → NULL, on delete set null)");
const semNadia = (await db.query(`select count(*)::int as n from submissions where criado_por = '${NADIA}'`)).rows[0].n;
ok(semNadia === 0, "…e todas as linhas dela ficam com o autor a NULL");

// ---------- 10. Re-executável ----------
await db.exec(`insert into auth.users (id) values ('${NADIA}')`);
await db.exec(readFileSync(base + "110_quem_pediu_e_por_onde.sql", "utf8"));
ok(true, "correr a 110 duas vezes não rebenta (if not exists / drop if exists / or replace)");

console.log(
  falhas === 0
    ? "\nTudo verde — a 110 está pronta para o TEST real."
    : `\n${falhas} falha(s) — NÃO correr em TEST antes de resolver.`,
);
process.exit(falhas === 0 ? 0 : 1);
