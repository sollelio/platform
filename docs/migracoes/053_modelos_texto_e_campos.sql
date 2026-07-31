-- ============================================================================
-- 053 · Modelos de evento — texto que se lê e campos que faltavam
--
-- Seis modelos, 192 campos. Corrige o que as pessoas leem e acrescenta três
-- campos em falta. NENHUM `id` de campo muda: são as chaves debaixo das quais
-- as respostas já dadas estão guardadas (`submissions.respostas`), e mudá-las
-- órfã tudo. A verificação final prova isso.
--
-- ⚠ NOTA QUE FICA REGISTADA, porque parece um erro e não é:
--    No modelo CASAMENTO, o campo do NOIVO tem o id `nomeDoNoiva` e o da
--    NOIVA tem o id `nomeDaNoivo`. Está trocado, e fica trocado para sempre.
--    A razão: o editor gera o id a partir da etiqueta (toCamelId), as
--    etiquetas saíram estragadas («Nome do Noiva»), e os ids nasceram delas.
--    Esta migração corrige as ETIQUETAS; os ids ficam como estão porque já
--    têm respostas guardadas debaixo deles.
--    A ordem e os exemplos («Ex: João Silva» primeiro) confirmam a intenção,
--    e são iguais aos do Noivado, que está correcto.
--    NÃO «corrijas» os ids mais tarde a olhar só para os nomes.
--
-- Idempotente. Correr primeiro em TESTE, depois em PRODUÇÃO.
-- ============================================================================


-- ─── 0 · Fotografia dos ids, para a verificação do fim ──────────────────────
--
-- Correr o ficheiro TODO de uma vez: a fotografia vive só o tempo da sessão.
--
-- `temp` põe-na no esquema pg_temp, fora do público — mas a secção 4, no fim,
-- larga-a explicitamente na mesma. Não é redundância inútil: o editor do
-- Supabase avisou que ficava visível, e uma tabela de andaime não tem que
-- depender de como o editor trata sessões. Depois da 4 não fica resíduo
-- nenhum, aqui nem no público.

drop table if exists _ids_antes;
create temp table _ids_antes as
select et.id as modelo_id, f.val->>'id' as campo_id
  from public.event_types et
  cross join lateral jsonb_array_elements(et.steps)      p(val)
  cross join lateral jsonb_array_elements(p.val->'fields') f(val);


-- ============================================================================
-- 1 · TEXTO — substituições sobre o `steps` inteiro
--
-- Feitas em texto e não campo a campo de propósito: as strings são frases
-- completas e únicas, não há risco de apanharem outra coisa, e assim uma
-- correcção alcança as 26 ocorrências sem percorrer 192 campos.
-- Os `where` tornam a repetição num não-evento (e o `replace` de uma string
-- ausente já era inócuo — cinto e suspensórios).
-- ============================================================================

-- 1.1 · Os errorMsg em segunda pessoa (26 ocorrências).
--       Mesma correcção que o `buildErrorMsg` do EventTypeEditor levou, para a
--       raiz e as folhas passarem a dizer o mesmo.

update public.event_types
   set steps = replace(steps::text,
         'Introduz um número de telefone válido',
         'Introduza um número de telefone válido')::jsonb
 where steps::text like '%Introduz um número de telefone válido%';

update public.event_types
   set steps = replace(steps::text,
         'Introduz um número positivo',
         'Introduza um número positivo')::jsonb
 where steps::text like '%Introduz um número positivo%';

update public.event_types
   set steps = replace(steps::text,
         'Introduz um endereço de email válido',
         'Introduza um endereço de email válido')::jsonb
 where steps::text like '%Introduz um endereço de email válido%';


-- 1.2 · O subtítulo do passo 1, copiado do molde do Casamento para todos.
--       Fica nos dois modelos onde há mesmo noivos; sai nos outros quatro.
--       Quem faz uma inauguração de loja não deve ler que o formulário é
--       sobre os noivos dela.

update public.event_types
   set steps = replace(steps::text,
         'Informações base sobre os noivos e o evento',
         'Informações base sobre o evento')::jsonb
 where steps::text like '%Informações base sobre os noivos e o evento%'
   and nome not ilike '%casamento%'
   and nome not ilike '%noivado%';


-- 1.3 · As etiquetas dos noivos, no Casamento.
--       A ordem importa: «Nome do Noiva» → «Nome do Noivo» primeiro; depois
--       «Nome da Noivo» → «Nome da Noiva». Não colidem («do» vs «da»), e os
--       ids (camelCase, sem espaços) não são tocados por nenhuma das duas.

