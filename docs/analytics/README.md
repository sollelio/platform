# Analytics de produto — a fundação

Fatia 1 (24/09/2026): **fundação + atribuição da submissão de pedidos**.
Não inclui instrumentação do backoffice inteiro, Sentry, dashboards nem
relatórios — isso são as fatias seguintes (ver fim).

## Quatro coisas separadas

| Camada | Onde vive | Para quê |
|---|---|---|
| **A. Verdade de negócio** | Supabase/Postgres | Factos: um pedido existe, de onde veio, quem o preencheu |
| **B. Analytics de produto** | PostHog (projecto UE) | Comportamento: o que se abre, o que se usa, onde se tropeça |
| **C. Observabilidade técnica** | *(fatia futura — Sentry)* | Erros, performance |
| **D. Histórico/auditoria** | Postgres (`criado_por`, tabelas de facto) | Quem fez o quê |

A regra que não se dobra: **um facto de negócio mora na base.** O PostHog
espelha-o para cruzar com comportamento, nunca o substitui. Não há tabela
genérica de logs.

## A fronteira do fornecedor

```
ecrãs ──► lib/analytics/index.js  (analytics.track / analytics.rota)
              │
              ├─ nucleo.js         criarAnalytics: catálogo, fila, no-op, identidade
              ├─ eventos.js        o catálogo executável (lista de permissão)
              ├─ privacidade.js    rotas medidas, endereços em molde, filtro de propriedades
              ├─ funilFormulario.js o funil do /interesse, com guardas contra re-render
              ├─ configuracao.js   a configuração do PostHog (pura, testada)
              └─ posthog.js        o ÚNICO ficheiro que importa posthog-js (import dinâmico)
```

Nenhum ecrã chama `posthog.*`. Trocar de fornecedor = reescrever
`posthog.js`. Testes: `src/lib/analytics.test.mjs` (fornecedor falso — não
dependem dos internos do SDK).

## Ambientes

| Variável | Para quê |
|---|---|
| `VITE_POSTHOG_KEY` | Chave do projecto. **Um projecto por ambiente** (TEST ≠ PROD). Sem ela: no-op. |
| `VITE_POSTHOG_HOST` | Endereço de ingestão. Omissão: `https://eu.i.posthog.com` (UE). |
| `VITE_APP_ENV` | Já existia. `production` \| `test` \| `development` — vai em todos os eventos. Sem valor declarado: no-op. |
| `VITE_ANALYTICS_DESLIGADA` | `true` desliga à mão. |

- `npm run dev` **nunca** envia para `production` (mesmo com a chave de
  produção no `.env` local).
- O SDK só se descarrega na primeira visita a uma superfície medida.

## Onde se mede (e onde nunca)

**Mede-se:** `/interesse`, e o backoffice (`/admin`, `/evento`, `/briefing`).

**Nunca:** as páginas por token — `/acompanhar`, `/contribuir`,
`/comunicado`, `/disponibilidade` — nem o formulário por convite (`/`,
`/formulario`). O token no endereço é a chave de acesso de uma cliente. Quem
entra por lá nunca carrega o SDK; quem navega para lá a partir de uma
superfície medida pára a gravação e os eventos caem no `before_send`.

## Privacidade — regras duras

**Nunca sai para o PostHog:** nomes, emails, telefones, moradas, corpos de
mensagens, texto livre, notas privadas, valores escritos por clientes,
segredos, tokens.

Como se garante (camadas, não confiança):

1. **Lista de permissão por evento** (`eventos.js`). Uma propriedade não
   declarada, ou com um valor fora da forma (enum, bool, int, uuid, slug),
   cai. Testado com PII de propósito.
2. **Endereços em molde** em TODOS os eventos, incluindo os do SDK
   (`$current_url`, `$referrer`, `$pathname`, `$initial_*`…): sem query, sem
   hash, uuids → `:id`, tokens → `:token`.
3. **Autocapture sem conteúdo**: `mask_all_text` e
   `mask_all_element_attributes` (um `aria-label="Ficha de <nome>"` é PII).
4. **Identidade** só por uuid interno; propriedades de pessoa só
   `role=internal` e `environment`.

### Session Replay

Conferido contra os tipos do SDK instalado (`posthog-js` 1.434.x):

