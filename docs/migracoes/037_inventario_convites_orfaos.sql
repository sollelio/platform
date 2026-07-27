-- ============================================================
-- 037 — INVENTÁRIO dos convites órfãos e do estrago da duplicação
--
-- ⚠ NÃO É UMA MIGRAÇÃO PARA CORRER ÀS CEGAS.
-- A parte 1 são SÓ SELECTs (seguros, correr à vontade em TEST e em
-- produção para ver o estado real). A parte 2 são MODELOS de reparação
-- COMENTADOS, com espaços por preencher — só se corre linha a linha,
-- caso a caso, DEPOIS de o Hélio rever o inventário. Com 9 clientes no
-- sistema, a fusão de duplicados é manual e deliberada.
-- ============================================================

-- ------------------------------------------------------------
-- PARTE 1 — INVENTÁRIO (só leitura)
-- ------------------------------------------------------------

-- 1a. Convites PENDENTES órfãos (sem alvo e por preencher) — cada um é
--     uma porta de duplicação se pertencer a um cliente que já existe.
--     As "pistas" ajudam a decidir a quem pertence.
select i.id,
       i.code,
       i.created_at,
       i.reserva_id,
       i.respostas ->> 'nomeNoivo'          as pista_noivo,
       i.respostas ->> 'nomeNoiva'          as pista_noiva,
       i.respostas ->> 'nomeDoCliente'      as pista_nome,
       i.respostas ->> 'contactoPrincipal'  as pista_contacto,
       i.data_evento                        as pista_data
  from invites i
 where i.status <> 'Preenchido'
   and i.submission_id is null
   and i.submission_alvo_id is null
 order by i.created_at desc;

-- 1b. Convites que JÁ duplicaram: preenchidos sem alvo. O evento que
--     criaram (submission_id) é candidato a duplicado de outro evento.
select i.id,
       i.code,
       i.created_at   as convite_criado,
       s.id           as evento_criado,
       s.data_evento,
       c.id           as cliente_criado,
       c.nome         as cliente_nome,
       c.contacto     as cliente_contacto
  from invites i
  join submissions s on s.id = i.submission_id
  left join clientes c on c.id = s.cliente_id
 where i.status = 'Preenchido'
   and i.submission_alvo_id is null
 order by i.created_at desc;

-- 1c. Pares de CLIENTES com o mesmo telefone (últimos 9 dígitos, nas
--     colunas E nas respostas dos eventos) — os candidatos a fusão.
-- (uma linha por CADA campo de telefone, replicando o OR do
--  captacao_dedupe — um coalesce esconderia o whatsapp de quem tem
--  contactoPrincipal vazio ou diferente)
with tel as (
  select c.id,
         c.nome,
         c.created_at,
         nullif(right(regexp_replace(coalesce(c.contacto, ''), '\D', '', 'g'), 9), '') as digitos
    from clientes c
  union
  select s.cliente_id,
         null,
         null,
         nullif(right(regexp_replace(coalesce(
           s.respostas ->> 'contactoPrincipal', ''), '\D', '', 'g'), 9), '')
    from submissions s
   where s.cliente_id is not null
  union
  select s.cliente_id,
         null,
         null,
         nullif(right(regexp_replace(coalesce(
           s.respostas ->> 'numeroWhatsapp', ''), '\D', '', 'g'), 9), '')
    from submissions s
   where s.cliente_id is not null
)
select a.digitos,
       array_agg(distinct a.id) as clientes_ids
  from tel a
 where a.digitos is not null
   and length(a.digitos) = 9
 group by a.digitos
having count(distinct a.id) > 1;

-- 1d. Eventos "gémeos": mesmo par de clientes candidatos (1c) e mesma
--     data — o retrato clássico do par original + duplicado.
--     (Correr depois de identificar os pares em 1c; substituir os ids.)
-- select s.id, s.cliente_id, s.data_evento, s.fase, s.created_at
--   from submissions s
--  where s.cliente_id in ('<CLIENTE_A>', '<CLIENTE_B>')
--  order by s.data_evento, s.created_at;

-- 1e. Convites cujo alvo foi perdido pela FK (apagou-se o evento-alvo):
--     têm ainda o rasto na data/respostas mas alvo NULL — subconjunto
--     de 1a; aqui só os que nasceram de reserva (mais fáceis de ligar).
select i.id, i.code, i.created_at, i.reserva_id, r.nome_cliente, r.contacto
  from invites i
  join reservas r on r.id = i.reserva_id
 where i.status <> 'Preenchido'
   and i.submission_id is null
   and i.submission_alvo_id is null;

-- ------------------------------------------------------------
-- PARTE 2 — MODELOS DE REPARAÇÃO (comentados; caso a caso)
-- ------------------------------------------------------------

-- 2a. Apontar um convite pendente órfão ao evento certo (equivalente ao
--     botão "É deste evento" da app, para usar em lote se preciso):
-- update invites
--    set submission_alvo_id = '<EVENTO_ID>'
--  where id = '<CONVITE_ID>'
--    and submission_id is null;   -- nunca re-apontar um preenchido

-- 2b. Fundir um par duplicado (DEPOIS de decidir qual sobrevive):
--     passo 1 — mover os eventos do cliente duplicado para o original:
-- update submissions
--    set cliente_id = '<CLIENTE_ORIGINAL>'
--  where cliente_id = '<CLIENTE_DUPLICADO>';
--     passo 2 — se o EVENTO também é duplicado e as respostas boas
--     estão nele, copiá-las para o evento original (merge; o original
--     prevalece onde ambos tiverem valor... trocar a ordem do || para
--     o contrário):
-- update submissions o
--    set respostas = d.respostas || o.respostas
--   from submissions d
--  where o.id = '<EVENTO_ORIGINAL>'
--    and d.id = '<EVENTO_DUPLICADO>';
--     passo 3 — re-apontar o convite preenchido ao evento original,
--     para o histórico ("Formulário ✓") ficar verdadeiro:
-- update invites
--    set submission_id = '<EVENTO_ORIGINAL>',
--        submission_alvo_id = '<EVENTO_ORIGINAL>'
--  where submission_id = '<EVENTO_DUPLICADO>';
--     passo 4 — apagar o evento duplicado (bloqueia se tiver pagamentos
--     — mover ou apagar esses primeiro, deliberadamente) e o cartão
--     duplicado do cliente:
-- delete from submissions where id = '<EVENTO_DUPLICADO>';
-- delete from clientes    where id = '<CLIENTE_DUPLICADO>';
