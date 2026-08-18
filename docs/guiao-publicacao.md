# Guião do dia da publicação — **das migrações 036 a 047 (27/07/2026)**

> ## ⚠ Isto é o REGISTO de uma publicação, não um guião vivo (nota de 18/08/2026)
>
> O ficheiro descreve o dia em que se publicaram as migrações **036 a
> 047**, com os dados e as pendências desse dia («o par da Brenda», o
> re-teste do 1C). A cadeia vai hoje até à **108**. **Não o siga como
> lista de tarefas.**
>
> O que nele continua a valer é o MÉTODO, e vale a pena ler por isso:
> migrações antes do deploy quando são seguras com o código antigo no
> ar, cada uma corrida no SQL editor com a deteção conferida à mão,
> TEST primeiro e produção depois, idempotência provada por correr
> duas vezes.
>
> **O que este ficheiro torna evidente é que não há processo de
> publicação escrito em lado nenhum** — há o registo de um dia. Quem
> repensar a infra-estrutura tem aqui o melhor ponto de partida que
> existe, e a lacuna a fechar.

O caminho de TEST (develop) para PRODUÇÃO, pela ordem certa. Da 036 à
046, cada migração já foi corrida 2× em TEST (idempotência provada). A
**047 é nova e ainda não passou por TEST**: antes do dia, corre-a 2× em
TEST, confere a deteção e compara o número de "pessoas" da página
pública com o que o admin mostra na mesma campanha. Em produção
corre-se cada uma no SQL editor e confere-se a **deteção** (o último
resultado que o editor mostra — os anteriores ficam escondidos).

## 0 · Antes de começar (opcional, mas recomendado)

- **Par da Brenda** (produção): dois eventos iguais a 2026-08-01 debaixo
  do mesmo cliente — assinatura de reimportação. Se quiseres limpar,
  apaga o gémeo À MÃO antes da publicação (os avisos de vínculos do 1A
  mostram o que cada um arrasta). Nada disto bloqueia as migrações.
- Confirma que o **re-teste do 1C** (promessas: dupla confirmação,
  anular por cima de confirmada) ficou feito em TEST.

## 1 · Migrações ANTES do deploy (SQL editor de PRODUÇÃO, por ordem)

Todas seguras com o código antigo ainda no ar — ou são RPCs novas com
fallback no código, ou recriam funções com a mesma assinatura:

1. **036** — o formulário sem alvo deixa de duplicar clientes.
2. **038** — merge cirúrgico das respostas (o editor de data/briefing
   deixa de poder apagar respostas da cliente).
3. **039** — contribuição transacional (confirmar 2× deixa de duplicar
   dinheiro).
4. **042** — `campanha_id` nos pagamentos + RPCs por campanha. A seguir,
   no mesmo editor: `notify pgrst, 'reload schema';`
5. **043** — dedupe determinístico (empates resolvem sempre para o
   cliente mais antigo).
6. **044** — importação idempotente (reimportar não duplica).
7. **045** — backfill de `data_evento` a partir das respostas. **Lê a
   deteção**: o que ficar listado continua invisível à logística — se
   alguma linha dever ter data, decide-a à mão (a coluna
   `data_candidata` ajuda).
8. **047** — a contagem de "pessoas" da página pública passa a ser a
   mesma do admin.

Opcionais (podem ir hoje ou noutro dia, não dependem do deploy):

- **041** — deteção + unique nos previstos (`submission_id, ordem`).
- **046** — `lista_carga` sem NULL (deteção final tem de dar 0/0/0).

## 2 · Deploy do código

```
git checkout main
git merge develop
git push
```

Esperar o deploy do Netlify de produção terminar.

## 3 · Migração DEPOIS do deploy

9. **040** — invariante fase/status (backfills + CHECKs). É a única
   ACOPLADA: os CHECKs devolvem 23514 e é o código novo que traduz
   isso em mensagens amigáveis e faz a recuperação informada. Correr
   só com o site novo já no ar.

**Plano de recuo da 040** (se algo inesperado bloquear a Nádia):

```sql
alter table public.submissions
  drop constraint if exists submissions_status_pos_sinal;
```

(dropa SÓ o CHECK mais exigente; os backfills e o resto ficam — e a
040 volta a poder correr por cima quando a causa estiver percebida).

## 4 · Smoke test (10 minutos, no site de produção)

1. Captação pública: submeter com um telefone NOVO → um cliente, um
   evento.
2. Criar formulário APONTADO a um evento → preencher no anónimo →
   submeter → as respostas caem NESSE evento (sem cartão novo).
3. Funil: arrastar um cartão, registar um sinal pelo caminho normal.
4. Página de um evento: editar um campo do briefing e a data → guardar
   → recarregar → tudo lá.
5. Contribuição: confirmar uma promessa 1× (e verificar que segunda
   confirmação é recusada com a mensagem da casa).
6. Logística → "O que sai": o período mostra os eventos esperados;
   imprimir a conferência abre a janela dedicada.
7. Consola do browser sem erros vermelhos nas páginas principais.

## 5 · Se algo correr mal

- **040**: plano de recuo acima (uma linha).
- Restantes migrações: aditivas e idempotentes — não têm recuo porque
  não partem nada do código antigo; em último caso, o Netlify permite
  voltar ao deploy anterior num clique (Deploys → Publish deploy
  antigo), e a BD com as migrações continua compatível com ele (exceto
  a 040, que por isso é a última).