- `maskAllInputs: true` — todos os inputs;
- `maskTextSelector: "*"` — **todo o texto** (o backoffice é feito de nomes;
  mascarar «só os sensíveis» esquecia um). Também as etiquetas do formulário
  público — é o preço da regra;
- `maskInputFn` / `maskTextFn` → máscara de **comprimento fixo** (`•••`):
  `*********` diria que o telefone tem nove dígitos;
- `blockSelector: img, video, canvas, iframe, …` — fotografias de referência,
  o mapa; `data-analytics-bloquear` para blocos futuros;
- sem consola (`enable_recording_console_log: false`), sem rede
  (`recordHeaders/recordBody: false`, `capture_performance: false`) — os
  URLs da API levam filtros com dados;
- sem exceções automáticas (fatia de observabilidade) e sem inquéritos.

**Verificado num servidor de ingestão falso** (payloads reais do SDK,
descomprimidos, incluindo os `$snapshot`): valores-marca escritos nos campos
(nome, telefone, morada, mensagem) e os nomes da Home do backoffice não
aparecem em lado nenhum.

**Limitação conhecida:** o evento *meta* do replay leva o `href` cru da
página (o `before_send` não o vê). Nas superfícies medidas só há uuids e
query inofensiva, e a gravação pára antes de qualquer página por token.
Cinto e suspensórios: configurar no projecto PostHog a *URL blocklist* de
replay com `/acompanhar`, `/contribuir`, `/comunicado`, `/disponibilidade`.

Verificado no projecto TEST real (24/09): a gravação guarda o `first_url`
cru da primeira página medida (ex.: `/interesse/doluxoamesa?entrada=interna`
— inofensivo) e nenhuma rota por token; ao navegar para lá, zero pedidos
(nem eventos, nem `/s/`). As chaves de URL do `$heatmap_data` são limpas no
`before_send` como os restantes endereços.

### GeoIP (achado no projecto TEST real, 24/09)

O PostHog enriquece cada evento com cidade, código postal e
latitude/longitude a partir do IP **antes** de o «Discard client IP» o
descartar (41/41 eventos no TEST). O `before_send` acrescenta
`$geoip_disable: true` a todos os eventos (incluindo o `$set` do SDK) —
o servidor deixa de enriquecer. Cinto e suspensórios: desligar também a
transformação GeoIP no projecto (Data pipelines).

### A configurar no projecto PostHog (não é código)

- Região **UE**; um projecto por ambiente.
- *Discard client IP data* ligado.
- Replay: URL blocklist (acima); *capture console logs* e *network* desligados.
- Autocapture/heatmaps ligados (o código já mascara o conteúdo).
- A opção de projecto «Privacy and masking» está em «Normal (mask inputs
  but not text/images)» e «Capture network requests» ligada: o código
  pede mais (todo o texto, imagens bloqueadas, sem rede/performance) —
  confirmar no replay real que a configuração do cliente prevalece; se
  não prevalecer, subir o projecto para o nível mais restrito.
- O replay só arranca depois de o separador ter estado **visível** (o SDK
  não grava separadores em segundo plano/pré-renderizados) — relevante
  para testes automáticos.
- Em `localhost`/`127.0.0.1` o SDK marca `$internal_or_test_user` e cria
  perfil também ao anónimo — artefacto de teste local.

## Atribuição da submissão (verdade de negócio — migração 110)

Duas perguntas que nunca se fundem numa «origem»:

| Coluna (`submissions`) | Pergunta | Valores |
|---|---|---|
| `submissao_superficie` | **ONDE** | `public_form` · `admin_form` · `import` · `other` |
| `submissao_autor_tipo` | **QUEM** | `internal_user` · `unknown` · `prospect` (reservado) |
| `criado_por` (da 105) | **qual utilizador** | uuid da sessão, ou NULL |
| `submissao_atribuicao` | **como se sabe** | `admin_form` · `internal_entry_point` · `authenticated_session` · `unidentified` |

O `submitted_by_user_id` do desenho é o `criado_por` que a 105 já grava: não
se cria uma segunda coluna com o mesmo facto.

**As regras** (dentro de `captacao_submeter`, `SECURITY DEFINER`):

