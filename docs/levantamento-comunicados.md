# Levantamento — módulo de comunicados

**Data:** 03/08/2026 · **Âmbito:** leitura do repositório, sem alterações
de código · **Para:** o desenho do módulo de comunicados (modelo de
comunicado → comunicado, canal WhatsApp com email desligável, folha em
PDF, produto multi-negócio).

**Como ler este relatório:** toda a afirmação vem com `caminho:linha`.
Onde está escrito **«não encontrei»** é porque a pesquisa não devolveu
nada — não se preencheu com o que seria natural existir. O que é leitura
directa do código vem sem marca; o que é conclusão minha vem marcado
**[inferência]**. No fim: três parágrafos de síntese e as consultas SQL
para o que só a base de dados sabe responder.

**Nota transversal que aparece em várias secções:** as migrações
**001–019 não estão no repositório** — `docs/migracoes/` começa na
`020_rpcs_formularios_publicos.sql`. Os `CREATE TABLE` de `clientes`,
`invites`, `mensagens_tipo` e `app_config` não estão versionados; a forma
dessas tabelas foi reconstruída pelo uso no código, e está marcada como
tal.

---

## SECÇÃO A — Mensagens, o que já existe

### 1. O separador Mensagens: rota, ficheiros, tabelas

**Rota:** `/admin/mensagens`. O id interno `mensagens` mapeia ao slug `mensagens` em `src/lib/rotasAdmin.js:35`; o URL cai na rota genérica `path="/admin/:separador/:p1?/:p2?"` em `src/App.jsx:103`. A entrada de navegação vive no grupo `NAV_GESTAO` — `src/components/admin/Navegacao.jsx:26` (`{ id: "mensagens", label: "Mensagens", icone: "mensagens" }`).

**Montagem:** `src/pages/AdminPage.jsx:53` (import) e `src/pages/AdminPage.jsx:985-986` — `{activeTab === "mensagens" && <MensagensTab />}`.

**Ficheiros:**
- `src/components/admin/MensagensTab.jsx` — o separador; monta `<MensagensConteudo dados={null} reordenavel />` (`MensagensTab.jsx:47`).
- `src/components/admin/MensagensSheet.jsx` — o miolo partilhado `MensagensConteudo` (`MensagensSheet.jsx:100`) e a folha `MensagensSheet` que abre do drawer de um evento (`MensagensSheet.jsx:553`).
- `src/lib/mensagens.js` — CRUD e resolução de placeholders.

**Tabela — lê e escreve `mensagens_tipo`:**
- Leitura: `getMensagens` — `select * where ativo=true order ordem` (`src/lib/mensagens.js:10-18`).
- Escrita: `createMensagem` (insert — `mensagens.js:37-44`), `updateMensagem` (update com whitelist `titulo, corpo, ordem, ativo` — `mensagens.js:49-65`), `removerMensagem` = soft-delete `ativo=false` (`mensagens.js:68`). A reordenação por arrasto grava `ordem` em fundo (`MensagensSheet.jsx:128-133`).

### 2. Mensagens-tipo com substituições

**Onde vivem:** na tabela `mensagens_tipo` da base de dados — não em constante de código. O comentário de topo diz «CRUD sobre a tabela mensagens_tipo (migração 015)» (`src/lib/mensagens.js:4-6`). **A migração 015 não está no repositório** — `docs/migracoes/` começa em `020_rpcs_formularios_publicos.sql`; do SQL de criação e do seed («o seed da 015 usa chaves fixas» — `mensagens.js:20-21`) **não encontrei** o ficheiro. A tabela aparece só na lista de RLS de `docs/migracoes/021_rls_bloquear_anon.sql:41` e numa contagem em `docs/migracoes/limpeza_dados_teste.sql:105`.

**Forma de um registo** [inferência do código, sem o CREATE TABLE à vista]: `id`, `chave` (geradas como `custom_<timestamp>` — `mensagens.js:36`), `titulo`, `corpo`, `ordem`, `ativo` (insert em `mensagens.js:40`; whitelist de update em `mensagens.js:50`).

**Tokens — lista exaustiva** (`src/lib/mensagens.js:98-105`):
- `{NOME}` — `dados.nomeCliente`
- `{TIPO_EVENTO}` — `dados.tipoEvento`
- `{DATA}` — `dados.dataEvento` formatada dd/mm/aaaa (`mensagens.js:73-78`)
- `{VALOR}` — valor em euros (`mensagens.js:80-85`)
- `{SINAL}` — 50% do valor (`mensagens.js:103`)
- `{LINK_INTERESSE}` — `window.location.origin + "/interesse"` (`mensagens.js:104`)

Sem dados, cada token vira `"___"` (`mensagens.js:88-90`). Estão documentados na UI do editor em `MensagensSheet.jsx:403-406`.

**Função que os aplica:** `resolverMensagem(corpo, dados)` — `src/lib/mensagens.js:91-110` (split/join por cada chave do mapa, `mensagens.js:106-109`).

### 3. Quem consome as mensagens

- **Separador Mensagens** (`/admin/mensagens`): biblioteca sem contexto de evento (`dados={null}`, tokens como `___` — `MensagensTab.jsx:9-11,47`). Ações: Copiar para o clipboard (`MensagensSheet.jsx:159-168`), editar tocando no texto (`MensagensSheet.jsx:288-291`), criar, remover (confirmação inline), reordenar. Aqui **não há** botão WhatsApp — o botão por mensagem só se renderiza quando `linkWhatsApp(whatsapp)` devolve algo (`MensagensSheet.jsx:258`) e o separador não passa `whatsapp` (`MensagensTab.jsx:47`; default `null` em `MensagensSheet.jsx:103`).
- **Drawer de um evento** (`SubmissionDrawer`): o botão «WhatsApp» (`src/components/admin/SubmissionDrawer.jsx:502-522`) abre a `MensagensSheet` (`SubmissionDrawer.jsx:529-535`) com `dados` construídos inline — `{ nomeCliente, tipoEvento, dataEvento, valor }` (`SubmissionDrawer.jsx:223-232`) — e `whatsapp` = respostas `numeroWhatsapp || contactoPrincipal` (`SubmissionDrawer.jsx:187-190`). Depois de escolher uma mensagem: **Copiar** → clipboard com o texto já resolvido (`MensagensSheet.jsx:159-168`), ou **💬 WhatsApp** → `window.open(wa.me com ?text=<mensagem resolvida>)` (`MensagensSheet.jsx:258-284`). Nota: o comentário em `MensagensSheet.jsx:41` diz que `dados` vem de `getDadosParaDocumento`, mas o drawer constrói o objecto à mão (`SubmissionDrawer.jsx:223-232`); `getDadosParaDocumento` (`src/lib/clientes.js:575`) serve os geradores de documentos.
- O drawer é montado por cinco superfícies — imports em `src/pages/AdminPage.jsx`, `src/components/admin/CentroNotificacoes.jsx`, `src/components/admin/orcamentos/DocumentosTab.jsx`, `src/components/admin/PortalDoClienteSheet.jsx`, `src/components/admin/ClientesLista.jsx`; o próprio código fala em «cinco superfícies... (Início, Contactos, funil, Agenda, notificações)» (`SubmissionDrawer.jsx:214-215`).
- Não há envio nenhum: é sempre copiar, ou abrir o WhatsApp com o texto pré-escrito para a Nádia enviar à mão.

### 4. O botão WhatsApp do CabecalhoEvento

- O botão está em `src/components/admin/CabecalhoEvento.jsx:365-374` e só se renderiza se a prop `onWhatsApp` existir (`CabecalhoEvento.jsx:365`).
- O handler vem de `src/pages/EventoPage.jsx:802-806`: `window.open(ligacaoWhatsApp, "_blank")` — **wa.me**, não `whatsapp://`, não clipboard.
- **Texto: nenhum.** `ligacaoWhatsApp = linkWhatsApp(numeroWhatsapp)` sem segundo argumento (`EventoPage.jsx:574`) — abre a conversa vazia.
- **Número:** das respostas do evento — `getValorAtual(submissao, "numeroWhatsapp") || getValorAtual(submissao, "contactoPrincipal")` (`EventoPage.jsx:570-573`).
- **Anexos:** não encontrei — é um `window.open` de um link `wa.me` (`https://wa.me/<dígitos>?text=` construído em `src/lib/mensagens.js:118-125`; normalização: só dígitos, cai o `00` inicial, 9 dígitos ganham `351`, menos de 9 → `null`).

### 5. WHATSAPP_URL e números em bruto

- **Definição:** `src/components/portal/base.js:80-81` — constante **hard-coded no código** (não vem de env): `"https://wa.me/351927177190?text=Ol%C3%A1%21%20Escrevo%20a%20partir%20da%20p%C3%A1gina%20de%20acompanhamento%20do%20meu%20evento."`. Ao lado, `SITE_URL = "https://doluxoamesa.pt"` também hard-coded (`base.js:82`).
- **Usos:** `src/pages/PortalPage.jsx:36,189-206,425-426,626-629` e `src/components/portal/DocumentosVista.jsx:7,1025,1063,1149,2104`.
- **Grep por `9[0-9]{8}` / `+351` / `wa.me` / `whatsapp://`:**
  - `src/components/portal/base.js:81` — o **único** número real da casa no código (`351927177190`).
  - `src/pages/FormPage.jsx:737,750` — `"912345678"` / `"934567890"` dentro de `fillTestData` (dados de demonstração, `FormPage.jsx:733`).
  - `docs/portal-roteiro-de-teste.md:94` — `'910000000'` (evento de teste); `docs/prompt-migracao.md:58,97` — `"912345678"` (exemplos); `docs/decisoes-de-produto.md:29` — exemplos de formatos.
  - `wa.me` **sem número** (o utilizador escolhe o destinatário): `src/components/admin/ShareSheet.jsx:99` e `src/components/admin/ContribuicaoColetiva.jsx:1010-1018` (`wa.me/?text=`).
  - `whatsapp://` — não encontrei.

### 6. Envio automático de mensagens hoje

**Não.** Termo a termo (grep em `src`, `supabase`, `docs`, `scripts`, `package.json`, `index.html`, `public`):
- `resend` — não encontrei.
- `sendgrid` — não encontrei.
- `nodemailer` — não encontrei.
- `mailto` — não encontrei.
- `sms` — não encontrei.
- `twilio` — não encontrei.
- `supabase/functions/` — existe, com **uma única** função: `supabase/functions/obter-distancia/index.ts`, que devolve km via Google Distance Matrix (`index.ts:1-12`), invocada em `src/lib/obterDistancia.js:51`. Nada de mensagens.
- `package.json:12-27` (dependencies) — nenhuma biblioteca de email/SMS.

Confirmação pelo desenho do produto: até o código de verificação do portal é emitido no backoffice «para ela enviar pelo WhatsApp» à mão (`src/lib/portal.js:199-201`), e a notificação correspondente instrui exactamente isso (`src/components/admin/CentroNotificacoes.jsx:145-148`). [inferência] Todo o circuito de comunicação de hoje é manual: clipboard ou links `wa.me` abertos pelo humano.

## SECÇÃO B — o molde: modelo de evento → formulário

### 1. Anatomia do EventTypeEditor (src/components/admin/EventTypeEditor.jsx)

**Natureza do ecrã**: não é um modal pequeno — é uma sobreposição de ecrã inteiro (`position: fixed, inset: 0, zIndex: 200`, fundo creme) com scroll próprio — src/components/admin/EventTypeEditor.jsx:1383-1397. Coluna central com `maxWidth: 720px` — src/components/admin/EventTypeEditor.jsx:1398-1405.

