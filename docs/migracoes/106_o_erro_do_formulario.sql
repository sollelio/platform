-- ============================================================================
-- 106 · Os erros do formulário, com casa e com prazo
--
-- A `form_errors` é a única tabela que ficou fora do modelo de casas. A 091
-- deixou-a de fora com um argumento que estava errado: «é diagnóstico do
-- developer, não dado de cliente». A coluna `respostas` desmente-o — guarda
-- o formulário inteiro no momento da falha, com nomes, contactos, moradas
-- e, num casamento, restrições alimentares.
--
-- ── PORQUE É QUE A COLUNA FICA ───────────────────────────────────────────
--
-- A leitura óbvia era apagá-la: minimização de dados, e um log técnico não
-- precisa do que a pessoa estava a escrever. Mas o cabeçalho do errosForm.js
-- diz a que veio, e não é diagnóstico:
--
--   «permite investigar a causa E recuperar os dados sem pedir ao cliente
--    para preencher tudo de novo»
--
-- Uma noiva preenche 44 campos e a submissão rebenta: aquilo é a única
-- cópia do trabalho dela. Apagar a coluna seria escolher, nesse dia, pedir-
-- lhe que recomeçasse.
--
-- A finalidade é legítima e é TEMPORÁRIA por natureza — serve para
-- recuperar agora, não daqui a um ano. Minimizar não é só recolher menos;
-- é guardar menos tempo. Por isso as respostas ganham prazo em vez de
-- desaparecerem.
--
-- ── TRÊS COISAS, e a do volume é a menor ─────────────────────────────────
--
--   1. ISOLAMENTO. Sem `tenant_id`, com duas casas a Nádia lê os erros do
--      buffet concorrente — com as respostas dos noivos dele lá dentro.
--   2. RETENÇÃO. Sem prazo. Dados pessoais guardados para sempre com uma
--      finalidade que se esgota em dias.
--   3. ESCRITA ILIMITADA. Qualquer pessoa insere linhas sem limite — o
--      caminho mais fácil para encher os 500 MB do plano.
--
-- A tabela está VAZIA (zero linhas, verificado). Nada a migrar, e é o
-- momento mais barato que alguma vez vai haver.
-- ============================================================================

-- ── 1 · A casa e o prazo ────────────────────────────────────────────────────
--
-- `tenant_id` nullable, ao contrário das raízes da 090: um erro pode
-- acontecer ANTES de se saber de que casa é (um slug inválido, um código
-- que não existe). Uma linha sem casa é um erro real que continua a valer
-- para diagnóstico — obrigá-la a ter casa seria perder precisamente os
-- erros mais interessantes.
--
-- `respostas_ate` é quando a cópia de recuperação expira. Fica na linha e
-- não numa constante do código: o dia em que o prazo mudar, as linhas
-- antigas mantêm o prazo com que nasceram, que é o que foi prometido.

alter table public.form_errors add column if not exists tenant_id uuid references public.tenants(id) on delete set null;
alter table public.form_errors add column if not exists respostas_ate timestamptz;

create index if not exists form_errors_tenant_idx on public.form_errors (tenant_id);
create index if not exists form_errors_respostas_ate_idx on public.form_errors (respostas_ate)
  where respostas is not null;

comment on column public.form_errors.respostas is
  'A cópia de recuperação — o formulário no momento da falha. NÃO é diagnóstico: existe para a cliente não ter de reescrever tudo. Esvazia-se ao fim de 30 dias (respostas_ate), porque passado esse tempo ninguém recupera nada e ficam a ser só dados pessoais guardados sem razão.';

comment on column public.form_errors.tenant_id is
  'Nullable de propósito: um erro pode acontecer antes de se saber a casa (slug inválido, código inexistente). Esses são precisamente os que mais interessa ver.';

-- ── 2 · A porta de escrita ──────────────────────────────────────────────────
--
-- O `insert` directo do anon morre. Passa por função, e a função faz três
-- coisas que uma política não sabe fazer: resolve a casa, põe o prazo, e
-- trava quem insistir.
--
-- O LIMITE é por casa e por hora. Vinte é generoso para um formulário que
-- rebenta — se rebentar vinte vezes numa hora, o problema não se resolve a
-- ler a vigésima primeira linha. E é o suficiente para tornar inútil quem
-- quisesse encher a tabela.
--
-- Passado o limite, a função devolve `false` em silêncio em vez de levantar
-- excepção: o registo de erros é fire-and-forget por desenho (o cliente já
-- está a ver uma mensagem de erro; não o piorar). Rebentar aqui seria o
-- registo de erros a causar um erro.