- **QUEM vem sempre da sessão** (`auth.uid()`), nunca do browser. Com sessão,
  a casa já foi confirmada contra a membership (108) — quem chega ao insert
  autenticado é membro da casa.
- **«+ Registar pedido»** → `admin_form` · `internal_user` · `admin_form` · uuid.
- **/interesse com sessão interna** → `public_form` · `internal_user` ·
  `authenticated_session` (ou `internal_entry_point` se entrou pelo atalho
  «Preencher formulário público») · uuid.
- **/interesse sem sessão** → `public_form` · **`unknown`** · `unidentified`.
  Não é `prospect` porque nada o prova: pode ser a cliente, ou a Nádia com a
  sessão fechada. Não se adivinha por nome, telefone, IP, dispositivo.
- O anónimo não consegue declarar-se admin nem interno (a declaração é
  ignorada sem sessão).
- Sessão interna sem declaração (browser antigo em cache) → `other`.
- **Histórico:** NULL nas três colunas = anterior à atribuição. Sem backfill.
- **Imutável:** um gatilho recusa reescrever a atribuição (`ATRIBUICAO_IMUTAVEL`).
- **O autor também:** `criado_por` deixa de ser reescrevível por um membro —
  reatribuir, apagar à mão, «preencher» um NULL histórico ou forjá-lo num
  insert com sessão dão `AUTORIA_IMUTAVEL`. A limpeza da FK `ON DELETE SET
  NULL` continua a passar (só se aceita pôr a NULL quando a conta já não
  existe em `auth.users`). Gatilho em vez de privilégios de coluna: a tabela
  tem GRANT de tabela, e um REVOKE de coluna não o estreita.
- Os outros caminhos de criação (+ Novo evento, convites, importador) ficam
  NULL até à fatia seguinte.

O atalho **«Preencher formulário público»** vive no «Novo pedido» do Início e
do Funil; abre o `/interesse` da casa num separador novo com a sessão
intacta. No `/interesse`, quem é da casa vê um aviso discreto («A preencher
em nome de um cliente · fica registado como teu») — confiança pela
membership (`tenant_do_pedido`), nunca pelo `?entrada=interna`.

## As duas métricas que não se confundem

**Taxa de pedidos self-service** — *verdade de negócio (SQL, nunca PostHog)*:

```
pedidos com submissao_autor_tipo = 'prospect'  /  todos os pedidos qualificados
```

Hoje nada é `prospect` (ver acima), por isso o número honesto é um
**intervalo**:

```
limite inferior: 0   (nenhum pedido anónimo é provadamente da cliente)
limite superior: pedidos public_form + unknown  /  pedidos atribuídos
```

**Taxa de conclusão do formulário público** — *analytics de produto (PostHog)*:

```
public_quote_form_submitted  /  public_quote_form_started
```

Respondem a perguntas diferentes: a primeira diz quanto trabalho a cliente
faz sozinha; a segunda diz quanto o formulário perde pelo caminho.

## Versão do formulário

`FORM_VERSION = "flat_2026_09"` (em `eventos.js`) — o formulário plano
restaurado a 24/09. Muda quando o formulário muda (campos, ordem, fluxo),
nunca por deploy nem pelo SHA.

## Canal de aquisição (o que existe)

O formulário tem «Como nos conheceste?» → `respostas.canalOrigem`
(Instagram, Facebook, WhatsApp, Recomendação, Pesquisa Google, Outro;
opcional; 109). É **aquisição** (como a pessoa conheceu a casa), não **canal
do pedido** (por onde o pedido chegou — WhatsApp, telefone, formulário). Não
se reaproveita. O canal do pedido é hoje inferível só em parte (superfície +
«transcreve o que a pessoa te disse»). Próximo passo proposto: um campo
curto no «Novo pedido» interno — «Por onde chegou?» (WhatsApp · Instagram ·
Telefone · Presencial · Email) — gravado em coluna própria, numa fatia
dedicada.

## Próximas fatias

1. Atribuir os outros caminhos de criação (+ Novo evento, convites, importador).
2. Instrumentação semântica do backoffice (módulos abertos vs usados).
3. Canal do pedido (acima).
4. Observabilidade técnica (Sentry) — fatia própria.
5. Dashboards/relatórios sobre a verdade de negócio + PostHog.