**Secções, por ordem vertical:**
1. **Cabeçalho sticky** — título «Editar Tipo de Evento» / «Novo Tipo de Evento» (conforme `editingId`) e botão ✕ que chama `onCancel` — src/components/admin/EventTypeEditor.jsx:1407-1445.
2. **Aviso do predefinido** (só quando `isPredefinido`): faixa âmbar «alterações aqui afectam o questionário do Casamento já em uso» — src/components/admin/EventTypeEditor.jsx:1449-1464.
3. **Nome do Tipo de Evento** (input obrigatório) — src/components/admin/EventTypeEditor.jsx:1465-1474.
4. **Linha de instrução do arrasto** («⠿ Arrasta pela pega para reordenar passos, campos e opções…») — src/components/admin/EventTypeEditor.jsx:1476-1486.
5. **Lista de passos** dentro de um `DndContext` + `SortableContext` — src/components/admin/EventTypeEditor.jsx:1488-1536 — com um `DragOverlay` que mostra um cartão-fantasma com o texto do que se arrasta — src/components/admin/EventTypeEditor.jsx:1538-1556.
6. **Botão «+ Adicionar Passo»** (largura total, tracejado) — src/components/admin/EventTypeEditor.jsx:1559-1576.
7. **Rodapé sticky** — linha de erro (mostra só o primeiro problema da validação), «Cancelar» e «Guardar Alterações»/«Guardar Tipo de Evento» — src/components/admin/EventTypeEditor.jsx:1579-1639.

**Dentro de cada passo (`StepCard`)**: pega de arrasto ⠿ — src/components/admin/EventTypeEditor.jsx:772-781; rótulo «Passo N» — :783-794; inputs de título e subtítulo — :795-812; selector do **prazo do passo** («Quando é que estas respostas deixam de se poder mudar», predefinido «Nunca fecha», opções vindas da BD) com texto explicativo por baixo — :814-857; botão de remover passo (desactivado quando é o único) — :859-878; lista sortable de campos com zona de largada — :881-919; botão «+ Adicionar Campo» — :921-936.

**Dentro de cada campo (`FieldRow`)**: pega + input do rótulo + select do tipo (11 tipos, `TYPE_OPTIONS` — :27-39) + botão remover — :492-527; checkbox «Obrigatório» — :529-536; validações condicionais (número positivo — :538-547; data não no passado — :548-557); placeholder (só tipos de texto) — :558-566; selector «Papel deste campo» (titulo/local/data/morada/estilo, conforme o tipo) — :458-481 e :567-594; zona de opções para radio/checkbox — :595-603.

**Gestos:**
- **Acrescentar**: passo (`addStep` — :971-975), campo (`addField`, nasce com `id: null` — :1037-1063), opção (`addOption` — :1139-1156).
- **Reordenar** (dnd-kit, tudo em linha): passos entre si (— :1220-1230), com **modo compacto** — ao pegar num passo todos colapsam para cartões-resumo finos (— :679-742); campos dentro do passo **e entre passos** (— :1232-1264); opções dentro do campo e **entre campos do mesmo tipo** (radio→radio, checkbox→checkbox, recusado se o tipo difere — :1318-1320, lógica completa :1266-1350).
- **Apagar**: em **duas fases inline** no próprio botão — o primeiro clique arma («Confirmar?» / «Confirmar? Os campos perdem-se»), o segundo remove; nunca `window.confirm` — estilo :251-262, campo :520-526, passo :859-878, estado `confirmandoRemocao` :977-1007, `removeStep` :1009-1021, `removeField` :1065-1082. O botão armado desarma sozinho ao fim de 4 s — :1001-1007 — e arrastar desarma qualquer confirmação pendente — :1174-1177. A remoção de **opção** é imediata, sem confirmação (✕ chama `onRemove` directo) — :334-336 e :1158-1172.
- **Duplicar**: não encontrei gesto de duplicar passo ou campo dentro do editor. A duplicação existe só ao nível do modelo inteiro, fora do editor (ver §2).

**Modal vs em linha**: dentro do editor nada abre modal — todas as confirmações são em linha. Os modais vivem no separador que o invoca (EventTypesTab): o seletor «Como queres começar?» — src/components/admin/EventTypesTab.jsx:272-447 — e a confirmação de remoção de um modelo — src/components/admin/EventTypesTab.jsx:450-559.

### 2. Como nasce um modelo de evento novo

**Ambos os caminhos**, escolhidos num modal ao carregar «+ Criar Tipo de Evento» (src/components/admin/EventTypesTab.jsx:119-137 → `setShowChooser(true)`):
- **Em branco**: `abrirEmBranco` passa `blankEditingSteps()` ao editor — src/components/admin/EventTypesTab.jsx:52-55; `blankEditingSteps` cria um único «Passo 1» sem campos — src/components/admin/EventTypeEditor.jsx:76-78.
- **Duplicando um existente**: `abrirDuplicado` escolhe o tipo pelo selector, dá-lhe o nome `«X (cópia)»` e converte os steps gravados em steps editáveis com `toEditingSteps` — src/components/admin/EventTypesTab.jsx:57-65. O modal apresenta as duas opções lado a lado, com o selector de origem quando há mais de um tipo — src/components/admin/EventTypesTab.jsx:310-429.
- **Editar** um existente usa o mesmo editor com `editingId` — src/components/admin/EventTypesTab.jsx:67-74.

Na gravação, um modelo novo entra sempre com `predefinido: false` («os predefinidos só são criados por nós, à mão, no SQL») — src/lib/eventTypes.js:3-13.

### 3. Como se guarda

- `handleSave` corre `validar` (nome, ≥1 passo, títulos, ≥1 campo por passo, opções não vazias — src/components/admin/EventTypeEditor.jsx:186-210), depois `buildStepsForSave(steps)`, e chama `updateEventType` ou `createEventType` conforme `editingId` — src/components/admin/EventTypeEditor.jsx:1358-1381.
- **`buildStepsForSave`** (src/components/admin/EventTypeEditor.jsx:125-184) produz o JSON final: `id` do passo = índice+1 (:141), `icon: "user"` fixo (:144), `grupo` só gravado quando existe (:146-149); por campo deriva `validate` do tipo/checkboxes (:156-162), semeia `errorMsg` via `buildErrorMsg` (:87-94 e :168), limpa opções vazias (:173-177) e leva `papel` se existir (:178).
- **Ids dos campos — a regra central**: um campo que já tem `id` gravado **mantém-no tal e qual**; só um campo NOVO ganha id na gravação — src/components/admin/EventTypeEditor.jsx:125-138 e :150-154. O id preservado viaja desde a carga (`toEditingSteps` guarda `field.id` e nunca o regenera — é a chave de `respostas[campo.id]`; regenerá-lo do rótulo «foi o que desligou respostas reais em produção») — src/components/admin/EventTypeEditor.jsx:57-63. Um campo novo nasce com `id: null` («sem id até à gravação») — src/components/admin/EventTypeEditor.jsx:1046-1050.
- **`toCamelId`** (src/components/admin/EventTypeEditor.jsx:96-112) normaliza o rótulo (remove acentos e não-alfanuméricos) e produz camelCase; `generateUniqueFieldId` acrescenta sufixo numérico (`base2`, `base3`…) até ser único — :114-123. A unicidade confere-se contra **todos** os ids do modelo, preservados incluídos — :136-138. **Momento**: só dentro de `buildStepsForSave`, isto é, no clique de guardar — nunca durante a edição.

### 4. O caminho de um formulário criado a partir do modelo

- **Onde é iniciado** (dois pontos de entrada, ambos acabam em `createInvite`):
  1. Separador Formulários, botão «+ Formulário para cliente novo» → abre o `PainelNovoFormulario` (limpando qualquer alvo residual) — src/pages/AdminPage.jsx:1104-1141 e :1146-1165; criar chama `handleCreateInvite` — src/pages/AdminPage.jsx:588-660, com `createInvite` em :623-629.
  2. Dentro de um evento (separador Documentos do evento): `criarFormulario` chama `createInvite` com `submissionAlvoId: submissao.id` (o alvo é o próprio evento) — src/components/admin/DocumentosEvento.jsx:422-455, insert em :436-442, rascunho preparado com `submissionAlvoId` em :408-417.
