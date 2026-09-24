# Catálogo de eventos

A gémea executável deste documento é `src/lib/analytics/eventos.js` — o que
não está lá declarado **não sai**. Mudar um evento = mudar os dois.

## Convenção de nomes

`<superfície/domínio>_<objecto>_<acção no passado>` em `snake_case`, inglês:
`public_quote_form_submitted`, `request_created`. Nada de `button_clicked`,
`agenda_button`, `thing_opened`.

## Propriedades comuns (todos os eventos nossos)

| Propriedade | Tipo | PII | Nota |
|---|---|---|---|
| `environment` | enum `production\|test\|development\|unknown` | não | de `VITE_APP_ENV` |
| `surface` | enum `public_form\|admin\|other` | não | derivada da rota |
| `route` | string (molde) | não | ex. `/evento/doluxoamesa/:id/documentos` — sem query, ids em `:id` |
| `authenticated` | bool | não | há sessão Supabase |
| `actor_type` | enum `internal\|anonymous` | não | `anonymous` ≠ `prospect` (não se prova) |

Não há `app_version`: o build não expõe nenhuma de forma segura hoje — não
se inventa.

## Formulário público (`/interesse`)

Todas levam `form_version` (enum, hoje `flat_2026_09`) e `tenant_slug`
(slug da casa — a empresa, não uma pessoa). Fonte canónica: **PostHog**
(comportamento). Nenhuma é crítica para o negócio — são o funil.

| Evento | Pergunta que responde | Quando dispara | Propriedades próprias |
|---|---|---|---|
| `public_quote_form_viewed` | Quantos chegam a ver o formulário? | O formulário foi desenhado (uma vez por visita) | — |
| `public_quote_form_started` | Quantos começam de facto? | 1.ª interacção a sério com um campo (escrever, escolher, tocar numa opção) — ou 1.ª tentativa de envio. **Nunca** a simples visita. Uma vez por visita. | — |
| `public_quote_form_required_completed` | Quantos chegam a ter tudo o obrigatório? | Os obrigatórios ficam completos pela 1.ª vez | `required_total` (int — o total dinâmico: opções só contam depois do espaço) |
| `public_quote_form_submit_attempted` | Quantas vezes se tenta enviar? | Cada toque em «Enviar pedido» / barra dourada | — |
| `public_quote_form_validation_failed` | Onde se tropeça? | Uma tentativa parou na validação | `invalid_fields` (lista de **nomes** de campo: `nome, contacto, whatsapp, tipo, data, convidados, espaco, localOutro, servicos, buffet, balcao`), `invalid_field_count` (int) |
| `public_quote_form_submitted` | Quantos concluem? | **O servidor confirmou** (nunca o clique). Uma vez por visita. | `deduplicated` (bool — o pedido juntou-se a um existente) |

Guardas: uma instância de funil por visita (`criarFunilFormulario`), com
«uma vez» por etapa — o StrictMode e os re-renders não duplicam.

## Pedido criado (espelho da verdade de negócio)

| Evento | Pergunta | Quando | Propriedades | Fonte canónica | Crítico |
|---|---|---|---|---|---|
| `request_created` | Quantos pedidos nascem, por onde e por quem — cruzado com comportamento | O servidor criou uma submissão nova (não em duplicados), em qualquer porta que use `captacao_submeter` (público e «+ Registar pedido») | `request_id` (uuid opaco), `submission_surface`, `submitted_by_type`, `attribution_method` (enums da 110 — **os valores gravados**, vindos da resposta do servidor), `returning_contact` (bool), `tenant_slug` | **Postgres** (`submissions.submissao_*`). O PostHog é espelho. | Sim — mas as contas de negócio fazem-se na base |

Sem a 110 aplicada, o servidor não devolve atribuição e o evento **não sai**
(não se inventa a partir do que o browser pediu).

## Eventos do SDK (comportamento, suplementares)

`$pageview` (em mudança de caminho), `$pageleave`, `$autocapture`
(click/submit/change, **sem texto nem atributos**), heatmaps, replay.
Nunca definem KPIs. Endereços limpos pelo `before_send`.

## Classificação de PII

Nenhuma propriedade deste catálogo é PII. As formas permitidas (enum, bool,
int, uuid, slug, lista fechada) não conseguem transportar um nome, telefone,
email, morada ou texto livre — e o filtro deita fora o que não encaixar.
