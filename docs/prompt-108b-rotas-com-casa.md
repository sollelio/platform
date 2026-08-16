# 108b · As rotas do admin ganham a casa

## O contexto

A migração 108 já correu em staging e produção. Do lado do servidor está
tudo pronto; falta o frontend.

**O que existe agora na base:**

- `tenant_do_pedido(p_slug)` — a casa do slug, confirmada contra a
  membership de quem pede. `NULL` se a casa não existe, está suspensa, ou
  não é de quem pergunta.
- `tenant_actual()` — deixou de escolher. Zero memberships → `NULL`; uma →
  essa; **duas ou mais → `raise CASA_AMBIGUA`**, com a frase em
  `error.hint`.
- `identidade_da_minha_casa(p_slug)` — três respostas: `conhecida` (com a
  casa), `suspensa` (com a casa, para o ecrã que explica), `desconhecida`.
  A versão **sem argumentos ainda existe** e é a que o `CasaProvider`
  chama hoje — sai quando passares o slug.
- `as_minhas_casas()` — `(slug, nome, estado)` de quem tem sessão.
- `captacao_submeter` e `registar_erro_formulario` — com sessão, o slug
  passa a ser verificado contra a membership.

**Testado em staging com duas casas:** criar um cliente rebenta com
`CASA_AMBIGUA` em vez de o criar na casa mais antiga. É o bug que isto
vem fechar.

**Ler primeiro:** `docs/prompt-108-casa-no-endereco.md` (a decisão e o
desenho aprovado), a secção da 108 em `docs/decisoes-de-produto.md`, e
`docs/invariantes.md`.

## A tarefa

```
/admin/:casa/inicio      /admin/:casa/documentos     /evento/:casa/:id/…
```

Três frentes, e a ordem importa.

### 1 · As rotas e o Provider

O `src/lib/rotasAdmin.js` tem doutrina escrita: os ids dos separadores
nunca mudam, e «o URL é para humanos». Lê-o antes de tocar — o que fizeres
tem de continuar a respeitá-lo.

A `AreaAutenticada` (a rota-molde que montaste na 099) lê `:casa` e o
`CasaProvider` chama `identidade_da_minha_casa(slug)` em vez da versão sem
argumentos. O Provider já recebe `carregar` por prop — a mudança é local.

**Três respostas, três comportamentos:**

- `conhecida` → como hoje.
- `suspensa` → um ecrã que explica. Hoje uma casa suspensa deixa o admin
  com **todas as listas vazias** e nada a dizer porquê — está registado
  como pendência da 104, e esta é a oportunidade de a fechar. O texto é
  decisão do Hélio: propõe e espera.
- `desconhecida` → o endereço não é de quem entrou. Também precisa de
  ecrã, e também de texto por aprovar.

### 2 · Os endereços antigos

`/admin/inicio` sem casa tem de continuar a funcionar — a Nádia tem-nos
em favoritos. Usa `as_minhas_casas()`: uma casa, redirecciona; mais do que
uma, o redirect não pode adivinhar.

**Regista como pendência com a condição escrita:** o redirect morre no dia
da segunda casa, e nesse dia a escolha faz-se por navegação — nunca por
seletor persistente (foi decisão explícita: um seletor tornaria a casa
activa num estado invisível, que é o problema que isto resolve).

### 3 · O helper dos code-words

Nenhum sítio do `src/` traduz `CASA_AMBIGUA`, `CASA_ERRADA`,
`CASA_DESCONHECIDA` ou `NOME_OBRIGATORIO` — verificaste isso tu próprio.
Hoje o sintoma é a frase genérica de gravação, ou o code-word cru entre
parênteses (`CaptacaoForm:378`).

Um helper único que traduz, com fallback para o `error.hint` do servidor.
Propõe as frases e espera — texto de interface é do Hélio.

### 4 · Os RPC que passam a receber a casa

Com a rota a saber a casa, estes deixam de cair no `tenant_actual()`:

- `captacao_submeter` — o modo interno (`CaptacaoForm` com `modoInterno`)
  passa o slug da rota em vez de `null`.
- `dlm_dia_estado` — o `disputaDia.js` envia o slug quando não houver
  `excluirId` (consultar um dia livre).
- `registar_erro_formulario` — o admin passa a enviar o slug.

⚠ O `dlm_dia_estado` da base ainda **não aceita** `p_tenant_slug` — recebe
`p_tenant uuid`. Se precisares dele, diz: é SQL, e é do Hélio.

## O que fica para depois, e não é bloqueio

O **caminho 2** — o frontend enviar `tenant_id` explícito em cada insert,
~13 sítios em 8 tabelas. Faz-se por lotes ao ritmo que der: a rede
endurecida já impede a mentira, porque uma escrita ou vai explícita ou
parte alto. **Não o faças neste lote.**

## O que NÃO fazer

- **Não commites e não faças push.** O git é do Hélio.
- Não construas seletor de casa.
- Não mudes texto de interface sem propor.
- Não instales dependências novas.

## O portão

`esbuild` + `eslint` + `build`, os três, entre cada lote. Baseline 70
erros pré-existentes; zero **novos**, contados por ficheiro.

## O teste que prova

Com uma casa, nada disto se exercita. Em **staging**:

```sql
insert into tenants (slug, nome, prefixo)
  values ('casa-dois', 'Casa Dois', 'CDOIS');
insert into memberships (user_id, tenant_id, papel)
  select u.id, t.id, 'gestor' from auth.users u cross join tenants t
   where u.email = '<o email do Hélio no staging>' and t.slug = 'casa-dois';
```

⚠ O prefixo só aceita `^[A-Z]{2,6}$` — letras, sem dígitos.

Com as duas memberships: `/admin/doluxoamesa/inicio` funciona,
`/admin/casa-dois/inicio` funciona, e criar um cliente em cada um cria na
casa certa. Sem casa no URL, o redirect não adivinha.

Limpar no fim:

```sql
delete from memberships where tenant_id = (select id from tenants where slug='casa-dois');
delete from tenants where slug='casa-dois';
```

## Como trabalhar

Rotas e Provider primeiro. **Para e mostra** antes de seguires para os
ecrãs de suspensa/desconhecida e para o helper — as frases precisam de
aprovação, e prefiro dá-la uma vez do que corrigi-las três.