- **O que é gravado na tabela `invites`** (insert do cliente): `code`, `data_evento`, `event_type_id`, `respostas` (objecto com o que a Nádia pré-preencheu), `status: "Pendente"`, `reserva_id`, `submission_alvo_id` — src/lib/invites.js:44-58. Mais tarde entram `submission_id` (na submissão — src/lib/invites.js:214-218) e `preenchido_em` (coluna + trigger `invites_marcar_preenchido` que carimba na transição para «Preenchido» — docs/migracoes/048_invites_preenchido_em.sql:16-19 e :52-57). Também existem `id` e `created_at` (usados em src/lib/invites.js:157-158). Não encontrei o `CREATE TABLE` da `invites` no repositório — as migrações em docs/migracoes começam na 020.
- **Como se gera o code**: `generateCode` produz `DLM-XXXX-XXXX` com alfabeto sem caracteres ambíguos (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`) — src/lib/invites.js:4-16; `createInvite` repete num loop `do…while` até o código não existir na tabela — src/lib/invites.js:33-42.
- **Estados da coluna `status` e onde transitam**: no código só encontrei dois valores — `"Pendente"` (na criação — src/lib/invites.js:52) e `"Preenchido"`. A transição faz-se: no caminho novo, dentro da RPC `formulario_submeter` na mesma transação da submissão (`update invites set status = 'Preenchido', submission_id = …`, e converte a reserva de origem para «Convertida») — docs/migracoes/020_rpcs_formularios_publicos.sql:235-244; no caminho antigo, `markInviteUsed` — src/lib/invites.js:202-228 — chamado pelo FormPage quando a RPC não marcou — src/pages/FormPage.jsx:606-620. As guardas do estado: `validateCode` recusa um convite «Preenchido» — src/lib/invites.js:122-128 — e a RPC lança `CONVITE_JA_USADO` — docs/migracoes/020_rpcs_formularios_publicos.sql:122-124, tratado no FormPage — src/pages/FormPage.jsx:627-633.
- **Estados derivados** (não são coluna; é a leitura única do admin): `estadoFormularioDoEvento` devolve `"nenhum"`, `"pendente"`, `"preenchido"`, `"preenchido-noutro"` (o rasto de um duplicado), com desempate pelo mais recente — src/lib/invites.js:133-179.

### 5. O separador Formulários enquanto supervisão

- **Ordem do separador** (`activeTab === "convites"`, «label Formulários» — src/pages/AdminPage.jsx:1018-1019): modal de convite criado (:1027-1036), barra de avisos (:1041-1075), botão «+ Formulário para cliente novo» com a linha «Para um evento que já existe, o formulário cria-se no próprio evento» (:1082-1141), painel de criação (:1146-1165), **FormulariosOrfaos antes da lista, de propósito** (:1167-1175), **LacunasFormulario** («primeiro o que falta, depois o estado do que existe» :1177-1185), a lista `InvitesList` (:1187-1201), modal de remoção (:1204-1211) e drawer de detalhe (:1214-1223).
- **O que cada linha mostra** (são cartões, não colunas de tabela — src/components/admin/InvitesList.jsx:59-247): título via `getTituloConvite` (:99; a função lê o nome do evento ligado por `submission_id`, senão do alvo `submission_alvo_id`, senão das respostas do próprio convite, com recurso a «Tipo · CÓDIGO» — src/lib/camposFormulario.js:17-49); badge do tipo de evento (:116-118); o `code` (:126-135); a data do evento ou «Sem data» (:136-149); badge do `status` (:161-174); e uma borda esquerda dourada (pendente) ou verde (preenchido) (:81).
- **Acções por linha**: clicar no cartão abre o drawer (`onSelect` — src/components/admin/InvitesList.jsx:64, ligado em src/pages/AdminPage.jsx:1195); só nos **pendentes** aparecem «✏️ Preencher» (abre o questionário como se fosse a cliente — src/components/admin/InvitesList.jsx:177-202; src/pages/AdminPage.jsx:296-312) e «🗑 Remover» (pede confirmação em modal — src/components/admin/InvitesList.jsx:203-241; delete em src/pages/AdminPage.jsx:687-699).
- **Como distingue o «para cliente novo» dos outros**: no separador, o painel recebe `eventosParaEscolher={null}` — «em Formulários já não se escolhe evento; o que não tem evento vive aqui; o que tem vive no evento» — src/pages/AdminPage.jsx:1159-1163 — e a guarda no painel não pinta o selector «Formulário para» quando é null — src/components/admin/PainelNovoFormulario.jsx:365-371. O botão de abertura limpa sempre `submissionAlvoId` e `reservaId` — src/pages/AdminPage.jsx:1113-1124. Na prática a distinção vive nos dados: convite **sem** `submission_alvo_id` cria cliente + evento novos ao submeter; **com** alvo, actualiza o evento existente — src/lib/invites.js:23-25 e docs/migracoes/020_rpcs_formularios_publicos.sql:127-140. Um pendente sem `submission_id` **nem** `submission_alvo_id` é um **órfão** (`ehFormularioOrfao` — src/lib/invites.js:243-244) e aparece destacado no bloco próprio antes da lista, com a adopção por linha (`onAdoptar` → `apontarConviteAoEvento`) — src/pages/AdminPage.jsx:1170-1175 e src/lib/invites.js:181-195. [inferência] Na lista em si não há coluna «cliente novo vs. apontado» — a distinção visível é indirecta: o título do órfão cai no genérico «Tipo · CÓDIGO» (src/lib/camposFormulario.js:39-47) e o bloco dos órfãos fica acima da lista.

## SECÇÃO C — o ficheiro: como uma folha chega ao WhatsApp

### 1. A app produz hoje algum ficheiro a sério?

Termo a termo, em `src/`:

- **`new Blob`** — não encontrei.
- **`createObjectURL`** — existe, mas só para pré-visualização/compressão de imagens: `src/lib/captacao.js:34`, `src/lib/materiais.js:328` (ler o ficheiro para um canvas antes do upload) e `src/components/captacao/CaptacaoForm.jsx:658` (miniatura da imagem escolhida).
- **`toBlob`** — existe: `canvas.toBlob` em `src/lib/captacao.js:52` e `src/lib/materiais.js:346` — comprime fotografias antes de as subir ao Storage. Não gera documentos.
- **`toDataURL`** — não encontrei.
- **atributo `download`** — a única ocorrência é `src/components/portal/AsFotografias.jsx:246-247`, e não é o atributo HTML: é o parâmetro `?download=fotografia-do-evento.jpg` acrescentado ao URL do Storage; o comentário em `src/components/portal/AsFotografias.jsx:243-245` explica que o atributo HTML `download` é ignorado em ligações cross-origin e que é o Storage que responde com `Content-Disposition: attachment`.

No `package.json`:

- **`jspdf`** — existe: `"jspdf": "^4.2.1"` (`package.json`, dependencies), mais `"jspdf-autotable": "^5.0.8"`.
- **`pdf-lib`** — não encontrei.
- **`html2canvas`** — não encontrei.
- **`react-pdf`** — não encontrei.
- **`puppeteer`** — não encontrei.
- **`print-js`** — não encontrei.
- Existe ainda `"xlsx": "^0.18.5"` (`package.json`, dependencies).

O jsPDF e o xlsx são usados num único ficheiro: `src/lib/exports.js` — `exportClientePDF` gera um PDF programático A4 com `doc.save(filename)` (`src/lib/exports.js:153-259`), `exportClienteExcel`/`exportTodosExcel` geram .xlsx com `XLSX.writeFile` (`src/lib/exports.js:130` e `src/lib/exports.js:149`). **Mas não encontrei nenhum import de `lib/exports` em todo o `src/`** — [inferência] `exports.js` é código morto: a app tem um gerador de PDF a sério instalado e escrito, mas nenhum botão o invoca.

### 2. `navigator.share` / `navigator.canShare`

Não encontrei — nem `navigator.share` nem `navigator.canShare` em `src/` ou `index.html`.

### 3. O caminho de impressão actual

**Componentes com `window.print()`** (levantamento completo):

| Sítio | Chamada | Folha de estilo de impressão |
|---|---|---|
| `GerarOrcamento` (admin) | `src/components/admin/orcamentos/GerarOrcamento.jsx:258-263` | `@media print` em `GerarOrcamento.jsx:288-310`; `@page { size: A4; margin: 0 }` na linha 308 |
| `GerarContrato` (admin) | `src/components/admin/orcamentos/GerarContrato.jsx:258-264` | `@media print` em `GerarContrato.jsx:298-310`; `@page { size: A4; margin: 2cm }` na linha 308 |
| `GerarProposta` (admin) | `src/components/admin/orcamentos/GerarProposta.jsx:83-88` | `@media print` em `GerarProposta.jsx:111-127`; `@page { size: A4; margin: 0 }` na linha 125 |
| `BriefingPage` | `src/pages/BriefingPage.jsx:709-711` (botão «Imprimir / Guardar PDF») | `@media print` em `BriefingPage.jsx:677-704`; `@page { size: A4; margin: 0 }` na linha 681 |
| Portal do cliente (`DocumentosVista`) | `src/components/portal/DocumentosVista.jsx:1783` («Imprimir o contrato»), `:1974` e `:2301` («Imprimir em A4») | `EstiloImpressao` partilhado em `src/components/portal/documentos-pecas.jsx:558-570` (sem `@page`) |
| Ficha de materiais | `src/lib/imprimirFicha.js:242-246` — abre `window.open("", "_blank")`, escreve HTML completo e `window.print()` dispara no `onload` (`imprimirFicha.js:238`); chamado por `src/components/admin/FichaMateriais.jsx:11` | `@media print { body { padding: 0 } }` em `imprimirFicha.js:231-233` |
| Conferência do período | `src/lib/imprimirConferencia.js:234` (mesmo molde de janela dedicada; comentário em `imprimirConferencia.js:1-11`); chamado por `src/components/admin/ConferenciaPeriodo.jsx:5` | `@media print` em `imprimirConferencia.js:198` |

**O que desaparece do ecrã ao imprimir:**

- Tudo o que não é o documento: `body * { visibility: hidden }` e só a árvore da área imprimível volta a ser visível (`GerarOrcamento.jsx:290-292`, `GerarContrato.jsx:300-301`, `GerarProposta.jsx:113-115`, `documentos-pecas.jsx:562-564`).
- Botões e formulários com classe `.no-print` (`GerarOrcamento.jsx:307,314`) ou `.acomp-nao-imprime` no portal (`documentos-pecas.jsx:566`); no contrato do portal há cópias que só existem no papel via `.acomp-so-imprime { display: block !important }` (`documentos-pecas.jsx:565`).
- Os cabeçalhos/rodapés automáticos do browser: `@page margin 0` elimina-os (`GerarOrcamento.jsx:282-285`); o `<title>` da app é trocado temporariamente pelo nome do documento durante a impressão (`GerarOrcamento.jsx:255-263`, `GerarContrato.jsx:255-264`, `GerarProposta.jsx:83-88`). No contrato (margens 2cm), o comentário em `GerarContrato.jsx:293-296` diz que é preciso **desligar "Headers and footers" uma vez no diálogo de impressão** (fica memorizado).
- Detalhe de fidelidade: `print-color-adjust: exact` para o dourado e as bolinhas de cor saírem no papel (`BriefingPage.jsx:695-698`, `imprimirFicha.js:219-229`).

**Passo a passo até ter um PDF no telemóvel:**

Está no código: o botão chama `window.print()` (`GerarOrcamento.jsx:261`) e a única instrução ao utilizador é a dica do briefing — «Para guardar como PDF, escolhe "Guardar como PDF" no destino da impressão» (`BriefingPage.jsx:712-715`).

[inferência] A sequência completa, à mão: (1) abrir o evento no admin e entrar no documento; (2) carregar em Imprimir; (3) no diálogo do browser, trocar o destino para «Guardar como PDF» (e, no contrato, desligar cabeçalhos/rodapés na primeira vez); (4) guardar o ficheiro no disco do computador; (5) fazer chegar o ficheiro ao telemóvel por meios externos à app — WhatsApp Web, email a si própria, cabo, etc. Não encontrei nenhum código que trate do passo 5, nem sequer do passo 4: a app termina o seu trabalho no `window.print()`.

### 4. O cabeçalho de marca dos documentos

- O logótipo é uma **imagem PNG**: `src/assets/logo.png` (existe em `src/assets/` — listagem do directório), importada como `logoUrl` nos quatro documentos (`GerarOrcamento.jsx:4`, `GerarContrato.jsx:5`, `GerarProposta.jsx:3`, `DocumentosVista.jsx:3`) e no `LogoDourado` (`src/components/LogoDourado.jsx:2`). Não encontrei SVG em código nem logótipo em texto nos documentos imprimíveis.
- `LogoDourado` (`src/components/LogoDourado.jsx:29-226`) é o tratamento animado do mesmo PNG (halo, poeira de ouro, brilho) para o ecrã — não encontrei uso dele em nenhum documento imprimível; os documentos usam `<img src={logoUrl}>` directo.
- O que sai no papel: no **orçamento**, PNG a 110px + «ORÇAMENTO / PROPOSTA DE SERVIÇOS» com filete dourado (`GerarOrcamento.jsx:982-1016`); no **contrato**, PNG a 90px + «CONTRATO DE PRESTAÇÃO DE SERVIÇOS» (`GerarContrato.jsx:747-762`); na **proposta/projecto**, PNG a 120px na capa + «PROJECTO» (`GerarProposta.jsx:444-459`); no **portal**, o `Timbre` com PNG a 92px + nome do documento + selo de versão (`documentos-pecas.jsx:51-58`), e um PNG a 74px na variante de `DocumentosVista.jsx:1934`.
- No gerador jsPDF morto, o cabeçalho é **texto** «DO LUXO À MESA» sobre faixa dourada, sem imagem (`src/lib/exports.js:163-169`).

### 5. Folha personalizada por destinatário — o que muda

O que está no código hoje:

- Os campos pessoais vêm de `getDadosParaDocumento` (`src/lib/clientes.js:575` em diante): busca o cliente à tabela `clientes` (`clientes.js:578-584`), lê as respostas do evento em dupla fonte via `getValorAtual` (`clientes.js:588`), resolve nome do noivo/noiva por três chaves alternativas cada (`clientes.js:614-625`) e monta os contraentes (`clientes.js:626-643`).
- O `AdminPage` reconstrói esse contexto a partir do URL do documento (`src/pages/AdminPage.jsx:346-422`; a chamada em `AdminPage.jsx:407-408`) e passa-o como `prefill` ao editor.
- No editor, o `prefill` alimenta apenas os `useState` iniciais, com rascunho persistente por evento (`rid = orcamento:<submissionId>` — `GerarOrcamento.jsx:99-115`; comentário `GerarOrcamento.jsx:34-37`: o componente é remontado por `key` quando o contexto muda).
- A impressão é uma acção manual por documento (`imprimir()` — `GerarOrcamento.jsx:258-263`).

[inferência] Com 30 destinatários, o caminho actual obriga a 30 ciclos completos: navegar para o evento, abrir o editor do documento, disparar o diálogo de impressão do browser, escolher «Guardar como PDF» e dar nome ao ficheiro — trinta vezes, porque cada folha personalizada é um estado de editor diferente e o `window.print()` só conhece a página montada nesse momento. Não encontrei nenhum mecanismo de geração ou impressão em lote; o único gerador de PDF sem interacção humana (`exports.js`) está desligado da UI (ver ponto 1).

### 6. Algum documento já é partilhado por WhatsApp a partir da app?

Documento (ficheiro/folha): **não encontrei**.

O que existe é partilha de **texto**: `linkWhatsApp` constrói `https://wa.me/<numero>?text=...` (`src/lib/mensagens.js:118-125`), e o `MensagensSheet` abre esse link com a mensagem-tipo já resolvida — placeholders `{NOME} {TIPO_EVENTO} {DATA} {VALOR} {SINAL} {LINK_INTERESSE}` substituídos pelos dados do evento (`src/components/admin/MensagensSheet.jsx:258-284`; resolução em `mensagens.js:91-110`). O `EventoPage` (`src/pages/EventoPage.jsx:570-574` e `:802-805`) e o `CentroNotificacoes` (`src/components/admin/CentroNotificacoes.jsx:293`) abrem a conversa sem texto. [inferência] Do outro lado, a pessoa recebe uma mensagem de texto simples — o que a app produz é apenas o URL `wa.me`; qualquer anexo teria de ser acrescentado à mão no próprio WhatsApp.

### 7. Storage: buckets do Supabase Storage em uso

Cinco buckets, todos com uso real no código:

| Bucket | Onde | Para quê |
|---|---|---|
| `referencias` | `src/lib/captacao.js:16` (const), upload em `captacao.js:77-83`, `getPublicUrl` em `captacao.js:85-88` | Imagens de referência do cliente na captação (JPEG comprimido) |
| `propostas` | `src/lib/propostas.js:10`, upload/URL em `propostas.js:21-31` | Imagens das secções do projecto/proposta |
| `materiais` | `src/lib/materiais.js:319`, upload/URL em `materiais.js:376-386` | Imagens do inventário de materiais (PNG) |
| `fotografias` | `src/lib/fotografias.js:21`, upload/URL em `fotografias.js:50-57` | Fotografias do dia do evento (duas versões comprimidas); bucket público criado em `docs/migracoes/065_fotografias_do_dia.sql:40-42` |
| `contratos-assinados` | upload em `src/lib/portal.js:271-273`; leitura só por URL assinado de 300s em `portal.js:326-332` | Fotografia/PDF do contrato assinado em papel, enviada pela cliente (input `accept="image/*,.pdf"` em `DocumentosVista.jsx:1798`); bucket **privado** criado em `docs/migracoes/057_portal_fase3_documentos.sql:739-741` |

Nota: `docs/migracoes/limpeza_dados_teste.sql:38-40` confirma que `referencias` se limpa pelo dashboard e que `materiais` não se toca. Não encontrei nenhum bucket que guarde documentos compostos (orçamentos, contratos, propostas) — [inferência] os documentos vivem como dados renderizados no ecrã, nunca como ficheiros no Storage; o único «documento» em ficheiro é o contrato assinado que a cliente fotografa e carrega.

## SECÇÃO D — o que está preso à Do Luxo à Mesa

### D1 · Inventário das constantes da casa

**Nome do negócio / designação comercial**
- `EMPRESA.designacao: "Do Luxo à Mesa"` e `EMPRESA.nome: "Nádia Schultz"` (a titular) — src/components/admin/orcamentos/orcamentoConfig.js:8-15. É a única estrutura «empresa» do código; o contratoConfig importa-a e re-exporta (src/components/admin/orcamentos/contratoConfig.js:10-12).
- `<title>Do Luxo à Mesa</title>` — index.html:10; título do backoffice «Sistema DLM — Do Luxo à Mesa» — src/lib/notificacoes.js:149 e src/pages/EventoPage.jsx:182.
- Prefixo «DLM» nos códigos de convite (`DLM-X7K9-2025`) — src/lib/invites.js:4,15 — e nos nomes de ficheiros exportados (`DLM_...xlsx/pdf`) — src/lib/exports.js:129,149,258.
- `SITE_URL = "https://doluxoamesa.pt"` — src/components/portal/base.js:82.

**Número de WhatsApp**
- `WHATSAPP_URL = "https://wa.me/351927177190?text=..."` (com mensagem pré-escrita) — src/components/portal/base.js:80-81. É a única ocorrência do número no projeto (grep por 927177190 só devolve esta linha).
- O construtor genérico `linkWhatsApp(numero, texto)` assume indicativo 351 para números de 9 dígitos — src/lib/mensagens.js:118-124.

**Moradas**
- Morada da sede nos contratos: `morada: "Rua dos Moinhos nº 31 - Ericeira"` — src/components/admin/orcamentos/orcamentoConfig.js:10.
- Morada-base da deslocação: NÃO está no código — vive no secret `MORADA_BASE` do Supabase, lido pela edge function — supabase/functions/obter-distancia/index.ts:4-5,43. O comentário em src/components/admin/orcamentos/orcamentoConfig.js:32-38 regista que «a morada-base do calculador de deslocação NÃO é o armazém» e que existe um custo fixo `LOGISTICA_ENTRE_MORADAS = 25` entre as duas moradas da casa (orcamentoConfig.js:38). A segunda morada (armazém) em texto: não encontrei.
- Foro judicial: `foro: "comarca de Sintra"` — src/components/admin/orcamentos/orcamentoConfig.js:14, usado na cláusula 11.ª — contratoConfig.js:123.

**NIF e IBAN**
- `nif: "243705689"` — src/components/admin/orcamentos/orcamentoConfig.js:11; impresso no contrato — src/components/admin/orcamentos/GerarContrato.jsx:806.
- `iban: "PT50 0193 0000 1050 1570 8076 8"` — orcamentoConfig.js:12; na cláusula 4.ª de pagamento — contratoConfig.js:53-54.

**Logótipo e favicon**
- Ficheiro do logo: src/assets/logo.png, importado em src/components/LogoDourado.jsx:2 (componente com o «tratamento de luxo» do logo — LogoDourado.jsx:4-12). Menciona por escrito «by luxury events» dentro do desenho — LogoDourado.jsx:86,179.
- Favicon: `<link rel="icon" ... href="/favicon.png" />` — index.html:5; ficheiro em public/favicon.png (listagem de `public/`).

**Paleta de cores**
- Variáveis CSS: `--gold: #c9a84c; --gold-light: #e8d5a3; --gold-dark: #a07830; --cream: #fafaf8; --charcoal: #1a1a1a; --gray-mid: #6b6b6b` — src/index.css:10-15.
- A mesma paleta duplicada em RGB para os PDFs do jsPDF: `gold = [201,168,76]`, `charcoal = [26,26,26]`, `goldLight = [232,213,163]` — src/lib/exports.js:155-158.
- Documentação da paleta alargada (ouro carregado #B9973E, lavados, etc.) — docs/identidade-visual.md:33-53.

**Tipos de letra**
- Carregados no `<head>`: Playfair Display (400/600/itálico) + Inter (300–700) via Google Fonts — index.html:28-33 (com o aviso de nunca voltarem ao index.css — index.html:12-27 e src/index.css:2-7).
- Base: `font-family: "Inter", sans-serif` — src/index.css:23; títulos `"Playfair Display", serif` — src/index.css:32; estilos partilhados `overline`/`playfair` — src/components/portal/base.js:54-67.

**Textos de rodapé e assinaturas**
- Rodapé-assinatura das páginas públicas do portal: componente `Assinatura` com o texto «Do Luxo à Mesa · by Luxury Events» — src/components/portal/pecas.jsx:207-224.
- Fichas de impressão (armazém): «Do Luxo à Mesa» + «by Luxury Events» no cabeçalho — src/lib/imprimirFicha.js:99-100 e src/lib/imprimirConferencia.js:205-206.
- PDF de exportação: cabeçalho «DO LUXO À MESA» + tagline «Planeamento · Personalização · Organização · Detalhes» — src/lib/exports.js:168-169; rodapé por página «Do Luxo à Mesa · Página i de N» — exports.js:253.
- Folha do orçamento: rodapé «DO LUXO À MESA | By Nádia Schultz» — src/components/admin/orcamentos/GerarOrcamento.jsx:1212; condições fixas `CONDICOES_ORCAMENTO` e `NOTA_RODAPE_ORCAMENTO` — orcamentoConfig.js:21-28.
- Assinatura do género «Com carinho, …»: não encontrei (grep por «com carinho» em src, docs e supabase sem resultados).

### D2 · Tabela/ficheiro de definições do negócio

- **Existe uma tabela `app_config` na BD**, mas é um chave-valor usado SÓ para o buffer de ocupação do stock: `getAppConfig`/`updateAppConfig` leem/escrevem `{chave, valor}` — src/lib/stock.js:17-43 — e as únicas chaves usadas são `buffer_dias_antes`/`buffer_dias_depois` — stock.js:50-51. O `create table` de `app_config` não está no repositório (docs/migracoes começa na 020; a tabela só aparece na lista de RLS — docs/migracoes/021_rls_bloquear_anon.sql:44). [inferência] Foi criada numa migração 001–019 que não está versionada aqui.
- **Definições da marca em ficheiros de código**, não em BD: `EMPRESA`, condições e catálogo — src/components/admin/orcamentos/orcamentoConfig.js:1-95 (o próprio cabeçalho diz «Dados fixos da empresa … Editável aqui num sítio só» — linhas 2-4); cláusulas do contrato — contratoConfig.js:22-125; fases — src/lib/fases.js:20-38 e src/components/admin/faseConfig.js:31-71; contacto/site — src/components/portal/base.js:80-82.
- **Em secrets do Supabase** (fora do código): `GOOGLE_MAPS_KEY` e `MORADA_BASE` — supabase/functions/obter-distancia/index.ts:42-43.
- Ficheiro `settings.json`/`definicoes`/`parametros` dedicado ao negócio: não encontrei (os únicos ficheiros *config* em src são faseConfig.js, contratoConfig.js e orcamentoConfig.js — resultado do find).

### D3 · Noção de negócio/tenant no esquema

- Não encontrei. Grep por «tenant» em src, docs e supabase: zero resultados. «negócio»/«empresa»/«organiza» nas migrações só aparecem em prosa de comentários (ex.: «quem fechou negócio» — docs/migracoes/067_avaliacao_rpcs_e_despedida.sql:673; «apaga TODOS os dados de negócio» — docs/migracoes/limpeza_dados_teste.sql:3). Nenhuma coluna, id ou tabela de tenant/negócio, nem embrionária.
- [inferência] O esquema é mono-negócio por construção: as RPCs do portal têm até prefixo de marca `dlm_` (ex.: `dlm_portal_ver_documento` — docs/migracoes/074_assinaturas_e_morada.sql:40) e a chave de sessão do portal é `dlm_acomp_sessao_` — src/components/portal/base.js:118.

### D4 · [inferência] O que teria de ser por-negócio num módulo de comunicados

Tudo o que se segue é inferência minha a partir do inventário acima:

- **Canal e remetente**: o número de WhatsApp está cravado numa constante do frontend (src/components/portal/base.js:80-81) e não existe infraestrutura de email nenhuma (grep por resend/smtp/sendgrid/nodemailer: não encontrei — o email do cliente existe como coluna, src/lib/clientes.js:23, mas nada o envia). O canal por negócio e o «email desligável» teriam de nascer de raiz, em configuração.
- **Assinatura e textos de fecho**: hoje há três assinaturas diferentes coladas em quatro sítios (pecas.jsx:222, imprimirFicha.js:99-100, GerarOrcamento.jsx:1212, exports.js:168-169) — teriam de convergir numa definição única por negócio.
- **Marca da folha (o PDF)**: logo (src/assets/logo.png via LogoDourado.jsx:2), paleta duplicada em CSS (index.css:10-15) e em RGB para jsPDF (exports.js:155-158), fontes (index.html:31) — o comunicado em PDF precisaria disto tudo parametrizado, incluindo a duplicação CSS↔RGB resolvida numa fonte só.
- **Identidade legal**: `EMPRESA` (nome, morada, NIF, IBAN, foro — orcamentoConfig.js:8-15) se o comunicado citar condições contratuais, como no primeiro caso real («Condições para a montagem e recolha»), cujo conteúdo hoje vive nas cláusulas 5.ª e 6.ª do contrato — contratoConfig.js:58-79.
- **Tipos de evento**: já vivem em BD (`event_types` com nome, icone, steps — src/lib/invites.js:65-73), portanto «todos os casamentos» é filtrável por dados; mas a nota em src/lib/clientes.js:645-647 avisa que não se adivinha a natureza do evento pelo nome do modelo — a seleção «eventos de casamento» precisaria de um marcador de tipo mais firme do que o nome.
- **Nomes das fases e a definição de «activo»**: chaves e rótulos em src/lib/fases.js:20-28 e `FASES_POS_SINAL = ["contrato","cliente","projecto"]` — fases.js:38; um filtro «casamentos activos» assentaria nestas listas, que hoje são código, não configuração.
- **Modelos de texto com placeholders**: o antecedente direto do «modelo de comunicado» já existe — `mensagens_tipo` (migração 015, CRUD + resolução de {PLACEHOLDERS} com dados do evento — src/lib/mensagens.js:4-7) e os modelos de documentos com placeholders {TIPO_EVENTO}, {DATA_EXTENSO}, etc. — contratoConfig.js:20-29. Num produto multi-negócio, estes modelos teriam de pertencer ao negócio.
- **Prefixos e nomenclatura técnica**: o prefixo «DLM» nos códigos (invites.js:15), nos ficheiros (exports.js:129) e nas RPCs `dlm_*` (074_assinaturas_e_morada.sql:40) — cosmético mas omnipresente.

## SECÇÃO E — público-alvo: como se recorta

Raiz do projeto: `/home/bebetter/Documents/HELIO - assuntos/MEUS PROJECTOS DE PROGRAMACAO/doluxoamesa/noivos-form` (todos os caminhos abaixo são relativos a esta raiz).

### E1 · Como a app determina hoje que um evento está «ACTIVO»

**Não existe coluna nem flag «activo»** — não encontrei nenhuma ocorrência de `activo/ativo` aplicada a eventos (a pesquisa só devolve `materiais.ativo`, src/lib/materiais.js:64, e o estado `activo` do acesso ao portal, src/pages/PortalPage.jsx:252). O recorte faz-se por combinações de **três colunas de `submissions`**: `fase`, `status` e `data_evento`:

- **«vivos» = `fase !== "perdido"`** — src/components/admin/ClientesLista.jsx:209, src/components/admin/InicioTab.jsx:92, src/components/admin/CalendarioTab.jsx:139 («negócios mortos não ocupam dias»).
- **«garantidos» = fase pós-sinal + `status !== "Concluído"`** — src/components/admin/InicioTab.jsx:184-186 (`listaGarantidos`) e src/components/admin/FunilBoard.jsx:620-622 (`posSinalAtivos`, a variável mais próxima do conceito «activos» no código).
- **corte por data** — `evento.data_evento < hojeISO` exclui («não tem lacuna, tem história»), src/components/admin/faseConfig.js:116-123 (`ehLacunaDeFormulario`).

**Constantes de fase:**
- src/lib/fases.js:20-28 — `FASE_LABEL` (declarada «a fonte ÚNICA dos rótulos», fases.js:2); src/lib/fases.js:37 — `FASES_POS_SINAL = ["contrato", "cliente", "projecto"]`.
- src/components/admin/faseConfig.js:28-29 — importa e re-exporta `FASE_LABEL`/`FASES_POS_SINAL` de lib/fases.js; define ainda `FASE_COR` (31-39), `FASES_BOARD` (43-50), `PROXIMA_FASE` (54-60), `AVANCO_LABEL` (64-70), `STATUS_OPTIONS` (86-91).
- Whitelist de escrita: `FASES_VALIDAS` em src/lib/clientes.js:455-463.

**Fontes de rótulos de fase (todas as que encontrei):**
1. `FASE_LABEL` — src/lib/fases.js:20-28 (fonte canónica).
2. Re-export em src/components/admin/faseConfig.js:28-29 (não é mapa próprio; mesmo objeto).
3. Rótulos literais na Jornada do admin — src/components/admin/jornadaEtapas.js: só `interessado` vem de `FASE_LABEL` (linha 129); «Orçamento» (136), «Sinal» (145), «Contrato» (165), «Projecto» (172), «Preparação» (177), «O grande dia» (187) são strings hard-coded no ficheiro.
4. `ROTULO_ETAPA` no portal do cliente — src/lib/portal.js:35-43 (chaves próprias: `interessada` no feminino, `orcamento`, `sinal`, `contrato`, `projecto`, `preparacao`, `grande_dia`; rótulos diferentes: «O seu pedido», «A data reservada», …).
5. `FASE_LABEL_PRE_SINAL` — **morto**: só existe em comentário (src/lib/fases.js:5, src/lib/clientes.js:518 «morreu com ela»); não encontrei nenhuma ocorrência viva no código.
6. `NOME_FASE` — não encontrei.
7. `rotuloFase` — não encontrei.
8. Lado SQL: a migração 050 **removeu** o `rotulo` da RPC do portal (docs/migracoes/050_portal_do_cliente_os_rotulos.sql:4-16) — os rótulos vivem só no cliente.

**Ordem 077 confirmada no código:** `interessado → orcamento → sinal → contrato → cliente → projecto` em src/components/admin/faseConfig.js:8-9 (comentário «decisão FINAL da dona do negócio, migração 077») e src/components/admin/faseConfig.js:43-50 (`FASES_BOARD`); semântica em docs/migracoes/077_sinal_antes_do_contrato.sql:4-15.

### E2 · Filtros existentes nas listagens

- **ClientesLista** (contactos): pesquisa de texto normalizada (sem acentos) sobre nome/contacto/email + comparação de telefone só por dígitos, incluindo `respostas.contactoPrincipal`/`numeroWhatsapp` dos eventos — src/components/admin/ClientesLista.jsx:221-247; alternador Lista↔Funil — ClientesLista.jsx:250-255. **Não encontrei** filtro por tipo, por fase nem por data nesta lista (a pastilha de fase é exibição, não filtro — ClientesLista.jsx:109-126).
- **FunilBoard**: colunas fixas por fase — Interessados (`interessado/orcamento/sinal`) | Clientes | Em Preparação — src/components/admin/FunilBoard.jsx:599-628; toggle «Ver perdidos» — FunilBoard.jsx:518 e 550-566; exclui `status === "Concluído"` (620-622). **Não encontrei** filtro por tipo de evento nem por data (a data só ordena — 602-609).
- **CalendarioTab** (Agenda): navegação por mês (recorte temporal) — src/components/admin/CalendarioTab.jsx:121-126 e 146; exclui `fase === "perdido"` (139); `FASES_EM_NEGOCIACAO = ["interessado","orcamento","sinal"]` pinta tracejado (46-47). **Não encontrei** filtro por tipo.
- **DocumentosLista** — a listagem com mais filtros: por tipo de documento (src/components/admin/DocumentosLista.jsx:46-55), por tipo de evento via `event_type_id` (56-63), por estado/status (64-74), por «actualizado há X dias» (75-86), por intervalo de `data_evento` (91-99), mais pesquisa livre (139).
- **ConferenciaPeriodo** (Logística): recorte por períodos predefinidos de datas — src/components/admin/ConferenciaPeriodo.jsx:128 (`periodosPredefinidos`); conta só eventos pós-sinal via `fasesPosSinal` passado a lib/stock — src/lib/stock.js:337-352 e 524-525.
- **InicioTab**: não tem filtros de utilizador; recorta internamente por fase para os alertas (interessados parados — InicioTab.jsx:193-196; fase `sinal` — 211-213; fase `contrato` — 226-229) e por `FASES_POS_SINAL` + `data_evento` para prazos (266, 290).

### E3 · A tabela `clientes`

- **Migração de criação: não encontrei** — docs/migracoes/ começa na 020 (020_rpcs_formularios_publicos.sql é o primeiro ficheiro numerado); o código refere que a separação pessoa/evento vem «da migração 010» (src/lib/clientes.js:13) e a extração de nome «da migração 011» (src/lib/clientes.js:184), mas essas migrações não estão no repositório. Também **não encontrei** nenhum `ALTER TABLE clientes` nas migrações presentes.
- **Colunas realmente lidas/escritas no código**: `id, nome, contacto, email, nif, morada, notas, created_at` — select da lista (src/lib/clientes.js:23), whitelist do update (clientes.js:82: `["nome","contacto","email","nif","morada","notas"]`), select para documentos (clientes.js:581), inserts (clientes.js:221-225 via `extrairDadosCliente` 196-213; src/lib/reservas.js:102-103 `{nome, contacto}`; src/lib/captacao.js:229-230 `{nome, contacto}`); nas RPCs SQL: `insert into clientes (nome, contacto, email, morada)` (docs/migracoes/020_rpcs_formularios_publicos.sql:215) e importação via `jsonb_populate_record(null::clientes, …)` com `id` e `created_at` gerados (docs/migracoes/028_importar_cliente_pagamentos.sql:58-66).
- **Telefone**: existe — `clientes.contacto` (clientes.js:23); o número também vive nas respostas dos eventos (`respostas.contactoPrincipal`, `respostas.numeroWhatsapp`) e o sistema procura nos dois sítios (src/lib/importacao/validar.js:44-57; docs/migracoes/043_dedupe_deterministico.sql:42-58).
- **Email**: existe — `clientes.email` (clientes.js:23, 82).
- **Consentimento/recusa de contacto (opt-out, rgpd, marketing): não encontrei.** A pesquisa por `opt-out|rgpd|consentimento|consent|marketing|recusa` só devolve: consentimento de **fotografias** de convidados (src/lib/avaliacao.js:36-37; src/components/admin/FotografiasEvento.jsx:56-57) e o «Bloco de recusa» de **documentos** no portal (src/components/portal/documentos-pecas.jsx:377-379). Nada sobre consentimento de comunicações/contacto.

### E4 · Duplicados de contacto e contacto↔eventos

- **Um cliente ↔ vários eventos é o modelo por desenho**: «Um cliente tem vários eventos (submissions com cliente_id)» — src/lib/clientes.js:13-14; `createEventoParaCliente` cria evento novo ligado a cliente existente sem criar cliente (clientes.js:161-176).
- **Não há garantia de unicidade do telefone na BD**: não encontrei nenhum índice/constraint UNIQUE sobre `clientes.contacto` nas migrações do repositório (a pesquisa por `unique` só devolve o token do portal — docs/migracoes/049_portal_do_cliente_fase1.sql:46,67). A própria migração 043 assume duplicados como estado real: «dois clientes a partilharem a mesma chave de telefone (o estado que os duplicados históricos criam)» — docs/migracoes/043_dedupe_deterministico.sql:5-7.
- **Dedupe é aplicacional, no momento da entrada**, com a regra «só dígitos, últimos 9»:
  - normalização partilhada — src/lib/importacao/schema.js:81-84 (`normalizarTelefone`), «a mesma regra do captacao_dedupe do Postgres» (schema.js:79-80);
  - RPC `captacao_dedupe` (captação/reserva): compara os 9 dígitos finais contra `clientes.contacto` E `respostas->>'numeroWhatsapp'`/`->>'contactoPrincipal'`; devolve o cliente **mais antigo** (`order by created_at asc`) — docs/migracoes/043_dedupe_deterministico.sql:33-62; trava também o evento duplicado do mesmo cliente na mesma data (68-79);
  - importação, dentro do ficheiro: mesmo telefone → funde eventos no primeiro cliente — src/lib/importacao/normalizar.js:172-182;
  - importação, contra a BD: mapa telefone→cliente construído da ficha e das respostas dos eventos (src/lib/importacao/validar.js:39-57); com match, os eventos são **anexados** ao cliente existente em vez de criar um novo (validar.js:76-83);
  - cliente sem telefone fica fora de qualquer deteção de duplicados — validar.js:84-88.
- [inferência] Para um comunicado «uma pessoa = um envio», o código sugere que o recorte fiável é a **chave de 9 dígitos** (e não `clientes.id`): a BD admite dois clientes com o mesmo telefone (043:5-7) e admite o telefone só nas respostas do evento com `contacto` vazio na ficha (validar.js:46-48) — um `GROUP BY` por telefone normalizado seria necessário do lado do SQL.

### E5 · Nomes exactos para o SQL do dono

- **Eventos = tabela `submissions`** (não existe tabela «eventos»; o funil lê `from("submissions")` — src/lib/clientes.js:408-412). Colunas relevantes:
  - `fase` text NOT NULL, default `'interessado'` (docs/migracoes/040_invariante_fase_status.sql:88-95), CHECK `submissions_fase_valida` com o vocabulário `('interessado','orcamento','sinal','cliente','projecto','contrato','perdido')` (040:117-120);
  - `status` text NOT NULL, default `'Recebido'` (040:75-82), CHECK `submissions_status_valido` com `('Recebido','Em Preparação','Confirmado','Concluído')` (040:107-109); CHECK do par `submissions_status_pos_sinal` (040:123-134, reescrito pela 077 — docs/migracoes/077_sinal_antes_do_contrato.sql:34-35);
  - `data_evento` date (comparada a `date` em docs/migracoes/043_dedupe_deterministico.sql:70-74);
  - `event_type_id` (FK para `event_types` — clientes.js:23), `cliente_id` (clientes.js:14), `respostas` jsonb, `numero_convidados`, `valor_acordado` (clientes.js:369), `pagamento_final` (clientes.js:393), `created_at`.
- **Tipo «casamento»: não há coluna de tipo nem slug.** `event_types` tem `id`, `nome` (texto livre), `steps` (jsonb) e `predefinido` (boolean) — src/lib/eventTypes.js:8 e 20, src/components/admin/EventTypesTab.jsx:70. O casamento é uma **linha** de `event_types` identificada só pelo `nome`; o código compara nomes normalizados (minúsculas, sem acentos — src/lib/tipoEvento.js:27-34, 54-60). Eventos «Outro» sem modelo guardam texto livre em `submissions.respostas->>'tipoEventoOutro'` (clientes.js:23; tipoEvento.js:37-38). Não encontrei o UUID do modelo Casamento no repositório. [inferência] O SQL terá de resolver o tipo por `event_types.nome` (ex.: `where et.nome ilike '%casamento%'`) ou pelo `id` obtido antes com `select id, nome from event_types;`.
- **Contagens** [inferência, montada só com os nomes confirmados acima]:
  - casamentos «activos» no sentido do FunilBoard (posSinalAtivos — FunilBoard.jsx:620-622): `select count(*) from submissions s join event_types et on et.id = s.event_type_id where et.nome ilike '%casamento%' and s.fase in ('contrato','cliente','projecto') and s.status <> 'Concluído';`
  - no sentido «vivos» (ClientesLista.jsx:209): trocar o filtro de fase por `s.fase <> 'perdido'`;
  - distribuição: `select fase, status, count(*) from submissions group by 1, 2 order by 1, 2;`
- **Telefones**: `clientes.contacto`, com fallback em `submissions.respostas->>'contactoPrincipal'` e `->>'numeroWhatsapp'`; a chave de comparação canónica é `right(regexp_replace(coalesce(<campo>,''), '\D', '', 'g'), 9)` — exactamente como em docs/migracoes/043_dedupe_deterministico.sql:33, 47, 57-58.

## SECÇÕES F e G — Caixa de Entrada e restrições

## F1 — Como funciona a Caixa de Entrada

**Tabela.** `public.notificacoes`, criada em `docs/migracoes/022_notificacoes.sql:29-39`: `tipo text not null default 'captacao'` (022:32), `titulo`, `submission_id` (FK para `submissions`, nullable, `on delete cascade` — 022:34), `cliente_id`, `event_type_id`, `dados jsonb` (snapshot do acontecimento — 022:37) e `lida_em` (022:38). Índice parcial para o badge de não lidas em 022:45-47. RLS ligado, só `authenticated` lê/escreve (022:103-111); o comentário da própria migração diz «O anon nem SELECT tem» (022:22-23).

**Quem escreve lá.** Nunca o front — em `src/` só encontrei SELECT (`src/lib/notificacoes.js:23-40`), UPDATE de `lida_em` (`src/lib/notificacoes.js:42-63`), DELETE (`src/lib/notificacoes.js:75-82`) e uma leitura da «fila do papel» em `src/lib/portal.js:313-315`. Quem insere é a BD, por duas vias:

1. **Trigger** `AFTER INSERT` em `submissions` → `dlm_notificar_captacao` (SECURITY DEFINER), que cria a notificação de captação quando a fase é `interessado` e o papel do JWT é `anon` (`docs/migracoes/022_notificacoes.sql:50-100`; corrigida em `024_corrigir_trigger_notificacoes.sql:48-51`; recriada em `026_recovery_funcoes_publicas.sql:208-211`). Qualquer erro do trigger é engolido para nunca falhar a captação (022:89-92).
2. **RPCs SECURITY DEFINER do portal** (chamadas pelo cliente anónimo com token): `dlm_portal_pedir_codigo` (`061_portal_codigo_ambito_e_revogacao.sql:53` insere em 061:112-115), `dlm_portal_acto` (versão actual em `077_sinal_antes_do_contrato.sql:218-248`; antes `072_actos_na_caixa_de_entrada.sql:133-163` e `075_funil_acompanha_os_factos.sql:239-269`), `dlm_portal_registar_assinado_papel` (`060_portal_papel_correccoes.sql:52` insere em 060:106-109), `dlm_portal_entregar_questionario` (`063_questionario_rpcs_do_portal.sql:348` insere em 063:376-379; redefinida em `069_questionario_entrega_se.sql:196-199`), `dlm_portal_pedir_alteracao_campo` (063:397 insere em 063:452-455; redefinida em `074_assinaturas_e_morada.sql:183-186`) e `dlm_portal_avaliar` (`067_avaliacao_rpcs_e_despedida.sql:122` insere em 067:198-201).

**Como chega ao ecrã.** Realtime, não sondagem: a tabela é juntada à publicação `supabase_realtime` em `docs/migracoes/022_notificacoes.sql:116-127`; o front subscreve `postgres_changes` INSERT no canal `"notificacoes-changes"` (`src/lib/notificacoes.js:90-108`), com registo do status do canal (notificacoes.js:100-106). O hook `useNotificacoes` (`src/lib/notificacoes.js:116-203`) faz a carga inicial (limite 60 — notificacoes.js:23), funde a lista inicial com o que chegou entretanto pelo canal (notificacoes.js:128-135), conta não lidas e põe-nas no título do separador (notificacoes.js:146-151), e guarda a última chegada em `nova` para o toast (notificacoes.js:136-139). Consumido em `src/pages/AdminPage.jsx:191` (toast em AdminPage.jsx:1423) e `src/pages/EventoPage.jsx:473`. Não encontrei `setInterval` de sondagem para notificações — o único `setInterval` que encontrei é decorativo (`src/pages/MaintenancePage.jsx:274`). Há um segundo canal realtime, `"db-changes"`, para submissions/invites/event_types (`src/pages/AdminPage.jsx:492-531`), coberto pela publicação em `docs/migracoes/023_realtime_submissions.sql:15-37`.

## F2 — Tipos de acontecimento registados

Lista exaustiva dos valores de `tipo` inseridos (local da inserção actual, com redefinições anteriores entre parênteses):

| tipo | onde se insere |
|---|---|
| `captacao` | `docs/migracoes/022_notificacoes.sql:77` (024:51, 026:211) |
| `codigo_pedido` | `docs/migracoes/061_portal_codigo_ambito_e_revogacao.sql:115` (057:315) |
| `pedido_alteracao` | `docs/migracoes/077_sinal_antes_do_contrato.sql:221` (057:717, 058:302, 061:246, 072:136, 075:242) |
| `orcamento_aceite` | `docs/migracoes/077_sinal_antes_do_contrato.sql:230` (072:145, 075:251) |
| `projecto_aprovado` | `docs/migracoes/077_sinal_antes_do_contrato.sql:239` (072:154, 075:260) |
| `contrato_assinado` | `docs/migracoes/077_sinal_antes_do_contrato.sql:248` (072:163, 075:269) |
| `contrato_papel` | `docs/migracoes/060_portal_papel_correccoes.sql:109` (057:782, 058:387) |
| `questionario_entregue` | `docs/migracoes/063_questionario_rpcs_do_portal.sql:379` (069:199) |
| `questionario_pedido` | `docs/migracoes/063_questionario_rpcs_do_portal.sql:455` (074:186) |
| `avaliacao_recebida` | `docs/migracoes/067_avaliacao_rpcs_e_despedida.sql:201` |

No front, o mapa `TIPOS_DO_PORTAL` conhece os 9 tipos do portal com resumo/corpo (`src/components/admin/CentroNotificacoes.jsx:142-212`); `captacao` é o caso base fora do mapa (CentroNotificacoes.jsx:665 faz `TIPOS_DO_PORTAL[n.tipo] || null`).

**[inferência]** O modelo aguentaria um acontecimento «comunicado entregue a este evento» sem mudar de forma: `tipo` é `text` sem CHECK (não encontrei nenhuma constraint sobre `tipo` — só o default em 022:32), `dados` é jsonb livre (022:37), e `submission_id`/`cliente_id`/`event_type_id` já existem para ancorar ao evento (022:34-36). Um `tipo` desconhecido não parte a UI (fallback em CentroNotificacoes.jsx:665). Duas ressalvas: (a) para ter resumo/corpo próprios teria de se acrescentar a entrada ao `TIPOS_DO_PORTAL` (CentroNotificacoes.jsx:142); (b) a única protecção contra remoção é hardcoded para `contrato_papel` (`src/lib/notificacoes.js:178-183`), pelo que um tipo novo seria removível como os restantes.

## G1 — RLS e o padrão das páginas públicas

**O que o anon lê hoje nas tabelas.** A migração 021 activa RLS em todas as tabelas listadas, apaga TODAS as políticas e recria o mínimo (`docs/migracoes/021_rls_bloquear_anon.sql:30-67`): `authenticated` acesso total (021:64-66) e, para o anon, apenas **SELECT em `event_types`** (021:70-73) e **INSERT em `form_errors`** (021:75-78). Nota: `docs/migracoes/form_errors.sql:28-40` dava também select/delete a anon em `form_errors`, mas a 021 apaga e recria as políticas dessa tabela (021:43, 021:56-62). Em `notificacoes` o anon não tem nada (022:105-107). No storage: os baldes são públicos para GET directo por URL, mas a listagem anónima foi fechada (`docs/migracoes/056_storage_sem_listagem_anonima.sql:1-33`); o INSERT anónimo mantém-se no balde `referencias` (056:25-27) e no `contratos-assinados`, restringido ao prefixo `papel_` (`docs/migracoes/058_portal_fase3_correccoes.sql:329-336`); o balde `fotografias` só aceita/mostra a equipa autenticada (`docs/migracoes/065_fotografias_do_dia.sql:47-55`).

**O padrão da casa para páginas públicas** — RPC SECURITY DEFINER + segredo no URL + projecção explícita:
- `dlm_portal_ver(p_token)` (`docs/migracoes/049_portal_do_cliente_fase1.sql:154` e seguintes): token opaco de 24 bytes aleatórios em base64url, «não deriva do id do evento» (049:26-37); regra escrita no cabeçalho: «submissions.id NUNCA sai» (049:7-9); token inexistente, revogado e expirado devolvem a MESMA resposta (049:151-153 e 049:186-193); `revoke all ... from public` + `grant execute ... to anon` (049:334-335).
- `campanha_publica(p_token)` (`docs/migracoes/034_campanha_publica.sql:27` e grant em 034:63): o cabeçalho descreve o padrão — «a única janela do público para a campanha, pelo padrão das 020/026: SECURITY DEFINER, procura por token (aleatório, revogável), devolve SÓ o que a página pública mostra» (034:10-17).
- Formulários públicos: as RPCs da 020 são «a única porta dos formulários públicos» (`docs/migracoes/020_rpcs_formularios_publicos.sql:9-14`), com grants a anon em 020:349-358 (`formulario_submeter`, `captacao_submeter`, etc.).
- Contei 63 ocorrências de `security definer` nas migrações (saída de grep sobre `docs/migracoes/*.sql`).

## G2 — Operação em lote

**Importação de clientes** (`src/lib/importacao/executar.js`): é o padrão de lote mais desenvolvido — **sequencial, um RPC por cliente**: `for (const item of selecionados)` com `supabase.rpc("importar_cliente", ...)` (executar.js:134-159), «UMA TRANSAÇÃO por cliente. Um cliente que falhe reverte inteiro; os restantes seguem» (executar.js:8-9), idempotente desde a migração 044 (executar.js:12-15). Progresso: callback `aoProgresso` com o nome do cliente em curso (executar.js:93 e 135), mostrado no botão do ecrã (`src/components/admin/ImportarTab.jsx:55`, 108, 550) — é texto («A importar "X"...»), não barra percentual. Relatório final ok/falhados/contagens/duração (executar.js:122-161).

**Outros lotes que encontrei:**
- `Promise.allSettled` sobre a selecção na ficha de materiais — aplicar um campo a várias linhas e remover selecionadas, com reversão das que falharam (`src/components/admin/FichaMateriais.jsx:854-856` e 884-895).
- `Promise.all` para escrita em paralelo pequena: reordenar mensagens (`src/components/admin/MensagensSheet.jsx:128-133`), reordenar fotografias (`src/lib/fotografias.js:158-165`), e as duas versões de uma fotografia (`src/lib/fotografias.js:62-70`).
- `Promise.all` de leitura paralela (carga de ecrãs): `src/lib/clientes.js:115`, `src/pages/EventoPage.jsx:293`, `src/components/admin/OperacionalTab.jsx:101`.

Não encontrei fila persistente, worker, processamento por partes (chunking) nem barra de progresso percentual em lado nenhum. **[inferência]** O padrão da casa para lote é «ciclo sequencial no browser com relatório no fim» (importação) ou «Promise.all/allSettled sobre dezenas, não centenas» (materiais) — não há retoma se a página fechar a meio.

## G3 — Limites do plano gratuito: o que o repo evidencia

- **Edge Functions**: existe exactamente UMA — `supabase/functions/obter-distancia/index.ts` (contrato descrito em index.ts:1-13), invocada em `src/lib/obterDistancia.js:51`. Não encontrei mais nenhuma função em `supabase/functions/`. Não encontrei no repo qualquer integração de envio de email (grep por sendgrid/resend/smtp/nodemailer: nada) — o WhatsApp existente é link manual `wa.me` com mensagem pronta (`src/lib/mensagens.js:113-124`).
- **Storage**: cinco baldes referenciados — `referencias`, `propostas` e `materiais` (`docs/migracoes/056_storage_sem_listagem_anonima.sql:5-7`), `fotografias` (`docs/migracoes/065_fotografias_do_dia.sql:40`), `contratos-assinados` (`docs/migracoes/058_portal_fase3_correccoes.sql:332`). O código contém disciplina deliberada de peso: compressão no browser a JPEG máx. 1200px/82% (`src/lib/captacao.js:24-31`) e fotografias em duas versões 1000px/1800px com racional «poupança de mais de dez para um» (`src/lib/fotografias.js:23-32`). Não encontrei no repo qualquer medição do storage usado nem referência escrita a quotas ou ao plano do Supabase (grep por «gratuito/free/quota/limite» em `docs/`: nada).
- **Realtime**: quatro tabelas na publicação `supabase_realtime` — `notificacoes` (022:125), `submissions` e `invites` (`docs/migracoes/023_realtime_submissions.sql:18` e 037), `campanha_intencoes` (`docs/migracoes/035_campanha_intencoes.sql:121`).
- **PDF**: a geração é client-side — `jspdf` e `jspdf-autotable` em `package.json:19-20`. Não encontrei geração de PDF no servidor.

**[inferência]** Onde um módulo de comunicados em lote pode morder: (a) gerar o PDF é hoje trabalho do browser (jspdf), logo «um comunicado × N eventos» significa N gerações+uploads a partir da máquina da Nádia, no padrão sequencial sem retoma da importação (executar.js:134-159); (b) não existe nenhum mecanismo servidor-side de envio (a única edge function é a da distância), pelo que email automático exigiria a segunda edge function do projecto; (c) os PDFs acumulam storage sem a disciplina de compressão que as imagens têm. **[conhecimento geral, não do repo]** Os números concretos do plano gratuito (tamanho total de storage, mensagens/ligações realtime, invocações de edge functions) não constam em lado nenhum do repositório — qualquer valor citado viria de fora dele.

## H — Identidade visual e vocabulário

### H1 · O que o designer precisa de `docs/identidade-visual.md`

**Paleta — §1 (docs/identidade-visual.md:33-84), citação directa:**

> ### O dourado (a identidade)
>
> | Papel | Valor |
> |---|---|
> | **Ouro da casa** — ações primárias, marcas de "feito", identidade | `#C9A84C` |
> | **Ouro escuro** — texto dourado legível, overlines, hovers de ligação | `#A07830` |
> | **Ouro claro** — hairlines, bordas de cartão, estados suaves | `#E8D5A3` |
> | Ouro carregado — hover do botão dourado cheio; aro de cunhagem | `#B9973E` |
> | Rótulo dourado de contraste (par do número) | `#B08A3C` |
> | Halo dourado (sombras/anéis de foco suaves) | `rgba(201,168,76, 0.14–0.30)` |
>
> ### Os fundos (do mais frio ao mais quente)
>
> | Papel | Valor |
> |---|---|
> | **Creme** — o fundo de página, sempre | `#FAFAF8` |
> | Branco — cartões e superfícies de conteúdo | `#FFFFFF` |
> | Lavado quente — cartões destacados, hover de botão dourado-contorno | `#FBF7EF` |
> | Lavado de pastilha — selos, etiquetas douradas | `#FEF9EC` |
> | Lavado de aviso suave — linhas com atenção pendente | `#FFFDF6` |
> | Branco-quente — elementos "por preencher" (engastes vazios) | `#FDFBF5` |
>
> ### Hairlines e neutros
>
> | Papel | Valor |
> |---|---|
> | Hairline padrão — divisores, bordas finas | `#F0E6D0` |
> | Hairline leve — linhas de tabela | `#F5ECD7` |
> | Trilho — a linha por preencher de uma régua/progresso | `#E5DCC3` |
> | Aro de engaste — borda de um passo futuro | `#E8DCC0` |
> | **Texto** — quase-preto da casa | `#1A1A1A` |
> | **Texto secundário** | `#6B6B6B` |
> | Rótulos apagados, cabeçalhos de tabela — **nunca em algo que se clica** | `#9B9B9B` |
> | Traços quase invisíveis (ações destrutivas discretas) | `#C4C4C4` |
>
> **Regra de contraste (vale nos dois registos):** `#9B9B9B` nunca serve algo que se clica — não chega ao contraste mínimo. Ligações secundárias em `#6B6B6B` (≈5.1:1), com hover dourado `#A07830`.
>
> ### Semânticos (sempre o trio texto/fundo/borda)
>
> | Família | Texto | Fundo | Borda |
> |---|---|---|---|
> | Sucesso / dinheiro recebido | `#166534` (ou `#22C55E`) | `#F0FDF4` | `#BBF7D0` |
> | Perigo / rutura / erro | `#DC2626` (ou `#B91C1C`) | `#FEF2F2` | `#FECACA` |
> | Aviso / atenção | `#B45309` (ou `#92400E`) | `#FEF3E2` | `#F0D9B5` |
> | Terminado / perdido / neutro | `#6B7280` | `#F9FAFB` | `#E5E7EB` |
>
> Regra: o vermelho e o âmbar são estados, nunca decoração. O dourado nunca é usado para erro nem aviso grave.

**Tipografia — §2 (docs/identidade-visual.md:88-128), citação directa:**

> Duas famílias, papéis rígidos:
>
> - **Playfair Display** (serifa) — pesos 400 e 600, itálico 400. É a voz de cerimónia: títulos de página, nomes de eventos/casais, frases de remate («Percurso completo…»), a mensagem da anfitriã. **Nunca** em UI de trabalho: botões, tabelas, campos, rótulos.
> - **Inter** (sans) — pesos 300–700. Todo o resto: corpo, botões, tabelas, formulários, avisos.

(escala completa em docs/identidade-visual.md:101-110; regras duras — `tabular-nums`, `text-wrap: balance/pretty`, euros «`1500€`, `1500,50€` — símbolo colado, vírgula decimal, sem separador de milhares» — em docs/identidade-visual.md:112-118)

> ### Overlines (os "versaletes" da casa)
>
> Etiquetas curtas em MAIÚSCULAS, Inter 9–10px, peso 700, com tracking largo. É o gesto tipográfico mais assinatura da casa:
>
> - **Interno**: tracking `0.14–0.16em`, cor ouro-escuro `#A07830` (ou cinza `#6B7280` em contextos terminados).
> - **Público**: tracking `0.22em` — mais cerimónia, mais respiro.

(docs/identidade-visual.md:120-128)

Nota: docs/decisoes-de-produto.md:452-457 regista uma excepção viva ao formato do euro — «**`formatarEuroPT` fica "1 291,50 €"** (espaço nos milhares, espaço antes do €), contra a letra da identidade §2 (…) é o formato dos documentos que a cliente recebe, e a coerência portal↔papel manda mais do que o guia. Fica anotado para o Hélio decidir». [inferência] Um comunicado em PDF é «documento que a cliente recebe» — cai do lado do formato `1 291,50 €`.

**Voz / escrita — §6 (docs/identidade-visual.md:232-254), citação directa (inclui a regra da terceira pessoa e as aspas «»):**

> - **Português europeu, sempre — nunca pt-BR.** As armadilhas do costume: nada de «você», nada de gerúndio progressivo («estamos a enviar», nunca «estamos enviando»). Se soa a Brasil, está errado para esta casa.
> - **Terceira pessoa em todo o texto, nos dois registos** — «o seu evento», «receberá um aviso», «se precisar». Nunca «o teu», «avisamos-te», «escreve-nos».
> - **A linguagem serve todo o espaço lusófono.** A grafia continua portuguesa, mas o vocabulário evita as palavras que só existem em Portugal: «telemóvel», «ecrã», «casa de banho», «autocarro».
> - **Aspas angulares «»** para citações e para nomear botões/estados em texto corrido.
> - Frases completas e calmas; nada de fragmentos tipo dashboard.
> - **Erros dizem o que aconteceu e o que fazer a seguir**, sem jargão: «Não foi possível registar. Tente novamente daqui a um momento.» Um erro terminal diz que é terminal em vez de convidar a repetir.
> - Maiúsculas só nos overlines. Títulos em caixa normal.
> - Celebração com sobriedade: uma frase serena vale mais do que três pontos de exclamação (a casa quase não os usa).
> - Nunca `alert()`/diálogos do browser — tudo se diz na própria página, no lugar onde aconteceu.

A esta soma-se, de docs/decisoes-de-produto.md:425-428: «**No portal, quem fala é "a Do Luxo à Mesa", nunca "a Nádia".** (…) o nome próprio saiu de todo o texto virado à cliente (18 frases). No backoffice e nos comentários do código, a Nádia continua a ser a Nádia».

**Movimento — §3 (docs/identidade-visual.md:131-183), citação directa:**

> **Regra nº 1: o movimento marca acontecimentos; o estado é imóvel.** No backoffice não existem loops perpétuos (…) **No público os loops ambiente são permitidos** (é o papel da vitrina), mas lentos, orgânicos e discretos — brilho que respira, nunca coisas que saltam.
>
> Regras duras (valem nos dois registos):
> - **Nada anima ao abrir.** (…)
> - **`prefers-reduced-motion` sempre respeitado**: tudo troca de estado seco, sem transições, sem exceções.
> - **Zero jank.** (…) Animar só `transform`/`opacity` onde possível.

Curvas (docs/identidade-visual.md:149-153): «`cubic-bezier(0.22, 1, 0.36, 1)` — "EASE LUXO" | Entradas de conteúdo, revelações, contagens, enchimentos»; «`cubic-bezier(0.32, 0.72, 0, 1)` — folha iOS | Superfícies que deslizam: drawers (0.32s), popovers e painéis (0.14–0.16s)»; «`cubic-bezier(0.34, 1.56, 0.64, 1)` — ressalto | SÓ clímax raros e deliberados». Molas (linhas 157-161): 500/28 «pop de uma marca a assinar», 600/42 «deslize firme sem ressalto», 55/15 «líquido a assentar». Durações (linhas 163-171): micro 140–180ms, padrão 200–320ms, média 400–600ms, «**Ambiente (1.1s+)** — só no registo público e em esqueletos de carregamento (ondulação de 1.6s)».

**Esqueletos e foco (docs/identidade-visual.md:177-183), citação directa:**

> **Estados de carregamento**: esqueletos com a forma do conteúdo que vem (blocos arredondados a ondular entre `#F3EEE1` e `#FAF6EC`), nunca spinners, nunca frases a fingir de conteúdo.
>
> **Foco de teclado**: anel `2px` dourado `#C9A84C` com offset 2px — nunca se remove o foco sem o substituir por algo melhor.

Contexto que enquadra tudo: os dois registos (backoffice OFÍCIO / público DESLUMBRE) em docs/identidade-visual.md:12-24; espaço e raios em docs/identidade-visual.md:186-211; o traço dos ícones (SVG à mão, stroke 1.5–2.2px redondo, «**Proibido no backoffice**: bibliotecas de ícones, glifos de texto (✓ ✕ ● ○) como marcas, e emoji como ícone») em docs/identidade-visual.md:214-228; a anatomia da vitrina pública (logo com halo, overline 0.22em, Playfair 22-24, coluna única ~480px) em docs/identidade-visual.md:258-293.

### H2 · «Comunicado» no glossário e as palavras vizinhas

**Entrada para «comunicado» em docs/glossario.md: não encontrei.** Também não encontrei entradas para «aviso», «circular», «notificação» nem «mensagem» como termos definidos — o quadro dos nomes (docs/glossario.md:217-243) não tem nenhuma linha para estes conceitos. A única ocorrência de «comunicado» no código do projecto é o particípio num texto de contrato: «O cancelamento deverá ser comunicado por escrito à 2.ª Contraente.» — src/components/admin/orcamentos/contratoConfig.js:108. «Circular»: não encontrei.

Palavras vizinhas que **já têm dono hoje**:

- **«notificação» — é da Caixa de Entrada.** src/lib/notificacoes.js:5 («notificacoes.js — a Caixa de Entrada da Nádia (migração 022)»); o painel chama-se «Caixa de Entrada — o painel das notificações» (src/pages/AdminPage.jsx:1407) e o componente é CentroNotificacoes (src/components/admin/CentroNotificacoes.jsx; referido em docs/glossario.md:482 — «O "Novo interessado" do CentroNotificacoes vem de um gatilho da base (migração 024)»). O item de menu lê-se «Caixa de Entrada» (src/components/admin/Navegacao.jsx:405).
- **«mensagem» — é do separador Mensagens (mensagens-tipo de WhatsApp/Instagram).** Separador no menu: `{ id: "mensagens", label: "Mensagens", icone: "mensagens" }` — src/components/admin/Navegacao.jsx:26; «MensagensTab — a biblioteca de mensagens-tipo como separador» — src/components/admin/MensagensTab.jsx:5; o painel resolve placeholders «({SINAL} vira "138€", {LINK_INTERESSE} vira o link real...) e um toque em Copiar põe-na no clipboard, pronta a colar no Instagram» — src/components/admin/MensagensSheet.jsx:30-34. Segundo uso, distinto: «Mensagens» é também um tipo de nota do evento — `{ id: "mensagem", label: "Mensagens" }` em src/components/admin/NotasEvento.jsx:31. O glossário usa ainda «modelos de mensagem» para estas mensagens-tipo guardadas na base (docs/glossario.md:501-502).
- **«aviso» — tem vários donos.** (a) A família semântica âmbar da identidade: «Aviso / atenção» (docs/identidade-visual.md:80) e «Lavado de aviso suave — linhas com atenção pendente» (docs/identidade-visual.md:54). (b) O conteúdo de uma notificação: «a notificação é só o aviso» — src/lib/notificacoes.js:67; «Os avisos tocam onde a Nádia está: o toast…» — docs/decisoes-de-produto.md:524. (c) Componentes com o nome: AvisosBloqueantes («o portão de actualizações importantes» — src/components/admin/AvisosBloqueantes.jsx:9), AvisoDataDoEvento (src/components/admin/AvisoDataDoEvento.jsx:4) e AvisoMoradaDoEvento (existe em src/components/admin/AvisoMoradaDoEvento.jsx). (d) No texto ao cliente: «receberá um aviso» é o exemplo canónico da terceira pessoa (docs/identidade-visual.md:240).
- [inferência] «Comunicado» está livre de colisões no vocabulário da casa — nenhuma superfície, separador ou tabela o usa hoje — enquanto «notificação», «mensagem» e «aviso» já fazem cada uma um trabalho, e o princípio do glossário é «uma palavra só deve fazer um trabalho» (docs/glossario.md:15).

### H3 · Decisões registadas que toquem comunicados, mensagens em massa, promoções ou canais de contacto

**Decisão directa sobre comunicados, mensagens em massa ou promoções: não encontrei** em docs/decisoes-de-produto.md.

Decisões que tocam canais de contacto, tangencialmente:

- docs/decisoes-de-produto.md:24-27 — «**Email fica fora do dedupe** (Lote 3). Dados: 0 emails em 12 contactos. (…) o email não é chave fiável neste negócio; fusões automáticas são irreversíveis.»
- docs/decisoes-de-produto.md:684-686 — a pendência do sinal «leva à conversa ("Combinar pela conversa", o WhatsApp da casa) porque o pagamento não se faz no portal.»
- docs/decisoes-de-produto.md:443-444 — no cartão do véu do portal, «"Já tenho o código" (direito às células, com "Se tiver pressa, fale pelo WhatsApp")».
- docs/decisoes-de-produto.md:513-531 — migração 072 e seguintes: todos os actos da cliente tocam na Caixa de Entrada; «Os avisos tocam onde a Nádia está: o toast (e o canal realtime) passam a viver também na ficha do evento». [inferência] São canais internos (avisos à Nádia), não canais de saída para clientes.
- docs/decisoes-de-produto.md:425-428 — «No portal, quem fala é "a Do Luxo à Mesa", nunca "a Nádia"» — regra de remetente relevante para qualquer comunicado. [inferência]
---

## Três parágrafos de síntese

### 1 · O que já resolve metade do problema

O par modelo→instância que o desenho quer imitar já existe **duas vezes**
no repo, e cada uma resolve uma metade diferente. A `mensagens_tipo`
(secção A) é o antecedente directo do *modelo de comunicado*: tabela em
BD com CRUD completo, soft-delete, reordenação por arrasto, e — o mais
valioso — a `resolverMensagem` com os tokens `{NOME} {TIPO_EVENTO} {DATA}
{VALOR} {SINAL}` já a funcionar (`src/lib/mensagens.js:91-110`); o corpo
de mensagem que acompanha o PDF no WhatsApp está a um passo disto. O par
`event_types`→`invites` (secção B) é o molde do *comunicado emitido*:
geração de código com verificação de unicidade, ciclo de estados com
carimbo por trigger, estados derivados para a supervisão. E há um achado
que muda o tabuleiro: **o jsPDF já está instalado e há um gerador de PDF
programático completo em `src/lib/exports.js` — mas é código morto**,
sem um único import em todo o `src/` (secção C.1). A app tem o motor da
folha-como-ficheiro parado na garagem, com a paleta da casa já duplicada
em RGB. Somem-se os cinco baldes de Storage com padrão de upload
estabelecido, a Caixa de Entrada que aceita um `tipo` novo sem mudar de
forma (F2), e a chave de dedupe dos 9 dígitos já canónica na migração 043
— o recorte «uma pessoa = um envio» tem a régua feita.

### 2 · Onde vejo colisão

Três sítios. **(a) O separador Mensagens**: um comunicado é, na prática,
uma mensagem-tipo com folha anexada — se o módulo novo nascer com a sua
própria biblioteca de textos, ficam duas bibliotecas de modelos com
tokens lado a lado (`mensagens_tipo` e os modelos de comunicado), a
competir pelo mesmo gesto da Nádia. O desenho tem de decidir à cabeça se
o comunicado *absorve* as mensagens-tipo (a biblioteca ganha anexos) ou
se as *referencia* — coexistirem sem relação é o pior dos mundos. **(b) O
ecossistema dos documentos do portal**: a casa já tem uma noção forte de
«folha que chega à cliente» — publicação congelada, véu de valores,
código, actos com prova (G1). Um PDF que circula por WhatsApp é uma
segunda espécie de documento, sem véu nem trilho; se um dia os
comunicados aterrarem também no portal (e o primeiro caso real — condições
de montagem e recolha — é conteúdo contratual, ver `contratoConfig.js:58-79`),
as duas espécies colidem nas pendências e novidades. **(c) O vocabulário**:
«comunicado» está livre (H2), mas «mensagem», «notificação» e «aviso» têm
dono — qualquer UI que misture estes termos paga o preço; e o único ecrã
com filtros ricos por tipo/estado/data é a `DocumentosLista`
(`src/components/admin/DocumentosLista.jsx:46-99`) — o selector de
público-alvo vai querer exactamente aqueles filtros, e duplicá-los em vez
de os extrair seria a colisão silenciosa.

### 3 · A armadilha que ainda não viste

**O `wa.me` não anexa ficheiros — e é tudo o que a app sabe fazer.** Todo
o caminho WhatsApp existente é um link com `?text=` (A.3-A.5); a Web
Share API, que é a única ponte browser→conversa com ficheiro no
telemóvel, **não aparece uma única vez no código** (C.2); e o caminho de
impressão actual termina no `window.print()` — o repo não tem um só passo
do «tenho a folha no ecrã» ao «tenho o ficheiro na conversa» (C.3). Isto
faz da frase «o comunicado circula como PDF pelo WhatsApp» uma decisão de
produto disfarçada de detalhe técnico, com três saídas possíveis e nenhuma
grátis: partilha manual folha a folha (trinta casamentos = trinta gestos
de partilha da Nádia, cada um com o seu toque — a Web Share API exige
gesto por partilha), guardar as folhas no Storage e mandar *links* (muda
o artefacto: deixa de ser anexo, passa a ser página — e volta a colidir
com o portal), ou a API oficial do WhatsApp Business (a primeira
infraestrutura de envio servidor-side do projecto, que hoje tem uma única
edge function, a da distância — G3). Armadilha secundária que o SQL
abaixo vai expor: «todos os casamentos» não existe no esquema — o tipo é
uma linha de `event_types` identificada só pelo `nome` em texto livre
(E5), e a nota em `src/lib/clientes.js:645-647` avisa explicitamente que
não se adivinha a natureza do evento pelo nome do modelo. Num produto
multi-negócio, o filtro «casamentos» precisa de um marcador mais firme do
que uma comparação de strings.

---

## SQL para o dono correr

Prontas a colar no SQL editor do Supabase (TEST ou PROD, conforme o que
se quer medir). Cada uma diz ao que vai.

```sql
-- 0 · Os modelos de evento que existem (para obter o id real do «Casamento»
--     em vez de comparar nomes às cegas):
select id, nome, predefinido from event_types order by nome;

-- 1a · Casamentos «activos» no sentido mais apertado do código (FunilBoard:
--      pós-sinal e não concluído — a variável posSinalAtivos):
select count(*)
  from submissions s
  join event_types et on et.id = s.event_type_id
 where et.nome ilike '%casamento%'
   and s.fase in ('contrato', 'cliente', 'projecto')
   and s.status <> 'Concluído';

-- 1b · Casamentos «vivos» (tudo menos perdidos), separando os por vir dos
--      já acontecidos — a definição que o primeiro comunicado deve querer:
select count(*) filter (where s.data_evento >= current_date)   as por_vir,
       count(*) filter (where s.data_evento < current_date)    as ja_passaram,
       count(*) filter (where s.data_evento is null)           as sem_data,
       count(*)                                                as total_vivos
  from submissions s
  join event_types et on et.id = s.event_type_id
 where et.nome ilike '%casamento%'
   and s.fase <> 'perdido';

-- 2 · A distribuição real de fase × status em todos os eventos:
select fase, status, count(*)
  from submissions
 group by 1, 2
 order by 1, 2;

-- 3 · Contactos com telefone na ficha (chave canónica dos 9 dígitos,
--     a mesma da migração 043):
select count(*) as clientes_total,
       count(*) filter (
         where nullif(right(regexp_replace(coalesce(contacto, ''),
                                           '\D', '', 'g'), 9), '') is not null
       ) as com_telefone_na_ficha
  from clientes;

-- 4 · Repetidos num envio a contactos: a mesma chave de 9 dígitos em mais
--     do que um cliente (chegariam duas vezes à mesma pessoa):
select right(regexp_replace(coalesce(contacto, ''), '\D', '', 'g'), 9) as chave,
       count(*)            as n_clientes,
       array_agg(nome)     as nomes
  from clientes
 where coalesce(contacto, '') <> ''
 group by 1
having count(*) > 1
 order by n_clientes desc;

-- 5 · Clientes de ficha muda: telefone SÓ nas respostas do evento (um envio
--     feito só por clientes.contacto deixava estas pessoas de fora):
select count(distinct c.id) as clientes_sem_contacto_na_ficha_mas_com_telefone_no_evento
  from clientes c
  join submissions s on s.cliente_id = c.id
 where coalesce(c.contacto, '') = ''
   and (coalesce(s.respostas->>'contactoPrincipal', '') <> ''
     or coalesce(s.respostas->>'numeroWhatsapp', '') <> '');

-- 6 · Quantos contactos têm email (para dimensionar o canal desligado):
select count(*) filter (where coalesce(email, '') <> '') as com_email,
       count(*)                                          as total
  from clientes;
```