update public.event_types
   set steps = replace(steps::text, 'Nome do Noiva', 'Nome do Noivo')::jsonb
 where steps::text like '%Nome do Noiva%';

update public.event_types
   set steps = replace(steps::text, 'Nome da Noivo', 'Nome da Noiva')::jsonb
 where steps::text like '%Nome da Noivo%';


-- 1.4 · Duas gralhas numa etiqueta do Casamento.

update public.event_types
   set steps = replace(steps::text,
         'Vai quere cenário fotoígrafável dos noivos?',
         'Vai querer cenário fotografável dos noivos?')::jsonb
 where steps::text like '%Vai quere cenário fotoígrafável dos noivos?%';


-- 1.5 · O nome do modelo. Aparece no portal do cliente, ao lado do nome dela.

update public.event_types
   set nome = 'Brunch Elegante'
 where nome = 'Brunch Elengante';


-- ============================================================================
-- 2 · CAMPOS — as três faltas
--
-- Os campos novos são COPIADOS de um modelo onde já existem, em vez de
-- escritos à mão: garante o mesmo id, a mesma etiqueta, o mesmo tipo e a
-- mesma validação — e, como a secção 1 já correu, já vêm com o errorMsg na
-- terceira pessoa.
--
-- A inserção é ANCORADA num campo vizinho, não numa posição fixa: não
-- preciso de saber em que passo cada modelo os tem, e se a âncora não
-- existir a migração AVISA e não mexe, em vez de largar o campo num sítio
-- qualquer.
-- ============================================================================

create or replace function public.dlm_inserir_campo_antes(
  p_steps  jsonb,
  p_campo  jsonb,
  p_ancora text
) returns jsonb
language plpgsql
immutable
as $$
declare
  v_out       jsonb := '[]'::jsonb;
  v_step      jsonb;
  v_fields    jsonb;
  v_f         jsonb;
  v_inserido  boolean := false;
begin
  -- Idempotência: se o id já lá está, devolve tal e qual.
  if exists (
    select 1
      from jsonb_array_elements(p_steps) s,
           jsonb_array_elements(s->'fields') f
     where f->>'id' = p_campo->>'id'
  ) then
    return p_steps;
  end if;

  -- Âncora em falta: não inventa lugar. Devolve intacto (o chamador avisa).
  if not exists (
    select 1
      from jsonb_array_elements(p_steps) s,
           jsonb_array_elements(s->'fields') f
     where f->>'id' = p_ancora
  ) then
    return p_steps;
  end if;

  for v_step in select * from jsonb_array_elements(p_steps) loop
    v_fields := '[]'::jsonb;
    for v_f in select * from jsonb_array_elements(v_step->'fields') loop
      if not v_inserido and v_f->>'id' = p_ancora then
        v_fields := v_fields || jsonb_build_array(p_campo);
        v_inserido := true;
      end if;
      v_fields := v_fields || jsonb_build_array(v_f);
    end loop;
    v_out := v_out || jsonb_build_array(jsonb_set(v_step, '{fields}', v_fields));
  end loop;

  return v_out;
end
$$;

comment on function public.dlm_inserir_campo_antes(jsonb, jsonb, text) is
  'Insere um campo no steps de um modelo, imediatamente antes de um campo '
  'âncora. Idempotente (id já presente = não faz nada) e conservadora '
  '(âncora ausente = não faz nada).';


create or replace function public.dlm_actualizar_campo(
  p_steps jsonb,
  p_id    text,
  p_patch jsonb
) returns jsonb
language plpgsql
immutable
as $$
declare
  v_out    jsonb := '[]'::jsonb;
  v_step   jsonb;
  v_fields jsonb;
  v_f      jsonb;
begin
  for v_step in select * from jsonb_array_elements(p_steps) loop
    v_fields := '[]'::jsonb;
    for v_f in select * from jsonb_array_elements(v_step->'fields') loop
      if v_f->>'id' = p_id then
        v_f := v_f || p_patch;   -- merge de topo: o patch ganha
      end if;
      v_fields := v_fields || jsonb_build_array(v_f);
    end loop;
    v_out := v_out || jsonb_build_array(jsonb_set(v_step, '{fields}', v_fields));
  end loop;
  return v_out;
end
$$;

comment on function public.dlm_actualizar_campo(jsonb, text, jsonb) is
  'Funde um patch no campo com o id dado, em todos os passos do modelo.';


