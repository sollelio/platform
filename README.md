# O gestor de eventos

Aplicação de gestão para uma empresa de decoração e aluguer para eventos:
o funil de pedidos, os formulários das clientes, os documentos
(orçamento · projecto · contrato), a agenda, a logística, os pagamentos e
o **Portal do Cliente**.

Primeira casa: **Do Luxo à Mesa**. O sistema é multi-casa desde as
migrações 090–108 — ver «A casa» já a seguir.

**⚠ O produto ainda não tem nome fechado.** O repositório chama-se
`noivos-form` (o nome do primeiro protótipo), o `.env` traz
`VITE_NOME_PRODUTO=Celebra`, o `src/lib/casa.js` avisa que «Celebra» já
está registada por outros em PT e no BR, e `docs/decisoes-de-produto.md`
regista «o nome Celebra mudou para Sollelio a 15/08» — mas *Sollelio* é
usada no resto da prosa como o nome do **fabricante**, não do produto.
São três nomes a apontar para duas coisas: quem repensar a arquitectura
faz bem em resolver isto primeiro, porque o nome do produto atravessa o
título do backoffice, o rodapé das folhas e o nome do repositório.

> *(Este ficheiro era o template do Vite até 18/08/2026. Se encontrar
> instruções sobre `@vitejs/plugin-react-swc` ou TypeScript, é porque
> alguém o repôs por engano.)*

---

## Correr

```bash
npm install
npm run dev      # vite
npm run build    # vite build
npm run lint     # eslint .
```

React 19 · Vite 8 · react-router 7 · Supabase (Postgres + Auth + Storage +
Realtime) · framer-motion · recharts · Tailwind 4. **Sem TypeScript** e sem
gestor de estado — o estado vive no URL e nas queries.

**Variáveis de ambiente** (`.env`): `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `VITE_APP_ENV` (`development`/`test` mostram a
faixa de ambiente), `VITE_NOME_PRODUTO`.

**O portão de qualidade é `esbuild` + `eslint` + `build`, os três.** A
linha de base do eslint é de **70 erros pré-existentes** (quase todos
`react-hooks` e `react-refresh`): o critério não é «zero erros», é **zero
erros NOVOS, contados por ficheiro**.

---

## Onde está o quê

```
src/
  pages/        uma por rota  (AdminPage, EventoPage, PortalPage, …)
  components/   admin/ · portal/ · captacao/ · form/
  lib/          a camada de dados e as regras — NUNCA importa de components/
docs/
  migracoes/    todo o SQL (88 ficheiros numerados, 020 → 108)
```

**A regra que mantém isto de pé: `lib/` nunca importa de `components/`.**
Módulos sem hook recebem casa e contexto por argumento. É o que mantém a
camada de dados servível a qualquer ecrã.

---

## A casa (multi-tenant)

**A casa vem do endereço** — no admin como no público:

```
/admin/:casa/documentos      /evento/:casa/:id/:aba      /interesse/:slug
```

Não há seletor de casa, e não há «casa activa» guardada em lado nenhum. A
razão está registada: um estado invisível de casa activa é precisamente o
que faz escritas caírem no sítio errado sem ninguém reparar.

Do lado da base: `tenants` + `memberships`, política `tenant_isolamento` em
31 tabelas, e `tenant_do_pedido(slug)` a confirmar a membership em cada
pedido.

---

## Os documentos, e por que ordem se lêem

Este projecto tem mais decisão escrita do que código. Não é acidente: a
prosa é onde vive o *porquê*, e o porquê é o que impede alguém de
«arrumar» uma coisa que estava certa.

**Antes de mexer em código, dois de leitura obrigatória:**

| ficheiro | o que é |
|---|---|
| **`docs/invariantes.md`** | as regras que o código inteiro assume. Curto de propósito. Se uma regra atrapalhar, o caminho é decisão registada — nunca excepção calada |
| **`docs/glossario.md`** | o vocabulário. Os nomes que a cliente vê, os que a Nádia vê, e os de máquina — e quais deles não se mudam |

**Para entender o sistema:**

| ficheiro | o que é |
|---|---|
| **`ESTADO_APP.md`** | o levantamento: rotas, schema tabela a tabela, RLS, perímetro público, realtime, design system. ⚠ Tem **duas vintages** por dentro (12/08 e 18/08) — a nota no topo diz quais |
| **`docs/decisoes-de-produto.md`** | o diário das decisões, por data, com o porquê de cada uma. É o ficheiro mais consultado do repositório |
| **`docs/identidade-visual.md`** | a identidade: paleta, tipografias, movimento, acessibilidade |

**Por tema:**

| ficheiro | o que é |
|---|---|
| `docs/portal-roteiro-de-teste.md` | o roteiro de teste do Portal do Cliente, dez secções |
| `docs/levantamento-comunicados.md` | o levantamento do módulo de comunicados |
| `docs/guiao-publicacao.md` | como se publica |
| `docs/prompt-migracao.md` | como se escreve uma migração nesta casa |
| `docs/prompt-*.md` | os briefings de cada arco (099 identidade, 100 casa desconhecida, 108 a casa no endereço, dark mode) |

---

## Duas regras de trabalho

1. **O git é do Hélio.** Não se commita nem se faz push sem ele pedir.
2. **As migrações corre-as o Hélio**, no SQL editor do Supabase. O
   repositório escreve o SQL; não o aplica, e **não sabe** o que está
   aplicado (ver `ESTADO_APP.md`, secção 7).