create or replace function public.registar_erro_formulario(
  p_origem text,
  p_mensagem text,
  p_detalhe jsonb default null,
  p_contexto jsonb default null,
  p_respostas jsonb default null,
  p_tenant_slug text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  c_limite_hora constant integer := 20;
  c_dias_recuperacao constant integer := 30;
  v_tenant uuid;
  v_recentes integer;
begin
  v_tenant := case when p_tenant_slug is null
                   then public.tenant_actual()
                   else public.tenant_por_slug(p_tenant_slug) end;

  -- A limpeza vive AQUI, não num agendador. O pg_cron existe no Supabase
  -- mas pausa com o projecto no plano gratuito, e uma limpeza que depende
  -- de alguém verificar se o cron ainda corre é uma limpeza que um dia
  -- deixa de correr sem ninguém dar por isso.
  --
  -- Se ninguém escrever durante meses, nada se limpa — mas também não há
  -- respostas novas a expirar: as antigas foram limpas na última escrita.
  update public.form_errors
     set respostas = null, respostas_ate = null
   where respostas is not null
     and respostas_ate is not null
     and respostas_ate < now();

  -- O travão. Conta por casa; linhas sem casa contam entre si.
  select count(*) into v_recentes
    from public.form_errors
   where created_at > now() - interval '1 hour'
     and (tenant_id = v_tenant or (tenant_id is null and v_tenant is null));

  if v_recentes >= c_limite_hora then
    return false;
  end if;

  insert into public.form_errors
    (origem, mensagem, detalhe, contexto, respostas, tenant_id, respostas_ate)
  values (
    coalesce(nullif(btrim(p_origem), ''), 'desconhecida'),
    p_mensagem,
    p_detalhe,
    p_contexto,
    p_respostas,
    v_tenant,
    case when p_respostas is not null
         then now() + (c_dias_recuperacao || ' days')::interval end);

  return true;
end
$$;

revoke all     on function public.registar_erro_formulario(text, text, jsonb, jsonb, jsonb, text) from public, anon;
grant  execute on function public.registar_erro_formulario(text, text, jsonb, jsonb, jsonb, text) to anon, authenticated;

-- ── 3 · As políticas ────────────────────────────────────────────────────────
--
-- O `insert` anónimo directo sai — a porta é a função. A leitura passa a ser
-- por casa, com uma excepção: as linhas SEM casa vêem-se por quem estiver
-- autenticado. São os erros de quem nem chegou a ser identificado, e
-- escondê-los de toda a gente seria guardá-los para ninguém.

drop policy if exists publico_regista_erros on public.form_errors;
drop policy if exists equipa_le_erros       on public.form_errors;
drop policy if exists tenant_isolamento     on public.form_errors;

create policy tenant_isolamento on public.form_errors
  for all to authenticated
  using (tenant_id is null or tenant_id in (select public.tenants_do_utilizador()))
  with check (tenant_id in (select public.tenants_do_utilizador()));

-- ============================================================================
-- VERIFICAÇÃO — correr depois, em TESTE
-- ============================================================================
-- 1 · O insert directo do anon já não passa. Confirma-se na app, não aqui —
--   o SQL Editor corre como service_role e contorna as políticas.
--
-- 2 · A função regista, com casa e com prazo:
--   select public.registar_erro_formulario(
--     'teste', 'mensagem de teste', null, null,
--     '{"campo":"valor"}'::jsonb, 'doluxoamesa');
--   -- Esperado: true
--   select origem, tenant_id is not null as tem_casa, respostas_ate
--     from form_errors order by created_at desc limit 1;
--   -- Esperado: tem_casa true, respostas_ate daqui a 30 dias
--
-- 3 · A limpeza funciona. Forçar uma linha expirada e escrever outra:
--   update form_errors set respostas_ate = now() - interval '1 day'
--    where origem = 'teste';
--   select public.registar_erro_formulario('teste2','x',null,null,null,'doluxoamesa');
--   select origem, respostas is null as limpa from form_errors order by created_at;
--   -- Esperado: a linha 'teste' com respostas a null; a linha continua lá
--
-- 4 · O travão. Vinte e uma chamadas seguidas — a última devolve false:
--   select public.registar_erro_formulario('carga','x',null,null,null,'doluxoamesa')
--     from generate_series(1, 21);
--   -- Esperado: as primeiras true, as últimas false
--
-- 5 · LIMPAR o que os testes deixaram:
--   delete from form_errors where origem in ('teste','teste2','carga');
--
-- 6 · A APP: o painel de erros do admin deve continuar a listar. E o
--   registo de um erro real — se souber provocar um — deve escrever.
-- ============================================================================