do $$
declare
  v_campo   jsonb;
  v_options jsonb;
  v_id      uuid;
  v_nome    text;
  v_antes   int;
begin
  -- ── 2.1 · numeroDeMesas → falta no Casamento ────────────────────────────
  select f.val into v_campo
    from public.event_types et
    cross join lateral jsonb_array_elements(et.steps)        p(val)
    cross join lateral jsonb_array_elements(p.val->'fields') f(val)
   where f.val->>'id' = 'numeroDeMesas'
   limit 1;

  if v_campo is null then
    raise warning '053/2.1: não encontrei `numeroDeMesas` em modelo nenhum — nada feito.';
  else
    for v_id, v_nome in
      select et.id, et.nome from public.event_types et where et.nome ilike '%casamento%'
    loop
      select count(*) into v_antes
        from jsonb_array_elements((select steps from public.event_types where id = v_id)) s,
             jsonb_array_elements(s->'fields') f
       where f->>'id' = 'numeroDeMesas';

      update public.event_types
         set steps = public.dlm_inserir_campo_antes(steps, v_campo, 'nDeLugaresPorMesa')
       where id = v_id;

      if v_antes = 0 and not exists (
        select 1 from jsonb_array_elements((select steps from public.event_types where id = v_id)) s,
                      jsonb_array_elements(s->'fields') f
         where f->>'id' = 'numeroDeMesas')
      then
        raise warning '053/2.1: âncora `nDeLugaresPorMesa` não existe em "%" — campo NÃO inserido.', v_nome;
      end if;
    end loop;
  end if;

  -- ── 2.2 · morada exacta → falta no Brunch e na Inauguração ──────────────
  -- Copia-se o `moradaExactaDoLocal` (o id que três modelos já usam), para o
  -- mesmo conceito ter o mesmo nome no maior número de modelos possível.
  select f.val into v_campo
    from public.event_types et
    cross join lateral jsonb_array_elements(et.steps)        p(val)
    cross join lateral jsonb_array_elements(p.val->'fields') f(val)
   where f.val->>'id' = 'moradaExactaDoLocal'
   limit 1;

  if v_campo is null then
    raise warning '053/2.2: não encontrei `moradaExactaDoLocal` — nada feito.';
  else
    for v_id, v_nome in
      select et.id, et.nome
        from public.event_types et
       where et.nome ilike '%brunch%' or et.nome ilike '%inaugura%'
    loop
      update public.event_types
         set steps = public.dlm_inserir_campo_antes(
               steps, v_campo, 'contactoDoResponsavelPelaAberturaEspaco')
       where id = v_id;

      if not exists (
        select 1 from jsonb_array_elements((select steps from public.event_types where id = v_id)) s,
                      jsonb_array_elements(s->'fields') f
         where f->>'id' = 'moradaExactaDoLocal')
      then
        raise warning '053/2.2: âncora não existe em "%" — morada NÃO inserida.', v_nome;
      end if;
    end loop;
  end if;

  -- ── 2.3 · estiloPretendido: `paleta` → `checkbox` no Brunch e Inauguração
  -- As `options` são copiadas de um modelo onde o campo já é checkbox, em vez
  -- de escritas aqui: se ela editar as opções amanhã, esta migração não fica
  -- a contradizê-la.
  --
  -- Porquê corrigir: `paleta` é o tipo do SELECTOR DE CORES. Nestes dois
  -- modelos, quem escolhe o estilo recebia um selector de cores. E há efeito
  -- secundário: o DashboardTab, quando não encontra a chave canónica, apanha
  -- o PRIMEIRO campo de tipo `paleta` do modelo para o gráfico das «paletas
  -- mais populares» — ou seja, escolhas de estilo entravam no gráfico de cores.
  select f.val->'options' into v_options
    from public.event_types et
    cross join lateral jsonb_array_elements(et.steps)        p(val)
    cross join lateral jsonb_array_elements(p.val->'fields') f(val)
   where f.val->>'id' = 'estiloPretendido'
     and f.val->>'type' = 'checkbox'
     and jsonb_typeof(f.val->'options') = 'array'
   limit 1;

  if v_options is null then
    raise warning '053/2.3: não encontrei `estiloPretendido` do tipo checkbox com opções — nada feito.';
  else
    update public.event_types
       set steps = public.dlm_actualizar_campo(
             steps, 'estiloPretendido',
             jsonb_build_object('type', 'checkbox', 'options', v_options))
     where (nome ilike '%brunch%' or nome ilike '%inaugura%')
       and steps::text like '%estiloPretendido%';
  end if;
