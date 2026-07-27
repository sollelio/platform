-- ============================================================
-- INVENTÁRIO DE FECHO — duplicados e convites desviados, à prova de
-- NULL. Só SELECTs; correr em PRODUÇÃO e TEST e mandar os resultados.
--
-- Porquê esta segunda ronda (auditoria honesta da primeira):
--   • As queries que CORRERAM (037: 1a, 1b, 1c, 1e) usavam IS NULL
--     explícito — NÃO tinham a armadilha do != com NULL. Os zeros
--     delas são zeros a sério.
--   • MAS a cobertura tinha buracos: a assinatura do convite DESVIADO
--     (alvo preenchido, respostas noutro evento) nunca foi consultada;
--     a 1d (pares de eventos) era um modelo comentado com ids à mão —
--     nunca correu; e a 1c só via duplicados que PARTILHAM telefone —
--     um duplicado sem telefone era invisível.
--   • E produção tem 12 clientes onde o Hélio contava 9 — fecha-se
--     por inspeção direta (query A), não por inferência.
-- Tudo abaixo usa IS NULL / IS DISTINCT FROM — nenhum NULL é varrido.
-- ============================================================

-- A. TODOS os clientes, com os seus eventos — 12 linhas em produção:
--    identifica a olho os 3 inesperados (captação? importação? teste?).
select c.id,
       c.nome,
       c.contacto,
       c.email,
       c.created_at,
       count(s.id)                              as n_eventos,
       string_agg(coalesce(s.fase, '(sem fase)'), ', ') as fases
  from clientes c
  left join submissions s on s.cliente_id = c.id
 group by c.id, c.nome, c.contacto, c.email, c.created_at
 order by c.created_at;

-- B. Convites DESVIADOS — a assinatura que faltou: apontados a um
--    evento mas com as respostas gravadas NOUTRO. (IS DISTINCT FROM:
--    um NULL de cada lado nunca esconde a linha.)
select i.id, i.code, i.created_at,
       i.submission_alvo_id as evento_alvo,
       i.submission_id      as evento_com_as_respostas
  from invites i
 where i.submission_alvo_id is not null
   and i.submission_id is not null
   and i.submission_id is distinct from i.submission_alvo_id;

-- C. Convites com o carimbo trocado — 'Preenchido' sem submissão (o
--    rasto de um markInviteUsed falhado a meio) e o inverso, submissão
--    sem carimbo. A 1b usava INNER JOIN e não podia ver o primeiro.
select i.id, i.code, i.status, i.submission_id, i.submission_alvo_id,
       i.created_at
  from invites i
 where (i.status = 'Preenchido' and i.submission_id is null)
    or (i.status is distinct from 'Preenchido' and i.submission_id is not null);

-- D. Pares de clientes com o MESMO NOME normalizado — apanha os
--    duplicados sem telefone, invisíveis à 1c.
select lower(btrim(c.nome))     as nome_normalizado,
       count(*)                 as quantos,
       array_agg(c.id)          as clientes_ids,
       array_agg(c.contacto)    as contactos
  from clientes c
 where btrim(coalesce(c.nome, '')) <> ''
 group by lower(btrim(c.nome))
having count(*) > 1;

-- E. Pares por TELEFONE (a 1c, re-emitida por completude — já tinha
--    corrido limpa; barata de repetir na mesma ida).
with tel as (
  select c.id,
         nullif(right(regexp_replace(coalesce(c.contacto, ''), '\D', '', 'g'), 9), '') as digitos
    from clientes c
  union
  select s.cliente_id,
         nullif(right(regexp_replace(coalesce(s.respostas ->> 'contactoPrincipal', ''), '\D', '', 'g'), 9), '')
    from submissions s where s.cliente_id is not null
  union
  select s.cliente_id,
         nullif(right(regexp_replace(coalesce(s.respostas ->> 'numeroWhatsapp', ''), '\D', '', 'g'), 9), '')
    from submissions s where s.cliente_id is not null
)
select digitos, array_agg(distinct id) as clientes_ids
  from tel
 where digitos is not null and length(digitos) = 9
 group by digitos
having count(distinct id) > 1;

-- F. Eventos na MESMA DATA, lado a lado (13 submissions — revê a olho;
--    dois eventos do mesmo dia com nomes parecidos são o retrato do
--    par original + duplicado). Sem filtro de cliente de propósito.
select s.data_evento,
       s.id,
       coalesce(c.nome, '(sem cliente)') as cliente,
       s.fase, s.status, s.created_at
  from submissions s
  left join clientes c on c.id = s.cliente_id
 where s.data_evento is not null
   and s.data_evento in (
     select data_evento from submissions
      where data_evento is not null
      group by data_evento having count(*) > 1
   )
 order by s.data_evento, s.created_at;

-- G. O duplicado interno: o MESMO cliente com dois eventos na mesma
--    data (vivos ou não).
select s.cliente_id, c.nome, s.data_evento,
       count(*) as quantos, array_agg(s.id) as eventos
  from submissions s
  join clientes c on c.id = s.cliente_id
 where s.data_evento is not null
 group by s.cliente_id, c.nome, s.data_evento
having count(*) > 1;