end
$$;


-- ============================================================================
-- 3 · VERIFICAÇÃO — corre a seguir, na mesma sessão
-- ============================================================================

-- 3.1 · 🔴 NENHUM id desapareceu, e os únicos novos são os três esperados.
--       Qualquer outra linha aqui é motivo para parar tudo.

select 'DESAPARECEU' as veredicto, a.modelo_id, a.campo_id
  from _ids_antes a
 where not exists (
   select 1 from public.event_types et
     cross join lateral jsonb_array_elements(et.steps)        p(val)
     cross join lateral jsonb_array_elements(p.val->'fields') f(val)
    where et.id = a.modelo_id and f.val->>'id' = a.campo_id)
union all
select 'NOVO', et.id, f.val->>'id'
  from public.event_types et
  cross join lateral jsonb_array_elements(et.steps)        p(val)
  cross join lateral jsonb_array_elements(p.val->'fields') f(val)
 where not exists (
   select 1 from _ids_antes a
    where a.modelo_id = et.id and a.campo_id = f.val->>'id')
 order by 1, 2;
-- Esperado: 3 linhas «NOVO» (numeroDeMesas ×1, moradaExactaDoLocal ×2).
--           ZERO linhas «DESAPARECEU».


-- 3.2 · O texto ficou como devia?

select nome,
       steps::text like '%Introduz um%'                              as resta_segunda_pessoa,
       steps::text like '%Informações base sobre os noivos%'          as resta_subtitulo_noivos,
       steps::text like '%Nome do Noiva%'
         or steps::text like '%Nome da Noivo%'                        as resta_etiqueta_trocada,
       steps::text like '%quere cenário fotoígrafável%'               as resta_gralha
  from public.event_types
 order by nome;
-- Esperado: tudo FALSE, excepto `resta_subtitulo_noivos` = true no
-- Casamento e no Noivado, onde a frase está certa e fica.


-- 3.3 · Os campos novos entraram no sítio certo?

select et.nome, p.ord as passo, f.ord as posicao, f.val->>'id' as campo
  from public.event_types et
  cross join lateral jsonb_array_elements(et.steps)        with ordinality p(val, ord)
  cross join lateral jsonb_array_elements(p.val->'fields') with ordinality f(val, ord)
 where f.val->>'id' in ('numeroDeMesas', 'nDeLugaresPorMesa',
                        'moradaExactaDoLocal', 'contactoDoResponsavelPelaAberturaEspaco',
                        'estiloPretendido')
 order by et.nome, p.ord, f.ord;


-- 3.4 · O `estiloPretendido` deixou de ser paleta nos dois?

select nome, f.val->>'id' as campo, f.val->>'type' as tipo,
       jsonb_array_length(coalesce(f.val->'options','[]'::jsonb)) as n_opcoes
  from public.event_types et
  cross join lateral jsonb_array_elements(et.steps)        p(val)
  cross join lateral jsonb_array_elements(p.val->'fields') f(val)
 where f.val->>'id' = 'estiloPretendido'
 order by nome;
-- Esperado: `checkbox` nos seis, com o mesmo n_opcoes.


-- ============================================================================
-- 4 · LIMPEZA — o andaime sai
--
-- A fotografia dos ids já cumpriu o seu papel na 3.1. Larga-se aqui, à vista,
-- em vez de se confiar em que a sessão a leve: uma tabela de andaime não deve
-- sobreviver à migração que a criou, e o esquema público não é sítio para ela.
--
-- ⚠ Se quiseres correr as verificações da 3 mais tarde, numa segunda sessão,
--    corre a secção 4 só depois — a 3.1 precisa da fotografia.
-- ============================================================================

drop table if exists _ids_antes;


-- ─── Nota · as duas funções auxiliares FICAM ────────────────────────────────
--
-- `dlm_inserir_campo_antes` e `dlm_actualizar_campo` não são andaime: são
-- ferramentas de manutenção de modelos, idempotentes e conservadoras, e a
-- próxima migração que mexa em `steps` vai querê-las. Ficam no público, com
-- comentário, como as outras funções `dlm_*` da casa.
--
-- Se preferires não as deixar, é aqui:
--   drop function if exists public.dlm_inserir_campo_antes(jsonb, jsonb, text);
--   drop function if exists public.dlm_actualizar_campo(jsonb, text, jsonb);
