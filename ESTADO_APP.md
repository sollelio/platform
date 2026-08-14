# ESTADO_APP.md — levantamento do estado actual

**Data do levantamento:** 12/08/2026 · **Ramo:** develop · **Working tree:** contém alterações por commitar (ver git status).

Relatório de LEITURA, feito para servir de base ao planeamento de um módulo
novo. Nada foi alterado: sem edições de código, sem commits, sem migrações
corridas. Cada secção foi levantada por um leitor dedicado e depois
confirmada literalmente por um verificador céptico contra o código real.

**Como ler:** onde algo não existe, está escrito «não existe» — essas
afirmações foram verificadas com greps próprios, incluindo variantes de
grafia e acentuação. Onde um facto não pôde ser confirmado, está dito.
O estado da BD (que migrações estão mesmo aplicadas, que políticas vivem
no painel do Supabase) NÃO é observável a partir do repositório: essas
secções dizem o que o repositório declara, não o que a base tem.

## Índice

1. [ROTAS](#1-rotas)
2. [PÁGINA DE EVENTO](#2-página-de-evento)
3. [GLOSSÁRIO](#3-glossário)
4. [SCHEMA](#4-schema)
5. [RLS](#5-rls)
6. [PÁGINAS PÚBLICAS POR TOKEN](#6-páginas-públicas-por-token)
7. [MIGRAÇÕES](#7-migrações)
8. [REALTIME](#8-realtime)
9. [WHATSAPP](#9-whatsapp)
10. [PADRÕES REUTILIZÁVEIS](#10-padrões-reutilizáveis)
11. [DESIGN SYSTEM](#11-design-system)
12. [EQUIPA](#12-equipa)
13. [DIVERGÊNCIAS](#13-divergências)

---

## 1. ROTAS

Todo o encaminhamento vive num único ficheiro: `src/App.jsx` (130 linhas; `BrowserRouter` aberto em `src/App.jsx:53`, `<Routes>` em `src/App.jsx:60-125`). Não existe outro ficheiro de rotas — `src/main.jsx` (10 linhas) só monta `<App />` dentro de `<StrictMode>`; não há `createBrowserRouter` em lado nenhum de `src/`.

Do lado do alojamento, o *fallback* de SPA é `public/_redirects` (conteúdo literal: `/*    /index.html   200`, padrão Netlify), acompanhado de `public/_headers` com `Cache-Control` imutável para `/assets/*` e `max-age=0, must-revalidate` para `/*`.

**Faixa de ambiente:** No `.env` do repositório, `VITE_APP_ENV=test` (linha 3) faz aparecer a faixa `<EnvBanner />` (`src/App.jsx:27`, `src/App.jsx:59`). O interruptor de manutenção que existia antes do router (`VITE_SITE_LOCKED` no `.env` + `src/pages/MaintenancePage.jsx`) foi **removido a 14/08/2026** — o router é agora incondicional.

| path | componente (ficheiro) | pública/autenticada | notas |
|---|---|---|---|
| `/` | `src/pages/FormEntryPage.jsx` | pública | `src/App.jsx:61`. Ecrã do código de acesso. Pré-preenche a partir de `?codigo=` (`src/pages/FormEntryPage.jsx:120-127`); em caso de código válido grava `sessionStorage.setItem("dlm_invite", …)` (`src/pages/FormEntryPage.jsx:145`) e navega para `/formulario` (`src/pages/FormEntryPage.jsx:146`). |
| `/formulario` | `src/pages/FormPage.jsx` | pública | `src/App.jsx:62`. Sem guarda de rota; guarda **dentro da página**: `src/pages/FormPage.jsx:397-414` — sem `sessionStorage["dlm_invite"]` faz `navigate("/")`, e também se o modelo não tiver `steps` (ausente, não-array, ou array vazio). |
| `/interesse` | `src/pages/CaptacaoPage.jsx` | pública | `src/App.jsx:65`. Comentário em `src/App.jsx:63-64`: «Porta pública do funil: o formulário de captação de interessados (sem código de acesso, fricção zero)». |
| `/admin/login` | `src/pages/LoginPage.jsx` | pública | `src/App.jsx:71`. Rota **irmã** da protegida, de propósito (comentário `src/App.jsx:66-70`). Com sessão já viva redirecciona: `if (sessao) return <Navigate to={destino} replace />` (`src/pages/LoginPage.jsx:234`), com `destino = destinoDepoisDoLogin(localizacao)` (`src/pages/LoginPage.jsx:140`; função em `src/lib/sessao.js:48-52`). Entrada por `supabase.auth.signInWithPassword` (`src/pages/LoginPage.jsx:161`). |
| `/admin` | — (redirecionamento) | pública (é só um `Navigate`) | `src/App.jsx:74`: `<Navigate to="/admin/inicio" replace />`. |
| `/admin/:separador/:p1?/:p2?` | `src/pages/AdminPage.jsx` | **autenticada** | `src/App.jsx:86-93`, envolvida em `<ProtectedRoute>`. Backoffice inteiro numa só rota; a tradução slug↔id do separador está em `src/lib/rotasAdmin.js` (`SLUG_POR_ID`, `src/lib/rotasAdmin.js:28-41`). Slug desconhecido → `<Navigate>` interno para `caminhoDeSlugAntigo(...)` ou `caminhoDoSeparador(SEPARADOR_POR_OMISSAO)` (`src/pages/AdminPage.jsx:874-882`). |
| `/evento/:id/:aba?` | `src/pages/EventoPage.jsx` | **autenticada** | `src/App.jsx:96-103`, envolvida em `<ProtectedRoute>`. |
| `/briefing/:id` | `src/pages/BriefingPage.jsx` | pública | `src/App.jsx:104`. **Sem `ProtectedRoute`** e sem token: lê por `id` (uuid) via `supabase.rpc("formulario_briefing", { p_id: id })` (`src/pages/BriefingPage.jsx:472`) e `supabase.rpc("briefing_materiais", { p_id: id })` (`src/pages/BriefingPage.jsx:503`). Ambas as RPC são `SECURITY DEFINER` com `grant execute … to anon, authenticated` (`docs/migracoes/020_rpcs_formularios_publicos.sql:358`; `docs/migracoes/031_briefing_materiais.sql:55`). |
| `/contribuir/:token` | `src/pages/ContribuirPage.jsx` | pública | `src/App.jsx:107`. Ver secção 6. |
| `/acompanhar/:token/:vista?/:sub?` | `src/pages/PortalPage.jsx` | pública | `src/App.jsx:118`. Ver secção 6. Valores literais de `:vista` tratados em `src/pages/PortalPage.jsx`: `"avaliar"` (:502), `"questionario"` (:516), `"sinal"` (:537), `"documentos"` (:556); sem `:vista` desenha a jornada. `:sub` chega aos filhos: na área dos documentos vai como `tipo={sub}` (`src/pages/PortalPage.jsx:568`) e vale `orcamento` / `contrato` / `proposta` (`src/components/portal/DocumentosVista.jsx:803`, `["orcamento", "contrato", "proposta"].map(...)`; assinatura em `DocumentosVista.jsx:1390`); no questionário vale `"responder"` ou `"respostas"` (`src/components/portal/QuestionarioVista.jsx:122`). |
| `/comunicado/:token` | `src/pages/ComunicadoPage.jsx` | pública | `src/App.jsx:123`. Ver secção 6. |
| `*` | `DestinoDesconhecido`, definida em `src/App.jsx:44-49` | pública | Fallback/404. |

### Mecanismo exacto de protecção

Não há guarda no servidor ao nível da rota (é uma SPA); a guarda de rota é **inteiramente cliente** e consiste num só componente:

- `src/components/ProtectedRoute.jsx:12-39`.
  - `const sessao = useSessao();` (`src/components/ProtectedRoute.jsx:13`).
  - `sessao === undefined` (ainda a ler) → ecrã com o texto `"A verificar sessão..."` (`src/components/ProtectedRoute.jsx:17-28`).
  - `!sessao` → `<Navigate to="/admin/login" state={{ from: localizacao }} replace />` (`src/components/ProtectedRoute.jsx:32-35`).
  - com sessão → `return children` (`src/components/ProtectedRoute.jsx:38`).
- `useSessao` está em `src/lib/sessao.js:18-42`: estado inicial `undefined`, `supabase.auth.getSession()` (`src/lib/sessao.js:24`) e subscrição a `supabase.auth.onAuthStateChange` (`src/lib/sessao.js:31`).
- O destino pós-login vem de `destinoDepoisDoLogin(localizacao)` (`src/lib/sessao.js:48-52`): usa `localizacao.state.from.pathname` + `search`, ou `/admin` se não houver.

Só duas rotas usam `ProtectedRoute`: `/admin/:separador/:p1?/:p2?` e `/evento/:id/:aba?` (`grep -rn "ProtectedRoute" src/` só devolve `src/App.jsx:13,89,91,99,101` e o próprio ficheiro). A protecção real dos dados está na base (RLS `to authenticated`, ex.: `docs/migracoes/049_portal_do_cliente_fase1.sql:74-79`), não no router.

### Fallback e redirecionamentos

- **404 / rota desconhecida:** `<Route path="*" element={<DestinoDesconhecido />} />` (`src/App.jsx:124`). `DestinoDesconhecido` (`src/App.jsx:44-49`) decide pelo prefixo: `pathname.startsWith("/admin") || pathname.startsWith("/evento")` → `<Navigate to="/admin/inicio" replace />`; caso contrário → `<Navigate to="/" replace />`. Sempre com `replace`.
- **`/admin` → `/admin/inicio`**, `replace` (`src/App.jsx:74`).
- **Sem sessão numa rota protegida → `/admin/login`**, `replace`, com o destino em `state.from` (`src/components/ProtectedRoute.jsx:34`).
- **Com sessão em `/admin/login` → destino/`/admin`**, `replace` (`src/pages/LoginPage.jsx:234`).
- **Slug de separador desconhecido → separador por omissão** `inicio` (`src/pages/AdminPage.jsx:874-882` + `src/lib/rotasAdmin.js:25`, `SEPARADOR_POR_OMISSAO = "inicio"`); slugs antigos traduzem-se preservando o resto do caminho (`SLUG_ANTIGO`, `src/lib/rotasAdmin.js:76-79`: `clientes → contactos` (29/07/2026), `comunicados → envios` (09/08/2026); função `caminhoDeSlugAntigo` em `src/lib/rotasAdmin.js:81-85`).
- **`/formulario` sem convite em sessão → `/`** (`src/pages/FormPage.jsx:400` e `:412`), sem `replace`.

---

## 2. PÁGINA DE EVENTO

### 2.1 Rota e ficheiro

| item | valor |
|---|---|
| Rota | `path="/evento/:id/:aba?"` — `src/App.jsx:97` (elemento `<Route>` completo em `src/App.jsx:96-103`, com `<EventoPage />` dentro de `<ProtectedRoute>`, `:99-101`) |
| Ficheiro da página | `src/pages/EventoPage.jsx` (1604 linhas) |
| Aba predefinida | `const ABA_PREDEFINIDA = "visao-geral"` — `src/pages/EventoPage.jsx:81`; fallback em `:620` (`const activeAba = ABAS.some((a) => a.id === aba) ? aba : ABA_PREDEFINIDA;`) |
| Navegação entre abas | `irParaAba` → `navigate(\`/evento/${id}/${novaAba}\`, { replace: false })` — `src/pages/EventoPage.jsx:1074-1076` |
| Montagem | persistente: uma aba visitada fica montada e esconde-se com `display:none` (componente `Painel`, `className="painel-aba"`, `src/pages/EventoPage.jsx:94-103`; conjunto `visitas`/`visitadas`, `:642-654`) |

### 2.2 Lista ordenada das abas

Definidas em `const ABAS = [...]` — `src/pages/EventoPage.jsx:69-79`. Desenhadas por `Separadores` — `src/components/admin/CabecalhoEvento.jsx:229-307` (rótulo em `{aba.label}`, `:273`).

| ordem | rótulo visível | id interno | componente | tabelas/RPCs |
|---|---|---|---|---|
| 1 | "Visão geral" | `visao-geral` | `src/components/admin/VisaoGeralEvento.jsx` | RPC `submissao_fundir_respostas`; tabela `submissions` (fallback) |
| 2 | "Documentos" | `documentos` | `src/components/admin/DocumentosEvento.jsx` | `documentos`; `invites` (via `FormularioDoEvento`) |
| 3 | "Materiais" | `materiais` | `src/components/admin/FichaEvento.jsx` | `materiais`, `evento_materiais` |
| 4 | "Fotografias" | `fotografias` | `src/components/admin/FotografiasEvento.jsx` | `evento_fotografias`; bucket de storage (`BALDE = "fotografias"`, `src/lib/fotografias.js:21`) |
| 5 | "Pagamentos" | `pagamentos` | `src/components/admin/PagamentosEvento.jsx` | `pagamentos`, `pagamentos_previstos`, `submissions`; RPC `dlm_registar_sinal`; `portal_acessos` (via `AvisoSinalRecebido`) |
| 6 | "Notas" | `notas` | `src/components/admin/NotasEvento.jsx` | `notas_evento`, `documentos` |

### 2.3 Detalhe por aba

#### 1 · "Visão geral" (`visao-geral`) — `src/components/admin/VisaoGeralEvento.jsx`
O briefing no ecrã, em mosaico. As secções nascem dos *steps* do modelo do evento — quem as calcula é a página (`seccoesDoModelo(tipo)`, `src/pages/EventoPage.jsx:963-966`, de `src/lib/submissionFields`) e descem por props; duas abertas por omissão (`ABERTAS_POR_OMISSAO = 2`, `:56`) e as restantes recolhidas com linha-resumo (`resumoDaSeccao`, `:61`). Tem dois modos: **leitura** (cada campo corrige-se no lugar — `Campo`, `:168`) e **edição** (todos os campos do modelo, incluindo os por preencher, com barra fixa que guarda tudo de uma vez — botão `"Guardar alterações"`, `:636`). No topo monta a `FaixaOperacional` (`:717`, `:754`, `:859`) e mostra a paleta via `AmostraPaleta` (`:252`). Tem ainda `"Imprimir / Guardar PDF"` (`:386`).

- `FaixaOperacional` (`src/components/admin/FaixaOperacional.jsx`) é pura — resolve tudo por `getFaixaOperacional(submissao, seccoes)` (`src/lib/submissionFields`) e desenha cinco blocos: `"Montagem"` (`:97`), `"Recolha"` (`:117`), `"Responsável no dia"` (`:131`), `"Morada exacta"` (`:140`), `"Evento"` (`:151`)

Escrita (não faz leitura própria — recebe `submissao` por props; zero `.from()`/`.rpc()` no ficheiro):
- `guardarAlteracoes(...)` — `src/components/admin/VisaoGeralEvento.jsx:465` (modo edição, tudo de uma vez) e `:681` (modo leitura, um campo)
- → `src/lib/briefingEdicao.js:133` → `fundirCampos` (`:85`) → **RPC `submissao_fundir_respostas`** em `src/lib/briefingEdicao.js:93` (parâmetros `p_id`, `p_patch`, `p_colunas`)
- fallback pré-038: `.from("submissions").select("respostas")` em `src/lib/briefingEdicao.js:112` e `.from("submissions").update(...)` em `src/lib/briefingEdicao.js:120`

#### 2 · "Documentos" (`documentos`) — `src/components/admin/DocumentosEvento.jsx`
Cinco cartões-linha reordenáveis por arrasto (ordem global guardada em `localStorage`, `const CHAVE_ORDEM = "dlm.documentosEvento.ordem"`, `:55`): `ORDEM_DE_ORIGEM = ["briefing", "formulario", "orcamento", "proposta", "contrato"]` (`:48-54`). Nomes visíveis: `"Briefing"` e `"Formulário"` são títulos literais das linhas (`titulo="Briefing"`, `:615`; `titulo="Formulário"`, `:663`); os outros três saem de `TIPOS` (`:33-37`), que tem só três entradas — `orcamento: { nome: "Orçamento" }`, `proposta: { nome: "Projecto" }`, `contrato: { nome: "Contrato" }` — usadas em `titulo={cfg.nome}` (`:876`). Cada documento mostra o percurso gerar → enviar → assinar/aceitar com data (`POR_FAZER = { assinado: "assinar", aceite: "aceitar" }`, `:43`); o próximo gesto acende a dourado segundo `DOC_DA_FASE` (`:86-93`: `interessado`/`orcamento`/`sinal` → `orcamento`, `contrato` → `contrato`, `cliente`/`projecto` → `proposta`). Inclui o aviso de formulários órfãos adoptáveis (`:742`) e o *composer* `FormularioDoEvento` de ecrã inteiro (`:842-843`). A linha do Formulário conhece o caso do questionário respondido pelo Portal (`respondidoPortal`, via `submissao.questionario_entregue_em`) e nesse caso não cobra o passo «criado».

- leitura: `documentosDoEvento(submissionId)` — `src/components/admin/DocumentosEvento.jsx:494` → `.from("documentos")` em `src/lib/documentos.js:92` (selecciona `id, tipo, created_at, updated_at, enviado_em, assinado_em, trancado_em, assinado_casa_em, assinado_casa_por`)
- escrita: `marcarPassoDocumento(...)` — `:568` → `.from("documentos").update(...)` em `src/lib/documentos.js:125` (colunas `enviado_em` / `assinado_em`; passos travados quando `doc.trancado_em`)
- criação do formulário: `createInvite({...})` — `src/components/admin/FormularioDoEvento.jsx:276` → `.from("invites").select("id")` em `src/lib/invites.js:37` e `.from("invites").insert([...])` em `src/lib/invites.js:45`
- `estadoFormularioDoEvento` (`:554`) e `podeSerAdoptadoPor` (`:548`) são puros — `src/lib/invites.js:149` e `:253`
- adopção de órfão: `apontarConviteAoEvento(orfao.id, id)` — chamada na página, `src/pages/EventoPage.jsx:1383` → `.from("invites").update({ submission_alvo_id })` com guarda `.is("submission_id", null)` em `src/lib/invites.js:187`
- o componente não tem nenhum `.from()`/`.rpc()` próprio

#### 3 · "Materiais" (`materiais`) — `src/components/admin/FichaEvento.jsx`
A ficha de materiais do evento. Montado com `submissions={[submissao]}` e `submissionIdFixo={id}` (`src/pages/EventoPage.jsx:1419-1424`), pelo que o selector de evento não aparece (`!submissionIdFixo`, `:106`). Barra *sticky* com o título, `"Ainda sem materiais"` (`:516`) / `` `${totalNaFicha} ${totalNaFicha === 1 ? "material" : "materiais"}` `` (`:517`), indicador de gravação, botão `"🖨 Imprimir"` (`:547`; `onClick={() => imprimirFicha(linhas, submissao)}`, `:531`, `title="Imprimir ou guardar como PDF"`) e `"+ Adicionar"` (`:567`, painel `AdicionarMateriais`, `:920`, título `"Adicionar Materiais"`, `:1012`). Cada linha edita-se na célula, com cores por `SeletorPaleta` (`:847`) e campo de notas (`placeholder="Notas para a equipa..."`, `:862`).

- `getMateriais()` — `:385` → `.from("materiais")` em `src/lib/materiais.js:63`
- `getEventoMateriais(submissionId)` — `:386` → `.from("evento_materiais")` em `src/lib/materiais.js:185`
- `addEventoMaterial(...)` — `:428` → `.from("evento_materiais")` em `src/lib/materiais.js:222`
- `removeEventoMaterial(...)` — `:447` → `.from("evento_materiais")` em `src/lib/materiais.js:265`
- `updateEventoMaterial(...)` — `:464` → `.from("evento_materiais")` em `src/lib/materiais.js:253`
- contagem da etiqueta: `onContagem?.(totalNaFicha)` — `:474-476`
- o componente não tem nenhum `.from()`/`.rpc()` próprio

#### 4 · "Fotografias" (`fotografias`) — `src/components/admin/FotografiasEvento.jsx`
As fotografias do dia, carregadas do telemóvel: comprime em **duas** medidas antes de enviar (`url_pequena` + `url_grande`, `src/lib/fotografias.js:61-88`), grelha reordenável por arrasto (a primeira é a capa), assunto editável, momento (`MOMENTOS`, `:50-53`: `montagem` → `"Montagem"`, `evento` → `"Do evento"`) e estado de publicação (`PUBLICAVEL`, `:62-66`: `por_rever` → `"Por rever"`, `sem_convidados` → `"Sem convidados"`, `com_convidados` → `"Com convidados"`). Tudo o que se carrega é para a cliente ver — não há interruptor de visibilidade por fotografia (decisão escrita no cabeçalho do ficheiro, `:22-25`); o tri-estado `publicavel` é a decisão sobre convidados reconhecíveis, não um mostrar/esconder.

- `getFotografias(eventoId)` — `:88` → `.from("evento_fotografias")` em `src/lib/fotografias.js:93`
- `carregarFotografia(...)` — `:122` → storage `.from(BALDE).upload(...)` em `src/lib/fotografias.js:52` + `.from("evento_fotografias").insert(...)` em `src/lib/fotografias.js:74`
- `reordenarFotografias(...)` — `:144` → `.from("evento_fotografias").update({ ordem: i })` em `src/lib/fotografias.js:160`
- `mudarFotografia(...)` — `:155` (momento) e `:342` (assunto) → `.from("evento_fotografias").update(campos)` em `src/lib/fotografias.js:145`
- `marcarEstadoDaFoto(...)` — `:166` → `.from("evento_fotografias").update({ publicavel: estado })` em `src/lib/avaliacao.js:97-98` (valores válidos em `ESTADOS_FOTO`, `src/lib/avaliacao.js:92`)
- `apagarFotografia(foto)` — `:177` → `.from("evento_fotografias").delete()` em `src/lib/fotografias.js:110` + storage `.from(BALDE).remove(...)` em `src/lib/fotografias.js:135`
- a contagem da etiqueta também é lida pela página antes da visita: `.from("evento_fotografias").select("id", { count: "exact", head: true })` — `src/pages/EventoPage.jsx:718-721`

#### 5 · "Pagamentos" (`pagamentos`) — `src/components/admin/PagamentosEvento.jsx`
Total acordado, o que já entrou, o que falta, e o plano (sinal + remanescente) linha a linha. Cada parcela mostra `"✓ Recebido"` (`:471`) quando está completa, ou o botão `"Registar pagamento"` (`:486`) / `` `Registar restante (${formatarEuros(falta)})` `` (`:483-484`) quando falta. **O plano desce por props** — quem o lê é a `EventoPage` (`getPagamentosEvento`), o separador não repete a query. Regista/apaga pagamentos, gera o plano previsto, sugere o avanço de fase depois do sinal e sincroniza `pagamento_final`. Não tem nenhum `.from()`/`.rpc()` próprio.

- plano (na página): `getPagamentosEvento(id)` — `src/pages/EventoPage.jsx:713` e `:897` → `.from("pagamentos_previstos")` em `src/lib/pagamentos.js:188` e `.from("pagamentos")` em `src/lib/pagamentos.js:193`
- `gerarPrevistos(...)` — `src/components/admin/PagamentosEvento.jsx:726` → `.from("pagamentos_previstos")` em `src/lib/pagamentos.js:35` (guarda de duplicação) e `:49` (insert das duas parcelas)
- `registarPagamento(...)` — `:923` → `.from("pagamentos").insert(...)` em `src/lib/pagamentos.js:217`
- `apagarPagamento(...)` — `:1008` → `.from("pagamentos").delete()` em `src/lib/pagamentos.js:239`
- `registarSinalComGuarda({...})` — `:872` e `:946` → **RPC `dlm_registar_sinal`** em `src/lib/disputaDia.js:272-273` (parâmetros `p_submission`, `p_valor`, `p_data`, `p_metodo`, `p_contribuinte`, `p_notas`, `p_forcar`)
- `updateFase(submissao.id, "contrato")` — `:813` e `:851` → `.from("submissions").update(update)` em `src/lib/clientes.js:491` (o `update` é `{ fase }`, mais `status` quando `opcoes.status`; valida contra `FASES_VALIDAS`)
- `marcarPagamentoFinal(...)` — `:786` → `.from("submissions").update({ pagamento_final: !!pago })` em `src/lib/clientes.js:392`
- `AvisoSinalRecebido` (`:1062`) → `getAcessoDoEvento(eventoId)` (`src/components/admin/AvisoSinalRecebido.jsx:33`) → `.from("portal_acessos")` em `src/lib/portal.js:127`
- **Secções escondidas por interruptor** (não são abas): `ContribuicaoColetiva` só monta se `CONTRIBUICAO_COLETIVA_ATIVA` (`:1208-1219`), e `export const CONTRIBUICAO_COLETIVA_ATIVA = false;` — `src/lib/funcionalidades.js:44`, logo hoje **nunca aparece** (usaria `campanhas`, `campanha_intencoes`, `pagamentos` e as RPCs `campanha_publica` `src/lib/campanhas.js:131`, `prometer_contribuicao` `:147`, `contribuicao_registar` `:237`/`:277`). O bloco «Gastos do evento» está atrás de `const MOSTRAR_GASTOS_DO_EVENTO = false;` — `src/components/admin/PagamentosEvento.jsx:61` (uso em `:1223`). O dinheiro das contribuições continua a contar na aritmética; só desapareceu o ecrã.

#### 6 · "Notas" (`notas`) — `src/components/admin/NotasEvento.jsx`
O histórico de interação por ordem inversa, numa coluna: cartões do que ela escreveu, linhas finas com bolinha para o que o sistema registou sozinho (`construirHistorico`). Filtros: `"Tudo"`, `"Chamadas"`, `"Mensagens"`, `"Alterações"`, `"Notas internas"`, `"Só o percurso"` (`FILTROS`, `:28-35`; ids `tudo`, `chamada`, `mensagem`, `alteracao`, `interna`, `percurso`). Tipos de nota escritos: `"Chamada"`, `"Mensagem"`, `"Alteração"`, `"Nota interna"` (`TIPOS_NOTA`, `src/lib/notas.js:22-51`; ids `chamada`, `mensagem`, `alteracao`, `interna` — espelham a CHECK da migração 029). Não tem nenhum `.from()`/`.rpc()` próprio.

- `getNotas(submissionId)` — `:329` → `.from("notas_evento")` em `src/lib/notas.js:61`
- `getDocumentosDoEvento(submissionId)` — `:330` → `.from("documentos").select("id, tipo, created_at, updated_at")` em `src/lib/notas.js:103`
- `criarNota(...)` — `:384` → `.from("notas_evento").insert(...)` em `src/lib/notas.js:74`
- `apagarNota(...)` — `:398` → `.from("notas_evento").delete()` em `src/lib/notas.js:91`
- `construirHistorico` / `contarHistorico` (`:360`, `:371`) são puros — recebem `pagamentos`, `previstos`, `invites` já carregados pela página (`src/lib/notas.js:125` e `:226`)

### 2.4 Abas condicionais

**Não existe** aba condicional: o array `ABAS` (`src/pages/EventoPage.jsx:69-79`) é fixo, `abasComAviso` é um `ABAS.map(...)` sem filtro (`:976-986`) e `Separadores` desenha os seis rótulos sempre. O que varia é apenas a **montagem** do painel (só as abas já visitadas ficam montadas — `visitadas.has("…")`, `src/pages/EventoPage.jsx:1335`, `:1359`, `:1368`, `:1417`, `:1428`, `:1456`) e as **etiquetas** de cada separador: contagem só quando `> 0` (`contagens[a.id] > 0 ? contagens[a.id] : undefined`, `:983`) e ponto dourado de "por guardar" só na Visão geral (`a.id === "visao-geral" && porGuardar > 0`, `:980-981`); o desenho está em `src/components/admin/CabecalhoEvento.jsx:274-286` (contagem) e `:287-300` (ponto dourado, com `title` `` `${aba.porGuardar} alteração/alterações por guardar` ``).

Condicionais que **existem** noutros elementos da página (não em abas):
- Botão `"Acompanhamento"` / `"Acompanhar"` (`src/components/admin/CabecalhoEvento.jsx:405`) — ausenta-se quando `portalIndisponivel`, isto é `submissao?.fase === "perdido" || (dataPassou && !negocioFechou)`, com `dataPassou = submissao.data_evento < hojeISO` e `negocioFechou = FASES_POS_SINAL.includes(submissao?.fase)` — `src/pages/EventoPage.jsx:1054-1061` e `:1300` (`portalIndisponivel ? undefined : () => setPortalAberto(true)`)
- Botão `"WhatsApp"` — só se houver número (`numeroWhatsapp` = `getValorAtual(submissao, "numeroWhatsapp") || getValorAtual(submissao, "contactoPrincipal")`, `src/pages/EventoPage.jsx:1048-1052`; `onWhatsApp` em `:1277-1281`)
- Selo `"dia disputado"` no cabeçalho — `diaDisputado || diaTomadoPorRival` (`src/pages/EventoPage.jsx:1069-1070`, passado em `:1262`)
- Banner da disputa do dia (`BannerDisputaDia`, definido no próprio `src/pages/EventoPage.jsx:198`, montado acima dos painéis e fora deles) — mesma condição, `src/pages/EventoPage.jsx:1311-1334`. Só se consulta quando o evento compete: `!!dataEvento && dataEvento >= hojeISO && submissao?.fase !== "perdido"` (`:792-794`), com a resposta guardada por chave `${id}|${dataEvento}` (`:795`, `:811-812`)

### 2.5 Cabeçalho do evento (sempre visível acima das abas)

Componente: `src/components/admin/CabecalhoEvento.jsx` (708 linhas), montado em `src/pages/EventoPage.jsx:1258-1305`. Duas peças:

**A · Parte que se despede** (nunca *sticky*, `:470-472`):
- Breadcrumb `"← Clientes"` / `"/"` / `"Evento"` — `:491-505`
- Título grande `resumoEvento.titulo` (Playfair Display 28px, `textWrap: "balance"`) — `:507-521` (valor em `:520`)
- Meta separada por `·`: data por extenso (`formatarDataLonga`, `:43`), `nomeTipo`, `resumoEvento.local`, `` `${submissao.numero_convidados} convidados` `` — `:350-357`
- Pastilha da contagem: `"é hoje"` / `"é amanhã"` / `"faltam N dias"` (só até 60) / `"já passou"` (`contagem`, `:55-66`); cala-se quando `submissao.status === "Concluído"` (`quantoFalta`, `:362-363`)
- Pastilha âmbar `"dia disputado"` (`pastilhaDisputa`, `:87-92`) com `title` `TITULO_SELO_DISPUTA` = `"Há outro pedido vivo para esta data — o aviso completo está abaixo do cabeçalho"` (`:96-97`); uso em `:548-552`
- `LinhaDinheiro`: `"Total"` · `"Recebido"` · `"Falta"`, ou `"valor por acordar"` quando total e pago são 0 — `:124-227` (montada em `:568`; os números animam com `useContagemAnimada`)
- Botões (`const acoes = (compacto) => (...)`, `:373-466`): `"Imprimir / Guardar PDF"`, `"WhatsApp"`, `"Acompanhamento"`, e o de edição em três estados — `"Editar briefing"` (`:455`) / `"Concluir edição"` (`:462`) / `"Voltar ao briefing"` (`:459`)
- `Jornada` completa (`src/components/admin/Jornada.jsx`) — `:574-587`; é **pura** (sem `.from()`/`.rpc()`; props `submissao`, `invites`, `previstos`, `pagamentos`, `documentos`, mais os retornos `onEtapa`, `onProximoGesto`, `onStatusChange`, `onRecuperar`), etapas construídas por `construirEtapas`/`construirEvidencia` de `src/components/admin/jornadaEtapas.js` (`interessado`, `orcamento`, `sinal`, `contrato`, `projecto`, `preparacao`, `grandeDia`)

**B · Moldura permanente** (`position: "sticky"`, altura constante `ALTURA_LINHA_COMPACTA = 42`, `:41`; bloco `:604-705`): linha compacta com título (Playfair 17px, com ellipsis), `quantoFalta` (`:649-659`), selo de disputa (`:663-670`), `Jornada compacta` (`:673-680`), `"Falta …"` (`LinhaDinheiro compacta`, `:691`) e botões curtos (`"Imprimir"`, `"WhatsApp"`, `"Acompanhar"`, `"Concluir"`/`"Voltar"`); por baixo, os `Separadores` (`:703`). O estado "pregada" vem de um sentinela de 1px + `IntersectionObserver` (`:337-348`), nunca de limiares de scroll.

**De onde lê** (todas as leituras são feitas pela `EventoPage` e descem por props — `CabecalhoEvento.jsx` não tem nenhum `.from()`/`.rpc()`):

| dado do cabeçalho | origem | ficheiro:linha da chamada |
|---|---|---|
| `submissao` (título, meta, fase, status, `data_evento`, `dia_guardado_ate`) | tabela `submissions` + `clientes` (`select("*, clientes(*)")`) | `src/pages/EventoPage.jsx:706` (`getEventoCompleto`) → `src/lib/clientes.js:70` |
| `eventTypes` (nome do tipo, secções do modelo) | tabela `event_types` | `src/pages/EventoPage.jsx:707` (`getEventTypes`) → `src/lib/invites.js:67` |
| `invites` (passo Formulário da Jornada) | tabela `invites` | `src/pages/EventoPage.jsx:708-712` (`.from("invites").select("*").or(\`submission_id.eq.${id},submission_alvo_id.eq.${id}\`).throwOnError()`) |
| `previstos` + `pagamentos` (três números, Jornada) | tabelas `pagamentos_previstos`, `pagamentos` | `src/pages/EventoPage.jsx:713` e `:897` → `src/lib/pagamentos.js:188`, `:193` |
| `documentos` (evidência da assinatura na Jornada) | tabela `documentos` | `src/pages/EventoPage.jsx:915` → `src/lib/documentos.js:92` |
| selo `"dia disputado"` + banner | tabelas `submissions`, `pagamentos`, `portal_sinal_confirmacoes`, `reservas` | `src/pages/EventoPage.jsx:798` (`irmaosDoDia`) → `src/lib/disputaDia.js:83`, `:98`, `:106`, `:111` |
| frescura em directo | canal realtime `evento-${id}`, UPDATE em `submissions` | `src/pages/EventoPage.jsx:832-864`; releitura `.from("submissions").select("*")` em `:879-883` |
| mudança de estado pela Jornada (`onStatusChange` → `aoMudarEstado`) | `submissions` (update de `status`, com guarda `.in("fase", FASES_POS_SINAL)` quando o estado é pós-sinal) | `src/pages/EventoPage.jsx:1139` (`updateStatus`) → `src/lib/clientes.js:535-541` |
| prazo do dia (`BannerDisputaDia`) | `submissions` (update de `dia_guardado_ate`) | `src/pages/EventoPage.jsx:250` (`guardarPrazoDia`) → `src/lib/disputaDia.js:222` |

Também **sempre montados** fora das abas (não fazem parte do cabeçalho, mas vivem na página): `SidebarNav` (`:1233`), a folha `PortalDoClienteSheet` (`:1566`), `PainelNotificacoes` (`:1578`) e `ToastNotificacao` (`:1596`) — estes dois alimentados por `useNotificacoes()` (`:931`), que lê a tabela `notificacoes` em `src/lib/notificacoes.js:50`, `:69`, `:81`, `:102`.

A `PortalDoClienteSheet` lê/escreve, por `src/lib/portal.js`: `portal_acessos` (`:127`), `portal_publicacoes` (`:177`), `portal_verificacoes` (`:189`), `notificacoes` (`:315`), `questionario_pedidos` (`:357` e `:373`), storage `contratos-assinados` (`:328`); RPCs `dlm_portal_abrir` (`:139`), `dlm_portal_revogar` (`:148`), `dlm_portal_publicar` (`:162`), `dlm_portal_emitir_codigo` (`:202`), `dlm_portal_confirmar_papel` (`:341`). Tem ainda duas queries próprias — `.from("portal_condicoes_lidas").select("criado_em, portal_publicacoes!inner(submission_id)")` (`src/components/admin/PortalDoClienteSheet.jsx:120`) e `.from("submissions").select("sinal_pagamento, dia_guardado_ate")` (`:162`) — e puxa ainda `documentosDoEvento`/`obterDocumento` (`documentos`), `comunicadosDoEvento` (`.from("comunicado_destinatarios")` com join a `comunicados`, `src/lib/comunicados.js:718-719`), `confirmacaoViva`/`limparConfirmacaoSinal` (`portal_sinal_confirmacoes`, `src/lib/disputaDia.js:176`, `:198`), `guardarConfigSinal`/`guardarPrazoDia` (`submissions`, `:244`, `:222`) e `guardarAlteracoes` (`src/lib/briefingEdicao.js:133`).

Leituras adicionais da página que não pertencem a nenhuma aba em particular: `getFormulariosOrfaos()` — `src/pages/EventoPage.jsx:753` → `.from("invites")` em `src/lib/invites.js:261`; e `getReservaProvisoriaDoEvento(id)` — `src/pages/EventoPage.jsx:756` → `.from("reservas")` em `src/lib/reservas.js:278`.

---

## 3. GLOSSÁRIO

**Ficheiro:** `docs/glossario.md` (35.411 bytes, 614 linhas — 613 quebras de linha, a última linha não termina em `\n`; última alteração 10/08/2026). Título: «Glossário — a linguagem da casa». Não existe `GLOSSARIO.md` na raiz nem outro ficheiro de glossário no repositório (`find . -iname "*glossar*"` fora de `node_modules` devolve só este).

### 3.1 · Conteúdo integral

> **Nota de reprodução:** todos os termos e todas as regras estão abaixo. Abreviei apenas o *desenvolvimento retórico* de cinco justificações longas (Contactos, Pedido/orçamento, Questionário/briefing, Vitrina, Modelo de comunicado) — a definição operativa de cada uma está integral. Nada foi omitido do «quadro dos nomes», das «palavras a abandonar», das «incoerências» nem das «pendências».

**Preâmbulo (l. 3-9).** O ficheiro é a fonte única de verdade para três sítios: o que quem chega lê, o que a casa diz entre si, e o que está no código. **Regra de ouro (l. 7):** «*os nomes que as pessoas leem podem mudar; os nomes que a máquina usa ficam quietos*» — a mesma lógica do `slug ↔ id`. Quando um nome muda, muda-se aqui primeiro.

**O princípio (l. 15-21).** Uma palavra só deve fazer **um trabalho**. «Cliente» fazia dois (toda a gente na base / quem fechou); «orçamento» arriscava fazer dois (o que se pede / o que se entrega).

**A simetria da casa (l. 30-36).**

| Momento | A pessoa envia (formulário) | A Nádia produz (documento) |
|---|---|---|
| No início (ainda a decidir) | **pedido** | **orçamento** |
| Depois de fechar (evento confirmado) | **questionário** | **briefing** |

**Os três níveis do formulário (l. 45-83).**

| Nível | O que é | Quem lhe mexe | Nome |
|---|---|---|---|
| 1 · o molde | A estrutura de um tipo de evento: passos e campos. «Casamento = 5 passos, 44 campos.» | Nádia (raramente) | **modelo de evento** |
| 2 · a instância | Um formulário concreto para um evento, feito a partir do molde. | Nádia (por evento) | **formulário** |
| 3 · a cara pública | O mesmo formulário, do lado de quem o preenche. | Organizador | **questionário** |

«Molde» é a *metáfora*, não o nome — o separador chama-se «Modelos de Evento» (l. 51-55). Níveis 2 e 3 são o mesmo objecto visto de dois lados. **Regra de desempate (l. 71):** «*A palavra segue de quem é a acção que a frase descreve — não de quem está a ler o ecrã.*» **Corolário (l. 79-80):** duas palavras diferentes para o mesmo objecto na **mesma frase** lê-se sempre como erro.

**Quem preenche: o organizador (l. 87-105).** Nome neutro quanto a pessoa/empresa, que descreve a **função**. **A abandonar:** «casal», «família», «noivos» como nome genérico de quem preenche (podem aparecer *dentro* de um evento concreto). «Organizador» ≠ **«responsável no dia»** (a pessoa de contacto na montagem).

**Pedido vs questionário (l. 114-133).**

| | O pedido | O questionário |
|---|---|---|
| O que é | o **material de entrada** | a **peça de trabalho** que a Nádia acompanha |
| Campos | fixos, sempre os mesmos | dependem do modelo de evento |
| Chega | uma vez, no início | criado e acompanhado ao longo do processo |
| Onde vive | numa aba própria do evento — **«O pedido»** | listado em «Formulários», com estado |

O pedido **nunca aparece** na lista de «Formulários».

**A ponte pedido→formulário (l. 137-169).** O glossário descreve-a como «*Direcção de arquitectura a implementar*» (l. 139): campos com correspondência nascem pré-preenchidos; sem correspondência ficam vazios; o que não cabe vive na aba «O pedido». **Consequência (l. 168-169):** o ecrã de criação de formulário com o bloco «dados da captação» e os botões «Copiar» **deixa de fazer sentido**.

> **O texto do glossário está desactualizado neste ponto.** A ponte **já existe em código**: `src/lib/pontePedido.js` (`pontePedidoFormulario`, l. 92; `CHAVES_DO_PEDIDO` l. 35-50; `ROTULO_NOTAS = "Notas da conversa"` l. 53), consumida por `src/components/admin/FormularioDoEvento.jsx:14,16,113,130,139,182`. O cabeçalho desse ficheiro (l. 19-26) diz-lho literalmente: «*Substitui o painel inline que nascia debaixo da linha «Formulário» — e com ele o bloco de botões «Copiar» […] o que não tem campo fica no cartão «O PEDIDO», à vista, sem uma única cópia à mão.*» A decisão está registada em `docs/decisoes-de-produto.md:880-887` («A palavra «captação» não aparece no ecrã novo»; «Âmbito: a ficha do evento. O painel antigo continua no separador Formulários»).

**Onde se cria um formulário (l. 173-213).** «*O que não tem evento vive em "Formulários". O que tem evento vive no evento.*» Formulário de evento existente → dentro do evento (aba Documentos). Cliente novo → «Formulários». Órfãos → «Formulários». Supervisão → «Formulários». Implementado a 30/07/2026. A página tem três secções: **Sem evento associado** · N (órfãos) → **Sem formulário** · N (lacunas pós-sinal) → a lista. Critério das lacunas: `FASES_POS_SINAL`. As linhas «sem formulário» não levam botão de criar.

> No código a segunda secção diz exactamente «Sem formulário · N» (`src/components/admin/LacunasFormulario.jsx:54`); a primeira **não** usa a fórmula do glossário — `src/components/admin/FormulariosOrfaos.jsx:60-63` rende «⚠ 1 formulário sem evento associado» / «⚠ N formulários sem evento associado».

**O quadro dos nomes (l. 219-249) — reproduzido integralmente:**

| Conceito | Quem chega lê | Nós dizemos | No código |
|---|---|---|---|
| A base de pessoas | — | **contactos** | `clientes` (fica) |
| O separador dessa base | — | **Contactos** | slug: `/admin/contactos` |
| Formulário curto, de entrada | **pedido de orçamento** | **pedido** | `captacao` (fica) |
| Documento com valores que a Nádia devolve | **orçamento** | **orçamento** | `orcamento` (fica) |
| O molde de um tipo de evento | — | **modelo de evento** | `tiposEvento` (fica) |
| O separador dos moldes | — | **Modelos de Evento** | — |
| A instância que a Nádia monta | — | **formulário** | — |
| O separador onde ela os gere | — | **Formulários** | — |
| A mesma coisa, do lado de quem preenche | **questionário do evento** | **questionário** | — |
| Quem trata do evento (preenche) | — | **organizador** | — |
| A pessoa de contacto na montagem | — | **responsável no dia** | — |
| A folha de trabalho que sai do questionário | — | **briefing** | `briefing` (fica) |
| A casa do material de entrada, no evento | — | aba **«O pedido»** | — |
| Fase — mostrou interesse | — | **Interessado** | `interessado` |
| Fase — recebeu orçamento, a decidir | — | **Orçamento** | `orcamento` |
| Fase — fechou, evento confirmado | — | **Cliente** | `cliente` |
| A pipeline de fases | — | **funil** | `funil` |
| Uma ocorrência a decorar | **o vosso evento** | **evento** | `submissions` (fica) |
| A classe das superfícies públicas | — | **vitrina** | — |
| O que a casa diz a muitos de uma vez | **comunicado** | **comunicado** | `comunicados` |
| A página do comunicado, com endereço próprio | **a folha** | **folha** | `/comunicado/:token` |
| Tirar uma folha pública do ar | — | **retirar** | `retirado_em` |
| O separador da família (todos os envios da casa) | — | **Envios** | `comunicados` (id do separador, fica) |
| O temperamento da folha (sóbrio ou convidativo) | — | **aspecto** | `comunicados.registo` (`aviso`/`oferta` ficam) |
| A regra que diz quem recebe | — | **quem recebe** | `comunicados.publico` |
| Fixar os nomes de quem recebe | — | **fechar a lista** | `congelado_em` |
| Fazer o comunicado chegar à lista | — | **enviar** (o ecrã «Enviar») | `comunicado_destinatarios` |
| O que se guarda de um comunicado para voltar a usar | — | **modelo de comunicado** | `comunicado_modelos` |
| Decidir que quem entrou depois não recebe | — | **dispensar** | `dispensado_em` |

L. 251-252: «*Repara na última coluna: quase tudo **fica como está**. O trabalho de renomear é sobretudo nos rótulos que se leem — menu, slug, e algumas frases nas páginas. Baixo risco no código.*»

**Cada nome, e porquê (l. 256-481) — definições operativas:**

- **Contactos** (l. 258-263): a base guarda toda a gente; chamar-lhe «Clientes» era mentir. É a mudança-mãe, a que liberta a palavra «cliente». *(justificação abreviada)*
- **Cliente** (l. 265-268): a fase, não a base — um contacto que **fechou negócio**.
- **Pedido / orçamento** (l. 270-286): **pedido** é o input, o gesto de quem chega; **orçamento** é o output, o documento com valores. Público: «pedido de orçamento». Interno: «pedido». *(justificação abreviada)*
- **As duas portas do pedido** (l. 288-296): a Nádia pede à pessoa que preencha / um desconhecido pede por iniciativa própria. **Um nome só**.
- **Questionário / briefing** (l. 298-307): o par de atelier — questionário (as perguntas) → briefing (a folha imprimível com que se trabalha no dia). *(justificação abreviada)*
- **Funil** (l. 309-311): Interessado → Orçamento → Cliente.
- **As sete etapas do acompanhamento** (l. 313-339):

| Chave (`etapa`) | O que a cliente lê |
|---|---|
| `interessada` | **O seu pedido** |
| `orcamento` | **O orçamento** |
| `sinal` | **A data reservada** |
| `projecto` | **O projecto** |
| `contrato` | **O contrato** |
| `preparacao` | **A preparação** |
| `grande_dia` | **O grande dia** |

  A chave `interessada` está no feminino e a `submissions.fase` diz `interessado` — **não se corrigiu porque é chave de máquina** (l. 331-336). Os rótulos vivem em `src/lib/portal.js` (`ROTULO_ETAPA`, l. 35-43). «*Este ficheiro manda; o `portal.js` segue.*» **Nota de ordem:** a tabela do glossário põe `projecto` antes de `contrato` (l. 326-327), mas `ROTULO_ETAPA` põe `contrato` (l. 39) antes de `projecto` (l. 40) — e é o `portal.js` que está de acordo com a ordem canónica do funil fixada pela migração 077 (`src/components/admin/jornadaEtapas.js:29-36`, `FASE_ORDEM_JORNADA = ["interessado","orcamento","sinal","contrato","cliente","projecto"]`). Aqui é o glossário que está errado, não o código.
- **A pauta** (l. 343-352): o traço dourado por baixo de uma resposta. «*Com pauta, muda-se ali; sem pauta, passa por nós.*» Sem cadeados, sem cinzento-desactivado.
- **Grupo de prazo** (l. 354-371): `compras` → «Compras e stock», 14 dias antes; `producao` → «Produção», 7 dias; `palavras` → «Palavras», 2 dias. Rótulos, dias e porquê vivem na tabela `questionario_grupos`, não no código. Um passo sem grupo nunca fecha.
- **A capa e o momento** (l. 375-397): **capa** = a primeira fotografia, escolhida por **ordenação** (não há botão «tornar capa»); **momento** = `montagem` ou `evento`. «*Sem fotografias, não há secção.*»
- **Vitrina** (l. 401-416): a classe das superfícies públicas. Substituiu «montra» a 30/07/2026 (alcance lusófono). **Excepção assumida:** o comentário em `MateriaisInventario.jsx` que usa «montra» para uma vista de materiais **ficou de propósito**. *(justificação abreviada)*
- **Comunicado / folha / retirar** (l. 417-432): **comunicado** = o que a casa diz a muitos de uma vez; **folha** = a página com endereço próprio, pública, feita para ser **reencaminhada** (sem um único dado pessoal, fora do portal); leituras contam-se **no total**, nunca por pessoa. **Retirar** ≠ **revogar** (que é fechar um acesso pessoal). Retirar é reversível e devolve o **mesmo** endereço.
- **Aspecto / fechar a lista / enviar** (l. 434-457): **aspecto** = Sóbrio / Convidativo (na base ficam `aviso`/`oferta`); **fechar a lista** = fixar instantâneos, não referências («congelar» era jargão de sistema); **enviar** = o acto, «Envios» = a família. «Enviado» quer dizer que a conversa se abriu. **Cliente** = pós-sinal (`FASES_POS_SINAL`: contrato · cliente · projecto); **interessado** = evento vivo antes disso.
- **Modelo de comunicado / dispensar** (l. 459-481): guarda **a folha, a mensagem e a regra de quem recebe** — nunca nomes, endereço ou leituras. Diz-se sempre **qualificado** (há três famílias de «modelo»: de evento, de comunicado, de mensagem). Modelo de evento = **ligação viva** («Alterações aplicam-se já aos formulários por responder.»); modelo de comunicado = **cópia** («Alterações só valem para envios novos.»). **Nome** é de dentro, **título** é o que se lê. Apagar um modelo não leva os comunicados atrás. Um bloco do modelo pode estar marcado como **a rever** (`rever` + `pergunta`, decididos ao guardar). **Dispensar** = decidir que alguém que entrou depois de a lista fechar não recebe (`dispensado_em`, com instantâneo do nome; «Desfazer» limpa a coluna); não confundir com o «Agora não» do convite ao modelo. *(justificação abreviada)*

**Palavras a abandonar (l. 485-521) — três tabelas, integrais:**

| Não dizer | Dizer |
|---|---|
| captação, capturar, lead | **pedido** (o gesto), **contacto** (a pessoa) |
| onboarding | **questionário** |
| «formulário de interesse» | **pedido de orçamento** |
| «formulário» (para quem preenche) | **questionário** (o longo) ou **pedido** (o curto) |

Renomeados de 09/08/2026 — «*ficam só nos nomes de máquina, que não vale o risco de mexer*» (l. 498-499):

| Não dizer | Dizer |
|---|---|
| molde | **modelo de folha** |
| congelar (a lista) | **fechar a lista** |
| expedição | **enviar** (o gesto) · **Envios** (a família, o separador) |
| registo (da folha) | **aspecto** (Sóbrio / Convidativo) |
| público (a audiência) | **quem recebe** |
| Feitos (o sub-separador) | **Envios** (a lista) · **Modelos** (os modelos de folha) |

Renomeado de 10/08/2026:

| Não dizer | Dizer |
|---|---|
| comunicado (a coisa, no backoffice) | **folha** — «a folha», «Nova folha», «modelo de folha»; os géneros (comunicado, oferta, campanha) dizem-se UMA vez, na definição do estado vazio |

L. 517-521: «comunicado» **fica** na overline da folha pública (ComunicadoPage e o seu espelho na pré-visualização) e nos nomes de máquina (`comunicados`, `/comunicado/:token`, RPCs) — «*mudar a rota partia os endereços já entregues*».

**Incoerências a corrigir (l. 525-539):** 1) mensagem de WhatsApp diz «formulário», a página diz «questionário»; 2) página-guia (dlm-jornada) diz «formulário de interesse»; 3) separador «Clientes» → «Contactos»; 4) o bloco «DADOS DA CAPTAÇÃO (9)» com botões «Copiar» — **não é renomear; é remover**.

> **Estado real destas quatro:** **#1 já está resolvida** — a mensagem de partilha (`src/pages/AdminPage.jsx:716`) diz «*O vosso questionário \*Do Luxo à Mesa\* está pronto.*»; a expressão «vosso formulário» **não existe** em `src/`. **#2 não é verificável aqui** — a página-guia `dlm-jornada` **não existe neste repositório** (é outro repo). **#3 está feita no separador principal** (`Navegacao.jsx:19`) mas não no irmão «Importar clientes» (`Navegacao.jsx:34`). **#4 continua aberta** em `PainelNovoFormulario.jsx:94,140`, embora a ponte que a devia matar já exista na ficha do evento.

**O que muda por camadas (l. 543-558):** só nomes (leve) · arquitectura de navegação (✅ 30/07/2026) · arquitectura de dados (aba «O pedido» + ponte pedido→formulário — projeto próprio). *(A metade «ponte» desta terceira camada já está feita; a aba «O pedido» não.)*

**Pendências do inventário de 29/07/2026 (l. 562-603):** 1) duas fontes de verdade para os rótulos de fase (`FASE_LABEL_PRE_SINAL` em `clientes.js` vs `faseConfig.js`) — o `faseConfig.js` ganha; 2) «Interessada» no feminino; 3) vocabulário que a **base de dados** escreve (gatilho da migração 024, `notas.js`) — mudá-los é migração, não string; 4) slugs públicos já circulados `/formulario` e `/interesse` — **o slug antigo nunca morre**; o token `{LINK_INTERESSE}` aceita-se nos dois.

**Como manter isto vivo (l. 607-614):** o ficheiro muda primeiro; validar com a Nádia; só depois o código aplica, bloco a bloco.

### 3.2 · O que o glossário admite que fique antigo (as três camadas)

O glossário distingue explicitamente as três camadas e **autoriza o atraso só na camada (c)**:

| Camada | Regra do glossário | Onde está escrita |
|---|---|---|
| (a) **Copy visível** | muda primeiro; é onde o trabalho está | l. 7, 251-252 |
| (b) **Identificadores de código** (variáveis, componentes, props, nomes de ficheiro) | «*Ficam só onde ninguém as lê (nomes de ficheiro no código, que não vale o risco de mexer)*» | l. 488-489, 498-499 |
| (c) **Nomes de máquina** (tabelas, colunas, RPCs, rotas) | «*os nomes que a máquina usa ficam quietos*»; `aviso`/`oferta` quietos na BD; `interessada` no feminino fica; a rota `/comunicado/:token` fica | l. 7, 331-336, 439, 517-521 |

### 3.3 · Verificação termo a termo contra o código

Legenda da última coluna: **[a]** copy visível · **[b]** identificador de código · **[c]** nome de máquina.

| Termo (o nome certo) | Nome antigo/proibido | Usado no código? | Onde ainda aparece o antigo (ficheiro:linha) | Camada |
|---|---|---|---|---|
| **contactos** (a base) | clientes | Sim — `Navegacao.jsx:19` `label: "Contactos"`; `rotasAdmin.js:30` `clientes: "contactos"` | `ClientesLista.jsx:358` "Nenhum cliente encontrado."; `:176` "Não foi possível carregar os clientes."; `:454` `title="Ficha da cliente"`; `reservas.js:92` "abre-o em Clientes/Funil"; `Navegacao.jsx:34` `label: "Importar clientes"`; `ImportarTab.jsx:552` | [a] antigo persiste |
| **Contactos** (separador) | Clientes | Sim — slug `/admin/contactos` (`rotasAdmin.js:30`), com redirecção do antigo (`rotasAdmin.js:76-77` `SLUG_ANTIGO`) | id do separador continua `clientes` (`Navegacao.jsx:19`, `rotasAdmin.js:30`) | [c] autorizado |
| **pedido** | captação, lead | Sim — `CaptacaoForm.jsx:57` `textoBotao = "Enviar pedido"`; `CaptacaoPage.jsx:236` "Pedido recebido 🤍"; `FunilBoard.jsx:1088` "Novo pedido" | `PainelNovoFormulario.jsx:94` "Dados da captação" | [a] antigo persiste |
| **pedido de orçamento** (público) | formulário de interesse | Parcial — só `FormularioDoEvento.jsx:786` "Sem pedido de orçamento" (backoffice) e `pontePedido.js:6` (comentário). A página `/interesse` **nunca diz «pedido de orçamento»** | `CentroNotificacoes.jsx:1291` "Quando alguém preencher o formulário de interesse" (visível); `Navegacao.jsx:468` (comentário); `docs/linguagem-da-casa.html:674`; `docs/migracoes/022_notificacoes.sql:4` | [a] |
| **orçamento** (documento) | — | Sim — `documentos.js:13` `tipo — 'orcamento' \| 'contrato' \| 'proposta'`; `src/components/admin/orcamentos/GerarOrcamento.jsx` | — | [c] |
| **modelo de evento** | tipo de evento | Sim — `Navegacao.jsx:33` `label: "Modelos de Evento"`; slug `modelos-evento` (`rotasAdmin.js:39`) | `EventTypeEditor.jsx:1431` "Editar/Novo Tipo de Evento"; `:1479` "Nome do Tipo de Evento *"; `:1649` "Guardar Tipo de Evento"; `:188`; `:1474`; `EventTypesTab.jsx:115,136,488`; `camposFormulario.js:145` | [a] antigo persiste |
| **formulário** (instância) | convite | Sim — `Navegacao.jsx:25` `label: "Formulários"`; slug `formularios` (`rotasAdmin.js:34`) | `invites.js:119` "Este convite não tem um tipo de evento"; `RemoverEventoModal.jsx:99`; `:276-277`; `InvitesList.jsx:209` `title="Remover convite"`; `DocumentosEvento.jsx:674`; `AdminPage.jsx:611` | [a] antigo persiste |
| **questionário** | formulário (p/ quem preenche), onboarding | Sim — `FormEntryPage.jsx:231` "Questionário do Evento"; `FormPage.jsx:714` "O vosso questionário foi submetido com sucesso."; `AdminPage.jsx:716` "O vosso questionário *Do Luxo à Mesa* está pronto."; `invites.js:126` "Este questionário já foi submetido…" | `FormPage.jsx:612` `origem: "onboarding:markInviteUsed"`, `:639` `origem: "onboarding"` | [a] + [c] |
| **organizador** | casal, família, noivos | Sim — `EventTypesTab.jsx:115`; `EventTypeEditor.jsx:80` (comentário); a `MaintenancePage.jsx`, que também usava o termo, foi removida a 14/08/2026 | Só em campos de casamento (`clientes.js`, `submissionFields.js:6-7`) — uso legítimo; `exports.js` foi removido a 14/08/2026 (código morto) | [a] alinhado |
| **responsável no dia** | — | Sim — `FaixaOperacional.jsx:131` `rotulo="Responsável no dia"` (`formSteps.js` e `exports.js`, que também o usavam, foram removidos a 14/08/2026 como código morto) | — | [a] |
| **briefing** | — | Sim — `VisaoGeralEvento.jsx:758,764`; rota `/briefing/:id` (`App.jsx:104`); RPCs `formulario_briefing` e `briefing_materiais` (`BriefingPage.jsx:472,503`) | — | [a]+[c] |
| aba **«O pedido»** | — | **Não existe.** `EventoPage.jsx:69-78` `ABAS = [visao-geral, documentos, materiais, fotografias, pagamentos, notas]` | O cartão existe, mas dentro do compositor — `FormularioDoEvento.jsx:667` (render literal "O pedido", em estilo `OVERLINE`; o comentário `:26` chama-lhe «O PEDIDO»), não como aba. Também `BriefingPage.jsx:894` `<Section title="O pedido">` | — |
| **ponte pedido→formulário** | «Copiar» campo a campo | **Sim — implementada.** `src/lib/pontePedido.js` (`pontePedidoFormulario` l. 92); consumida em `FormularioDoEvento.jsx:113,130,139,182` | Sobrevive só no painel antigo, fora do âmbito: `PainelNovoFormulario.jsx:140` `"Copiar"` | — glossário desactualizado (l. 139) |
| **Interessado** (fase) | Interessada | Sim — `fases.js:22` `interessado: "Interessado"` (fonte única, `FASE_LABEL`) | `fases.js:5` e `clientes.js:517-518` só em comentário histórico; `portal.js:36` chave `interessada` | [c] autorizado (l. 331-336) |
| **Orçamento** / **Cliente** (fases) | «Orçamento enviado» / «A aguardar sinal» | Sim — `fases.js:21-29` `FASE_LABEL` | `FASE_LABEL_PRE_SINAL` **não existe** como código: só em comentário (`fases.js:5`, `clientes.js:518` «morreu com ela») e em `docs/levantamento-comunicados.md:342`, `docs/glossario.md:567` | — resolvido; **pendência 1 do glossário está fechada** |
| **funil** | — | Sim — `ClientesLista.jsx:254` `{ id: "funil", label: "Funil", icone: "funil" }` | — | [a]+[b] |
| **evento** | — | Sim; tabela `submissions` (`AdminPage.jsx:728`) | — | [c] |
| **vitrina** | montra | Sim, mas **só em comentários** — `portal.js:7`, `CaptacaoPage.jsx:23`, `ContribuirPage.jsx:15`, `PortalPage.jsx:49`, `pecas.jsx:2`, `base.js:2`, `AvaliacoesTab.jsx:9` | `PortalDoClienteSheet.jsx:79` "Registo de OFÍCIO, não de montra"; `MateriaisInventario.jsx:13` (autorizado). São as **duas únicas** ocorrências de «montra» em `src/` | [b] |
| **comunicado** (o género) | — | Sim, só onde autorizado — `ComunicadoPage.jsx:277,648` overline `COMUNICADO`; `ComunicadoEditor.jsx:629` espelho; `ComunicadosTab.jsx:1563` estado vazio | `PortalDoClienteSheet.jsx:2166` "Comunicados enviados" (backoffice, fora das excepções) | [a] |
| **folha** | comunicado (no backoffice) | Sim — `ComunicadosTab.jsx:1528` "+ Nova folha", `:1800` "Nova folha", `:483` `["1 · A folha","2 · Publicar","3 · Quem recebe","4 · Enviar"]`, `:1564` "Escrever a primeira folha"; `ComunicadoModelos.jsx:206` "Modelos de folha"; `divisoes.jsx:310` `rotulo="As folhas da casa"`, `:335` `rotulo="Ler a folha"` | `PortalDoClienteSheet.jsx:2166` (ver acima) | [a] |
| **retirar** | — | Sim — `ComunicadosTab.jsx:128` "RETIRADA", `:616` "Confirmar? A folha sai do ar.", `:690` "A folha saiu do ar. O endereço fica reservado."; RPC `dlm_comunicado_retirar` (`comunicados.js:138`); coluna `retirado_em` | «revogar» só no portal (`portal.js:147` `revogarPortal`, RPC `dlm_portal_revogar`, coluna `revogado_em`), como manda o glossário | [a]+[c] |
| **Envios** (separador) | expedição, Feitos | Sim — `Navegacao.jsx:27` `label: "Envios"`; slug `envios` (`rotasAdmin.js:36`); sub-abas `ComunicadosTab.jsx:1454-1455` `["feitos","Envios"], ["moldes","Modelos"]` | `ComunicadoExpedicao.jsx` (ficheiro/componente), props `onExpedicao` (`ComunicadosTab.jsx:297,1427`)/`onVoltarExpedicao` (`ComunicadoExpedicao.jsx:277,465,1166`)/`onAbrirExpedicao` (`ComunicadoRecorte.jsx:129`, `ComunicadosTab.jsx:1410`), `ComunicadosTab.jsx:1146` `vista === "expedicao"`; ids `feitos`/`moldes` (`:1145`) | [b] autorizado |
| **aspecto** | registo | Sim — `ComunicadoEditor.jsx:1180` `aria-label="O aspecto da folha"`, `:1209-1210` `["aviso","Sóbrio"], ["oferta","Convidativo"]`; `ComunicadoModelos.jsx:389` "CONVIDATIVO"/"SÓBRIO" | coluna `comunicados.registo` (`comunicados.js:37,73,108,874,914,950`), valores `aviso`/`oferta` | [c] autorizado (l. 439) |
| **quem recebe** | público | Sim — `ComunicadoRecorte.jsx:332` "Quem recebe"; `ComunicadosTab.jsx:483,933` "3 · Quem recebe", `:937` "Ver quem recebe"; `ComunicadoModelos.jsx:47` `nome: "Quem recebe"`, `:531` `QUEM RECEBE`; slug `/quem-recebe` (`ComunicadosTab.jsx:1146,1426`) | coluna `comunicados.publico` (`comunicados.js:60,76,571,579,610,920,937,996`); estado interno `vista === "publico"` | [c] autorizado (l. 245) |
| **fechar a lista** | congelar | Sim — `ComunicadoRecorte.jsx:557` "Fechar a lista · N nomes", `:595` "Lista fechada:"; `ComunicadosTab.jsx:935` "Lista fechada", `:954` "Vê-se quantos são antes de fechar a lista." | coluna `congelado_em`; `comunicados.js:477` `congelarLista`, `:590` `desfazerCongelamento`; `ComunicadoRecorte.jsx:150` `nomesCongelados`, `:252` `podeCongelar` | [b]+[c] autorizado |
| **enviar** | expedição | Sim — `ComunicadosTab.jsx:483` "4 · Enviar"; slug `/enviar`; `ComunicadosTab.jsx:999,1032` "Ver os envios" | ver «Envios» acima | [b] autorizado |
| **modelo de folha** / **modelo de comunicado** | molde | Ambos — visível: `ComunicadoModelos.jsx:206` "Modelos de folha", `ComunicadoExpedicao.jsx:804` "Este envio vai repetir-se? Guarde como modelo de folha."; comentários: `comunicados.js:806,808,817,871,902`, `ComunicadoModelos.jsx:12,14,538`, `GuardarComoMolde.jsx:15`, `ComunicadoExpedicao.jsx:307,799`, `EventTypeEditor.jsx:1450` | `GuardarComoMolde.jsx` (ficheiro+componente), `comunicados.js:906` `guardarComoMolde`, `ComunicadosTab.jsx:1213-1214` `gavetaMolde`/`moldeGuardado`, `ComunicadoModelos.jsx:182,187,191,430,468` classes `dlm-molde-*` | [b] autorizado; **o glossário contradiz-se** (ver §13) |
| **dispensar** | — | Só como identificador — `comunicados.js:1107` `dispensarCandidato`, `:1109` `dispensado_em`, `:1115` `desfazerDispensa`, `:691,701,722` filtros por `dispensado_em`. **Nenhum rótulo visível diz «dispensar»**: o botão diz `ComunicadoExpedicao.jsx:743` "Deixar como está" | `CentroNotificacoes.jsx:1824` `aria-label="Dispensar"` — para **fechar uma notificação**, outro acto | [a]+[b] |
| **pauta** | — | Sim, só em comentários e constantes — `questionario-pecas.jsx:14-15` (comentário), `:23` `PAUTA_REPOUSO`, `:107-108,165,168-169,209` | — | [b] |
| **grupo de prazo** | — | Sim — tabela `questionario_grupos` (`eventTypes.js:44`); `EventTypeEditor.jsx:55` "O grupo de prazo (062). Vazio = este passo nunca fecha." | — | [c] |
| **capa** | — | Sim — `FotografiasEvento.jsx:328` "Capa", `:230` "A primeira é a capa"; `AsFotografias.jsx:59,93` | — | [a]+[b] |
| **momento** | — | Sim — coluna `momento` (`fotografias.js:61,80,84,94`, `momentoPorOmissao` `:43`); `FotografiasEvento.jsx:51-52` `{valor:"montagem",label:"Montagem"}, {valor:"evento",label:"Do evento"}` | — | [c] |
| **contacto** (a pessoa) / **lead** | lead | «lead» já **só em comentários** (o último visível, `AvisoDataDoEvento.jsx:495`, morreu com o ficheiro a 14/08/2026) | `CaptacaoForm.jsx:131,240`, `DashboardTab.jsx:270`, `LacunasFormulario.jsx:18` (comentários) | [a] |
| **capturar** | capturar | **não existe** em `src/` — a única ocorrência no repositório é a própria linha do glossário (`docs/glossario.md:493`) | — | — |

**Divergências entre o quadro dos nomes e os nomes de máquina reais** (o quadro nomeia coisas que não existem com esse nome):

| O quadro diz | O que existe mesmo |
|---|---|
| `captacao` (fica) | **Não existe tabela `captacao`.** Há `src/lib/captacao.js`, as RPCs `captacao_submeter` (`captacao.js:164`) e `captacao_dedupe` (`captacao.js:192`, `reservas.js:75`); os dados aterram em `clientes` + `submissions`. `CAMPOS_CAPTACAO` é uma constante de `src/pages/BriefingPage.jsx:270` |
| `orcamento` (fica) | **Não existe tabela `orcamento`.** É `documentos` com `tipo = 'orcamento'` (`documentos.js:13`) |
| `tiposEvento` (fica) | A **tabela** é `event_types` (`eventTypes.js`, `AdminPage.jsx`). `tiposEvento` é só o id do separador (`Navegacao.jsx:33`, `rotasAdmin.js:39`) |
| `briefing` (fica) | **Não existe tabela `briefing`.** É a rota `/briefing/:id` (`App.jsx:104`) + as RPCs `formulario_briefing` e `briefing_materiais` |
| `funil` | **Não existe tabela `funil`.** É o id de vista `funil` (`ClientesLista.jsx:254`) e o nome do ícone |
| «formulário» → coluna «No código» **vazia** | A tabela é `invites` (`invites.js:37,45,98,187,205`); o id do separador é `convites` (`Navegacao.jsx:25`, `rotasAdmin.js:34`) — o glossário **não regista nenhum dos dois** |

---

## 4. SCHEMA

Base: Supabase/Postgres. Todo o SQL do repositório vive em `docs/migracoes/` (não há ficheiros `.sql` fora dessa pasta). A cadeia numerada vai de `020_rpcs_formularios_publicos.sql` a `088_as_imagens_do_cliente_no_projecto.sql` (69 ficheiros, sem saltos), mais três ficheiros fora da cadeia (`form_errors.sql`, `limpeza_dados_teste.sql`, `semear-comunicado-condicoes.sql`) e dois de inventário só-leitura (`inventario_pre_lote2.sql`, `inventario_fecho_duplicados.sql` — ambos só `select`).

**Tabelas anteriores à pasta de migrações** (criadas no painel Supabase; **não existe** `create table` para elas em lado nenhum do repo): `clientes`, `submissions`, `invites`, `reservas`, `event_types`, `materiais`, `evento_materiais`, `mensagens_tipo`, `documentos`, `app_config`. A lista aparece no array de `021_rls_bloquear_anon.sql:34-44`, que tem **onze** nomes — os dez acima mais `form_errors`, que **não** é anterior às migrações (nasce em `docs/migracoes/form_errors.sql:11-19`). Para as dez, as colunas abaixo são **reconstruídas** a partir dos `alter table`, dos `insert`/`update` das RPC e do uso em `src/lib/*.js` — cada tabela diz explicitamente o que é reconstrução.

Etiquetas **[eventos]**, **[contactos]**, **[materiais]**, **[pagamentos]**: são anotação deste relatório para agrupar famílias de tabelas — **não existem** como conceito no código. **[materiais]** cobre `materiais` + `evento_materiais`; **[pagamentos]** cobre `pagamentos`, `pagamentos_previstos`, `campanhas`, `campanha_intencoes`.

---

### 4.1 `public.submissions` — o EVENTO **[eventos]**

Origem: **anterior às migrações** (sem `create table` no repo). Colunas reconstruídas de `020_rpcs_formularios_publicos.sql:139-199` (o `update` campo a campo), `044_importacao_idempotente.sql:100-122`, `src/lib/submissionFields.js:5-49` (FIELD_MAP) e dos `alter table` das 040/062/083 (as 071 e 077 só mexem em constraints).

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK (não confirmado: sem `create table`; é alvo de FK em 13 tabelas, logo unique) | |
| `created_at` | timestamptz | — | usado em `044:107`, referido em `048:6,65,75` |
| `cliente_id` | uuid | — | FK → `public.clientes(id)` (ação **não confirmada**: sem DDL no repo) |
| `event_type_id` | uuid | — | FK → `public.event_types(id)` (ação não confirmada) |
| `data_evento` | date | — | backfill único em `045_backfill_data_evento.sql` |
| `numero_convidados` | integer | — | |
| `respostas` | jsonb | — | fonte principal; as colunas antigas são espelho |
| `fase` | text | **not null**, default `'interessado'` (040:91-95) | check `submissions_fase_valida` |
| `status` | text | **not null**, default `'Recebido'` (040:78-82) | check `submissions_status_valido` |
| `valor_acordado` | numeric (tipo não confirmado) | — | `src/lib/clientes.js:369`; lido em `044:121` |
| `pagamento_final` | boolean (tipo não confirmado) | — | `src/lib/clientes.js:393`; lido em `044:121,151` |
| `questionario_entregue_em` | timestamptz | — | **062**:115-116 |
| `sinal_pagamento` | jsonb | — | **083**:70-71; `{metodo: mbway_iban\|conversa\|dinheiro\|outra, mbway, iban, instrucao}` — jsonb livre, sem CHECK |
| `dia_guardado_ate` | date | — | **083**:79-80; prazo da preferência do dia |
| `nome_noivo`, `nome_noiva`, `contacto_principal`, `email`, `morada`, `local_evento`, `recolha_dia_seguinte`, `nome_responsavel`, `contacto_responsavel`, `relacao_responsavel`, `estilo_outro`, `paleta_observacoes`, `cartoes_pratos`, `observacoes_cartoes`, `descricao_mesa_noivos`, `descricao_cenario`, `medidas_espaco`, `formato_mesas`, `observacoes_mesas`, `texto_principal_placa`, `texto_secundario_placa`, `notas_placa`, `morada_exacta`, `pessoa_abre_espaco`, `contacto_pessoa_abre`, `notas_acesso`, `observacoes_gerais` | text | — | colunas antigas (Casamento). Escritas via `dlm_txt` em 020:152-178 |
| `hora_inicio`, `hora_termino`, `hora_montagem`, `hora_limite_montagem`, `hora_recolha` | time | — | via `dlm_safe_time` (020:181-185) |
| `numero_mesas`, `lugares_por_mesa` | integer | — | via `dlm_safe_int` (020:188-189). ⚠ a chave jsonb de `lugares_por_mesa` é `lugaresporMesa` — p minúsculo (020:189, `submissionFields.js:37`) |
| `estilo_evento`, `paleta_cores`, `mesa_noivos`, `cenario_palco`, `centros_mesa`, `tipo_flores`, `estilo_placa`, `acesso_local` | text[] | — | via `dlm_txt_array` (020:192-199) |

**CHECKs** (todos em `040_invariante_fase_status.sql`, dois reescritos depois):

| constraint | expressão exacta | ficheiro |
|---|---|---|
| `submissions_status_valido` | `check (status in ('Recebido', 'Em Preparação', 'Confirmado', 'Concluído'))` | 040:107-109 |
| `submissions_fase_valida` | `check (fase in ('interessado', 'orcamento', 'sinal', 'cliente', 'projecto', 'contrato', 'perdido'))` | 040:117-120 |
| `submissions_status_pos_sinal` (versão **em vigor**, 077) | `check (status not in ('Em Preparação', 'Confirmado', 'Concluído') or fase in ('contrato', 'cliente', 'projecto', 'perdido'))` | 077:63-68 |
| — versão 040 (substituída) | `… or fase in ('cliente', 'projecto', 'contrato', 'perdido')` | 040:128-133 |
| — versão 071 (substituída) | `… or fase in ('cliente', 'projecto', 'perdido')` | 071:65-70 |

Os `drop constraint if exists submissions_status_pos_sinal` que precedem cada reescrita estão em 071:41-42 e 077:34-35.

**Ordem canónica da fase** (não é constraint, é o array de `dlm_fase_avancar_ate`): 075:40-41 `{interessado, orcamento, contrato, sinal, cliente, projecto}` → **em vigor**, 077:82-83 `{interessado, orcamento, sinal, contrato, cliente, projecto}`.

**Índices**: **não existe** nenhum `create index` sobre `submissions` no repo.

**Trigger**: `trg_notificar_captacao` — `after insert on public.submissions for each row execute function public.dlm_notificar_captacao()` (022:97-100). É um dos **três** triggers criados no repo (os outros: `invites_marcar_preenchido`, `documentos_trancados`).

**FKs que apontam para `submissions`** (as declaradas no repo, com a ação) — **treze**:

| origem | ação |
|---|---|
| `notificacoes.submission_id` | on delete **cascade** (022:34) |
| `pagamentos_previstos.submission_id` (`pagamentos_previstos_submission_fk`) | on delete **cascade** (025:50-52) |
| `pagamentos.submission_id` (`pagamentos_submission_fk`) | on delete **restrict** (025:63-65) |
| `notas_evento.submission_id` (`notas_evento_submission_fk`) | on delete **cascade** (029:35-37) |
| `campanhas.submission_id` (`campanhas_submission_fk`) | on delete **cascade** (033:30-32) |
| `portal_acessos.submission_id` | on delete **cascade** (049:44-45) |
| `portal_publicacoes.submission_id` | on delete **cascade** (057:44) |
| `respostas_autoria.submission_id` | on delete **cascade** (062:89) |
| `questionario_pedidos.submission_id` | on delete **cascade** (062:140) |
| `evento_fotografias.submission_id` | on delete **cascade** (065:88) |
| `avaliacoes.submission_id` | **unique** + on delete **cascade** (066:125-126) |
| `comunicado_destinatarios.submission_id` | on delete **set null** (080:70) |
| `portal_sinal_confirmacoes.submission_id` | on delete **restrict** (083:107) |

Para as tabelas anteriores (`documentos`, `evento_materiais`, `invites`, `reservas`) as ações **não estão declaradas em lado nenhum do repo**; o comentário de `src/lib/clientes.js:99-108` afirma (não confirmado por DDL): `documentos.submission_id` CASCADE, `evento_materiais.submission_id` CASCADE, `reservas.submission_id` SET NULL, `invites.submission_alvo_id` SET NULL, `invites.submission_id` NO ACTION (bloqueia). `limpeza_dados_teste.sql:48-57` corrige para «a acção não está declarada em lado nenhum — `documentos` e `evento_materiais` são anteriores a esta pasta e o omisso do Postgres é NO ACTION, que bloqueia tal como o RESTRICT».

---

### 4.2 `public.clientes` — a PESSOA **[contactos]**

Origem: **anterior às migrações**. Colunas reconstruídas de `src/lib/clientes.js:23` (select explícito), `020:215-220`, `036:211-217`, `080:121-122`.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK (não confirmado) | |
| `nome` | text | — | |
| `contacto` | text | — | telefone; chave de dedupe = últimos 9 dígitos (`captacao_dedupe`, 043:33) |
| `email` | text | — | |
| `nif` | text | — | `src/lib/clientes.js:82` (whitelist de update) |
| `morada` | text | — | |
| `notas` | text | — | |
| `created_at` | timestamptz | — | desempate do dedupe (043:48,60) |
| `recusou_promocoes_em` | timestamptz | — | **080**:121-122. «Null = pode receber» — exclui dos recortes por CONTACTOS, e só desses (080:124-127) |

Constraints/índices declarados no repo: **não existe**. O único `alter table public.clientes` de toda a pasta é o da 080:121.

---

### 4.3 `public.documentos` — Orçamento · Proposta(Projecto) · Contrato **[eventos]**

Origem: **anterior às migrações**; colunas acrescentadas por 030, 057, 074. Reconstrução a partir de `src/lib/documentos.js:36-117`, `044:178-183`.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK (não confirmado) | |
| `tipo` | text | — | valores usados: `'orcamento'`, `'proposta'`, `'contrato'`. Validados **na RPC** `dlm_portal_publicar` (057:165-167, 088:42-44, `raise exception 'TIPO_INVALIDO'`), **não** por CHECK — não existe nenhum CHECK sobre `documentos` no repo. `'proposta'` é o «Projecto» na UI (`src/lib/documentos.js:13-15`) |
| `submission_id` | uuid | nullable | FK → `submissions(id)` (ação não declarada). NULL = documento manual |
| `dados` | jsonb | — | o conteúdo editável |
| `created_at` | timestamptz | — | |
| `updated_at` | timestamptz | — | a função `public.documentos_set_updated_at()` existe (026:276-284) mas **não existe** no repo nenhum `create trigger` que a dispare — o trigger é anterior à pasta de migrações (não confirmado) |
| `enviado_em` | timestamptz | — | **030**:29-30 |
| `assinado_em` | timestamptz | — | **030**:31 |
| `trancado_em` | timestamptz | — | **057**:116-117. Carimbado ao assinar; a partir daí o trigger recusa alterações |
| `assinado_casa_em` | timestamptz | — | **074**:31 |
| `assinado_casa_por` | text | — | **074**:32 |

**Trigger**: `documentos_trancados` — `before update on public.documentos for each row execute function public.dlm_travar_documento_trancado()` (057:141-145). Levanta `DOCUMENTO_TRANCADO: este contrato foi assinado e não se altera. Para corrigir, faz-se um contrato novo.` se `old.trancado_em is not null` e mudarem `dados`, `enviado_em`, `assinado_em` ou `trancado_em` (057:129-136).

**Índices**: `uq_documentos_tipo_manual` — citado só no comentário `src/lib/documentos.js:18` («no máximo 1 por tipo»); é a **única** ocorrência do nome em todo o repo. **Não existe** DDL. Colunas do índice não confirmadas.

---

### 4.4 `public.invites` — convites do questionário **[eventos]**

Origem: **anterior às migrações**; `preenchido_em` de 048. Reconstrução de `src/lib/invites.js:44-58`, `020:83-84,236-238`, `044:163-171`, `037:19-32`.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK (não confirmado) | |
| `code` | text | — | comparado com `upper(btrim(...))` (020:84,117) |
| `event_type_id` | uuid | — | FK → `event_types(id)` (não declarada no repo) |
| `data_evento` | date | — | |
| `respostas` | jsonb | — | pré-preenchimento |
| `status` | text | — | valores usados: `'Pendente'` (`invites.js:52`), `'Preenchido'` (020:122,237) |
| `submission_id` | uuid | — | o evento que o convite CRIOU |
| `submission_alvo_id` | uuid | — | o evento a que o convite aponta |
| `reserva_id` | uuid | — | FK → `reservas(id)` (não declarada) |
| `created_at` | timestamptz | — | |
| `preenchido_em` | timestamptz | — | **048**:16-17 |

**Trigger**: `invites_marcar_preenchido` — `before insert or update on public.invites for each row execute function public.dlm_marcar_preenchido()` (048:54-59): carimba `preenchido_em` na transição para `status = 'Preenchido'`, sem sobrepor valor existente (048:41-46).

---

### 4.5 `public.reservas` — reservas provisórias da Agenda **[eventos] [contactos]**

Origem: **anterior às migrações**. Reconstrução de `src/lib/reservas.js:140-154,170-179`.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK (não confirmado) | |
| `nome_cliente` | text | — | |
| `data_evento` | date | — | |
| `event_type_id` | uuid | — | FK → `event_types(id)` (não declarada) |
| `contacto` | text | — | |
| `nota` | text | — | |
| `estado` | text | — | valores usados: `'Provisória'`, `'Convertida'`, `'Cancelada'` (`ESTADOS_RESERVA`, `src/lib/reservas.js:24-28`); `'Convertida'` também escrito em 020:242 e 036:239. **Não existe** CHECK no repo |
| `submission_id` | uuid | — | FK → `submissions(id)`, SET NULL segundo comentário `clientes.js:103` (não confirmado) |

---

### 4.6 `public.event_types` — modelos de formulário

Nenhuma etiqueta se aplica. Origem: **anterior às migrações**. Reconstrução de `src/lib/invites.js:68`, `src/lib/eventTypes.js:5-26`, `020:71-72`, `045:44-51`.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK (não confirmado) | |
| `nome` | text | — | |
| `steps` | jsonb | — | array de passos; cada passo tem `fields[]` e, desde a 062, pode ter a chave `grupo` **no PASSO** (não no campo) apontando a `questionario_grupos.chave` — 062:62-63, lido em 063:128,273 e 064:185. Cada campo tem `id`, `type`, `papel`, `label` |
| `predefinido` | boolean | — | `false` para os criados na app (`eventTypes.js:8`) |
| `icone` | text | — | |

RLS: única tabela com SELECT para `anon` (021:70-72, policy `"publico le tipos de evento"`).

---

### 4.7 `public.materiais` — catálogo **[materiais]**

Origem: **anterior às migrações**. Reconstrução de `src/lib/materiais.js:72-131` (insert) e `:135-154` (whitelist de update).

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK (não confirmado) | |
| `categoria` | text | — | ordem canónica em `CATEGORIAS_ORDEM` (materiais.js:13-25), **não** na BD |
| `nome` | text | — | |
| `unidade` | text | default `'un'` no código (materiais.js:75) | |
| `quantidade_total` | integer | — | o «disponível» nunca se guarda (stock.js:11-13) |
| `codigo`, `tipo`, `cor`, `medida`, `notas`, `imagem_url` | text | — | |
| `em_higienizacao` | integer | — | |
| `por_confirmar` | integer | — | |
| `stock_ideal` | integer | — | |
| `ordem` | integer | — | dentro da categoria |
| `def_carga` | boolean | — | default de lista herdado por `evento_materiais` |
| `def_montagem` | boolean | — | idem |
| `def_higienizacao` | boolean | — | idem |
| `ativo` | boolean | — | soft-delete |

Nenhum `alter table public.materiais` nem índice no repo.

---

### 4.8 `public.evento_materiais` — ficha do evento **[eventos] [materiais]**

Origem: **anterior às migrações**; NOT NULL/defaults das três listas em **046**:27-33. Colunas restantes reconstruídas de `briefing_materiais` (031:34-43).

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK (não confirmado) | |
| `submission_id` | uuid | — | FK → `submissions(id)` (não declarada) |
| `material_id` | uuid | — | FK → `materiais(id)` (não declarada) |
| `quantidade` | integer | — | |
| `cores` | text | — | |
| `observacoes` | text | — | |
| `lista_carga` | boolean | **not null**, default `true` | 046:28-29 |
| `lista_montagem` | boolean | **not null**, default `true` | 046:30-31 |
| `lista_higienizacao` | boolean | **not null**, default `false` | 046:32-33 |

**Unique**: `(submission_id, material_id)` — usado como `onConflict: "submission_id,material_id"` em `src/lib/materiais.js:223` (comentário em `:200`); o DDL **não existe** no repo (nome do índice desconhecido).

---

### 4.9 `public.mensagens_tipo` — mensagens-tipo do Instagram

Nenhuma etiqueta. Origem: **anterior às migrações** (o comentário `src/lib/mensagens.js:5` diz «migração 015», ficheiro que **não existe** nesta pasta — a cadeia começa na 020).

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK (não confirmado) | |
| `chave` | text | única (não confirmado) | as da Nádia usam `custom_<timestamp>` (mensagens.js:36) |
| `titulo` | text | — | |
| `corpo` | text | — | placeholders `{NOME} {TIPO_EVENTO} {DATA} {VALOR} {SINAL} {LINK_INTERESSE} {LINK_FOLHA}` (mensagens.js:88, resolvidos em `:100-107`) |
| `ordem` | integer | — | |
| `ativo` | boolean | — | soft-delete (mensagens.js:68) |

---

### 4.10 `public.app_config` — configuração

Nenhuma etiqueta. Origem: **anterior às migrações**. Reconstrução de `src/lib/stock.js:21-43`.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `chave` | text | chave natural (o update filtra por `.eq("chave", …)`, stock.js:38) | |
| `valor` | text | — | gravado sempre como `String(valor)` (stock.js:37) |
| `updated_at` | timestamptz | — | escrito pelo cliente (stock.js:37) |

Chaves conhecidas: `buffer_dias_antes`, `buffer_dias_depois` (fallback 2/2 em `stock.js:48-56`).

---

### 4.11 `public.form_errors` — erros dos formulários públicos

Nenhuma etiqueta. Origem: **`docs/migracoes/form_errors.sql:11-19`** (fora da cadeia numerada).

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `created_at` | timestamptz | **not null**, default `now()` | |
| `origem` | text | — | `"onboarding"` \| `"captacao"` \| … (valores reais escritos: `"onboarding"` `FormPage.jsx:639`, `"onboarding:markInviteUsed"` `:612`, `"captacao"` `CaptacaoForm.jsx:341`) |
| `mensagem` | text | — | |
| `detalhe` | jsonb | — | code/details/hint do PostgREST |
| `contexto` | jsonb | — | convite, event_type, passo, url, user agent |
| `respostas` | jsonb | — | o formData no momento da falha |

Índices: **não existe**. `form_errors.sql:26-36` cria policies de `insert`/`select`/`delete` para `anon, authenticated` (grants em `:40`) — a única tabela onde o `anon` lê e apaga. ⚠ **Conflito por ordem de execução**: `form_errors` está no array da 021 (linha 43), que apaga **todas** as policies da tabela e recria só `"admin acesso total"` (authenticated) + `"publico regista erros"` (anon **insert**, 021:76-77). Qual das duas ficou em vigor depende da ordem em que foram corridas — **não confirmado** por nada no repo.

---

### 4.12 `public.notificacoes` — Caixa de Entrada **[eventos]**

Origem: **`022_notificacoes.sql:29-39`**.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `created_at` | timestamptz | **not null**, default `now()` | |
| `tipo` | text | **not null**, default `'captacao'` | texto livre — **não existe** CHECK. Valores emitidos pelas migrações (onze): `'captacao'`, `'codigo_pedido'`, `'pedido_alteracao'`, `'contrato_papel'`, `'questionario_pedido'`, `'questionario_entregue'`, `'orcamento_aceite'`, `'projecto_aprovado'`, `'contrato_assinado'`, `'avaliacao_recebida'` (067:201), `'sinal_confirmado'`. `src/lib/notificacoes.js:28-37` lista oito em `TIPOS_DO_ACOMPANHAMENTO` (sem `captacao`, `questionario_entregue` nem `avaliacao_recebida`) |
| `titulo` | text | — | |
| `submission_id` | uuid | — | FK → `submissions(id)` **on delete cascade** |
| `cliente_id` | uuid | — | sem FK declarada |
| `event_type_id` | uuid | — | sem FK declarada |
| `dados` | jsonb | **not null**, default `'{}'::jsonb` | snapshot do pedido |
| `lida_em` | timestamptz | — | NULL = não lida |

**Índices**: `notificacoes_nao_lidas_idx on public.notificacoes (created_at desc) where lida_em is null` (022:45-47) — parcial.

Realtime: junta-se a `supabase_realtime` se a publicação existir (022:116-127). A **023** faz o mesmo para `submissions` e `invites` (023:18, 023:37).

---

### 4.13 `public.pagamentos_previstos` — o plano **[eventos] [pagamentos]**

Origem: **`025_pagamentos.sql:48-59`**.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `submission_id` | uuid | **not null** | `pagamentos_previstos_submission_fk` → `submissions(id)` **on delete cascade** |
| `descricao` | text | **not null** | valores gerados: `'Sinal (50%)'`, `'Remanescente (50%)'` (`src/lib/pagamentos.js:23-24`; iguais em 044:129,135) |
| `valor` | numeric(10,2) | **not null** | `pagamentos_previstos_valor_check check (valor > 0)` |
| `data_limite` | date | — | data do evento − 2 dias, no gerador (044:137) |
| `ordem` | smallint | **not null**, default `1` | 1 = sinal, 2 = remanescente |
| `created_at` | timestamptz | **not null**, default `now()` | |

**Índices**: `pagamentos_previstos_submission_idx (submission_id)` (025:82-83); `pagamentos_previstos_submissao_ordem_unq` **unique** `(submission_id, ordem)` (041:25-26).

---

### 4.14 `public.pagamentos` — o dinheiro que entrou **[eventos] [pagamentos]**

Origem: **`025_pagamentos.sql:61-80`**; colunas de 039 e 042.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `submission_id` | uuid | **not null** | `pagamentos_submission_fk` → `submissions(id)` **on delete restrict** — dinheiro registado nunca cai em cascata |
| `previsto_id` | uuid | — | `pagamentos_previsto_fk` → `pagamentos_previstos(id)` **on delete set null** |
| `valor` | numeric(10,2) | **not null** | `pagamentos_valor_check check (valor > 0)` |
| `data` | date | — | |
| `metodo` | text | **not null** | texto livre de propósito (`pagamentos.js:13`); sugestões de autocomplete em `METODOS_SUGERIDOS` (`pagamentos.js:17-21`): `"MB Way"`, `"Transferência bancária"`, `"Numerário"`. A reconstituição escreve `'Desconhecido (reconstituído)'` (044:146,155) |
| `origem` | text | **not null**, default `'sinal'` | texto livre; outros valores usados: `'remanescente'` (027:111, 044:155, `PagamentosEvento.jsx:1147`) e `'contribuicao'` (033:6, 034:57, `campanhas.js:324`) |
| `contribuinte` | text | — | |
| `notas` | text | — | |
| `reconstituido` | boolean | **not null**, default `false` | |
| `created_at` | timestamptz | **not null**, default `now()` | |
| `intencao_id` | uuid | — | **039**:45-48, `pagamentos_intencao_fk` → `campanha_intencoes(id)` **on delete set null** |
| `campanha_id` | uuid | — | **042**:38-41, `pagamentos_campanha_fk` → `campanhas(id)` **on delete set null** |

**CHECK**: `pagamentos_data_reconstituido_check check (data is not null or reconstituido = true)` (025:78-79).

**Índices**: `pagamentos_submission_idx (submission_id)` (025:84-85); `pagamentos_intencao_idx (intencao_id) where intencao_id is not null` (039:50-52); `pagamentos_campanha_idx (campanha_id) where campanha_id is not null` (042:43-45).

---

### 4.15 `public.notas_evento` **[eventos]**

Origem: **`029_notas_evento.sql:33-45`**.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `submission_id` | uuid | **not null** | `notas_evento_submission_fk` → `submissions(id)` **on delete cascade** |
| `tipo` | text | **not null**, default `'interna'` | `notas_evento_tipo_check check (tipo in ('chamada', 'mensagem', 'alteracao', 'interna'))` |
| `corpo` | text | **not null** | `notas_evento_corpo_check check (btrim(corpo) <> '')` |
| `autor` | text | — | |
| `created_at` | timestamptz | **not null**, default `now()` | |

**Índices**: `notas_evento_submission_idx (submission_id, created_at desc)` (029:49-50).

---

### 4.16 `public.campanhas` — campanha de contribuição **[eventos] [pagamentos]**

Origem: **`033_campanhas.sql:28-44`**; `como_contribuir` de **034**:24-25.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `submission_id` | uuid | **not null** | `campanhas_submission_fk` → `submissions(id)` **on delete cascade** |
| `objetivo` | numeric(10,2) | **not null** | `campanhas_objetivo_check check (objetivo > 0)` |
| `mensagem` | text | — | |
| `token` | text | **not null** | `campanhas_token_unico` **unique** |
| `estado` | text | **not null**, default `'ativa'` | `campanhas_estado_check check (estado in ('ativa', 'fechada', 'concluida'))` |
| `celebrada_em` | timestamptz | — | a celebração acontece uma vez |
| `fechada_em` | timestamptz | — | |
| `created_at` | timestamptz | **not null**, default `now()` | |
| `como_contribuir` | text | — | **034**:24-25 |

**Índices**: `campanhas_submission_idx (submission_id)` (033:46-47); `campanhas_uma_ativa_idx` **unique** `(submission_id) where estado = 'ativa'` (033:50-52).

---

### 4.17 `public.campanha_intencoes` — promessas **[eventos] [pagamentos]**

Origem: **`035_campanha_intencoes.sql:24-39`**.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `campanha_id` | uuid | **not null** | `campanha_intencoes_campanha_fk` → `campanhas(id)` **on delete cascade** |
| `nome` | text | **not null** | |
| `valor` | numeric(10,2) | **not null** | `campanha_intencoes_valor_check check (valor > 0)` |
| `mensagem` | text | — | |
| `estado` | text | **not null**, default `'pendente'` | `campanha_intencoes_estado_check check (estado in ('pendente', 'confirmada', 'anulada'))` |
| `confirmada_em` | timestamptz | — | |
| `anulada_em` | timestamptz | — | |
| `created_at` | timestamptz | **not null**, default `now()` | |

**Índices**: `campanha_intencoes_campanha_idx (campanha_id)` (035:41-42).

---

### 4.18 `public.portal_acessos` — a porta do portal **[eventos]**

Origem: **`049_portal_do_cliente_fase1.sql:42-60`**; `visita_anterior_em` de **054**.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `submission_id` | uuid | **not null** | → `submissions(id)` **on delete cascade** |
| `token` | text | **not null**, **unique**, default `public.dlm_token_portal()` | 24 bytes base64url (049:32) |
| `criado_em` | timestamptz | **not null**, default `now()` | |
| `expira_em` | timestamptz | — | data do evento + 30 dias (049:110-113); sem data de evento fica NULL |
| `revogado_em` | timestamptz | — | |
| `motivo` | text | — | ver CHECK |
| `ultimo_acesso_em` | timestamptz | — | |
| `n_acessos` | integer | **not null**, default `0` | |
| `visita_anterior_em` | timestamptz | — | **054**:58-59; roda só após 30 min sobre `ultimo_acesso_em` |

**CHECKs** (049:56-59): `portal_acessos_motivo_check check (motivo is null or motivo in ('avaliado', 'prazo', 'manual'))`; `portal_acessos_revogado_com_motivo check ((revogado_em is null) = (motivo is null))`. Nota da **066**:188-193: `'avaliado'` deixou de ser automático — fica só para revogação à mão.

**Índices**: `portal_acessos_vivo_idx` **unique** `(submission_id) where revogado_em is null` (049:67-69); `portal_acessos_token_idx (token)` (049:71-72).

---

### 4.19 `public.portal_publicacoes` — instantâneos publicados **[eventos]**

Origem: **`057_portal_fase3_documentos.sql:42-52`**.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `submission_id` | uuid | **not null** | → `submissions(id)` **on delete cascade** |
| `documento_id` | uuid | — | → `documentos(id)` **on delete set null** |
| `tipo` | text | **not null** | `check (tipo in ('orcamento', 'proposta', 'contrato'))` inline, constraint sem nome próprio (057:46) |
| `versao` | integer | **not null** | |
| `instantaneo` | jsonb | **not null** | congelado; `documentos.dados` continua vivo |
| `publicado_em` | timestamptz | **not null**, default `now()` | |
| `publicado_por` | uuid | — | `auth.uid()` (057:192) |

**Unique**: `unique (submission_id, tipo, versao)` (057:51).
**Índices**: `portal_publicacoes_evento_idx (submission_id, tipo, versao desc)` (057:108-109).

---

### 4.20 `public.portal_verificacoes` — códigos de verificação **[eventos]**

Origem: **`057_portal_fase3_documentos.sql:59-69`**; `tentativas` de **058**.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `acesso_id` | uuid | **not null** | → `portal_acessos(id)` **on delete cascade** |
| `contexto` | text | — | âmbito do código (usado pela 061) |
| `pedido_em` | timestamptz | **not null**, default `now()` | |
| `codigo` | text | — | guardado **em claro** de propósito; vive 24h (057:71-74) |
| `emitido_em` | timestamptz | — | |
| `emitido_por` | uuid | — | |
| `expira_em` | timestamptz | — | |
| `usado_em` | timestamptz | — | também o relógio da sessão (60 min) |
| `tentativas` | integer | **not null**, default `0` | **058**:88-89; à quinta falha o código morre (058:91-94) |

**Índices**: `portal_verificacoes_acesso_idx (acesso_id, pedido_em desc)` (057:110-111).

---

### 4.21 `public.portal_actos` — trilho de auditoria **[eventos]**

Origem: **`057_portal_fase3_documentos.sql:77-87`**; alterações em 059, 083, 086.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `publicacao_id` | uuid | **not null** | → `portal_publicacoes(id)` **on delete restrict** |
| `verificacao_id` | uuid | **nullable desde 059**:26-27 (nasceu not null, 057:80) | → `portal_verificacoes(id)` **on delete restrict** |
| `acto` | text | **not null** | `check (acto in ('aceitou', 'pediu_alteracao', 'assinou'))` inline (057:81) |
| `nome_escrito` | text | **not null** | |
| `mensagem` | text | — | |
| `ip` | text | — | |
| `user_agent` | text | — | |
| `criado_em` | timestamptz | **not null**, default `now()` | |
| `confirmado_por` | uuid | — | **059**:30; `auth.uid()` de quem confirmou o papel |
| `ficheiro` | text | — | **059**:31; caminho no balde `contratos-assinados` |

**CHECK `portal_actos_tem_prova` — três versões, e a última é a MORTE da constraint**:
- 059:44-48 → `check (verificacao_id is not null or (confirmado_por is not null and ficheiro is not null))`
- 083:975-980 → `check (verificacao_id is not null or (confirmado_por is not null and ficheiro is not null) or acto in ('aceitou', 'pediu_alteracao'))`
- **086:300-301** → `alter table public.portal_actos drop constraint if exists portal_actos_tem_prova;` — **em vigor: a constraint não existe**.

**Índices**: `portal_actos_um_assinou_por_publicacao` **unique** `(publicacao_id) where acto = 'assinou'` (060:41-43).

---

### 4.22 `public.portal_condicoes_lidas` — o pórtico das condições **[eventos]**

Origem: **`078_o_portico_das_condicoes.sql:41-48`**.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `acesso_id` | uuid | **not null** | → `portal_acessos(id)` **on delete restrict** |
| `publicacao_id` | uuid | **not null** | → `portal_publicacoes(id)` **on delete restrict** |
| `ip` | text | — | |
| `user_agent` | text | — | |
| `criado_em` | timestamptz | **not null**, default `now()` | |

Uma leitura vale para o EVENTO inteiro, nunca por versão (078:53-54). RLS: só policy de **select** para `authenticated` (`"admin le as leituras"`, 078:75-77) — a escrita entra só pela RPC security definer.
**Índices**: `portal_condicoes_lidas_pub_idx (publicacao_id)` (078:79-80).

---

### 4.23 `public.portal_sinal_confirmacoes` — «já paguei o sinal» **[eventos] [pagamentos]**

Origem: **`083_o_ecra_do_sinal_e_a_disputa_do_dia.sql:104-114`**.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `acesso_id` | uuid | **not null** | → `portal_acessos(id)` **on delete restrict** |
| `submission_id` | uuid | **not null** | → `submissions(id)` **on delete restrict** |
| `metodo_indicado` | text | — | texto livre; indicação, não facto contabilístico (083:127-129) |
| `ip` | text | — | |
| `user_agent` | text | — | |
| `criado_em` | timestamptz | **not null**, default `now()` | |
| `anulada_em` | timestamptz | — | NULL = viva (fecha o ecrã do sinal aos rivais) |
| `anulada_por` | text | — | |

RLS: `"admin le as confirmacoes"` (select, 083:142-144) e `"admin anula confirmacoes"` (update, 083:146-148) para `authenticated`; **sem policy de insert** — a escrita entra só pela RPC security definer (083:138-141).
**Índices**: `portal_sinal_confirmacoes_viva_uidx` **unique** `(submission_id) where anulada_em is null` (083:153-155); `portal_sinal_confirmacoes_acesso_idx (acesso_id)` (083:157-158).

---

### 4.24 `public.questionario_grupos` — grupos de prazo

Nenhuma das quatro etiquetas (configuração da casa). Origem: **`062_questionario_grupos_e_autoria.sql:53-59`**.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `chave` | text | **PK** | |
| `rotulo` | text | **not null** | |
| `dias_antes` | integer | **not null** | `check (dias_antes >= 0)` (inline, sem nome) |
| `porque` | text | **not null** | o texto que a cliente lê num campo fechado |
| `ordem` | integer | **not null** | |

Semeada (062:68-76, `on conflict (chave) do nothing`) com três linhas: `('compras','Compras e stock',14,'as flores e o material encomendam-se com duas semanas de antecedência',1)`, `('producao','Produção',7,'os textos vão para impressão uma semana antes',2)`, `('palavras','Palavras',2,'a equipa recebe o briefing final dois dias antes',3)`.
**Índices**: **não existe** (para além da PK). `revoke all … from anon` em 062:172.

---

### 4.25 `public.respostas_autoria` — quem escreveu cada resposta **[eventos]**

Origem: **`062_questionario_grupos_e_autoria.sql:87-95`**.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `submission_id` | uuid | **not null** | → `submissions(id)` **on delete cascade** |
| `campo_id` | text | **not null** | |
| `autor` | text | **not null** | `check (autor in ('cliente', 'equipa'))` inline — o LADO, não a pessoa |
| `autor_id` | uuid | — | a pessoa, para o backoffice |
| `valor_anterior` | jsonb | — | |
| `escrito_em` | timestamptz | **not null**, default `now()` | |

**Índices**: `respostas_autoria_evento_idx (submission_id, campo_id, escrito_em desc)` (062:97-98).

---

### 4.26 `public.questionario_pedidos` — pedidos a campo fechado **[eventos]**

Origem: **`062_questionario_grupos_e_autoria.sql:138-147`**; `dados` de **074**.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `submission_id` | uuid | **not null** | → `submissions(id)` **on delete cascade** |
| `campo_id` | text | **not null** | |
| `campo_label` | text | **not null** | guardado por extenso — o rótulo do modelo pode mudar (062:153-157) |
| `pedido` | text | **not null** | |
| `pedido_em` | timestamptz | **not null**, default `now()` | |
| `respondido_em` | timestamptz | — | |
| `respondido_por` | uuid | — | |
| `dados` | jsonb | — | **074**:35-36; a morada nova em cinco partes (`rua, numero, andar, codigoPostal, localidade`) |

**Índices**: `questionario_pedidos_por_responder_idx (submission_id, pedido_em desc) where respondido_em is null` (062:149-151).

---

### 4.27 `public.evento_fotografias` — as fotografias do dia **[eventos]**

Origem: **`065_fotografias_do_dia.sql:86-98`**; `pode_publicar` nasceu na **066** e **morreu na 068**; `publicavel` da **068**.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `submission_id` | uuid | **not null** | → `submissions(id)` **on delete cascade** |
| `caminho` | text | **not null** | nome no balde `fotografias` |
| `url_pequena` | text | **not null** | |
| `url_grande` | text | **not null** | |
| `assunto` | text | — | |
| `momento` | text | **not null**, default `'montagem'` | `check (momento in ('montagem', 'evento'))` inline (065:93-94) |
| `ordem` | integer | **not null**, default `0` | a CAPA é a primeira |
| `criado_em` | timestamptz | **not null**, default `now()` | |
| `criado_por` | uuid | — | |
| `publicavel` | text | **not null**, default `'por_rever'` | **068**:34-35. `evento_fotografias_publicavel_check check (publicavel in ('por_rever', 'sem_convidados', 'com_convidados'))` (068:39-41) |
| ~~`pode_publicar`~~ | boolean | — | **066**:176-177 criou-a; **068**:49 fez `drop column if exists pode_publicar` — **já não existe** |

**Índices**: `evento_fotografias_evento_idx (submission_id, ordem, criado_em)` (065:100-101). `grant … to authenticated` (065:126) e `revoke all on public.evento_fotografias from anon` (065:129).

---

### 4.28 `public.avaliacao_eixos` — mapa serviço → eixo

Nenhuma das quatro etiquetas (configuração da casa). Origem: **`066_avaliacao_estrutura_e_eixos.sql:51-58`**.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `chave` | text | **PK** | |
| `servicos` | text[] | **not null**, default `'{}'` | as cadeias tal como estão em `respostas.servicos`; VAZIO = SEMPRE (066:65-68) |
| `rotulo` | text | **not null** | |
| `ponta_esquerda` | text | **not null** | |
| `ponta_direita` | text | **not null** | |
| `ordem` | integer | **not null** | |

Semeada (066:74-111, `on conflict (chave) do nothing`) com seis eixos: `mesa` `{Mesa posta}` «A mesa que encontrou» (1), `cenario` `{Cenário, Cenário fotografável}` «O cenário» (2), `comida` `{Buffet}` «A comida» (3), `servico` `{Balcão}` «A equipa em serviço» (4), `bolo` `{Mesa do bolo da noiva}` «A mesa do bolo» (5), `tranquilidade` `{}` «A tranquilidade com que passou o dia» (99). A **087**:18-21 faz `array_append(servicos, 'Mesa do bolo')` no eixo `bolo`, com guarda de idempotência — ficando `{"Mesa do bolo da noiva","Mesa do bolo"}`.
**Índices**: **não existe** (para além da PK). `revoke all … from anon` (066:118).

---

### 4.29 `public.avaliacoes` — a avaliação do cliente **[eventos]**

Origem: **`066_avaliacao_estrutura_e_eixos.sql:123-135`**.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `submission_id` | uuid | **not null**, **unique** | → `submissions(id)` **on delete cascade** — uma por evento |
| `frase` | text | — | |
| `eixos` | jsonb | **not null**, default `'[]'::jsonb` | `[{chave, rotulo, valor}]`, valor 0–100 |
| `fotografia_id` | uuid | — | → `evento_fotografias(id)` **on delete set null** |
| `publicacao_autorizada` | boolean | **not null**, default `false` | autorização DELA, só sobre as palavras |
| `nome_como` | text | **not null**, default `'completo'` | `check (nome_como in ('completo', 'primeiro', 'anonimo'))` inline |
| `criada_em` | timestamptz | **not null**, default `now()` | |
| `publicada_em` | timestamptz | — | |

**Índices**: `avaliacoes_por_publicar_idx (criada_em desc) where publicacao_autorizada and publicada_em is null` (066:160-162). `revoke all … from anon` (066:169).

---

### 4.30 `public.comunicados` — a folha **[contactos]**

Origem: **`079_comunicados_fase1.sql:30-52`**; colunas de 080, 081, 085.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `titulo` | text | **not null** | |
| `subtitulo` | text | — | |
| `blocos` | jsonb | **not null**, default `'[]'::jsonb` | array `{id, rotulo, texto}`; o PAPEL deriva da posição/conteúdo em `comporFolha` (`src/lib/comunicados.js`) — 079:54-66 |
| `mensagem` | text | — | o texto que acompanha a folha na conversa |
| `token` | text | **unique** | NULL enquanto não publicada |
| `publicado_em` | timestamptz | — | |
| `retirado_em` | timestamptz | — | |
| `expira_em` | timestamptz | — | NULL = não expira |
| `n_acessos` | integer | **not null**, default `0` | nunca se atribui a ninguém (079:68-70) |
| `created_at` | timestamptz | **not null**, default `now()` | |
| `actualizado_em` | timestamptz | **not null**, default `now()` | |
| `registo` | text | **not null**, default `'aviso'` | **080**:32-33. `comunicados_registo_valido check (registo in ('aviso', 'oferta'))` (080:42-44) |
| `publico` | jsonb | — | **080**:34. A REGRA: `{origem:"eventos"\|"contactos", event_type_id, janela, quem}` (080:52-55) |
| `congelado_em` | timestamptz | — | **080**:35 |
| `modelo_id` | uuid | — | **081**:92-93. → `comunicado_modelos(id)` **on delete set null** |
| `saudacao` | text | — | **085**:49-50. NULL = a folha abre sem saudação, e é escolha, não esquecimento |

**Índices**: `comunicados_token_idx (token) where token is not null` (079:72-73); `comunicados_modelo_idx (modelo_id) where modelo_id is not null` (081:95-96).

---

### 4.31 `public.comunicado_destinatarios` — a lista congelada **[eventos] [contactos]**

Origem: **`080_comunicados_fase2.sql:65-93`**; colunas de 081 e 085.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `comunicado_id` | uuid | **not null** | → `comunicados(id)` **on delete cascade** |
| `submission_id` | uuid | — | → `submissions(id)` **on delete set null** |
| `cliente_id` | uuid | — | → `clientes(id)` **on delete set null** |
| `nome` | text | **not null** | INSTANTÂNEO |
| `ancora` | text | — | «Casamento · 12 de setembro» |
| `telefone` | text | — | NULL = sem número utilizável |
| `telefone_chave` | text | — | os 9 dígitos canónicos (ver 043) |
| `mensagem` | text | — | NULL = usa a mensagem base do comunicado |
| `aberto_em` | timestamptz | — | conversa aberta, à espera de resposta |
| `enviado_em` | timestamptz | — | ela confirmou que saiu — não que foi lida (080:95-97) |
| `ordem` | integer | **not null**, default `0` | |
| `created_at` | timestamptz | **not null**, default `now()` | posterior a `comunicados.congelado_em` = «acrescentada» (081:114-115) |
| `dispensado_em` | timestamptz | — | **081**:117-118 |
| `no_portal` | boolean | **not null**, default `false` | **085**:187-188 (dentro de guarda `if not exists`, 085:178-195); backfill `set no_portal = true where enviado_em is not null` (085:191-193) |

**CHECK**: `comunicado_destinatarios_dispensada_sem_carimbos check (dispensado_em is null or (aberto_em is null and enviado_em is null))` (081:138-140).
**Índices**: `comunicado_destinatarios_comunicado_idx (comunicado_id, ordem)` (080:99-100); `comunicado_destinatarios_sem_repetidos` **unique** `(comunicado_id, telefone_chave) where telefone_chave is not null` (080:105-107).

---

### 4.32 `public.comunicado_modelos` — os moldes **[contactos]**

Origem: **`081_comunicados_fase3.sql:31-52`**; `saudacao` de **085**.

| coluna | tipo | not null/default | notas |
|---|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` | |
| `nome` | text | **not null** | o nome INTERNO do molde |
| `registo` | text | **not null**, default `'aviso'` | `comunicado_modelos_registo_valido check (registo in ('aviso', 'oferta'))` (081:59-61) |
| `titulo` | text | **not null** | |
| `subtitulo` | text | — | |
| `blocos` | jsonb | **not null**, default `'[]'::jsonb` | como em `comunicados`, mais `rever` (booleano) e `pergunta` (texto) — 081:65-71 |
| `mensagem` | text | — | |
| `publico` | jsonb | — | a REGRA `{origem, event_type_id, janela, quem}` (081:73-75) |
| `created_at` | timestamptz | **not null**, default `now()` | |
| `actualizado_em` | timestamptz | **not null**, default `now()` | |
| `saudacao` | text | — | **085**:52-53 |

**Índices**: **não existe** (para além da PK).

---

### 4.33 VIEWS

| view | origem | o que devolve |
|---|---|---|
| `public.v_destinatarios_possiveis` | **080**:210-237 | Uma linha por evento com `submission_id, cliente_id, nome, telefone, telefone_chave, event_type_id, data_evento, fase`; o telefone resolve-se por `coalesce(nullif(c.contacto,''), nullif(s.respostas->>'numeroWhatsapp',''), nullif(s.respostas->>'contactoPrincipal',''))` e a chave são os últimos 9 dígitos (`nullif(right(regexp_replace(…,'\D','','g'),9),'')`). **`security_invoker = true`** (080:252) + `revoke all … from anon, public` / `grant select … to authenticated` (080:254-255) |

Não existe nenhuma outra view nem materialized view no repo.

---

### 4.34 FUNÇÕES / RPC

**Auxiliares e triggers**

| função | devolve | origem | uma linha |
|---|---|---|---|
| `dlm_txt(v jsonb, k text)` | text | 020:22, 026:255 | texto de uma chave jsonb; null em erro |
| `dlm_txt_array(v jsonb, k text)` | text[] | 020:43, 026:261 | array de texto de uma chave jsonb |
| `dlm_safe_date(t text)` | date | 020:34, 026:231 | cast tolerante para date |
| `dlm_safe_int(t text)` | integer | 020:26, 026:237 | cast tolerante para integer |
| `dlm_safe_time(t text)` | time | 020:30, 026:243 | cast tolerante para time |
| `dlm_safe_uuid(t text)` | uuid | 020:38, 026:249 | cast tolerante para uuid |
| `_ajustar_registo(alvo regclass, registo jsonb)` | jsonb | 026:24 | filtra/adapta um jsonb às colunas reais da tabela alvo |
| `documentos_set_updated_at()` | trigger | 026:276 | põe `NEW.updated_at := now()`. **Sem `create trigger` no repo** |
| `dlm_notificar_captacao()` | trigger | 022:50, 024:29, 026:189 | `after insert` em submissions: cria a notificação `captacao` se `fase='interessado'` e o papel não for `authenticated`; erros engolidos (022:89-91) |
| `dlm_marcar_preenchido()` | trigger | 048:34 | carimba `invites.preenchido_em` na transição para `'Preenchido'` |
| `dlm_travar_documento_trancado()` | trigger | 057:124 | recusa alterações a um documento com `trancado_em` |
| `dlm_token_portal()` | text | 049:26 | token opaco de 24 bytes base64url para o portal; `set search_path = public, extensions` |
| `dlm_token_comunicado()` | text | 079:89 | idem para a folha do comunicado |
| `dlm_velar_instantaneo(p_dados jsonb)` | jsonb | 057:411, 058:37 | véu por lista de PERMISSÃO (058:45-49: `tipoEvento, dataEvento, horaInicio, horaFim, local, lugares, subtitulo, cliente, seccoes, linhas, __contrato, __condicoes, __validadeDias`); dentro dos arrays tira `valor`, `inclui`, `itens` (058:66) |
| `dlm_actualizar_campo(p_steps jsonb, p_id text, p_patch jsonb)` | jsonb | 053:190 | aplica um patch a um campo dentro de `event_types.steps`; `immutable` |
| `dlm_inserir_campo_antes(p_steps jsonb, p_campo jsonb, p_ancora text)` | jsonb | 053:133 | insere um campo antes de outro em `steps`; `immutable` |
| `dlm_questionario_conta_campos(p_steps jsonb)` | integer | 063:40 | quantos campos tem o modelo |
| `dlm_questionario_respondido(p_valor jsonb)` | boolean | 063:56 | se um valor conta como resposta |

**Formulários públicos e captação**

| função | devolve | origem | uma linha |
|---|---|---|---|
| `formulario_validar_convite(p_codigo text)` | jsonb | 020:62, 026:451 | valida o código e devolve o convite + `event_types` (nome/steps/icone) + `alvo_dados` |
| `formulario_submeter(p_codigo text, p_payload jsonb)` | jsonb | 020:96, 026:300, redefinida **036**:42 | grava as respostas, marca o convite e converte a reserva numa só transação; a 020 devolve `{id}`, a 036 devolve `{id, cliente_reutilizado}` (036:245-247). Erros de negócio: `CONVITE_INVALIDO`, `CONVITE_JA_USADO`, `EVENTO_ALVO_EM_FALTA` |
| `formulario_briefing(p_id uuid)` | jsonb | 020:334, 026:286 | `{submission, event_type}` para a folha pública `/briefing/:id` |
| `briefing_materiais(p_id uuid)` | jsonb | 031:24 | a ficha de materiais desse evento (nome, categoria, unidade, quantidade, cores, observações e as três listas) |
| `captacao_submeter(p_payload jsonb)` | jsonb | 020:254, 026:112 | cria cliente + evento em `fase='interessado'`, com dedupe; devolve a linha (`to_jsonb(v_sub)`) + `clienteReutilizado`, ou `{id, duplicado:true}` no acerto de data. Levanta `NOME_OBRIGATORIO` |
| `captacao_dedupe(p_digitos text, p_data date default null)` | TABLE(`cliente_id uuid`, `evento_id uuid`) | 026:57, redefinida **043**:26 | acha o cliente e o evento vivo pelos 9 dígitos do telefone, determinístico (mais antigo ganha, `order by created_at asc, id asc`) |
| `importar_cliente(payload jsonb)` | jsonb | 026:477, 028:34, redefinida **044**:40 | importa cliente + eventos + documentos + convite + plano/pagamentos reconstituídos; idempotente por (cliente, data, tipo) |
| `submissao_fundir_respostas(p_id uuid, p_patch jsonb, p_colunas jsonb default '{}')` | jsonb | 038:38 (a versão de 2 args é DROPada em 038:36), redefinida **064**:28 | funde respostas + colunas antigas numa transação e regista a autoria |

**Campanhas de contribuição**

| função | devolve | origem | uma linha |
|---|---|---|---|
| `campanha_publica(p_token text)` | jsonb | 034:27, 042:222, **047**:29 | a projecção pública da campanha (estado, pct, pessoas, …) pelo token |
| `prometer_contribuicao(p_token text, p_nome text, p_valor numeric, p_mensagem text default null)` | jsonb | 035:60 | a única porta pública de escrita: cria uma `campanha_intencoes` pendente |
| `contribuicao_registar(p_submission_id uuid, p_valor numeric, p_metodo text, p_data date, p_contribuinte text default null, p_notas text default null, p_intencao_id uuid default null, p_campanha_id uuid default null)` | jsonb | 039:54 (7 args), **042**:76 (8 args; a de 7 é DROPada em 042:74) | regista o pagamento e confirma a intenção na mesma transação |

**Portal do cliente**

| função | devolve | origem | uma linha |
|---|---|---|---|
| `dlm_portal_abrir(p_submission_id uuid)` | text | 049:87 (`security invoker`), 051:255 | devolve o token do acesso vivo; cria um se não houver, com `expira_em` = data do evento + 30 dias |
| `dlm_portal_revogar(p_submission_id uuid, p_motivo text default 'manual')` | void | 049:123 (`security invoker`) | carimba `revogado_em` + `motivo` no acesso vivo |
| `dlm_portal_acesso_por_token(p_token text)` | `public.portal_acessos` | 057:251 | resolve o acesso a partir do token (exige `length(p_token) >= 16`; valida expiração/revogação) |
| `dlm_portal_sessao(p_acesso_id uuid, p_verificacao uuid)` | `public.portal_verificacoes` | 057:385 | devolve a verificação viva (sessão de 60 min) |
| `dlm_portal_ver(p_token text)` | jsonb | 049:154, redefinida em 050:23, 051:43, 052:65, 054:69, 055:33, 065:139, 067:222, 068:151, 069:223, 070:20, 071:76, 073:21, 076:20, 077:378, 078:286, 082:30, 083:1249, 084:32, **085**:211 | a projecção INTEIRA do portal (jornada, preparação, documentos, fotografias, avaliação, folhas) |
| `dlm_portal_documentos(p_token text)` | jsonb | 057:449, 078:792, 083:790, **086**:172 | a lista dos documentos publicados visíveis nesse portal |
| `dlm_portal_ver_documento(p_token text, p_tipo text, p_verificacao uuid default null, p_versao integer default null)` | jsonb | 057:549, 074:39, 078:159, 083:658, **086**:44 | o instantâneo de uma versão, velado se não houver sessão verificada |
| `dlm_portal_pedir_codigo(p_token text, p_contexto text default null)` | jsonb | 057:272, **061**:53 | cria um pedido de código com âmbito e avisa a Caixa de Entrada |
| `dlm_portal_emitir_codigo(p_verificacao_id uuid)` | text | 057:210, **058**:96 | gera e devolve o código (origem criptográfica) para a Nádia enviar; devolve o existente se ainda válido |
| `dlm_portal_verificar(p_token text, p_codigo text)` | jsonb | 057:331, **058**:138 | valida o código, conta tentativas (5 = morre), abre a sessão |
| `dlm_portal_acto(p_token text, p_tipo text, p_verificacao uuid, p_acto text, p_nome text, p_mensagem text default null, p_versao integer default null)` | jsonb | 057:618 (sem `p_versao`), 058:203, 061:138, 072:24, 075:130, 077:109, 083:985, **086**:315 | grava `aceitou`/`pediu_alteracao`/`assinou` com a prova, carimba `documentos` e avança o funil |
| `dlm_portal_publicar(p_submission_id uuid, p_tipo text, p_extra jsonb default null)` | jsonb | 057:152, 075:66, **088**:28 | valida `p_tipo in ('orcamento','proposta','contrato')` (senão `TIPO_INVALIDO`), congela a versão nova em `portal_publicacoes` (na proposta troca `imagem ← imagemCliente`), carimba `enviado_em` na 1.ª vez; devolve `{versao, publicado_em}`. `security invoker` |
| `dlm_portal_registar_assinado_papel(p_token text, p_caminho text)` | jsonb | 057:755, 058:338, **060**:52 | regista o carregamento da fotografia do contrato assinado e avisa |
| `dlm_portal_confirmar_papel(...)` | jsonb | **059**:57 com assinatura `(p_submission_id uuid, p_nome text, p_caminho text)`, substituída em **060**:126 por `(p_notificacao_id uuid, p_nome text)`, 075:296, 077:276 | a Nádia confirma o papel: grava o acto, carimba `assinado_em` e TRANCA. `security invoker` |
| `dlm_portal_condicoes_lidas(p_token text)` | jsonb | 078:88 | regista a leitura das condições (anon, pré-código) |
| `dlm_portal_questionario(p_token text)` | jsonb | 063:74, **064**:131 | o questionário do portal, com os grupos de prazo e a autoria dos dois lados |
| `dlm_portal_responder(p_token text, p_campo text, p_valor jsonb)` | jsonb | 063:223, **069**:43 | grava uma resposta do cliente e, se completo, entrega o questionário |
| `dlm_portal_pedir_alteracao_campo(p_token text, p_campo text, p_pedido text, p_dados jsonb default null)` | jsonb | 063:397, **074**:123 | cria um `questionario_pedidos` quando o prazo do grupo já passou |
| `dlm_portal_entregar_questionario(p_token text)` | jsonb | 063:348 | carimba `submissions.questionario_entregue_em` |
| `dlm_portal_avaliacao(p_token text)` | jsonb | 067:37, **068**:61 | os eixos aplicáveis e as fotografias para a avaliação |
| `dlm_portal_avaliar(p_token text, p_frase text, p_eixos jsonb, p_fotografia text default null, p_autorizar boolean default false, p_nome_como text default 'completo')` | jsonb | 067:122 | grava a avaliação (uma por evento) e entra em despedida |
| `dlm_portal_confirmar_sinal(p_token text, p_metodo text default null)` | jsonb | 083:431 | cria a `portal_sinal_confirmacoes` viva (não reserva o dia) |

**Funil e sinal (backoffice)**

| função | devolve | origem | uma linha |
|---|---|---|---|
| `dlm_fase_avancar_ate(p_submission_id uuid, p_fase text)` | void | 075:31, **077**:73 | avança a fase só para a frente, pela ordem `{interessado, orcamento, sinal, contrato, cliente, projecto}` (077:82-83) |
| `dlm_dia_estado(p_data date, p_excluir uuid default null)` | jsonb | 083:188 | a definição ÚNICA do estado de um dia: `tomado` · `preferencia` · livre. `stable` |
| `dlm_registar_sinal(p_submission uuid, p_valor numeric, p_data date, p_metodo text, p_contribuinte text default null, p_notas text default null, p_forcar boolean default false)` | jsonb | 083:310 | regista o sinal e toma o dia, com guarda de disputa (`p_forcar`) |

**Comunicados**

| função | devolve | origem | uma linha |
|---|---|---|---|
| `dlm_comunicado_publicar(p_id uuid)` | text | 079:105 | gera o token e carimba `publicado_em`; devolve o token |
| `dlm_comunicado_retirar(p_id uuid)` | void | 079:134 | carimba `retirado_em` + `actualizado_em` |
| `dlm_comunicado_ver(p_token text)` | jsonb | 079:150, 080:136, **085**:930 | a projecção pública da folha (com `registo` e `saudacao`); resposta única `{estado:'terminado'}` para inexistente/retirada/expirada; incrementa `n_acessos`. `revoke all … from public` + `grant execute … to anon` — **de propósito não é concedida a `authenticated`** (080:169-172) |

---

### 4.35 BUCKETS DE STORAGE

| bucket (id = name) | público? | origem | notas |
|---|---|---|---|
| `referencias` | **público** | **criado no painel** — `insert into storage.buckets` **não existe** no repo | imagens de referência da captação; INSERT anónimo mantido de propósito (021:21-22, 056:25-27). Uso: `src/lib/captacao.js:16` |
| `propostas` | **público** | **criado no painel** — não existe DDL no repo | `src/lib/propostas.js:10` |
| `materiais` | **público** | **criado no painel** — não existe DDL no repo | `src/lib/materiais.js:319`. `limpeza_dados_teste.sql:93`: «O bucket "materiais" NÃO se toca (inventário)» |
| `contratos-assinados` | **privado** (`public = false`) | **057**:739-741 | INSERT para `anon, authenticated` (057:743-746); SELECT só `authenticated` (057:748-751). Uso: `src/lib/portal.js:272,328` |
| `fotografias` | **público** (`public = true`) | **065**:40-42 | insert/select/delete só `authenticated` (065:47-60); o `anon` não tem política nenhuma. Guarda dinâmica contra políticas SELECT anónimas herdadas em 065:66-81. Uso: `src/lib/fotografias.js:21` |
| `comunicados` | **público** (`public = true`) | **080**:184-186 | `for all to authenticated` (080:188-192); sem select para `anon` — a folha lê por URL directo. Uso: `src/lib/comunicados.js:746` |

A **056** (`056_storage_sem_listagem_anonima.sql:44-72`) apaga dinamicamente todas as políticas de SELECT em `storage.objects` que abranjam `anon`/`public` e toquem em `referencias`, `propostas` ou `materiais` (recriando-as só para `authenticated` quando serviam mais papéis) — fechando a listagem anónima sem fechar o GET directo por URL. Não toca em INSERT/UPDATE/DELETE (056:25-26).

---

## 5. RLS

Fonte: varrimento de `docs/migracoes/` (74 ficheiros `.sql`). Todas as linhas citadas são relativas à raiz do repo.

### 5.1 Tabela por tabela

**Bloco base — migração `021_rls_bloquear_anon.sql`.** Um `do $$ ... $$` (linhas 30-79) percorre o array `tabelas` (linhas 33-45, 11 nomes) e, para cada tabela que exista: activa RLS (`021:54`), **apaga TODAS as políticas pré-existentes** (`021:56-62`) e cria uma só (`021:64-66`). Depois — já fora do ciclo, e por isso a salvo do `drop` — acrescenta duas excepções nominais (`021:70-78`). O cabeçalho declara explicitamente que **não mexe em grants**: «grants/roles: o RLS por si já nega; não mexemos em grants» (`021:23`), e que não mexe em storage: «o bucket "referencias" mantém upload público — o formulário /interesse precisa dele» (`021:21-22`).

| tabela | RLS activa? | políticas (nome · comando · to · using/with check) | grants a `authenticated` | grants/revokes a `anon` | ficheiro:linha |
|---|---|---|---|---|---|
| `clientes` | sim | `"admin acesso total"` · ALL · authenticated · `using (true) with check (true)` | não existe (grant explícito) | não existe | `021:34,54,64-66` |
| `submissions` | sim | idem | não existe | não existe | `021:35,54,64-66` |
| `invites` | sim | idem | não existe | não existe | `021:36,54,64-66` |
| `reservas` | sim | idem | não existe | não existe | `021:37,54,64-66` |
| `event_types` | sim | `"admin acesso total"` · ALL · authenticated · `using (true) with check (true)` **+** `"publico le tipos de evento"` · SELECT · **anon** · `using (true)` | não existe | política de SELECT aberta (`using (true)`); grant não existe | `021:38,54,64-66,71-72` |
| `materiais` | sim | `"admin acesso total"` · ALL · authenticated · `using/with check (true)` | não existe | não existe | `021:39,54,64-66` |
| `evento_materiais` | sim | idem | não existe | não existe | `021:40,54,64-66` |
| `mensagens_tipo` | sim | idem | não existe | não existe | `021:41,54,64-66` |
| `documentos` | sim | idem | não existe | não existe | `021:42,54,64-66` |
| `app_config` | sim | idem | não existe | não existe | `021:44,54,64-66` |
| `form_errors` | sim (duas vezes) | **021**: `"admin acesso total"` · ALL · authenticated · `(true)` **+** `"publico regista erros"` · INSERT · **anon** · `with check (true)`. **form_errors.sql**: `"inserir erros"` · INSERT · anon+authenticated · `with check (true)`; `"ler erros"` · SELECT · anon+authenticated · `using (true)`; `"apagar erros"` · DELETE · anon+authenticated · `using (true)` | `grant select, insert, delete` | `grant select, insert, delete on public.form_errors to anon` | `021:43,54,76-77` e `form_errors.sql:21,26-36,40` |
| `notificacoes` | sim | `"admin acesso total"` · ALL · authenticated · `using (true) with check (true)` | `grant select, insert, update, delete` | não existe | `022:103,105-107,111` |
| `pagamentos_previstos` | sim | `"admin acesso total"` · ALL · authenticated · `using/with check (true)` | não existe | não existe | `025:89,92-93` |
| `pagamentos` | sim | `"admin acesso total"` · ALL · authenticated · `using/with check (true)` | não existe | não existe | `025:90,95-96` |
| `notas_evento` | sim | `"admin acesso total"` · ALL · authenticated · `using/with check (true)` | não existe | não existe | `029:55,57-58` |
| `campanhas` | sim | `"admin acesso total"` · ALL · authenticated · `using/with check (true)` (criada dentro de `do $$` com guarda `if not exists`) | não existe | não existe | `033:57,59-70` |
| `campanha_intencoes` | sim | `"admin acesso total"` · ALL · authenticated · `using/with check (true)` (idem, com guarda) | não existe | não existe | `035:44,46-57` |
| `portal_acessos` | sim | `"admin acesso total"` · ALL · authenticated · `using/with check (true)` | não existe | não existe | `049:74,77-79` |
| `portal_publicacoes` | sim | `"admin acesso total"` · ALL · authenticated · `using/with check (true)` | não existe | não existe | `057:94,98-100` |
| `portal_verificacoes` | sim | `"admin acesso total"` · ALL · authenticated · `using/with check (true)` | não existe | não existe | `057:95,101-103` |
| `portal_actos` | sim | `"admin acesso total"` · ALL · authenticated · `using/with check (true)` | não existe | não existe | `057:96,104-106` |
| `questionario_grupos` | sim | `"admin acesso total"` · ALL · authenticated · `using/with check (true)` | `grant select, insert, update, delete` | `revoke all ... from anon` | `062:78,79-81,82,172` |
| `respostas_autoria` | sim | `"admin acesso total"` · ALL · authenticated · `using/with check (true)` | não existe (grant explícito) | `revoke all ... from anon` | `062:107,108-110,173` |
| `questionario_pedidos` | sim | `"admin acesso total"` · ALL · authenticated · `using/with check (true)` | `grant select, insert, update, delete` | `revoke all ... from anon` | `062:159,160-162,163,174` |
| `evento_fotografias` | sim | `"admin acesso total"` · ALL · authenticated · `using/with check (true)` | `grant select, insert, update, delete` | `revoke all ... from anon` | `065:122,123-125,126,129` |
| `avaliacao_eixos` | sim | `"admin acesso total"` · ALL · authenticated · `using/with check (true)` | `grant select, insert, update, delete` | `revoke all ... from anon` | `066:113,114-116,117,118` |
| `avaliacoes` | sim | `"admin acesso total"` · ALL · authenticated · `using/with check (true)` | `grant select, insert, update, delete` | `revoke all ... from anon` | `066:164,165-167,168,169` |
| `portal_condicoes_lidas` | sim | **só uma**: `"admin le as leituras"` · **SELECT** · authenticated · `using (true)`. Sem política de INSERT/UPDATE/DELETE — comentário em `078:72-74`: «A escrita entra SÓ pela RPC security definer — sem policy de insert, nem o anon nem o authenticated tocam na mesa directamente.» | não existe | não existe | `078:70,75-77` |
| `comunicados` | sim | `comunicados_equipa` · ALL · authenticated · `using (true) with check (true)` | não existe | não existe | `079:79,81-83` |
| `comunicado_destinatarios` | sim | `comunicado_destinatarios_equipa` · ALL · authenticated · `using/with check (true)` | não existe | não existe | `080:109,111-113` |
| `comunicado_modelos` | sim | `comunicado_modelos_equipa` · ALL · authenticated · `using/with check (true)` | não existe | não existe | `081:77,79-81` |
| `portal_sinal_confirmacoes` | sim | **duas**: `"admin le as confirmacoes"` · SELECT · authenticated · `using (true)`; `"admin anula confirmacoes"` · UPDATE · authenticated · `using (true) with check (true)`. Sem política de INSERT — comentário em `083:138-141` | não existe | não existe | `083:136,142-148` |

**Vista** (não é tabela, mas partilha o perímetro):

| objecto | protecção | ficheiro:linha |
|---|---|---|
| `public.v_destinatarios_possiveis` | `alter view ... set (security_invoker = true)` + `revoke all ... from anon, public` + `grant select ... to authenticated` | `080:210-237` (definição), `080:252,254,255` (protecção); justificação em `080:243-251` |

**Nenhuma das 22 tabelas criadas nas migrações fica sem `enable row level security`.** Verificado por cruzamento de `create table` (22 ocorrências, incluindo `form_errors.sql:11`) com `enable row level security` (23 ocorrências: 22 nominais, uma por tabela criada, mais a dinâmica em `021:54` que cobre as 11 do array). No total, **32 tabelas** têm política declarada no repo.

---

### 5.2 O mecanismo de acesso público sem sessão

O padrão é **uniforme e explícito**: o `anon` **não tem uma única política de leitura** em nenhuma tabela de negócio (a única política SELECT concedida ao `anon` em todo o repo é `"publico le tipos de evento"` em `event_types`, `021:71-72`; a de `form_errors.sql:31-32` é o caso em conflito, ver 5.5.4). Tudo o resto passa por **funções `SECURITY DEFINER` com `set search_path = public`**, sobre as quais se faz `revoke all ... from public` seguido de `grant execute ... to anon`. A função corre com os privilégios do dono e **ignora o RLS**; o controlo de acesso está inteiramente **dentro do corpo da função**, sob a forma de um segredo passado por argumento.

Declaração de intenção no cabeçalho da 020 (`020:9-12`): «hoje o papel anon (a chave pública do site) consegue ler e alterar TODAS as tabelas. Estas funções SECURITY DEFINER passam a ser a única porta dos formulários públicos; a migração 021 fecha depois o acesso directo às tabelas.»

Existem **quatro segredos distintos**, cada um com o seu guarda:

**(a) O token do portal — `portal_acessos.token`**

- Gerado por `public.dlm_token_portal()` (`049:26-33`, `language sql volatile`, `set search_path = public, extensions`): `select translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');` (`049:32`) — 24 bytes aleatórios, 32 caracteres base64url. Comentário `049:35-37`: «Não deriva do id do evento — reverter é impossível por desenho.»
- Coluna `token text not null unique default public.dlm_token_portal()` (`049:46`), com índice único parcial «Um só acesso vivo por evento» (`049:66-69`).
- O guarda partilhado é `public.dlm_portal_acesso_por_token(p_token text) returns public.portal_acessos`, `language sql stable security definer` (`057:251-263`):
  ```sql
  select a.* from public.portal_acessos a
   where a.token = p_token
     and length(coalesce(p_token, '')) >= 16
     and a.revogado_em is null
     and (a.expira_em is null or a.expira_em > now());
  ```
  Esta função é **interna**: `revoke all on function public.dlm_portal_acesso_por_token(text) from public, anon;` (`057:265`) e **nunca recebe grant** — comentário `057:266`: «(interna: só as definer a chamam; nem o anon nem o authenticated precisam)». É chamada em **36 sítios**, em 16 ficheiros de migração (057, 058, 060, 061, 063, 064, 067, 068, 069, 072, 074, 075, 077, 078, 083, 086).
- Toda a RPC pública do portal começa por `v_acesso := public.dlm_portal_acesso_por_token(p_token); if v_acesso.id is null then return jsonb_build_object('estado', 'terminado'); end if;` — token inexistente, revogado ou expirado dá **a mesma resposta** que um token válido de evento apagado (`'terminado'`), sem distinguir os casos.
- Excepção notável: `dlm_portal_ver(text)` **não** usa o helper; faz a verificação em linha, com a mesma lógica (`085:274-285`): `if p_token is null or length(p_token) < 16 then return ... 'terminado'`, depois `select * into v_acesso from public.portal_acessos where token = p_token;` e `if not found or v_acesso.revogado_em is not null or (v_acesso.expira_em is not null and v_acesso.expira_em < now()) then return ... 'terminado'`.
- Além do token, as projecções aplicam **portões de negócio** antes de devolver. Em `dlm_portal_ver_documento` (`086:78-90`): para `p_tipo in ('contrato','proposta')` calcula `v_sinal_feito := v_fase in ('contrato','cliente','projecto') or exists (select 1 from public.pagamentos p where p.submission_id = v_acesso.submission_id and p.origem = 'sinal')` e, se falso, devolve `'nada'` — indistinguível de «nunca publicado». O mesmo portão está em `dlm_portal_documentos` (`086:198-202`).

**(b) O código de verificação — `portal_verificacoes.codigo`** (segunda camada, sobre o token)

- `dlm_portal_pedir_codigo(text, text)` (definer, `061:53-126`) valida o token (`061:69-72`), actualiza o contexto se houver pedido por atender (`061:78-91`), mata o código vivo anterior incluindo a sessão que ele abriu (`061:97-103`), insere um pedido (`061:105-107`) e cria uma notificação `'codigo_pedido'` para o backoffice (`061:112-122`). O código em si é emitido do lado autenticado por `dlm_portal_emitir_codigo(uuid)` — **`security invoker`** (`058:96-132`, cláusula em `058:99`), `revoke ... from public, anon` + `grant ... to authenticated` (`058:134-135`); a 058 trocou `random()` por `gen_random_bytes(4)` (`058:116-119`) contra o `floor(random() * 1000000)` da 057 (`057:229`).
- `dlm_portal_verificar(text, text)` (definer, `058:138-192`) exige, em simultâneo: `codigo = btrim(coalesce(p_codigo, ''))`, `emitido_em is not null`, `tentativas < 5` (`058:161`), e `(usado_em is null and expira_em > now()) or (usado_em is not null and usado_em > now() - interval '60 minutes')`. Falhar incrementa `tentativas` no código vivo (`058:172-178`); à quinta, morre.
- `dlm_portal_sessao(uuid, uuid)` (definer, `057:385-399`) traduz `(acesso_id, verificacao_id)` numa sessão viva (`usado_em is not null and usado_em > now() - interval '60 minutes'`). Também é **interna**: `revoke all ... from public, anon` em `057:401`, sem grant.
- **A partir da 086 o código deixou de ser obrigatório para assinar.** Cabeçalho `086:27-28`: «dlm_portal_acto reescrita da 083 com UM delta: o bloco que exigia sessão ao 'assinou' desaparece (peça 4)». Em `dlm_portal_acto` (`086:346`): `v_sessao := public.dlm_portal_sessao(v_acesso.id, p_verificacao);` sem `if` a seguir, e `086:392-393`: «Sem sessão, v_sessao.id é NULL e o acto regista-se assim — o CHECK morreu na peça 3; a prova é a da ligação, com IP e user-agent.» A restrição foi mesmo removida: `alter table public.portal_actos drop constraint if exists portal_actos_tem_prova;` (`086:300-301`). O véu de valores morreu na mesma migração (`086:35-42`).

**(c) O código de convite — `invites.code`**

- `formulario_validar_convite(p_codigo text)`, `language sql security definer` (`020:62-86`): `where i.code = upper(btrim(p_codigo)) limit 1` (`020:84-85`). Devolve `to_jsonb(i)` (a linha inteira do convite) mais `event_types.{nome,steps,icone}` e `alvo_dados.{respostas, data_evento, numero_convidados}` da submission-alvo (`020:68-82`).
- `formulario_submeter(text, jsonb)` (definer, `020:96`; redefinida em `036`) e `captacao_submeter(jsonb)` (definer, `020:254`) são as portas de escrita.

**(d) O token do comunicado — `comunicados.token`**

- Coluna `token text unique` (`079:43`, «null enquanto não for publicada»), gerada por `dlm_token_comunicado()` (`079:89`), com `set search_path = public, extensions` (nota `079:197-202`: a função é chamada por `dlm_comunicado_publicar`, que corre como INVOKER). `revoke all ... from public` (`079:189`) + `grant execute ... to authenticated` (`079:203`).
- `dlm_comunicado_ver(p_token text)` (definer, `085:930-963`): `where token = p_token and publicado_em is not null` (`079:943-944`), depois `if not found or r.retirado_em is not null or (r.expira_em is not null and r.expira_em < now()) then return jsonb_build_object('estado','terminado')` (`085:946-950`). Faz `update ... set n_acessos = n_acessos + 1` (`085:952`) e devolve **apenas** `estado, titulo, subtitulo, saudacao, registo, blocos` (projecção explícita, `085:954-961` — nunca a linha inteira).

**(e) O uuid como chave** — duas funções fogem ao padrão do token opaco:
- `formulario_briefing(p_id uuid)` (definer, `020:334-346`): `where s.id = p_id`, devolve `jsonb_build_object('submission', to_jsonb(s), 'event_type', to_jsonb(et))` — a submission **inteira** (`020:340-342`). Comentário `020:332-333`: «O id (uuid não adivinhável) é a chave de acesso, como sempre foi — mas deixa de ser preciso SELECT anónimo à tabela inteira.»
- `briefing_materiais(p_id uuid)` (definer, `031:24-52`): `where em.submission_id = p_id`, projecção explícita de campos (`031:33-44`). Comentário `031:20-21`: «Um id de evento só revela a ficha desse evento — a mesma superfície que a folha já revela.»

**O sentido inverso — o que o `anon` explicitamente NÃO pode chamar.** O padrão espelho é `revoke all on function ... from public, anon;` + `grant execute ... to authenticated;`, aplicado às funções do backoffice: `submissao_fundir_respostas(uuid, jsonb, jsonb)` (`064:122-123`, antes `038:120-121`), `contribuicao_registar(uuid, numeric, text, date, text, text, uuid, uuid)` (`042:216-217`), `importar_cliente(jsonb)` (`044:199-200`), `dlm_portal_abrir(uuid)` / `dlm_portal_revogar(uuid, text)` (`049:337-340`), `dlm_portal_publicar(uuid, text, jsonb)` (`088:117-118`), `dlm_portal_emitir_codigo(uuid)` (`058:134-135`), `dlm_fase_avancar_ate(uuid, text)` (`077:102-105`), `dlm_dia_estado(date, uuid)` (`083:273-274`), `dlm_registar_sinal(uuid, numeric, date, text, text, text, boolean)` (`083:410-411`), `dlm_comunicado_publicar(uuid)` / `dlm_comunicado_retirar(uuid)` (`079:190-195`). Caso à parte: `dlm_portal_confirmar_papel(uuid, text)` tem grant a `authenticated` em `060:217`, mas as redefinições posteriores só repetem o `revoke` (`075:393`, `077:373`) — sem re-grant, que o `create or replace` torna desnecessário.

---

### 5.3 O perímetro público real: funções com `grant execute ... to anon`

Estado final por assinatura (a linha citada é a **última** concessão no repo; entre parêntesis, as anteriores).

| # | função (assinatura exacta) | security | grant a | ficheiro:linha (último) | o que verifica antes de devolver |
|---|---|---|---|---|---|
| 1 | `public.dlm_txt(jsonb, text)` | (immutable, sem cláusula security) | anon, authenticated | `020:349` | helper puro; não toca em tabelas |
| 2 | `public.dlm_safe_int(text)` | idem | anon, authenticated | `020:350` | helper puro |
| 3 | `public.dlm_safe_time(text)` | idem | anon, authenticated | `020:351` | helper puro |
| 4 | `public.dlm_safe_date(text)` | idem | anon, authenticated | `020:352` | helper puro |
| 5 | `public.dlm_safe_uuid(text)` | idem | anon, authenticated | `020:353` | helper puro |
| 6 | `public.dlm_txt_array(jsonb, text)` | idem | anon, authenticated | `020:354` | helper puro |
| 7 | `public.formulario_validar_convite(text)` | definer | anon, authenticated | `020:355` | `i.code = upper(btrim(p_codigo))`. Sem outro guarda |
| 8 | `public.formulario_submeter(text, jsonb)` | definer | anon, authenticated | `036:253` (`020:356`) | código de convite; erros `CONVITE_INVALIDO`/`CONVITE_JA_USADO`/`EVENTO_ALVO_EM_FALTA` (`020:94-95`) |
| 9 | `public.captacao_submeter(jsonb)` | definer | anon, authenticated | `020:357` | porta pública do `/interesse` |
| 10 | `public.formulario_briefing(uuid)` | definer | anon, authenticated | `020:358` | só `s.id = p_id`. Devolve `to_jsonb(s)` inteiro |
| 11 | `public.briefing_materiais(uuid)` | definer | anon, authenticated | `031:55` | só `em.submission_id = p_id`. Projecção explícita |
| 12 | `public.campanha_publica(text)` | definer, stable | anon, authenticated | `047:71` (`034:63`, `042:258`) | `c.token = p_token`. Projecção agregada (`estado`, `pct`, `pessoas`, `mensagem`, `como_contribuir`, `tipo_evento`, `data_evento`) |
| 13 | `public.prometer_contribuicao(text, text, numeric, text)` | definer | anon, authenticated | `035:108-109` | `token = p_token and estado = 'ativa'`; `nome` não vazio; `0 < valor <= 99999`; máx. 200 intenções pendentes (`035:75-94`) |
| 14 | `public.captacao_dedupe(text, date)` | definer | anon, authenticated | `043:94` | `length(v_digitos) >= 9` (últimos 9 dígitos do telefone, `043:33,38-40`). Comentário `043:88-92`: «o anon fica (o fallback da captação pública em captacao.js ainda a chama diretamente do browser) […] Quando o fallback público for removido, retirar o anon» |
| 15 | `public.dlm_portal_ver(text)` | definer | anon, authenticated | `085:911` (049, 050, 051, 052, 054, 055, 065, 067, 068, 069, 070, 071, 073, 076, 077, 078, 082, 083, 084) | token ≥16, não revogado, não expirado (`085:274-285`) |
| 16 | `public.dlm_portal_pedir_codigo(text, text)` | definer | anon, authenticated | `061:129` (`057:325`) | `dlm_portal_acesso_por_token`; idempotente por acesso |
| 17 | `public.dlm_portal_verificar(text, text)` | definer | anon, authenticated | `058:195` (`057:381`) | token + código emitido + `tentativas < 5` + janela de validade/60 min |
| 18 | `public.dlm_portal_documentos(text)` | definer | anon, authenticated | `086:287` (`057:540`, `078:903`, `083:903`) | token; portão do sinal (`086:198-202`); projecção explícita da lista, `precisa_codigo` fixo a `false` (`086:213`) |
| 19 | `public.dlm_portal_ver_documento(text, text, uuid, integer)` | definer | anon, authenticated | `086:160` (`057:613`, `074:117`, `078:275`, `083:779`) | token + portão do sinal para `contrato`/`proposta` (`086:78-90`) |
| 20 | `public.dlm_portal_acto(text, text, uuid, text, text, text, integer)` | definer | anon, authenticated | `086:473` (`058:315`, `061:258`, `072:175`, `075:293`, `077:273`, `083:1155`) | token; `length(btrim(p_nome)) >= 3` (`086:348`); acto ∈ `aceitou`/`pediu_alteracao`/`assinou` com combinações de tipo válidas (`086:352-359`); versão em vigor tem de bater com `p_versao` (`086:372-374`); `ja_feito` se já existe (`086:376-381`). **Sessão opcional desde a 086** |
| 21 | `public.dlm_portal_registar_assinado_papel(text, text)` | definer | anon, authenticated | `060:119` (`057:792`, `058:397`) | token + caminho não vazio + confirma que o objecto existe em `storage.objects` no balde `contratos-assinados` **e foi criado há menos de 30 minutos** (`060:74-81`) |
| 22 | `public.dlm_portal_questionario(text)` | definer | anon, authenticated | `064:276` (`063:214`) | token |
| 23 | `public.dlm_portal_responder(text, text, jsonb)` | definer | anon, authenticated | `069:211` (`063:340`) | token; grava autoria e notifica |
| 24 | `public.dlm_portal_pedir_alteracao_campo(text, text, text, jsonb)` | definer | anon, authenticated | `074:197` | token. (A assinatura de 3 args foi concedida em `063:466` e **apagada** em `074:121`) |
| 25 | `public.dlm_portal_avaliacao(text)` | definer | anon, authenticated | `068:146` (`067:117`) | token |
| 26 | `public.dlm_portal_avaliar(text, text, jsonb, text, boolean, text)` | definer | anon, authenticated | `067:214` | token |
| 27 | `public.dlm_portal_condicoes_lidas(text)` | definer | anon, authenticated | `078:148` | token; exige publicação de `orcamento` (`078:107-114`); uma leitura por evento (`078:119-126`). Comentário `078:84-86`: «Sem código e sem sessão DE PROPÓSITO: o pórtico vem antes de tudo» |
| 28 | `public.dlm_portal_confirmar_sinal(text, text)` | definer | anon, authenticated | `083:574` | token; `fase <> 'perdido'` (`083:456`); sinal ainda não feito (`083:463-471`); data não passada (`083:475-477`); `pg_advisory_xact_lock` por dia (`083:485-489`); reconfere `dlm_dia_estado` no clique (`083:492-501`) |
| 29 | `public.dlm_comunicado_ver(text)` | definer | **anon apenas** | `085:966` (`079:211`, `080:170`) | `token = p_token and publicado_em is not null`, não retirado, não expirado. Nota `085:967-968`: «Continua a NÃO ser concedida a authenticated, de propósito: a função conta uma leitura, e uma espreitadela do backoffice não pode contar como visita» |

**Total: 29 assinaturas com `execute` ao `anon`** — 6 helpers puros de conversão e 23 funções que tocam em dados.

**Excepções ao padrão `revoke ... from public` antes do grant:** as dez concessões de `020:349-358` (os 6 helpers + `formulario_validar_convite`, `formulario_submeter`, `captacao_submeter`, `formulario_briefing`) **nunca recebem `revoke ... from public` em migração nenhuma** — mantêm o `execute` a `public` herdado dos default privileges. O mesmo em `036:253`, com nota explícita (`036:251-252`): «CREATE OR REPLACE preserva os grants existentes; repetir o grant é inofensivo e deixa o ficheiro completo por si só.»

Assinaturas que já **saíram** do perímetro: `public.dlm_portal_acto(text, text, uuid, text, text, text)` — 6 args, concedida em `057:729`, revogada em `058:313` e apagada em `058:318`; `public.dlm_portal_pedir_alteracao_campo(text, text, text)` — concedida em `063:466`, apagada em `074:121`; `public.dlm_portal_entregar_questionario(text)` — concedida em `063:389` e apagada em `069:216` («A função que ninguém chamava», `069:214`).

Funções `security definer` **sem grant nenhum** (só chamáveis de dentro de outras definer): `public.dlm_portal_acesso_por_token(text)` (`057:265`) e `public.dlm_portal_sessao(uuid, uuid)` (`057:401`).

Funções **sem `grant`/`revoke` explícito em migração nenhuma** (herdam os default privileges do Supabase, que incluem `execute` a `public`): `dlm_token_portal()` (`049:26`), `dlm_velar_instantaneo(jsonb)` (`057:411`, `058:37`), `dlm_questionario_conta_campos(jsonb)` (`063:40`), `dlm_questionario_respondido(jsonb)` (`063:56`), `dlm_inserir_campo_antes(...)` (`053:133`), `dlm_actualizar_campo(...)` (`053:190`), `dlm_marcar_preenchido()` (`048:34`, trigger), `dlm_travar_documento_trancado()` (`057:124`, trigger), `dlm_notificar_captacao()` (`022:50`, `024:29`, `026:189`, trigger), `documentos_set_updated_at()` (`026:276`, trigger), `_ajustar_registo(regclass, jsonb)` (`026:24`).

Nenhuma migração menciona `service_role` — **não existe** referência a esse papel em lado nenhum do repo (grep a todo o repositório, excluindo `node_modules`: zero ocorrências).

---

### 5.4 Storage

**Baldes criados por migração no repo (3):**

| balde | `public` | políticas em `storage.objects` (nome · comando · to · using/with check) | ficheiro:linha |
|---|---|---|---|
| `contratos-assinados` | `false` (privado) | `"portal envia contrato assinado"` · INSERT · **anon, authenticated** · `with check (bucket_id = 'contratos-assinados' and name like 'papel\_%' and length(name) between 12 and 120)`. `"admin le contratos assinados"` · SELECT · authenticated · `using (bucket_id = 'contratos-assinados')` | `057:739-751`; endurecido em `058:329-336` |
| `fotografias` | `true` | `"equipa carrega fotografias"` · INSERT · authenticated · `with check (bucket_id='fotografias')`; `"equipa ve fotografias"` · SELECT · authenticated · `using (bucket_id='fotografias')`; `"equipa apaga fotografias"` · DELETE · authenticated · `using (bucket_id='fotografias')`. **Nenhuma política para `anon`** | `065:40-60` |
| `comunicados` | `true` | `comunicados_img_equipa_escreve` · **ALL** · authenticated · `using (bucket_id='comunicados') with check (bucket_id='comunicados')`. Nenhuma política para `anon` | `080:184-192` |

**Baldes usados pela app mas cujas políticas NÃO estão no repo — criadas no painel:** `referencias` (`src/lib/captacao.js:16`), `propostas` (`src/lib/propostas.js:10`), `materiais` (`src/lib/materiais.js:319`). Não existe nenhum `insert into storage.buckets` nem `create policy` nominal para estes três em migração nenhuma (os únicos três `insert into storage.buckets` do repo são `057:739`, `065:40`, `080:184`).

O que os comentários do código **afirmam** sobre elas:
- `056:22-23`: «Dinâmico porque os nomes das políticas foram criados no painel e não os conhecemos; assim não depende de adivinhar nomes.»
- `056:4-8` (o achado): «um POST anónimo a `/storage/v1/object/list/{balde}` devolve a lista de ficheiros dos TRÊS baldes — referencias, propostas e materiais. Qualquer pessoa com a chave pública (que está no JavaScript do site) enumera as imagens de todas as clientes.»
- `056:11-15` (o que fica como está): «os baldes continuam públicos — o GET directo de um objecto por URL não passa pelas políticas, e o portal serve as imagens tal e qual; os nomes dos ficheiros são `ref_{timestamp}_{aleatório}.jpg`, sem id de evento — inadivinháveis SE a lista estiver fechada.»
- `056:25-26`: «O que NÃO se toca: INSERT (a captação pública faz upload anónimo das imagens de referência — tem de continuar), UPDATE e DELETE.»
- `056:28-29`: «A app não usa .list()/.download() em lado nenhum (verificado por grep), por isso nenhum ecrã perde nada.»

A correcção da 056 é um `do $$` dinâmico (`056:44-74`): apaga toda a política SELECT em `storage.objects` cujo `roles` intersecte `{anon, public}` e cujo `qual` mencione `referencias`, `propostas` ou `materiais`; se a política servia também `authenticated`/`public`, recria-a com `for select to authenticated using (<qual original>)`. A 065 repete a guarda para o balde `fotografias` (`065:66-81`), com nota (`065:62-65`): «Guarda contra o passado […] Copiado da 056, que teve de descobrir as políticas dinamicamente porque foram criadas no painel e ninguém sabe os nomes.»

`080:177-178` afirma o mesmo princípio para o balde `comunicados`: «A folha é pública, logo a imagem tem de ser legível por URL. O que NÃO pode é ser enumerável: sem política de select para o anon, ninguém lista o balde.»

`limpeza_dados_teste.sql:77-85` diz que «o Supabase já não permite DELETE direto em storage.objects (trigger protect_delete). As imagens de teste limpam-se pelo DASHBOARD: Storage → bucket → selecionar tudo → Delete», para os cinco baldes (`referencias`, `propostas`, `contratos-assinados`, `fotografias`, `comunicados`) — ou seja, não há caminho SQL versionado para os apagar.

---

### 5.5 Riscos e observações factuais

1. **Nenhuma tabela sem RLS.** As 22 tabelas criadas em migrações e as 11 do array da 021 têm todas `enable row level security` (32 tabelas distintas, contando a sobreposição de `form_errors`). Não encontrei tabela alguma sem activação.

2. **`using (true)` é a regra, não a excepção, para `authenticated`.** 30 das 32 tabelas com política têm `"admin acesso total"`/`*_equipa` · ALL · `authenticated` · `using (true) with check (true)`. Consequência factual: qualquer sessão autenticada no projecto Supabase lê e escreve tudo — não há segmentação por utilizador dentro do papel `authenticated`. As únicas tabelas onde `authenticated` **não** tem acesso total são `portal_condicoes_lidas` (só SELECT) e `portal_sinal_confirmacoes` (SELECT + UPDATE).

3. **`event_types` é legível pelo `anon` sem qualquer filtro** — `"publico le tipos de evento"` · SELECT · anon · `using (true)` (`021:71-72`). Isto expõe as colunas `nome`, `steps`, `icone` e todas as outras da tabela, incluindo o conteúdo integral de `steps` (o modelo do questionário).

4. **`form_errors` — conflito por resolver entre dois ficheiros.** `form_errors.sql` (sem número, data `Jul 19 03:28`, igual à da 020/021) cria três políticas que dão ao `anon` **SELECT e DELETE** sobre a tabela inteira (`form_errors.sql:30-36`) e um `grant select, insert, delete ... to anon, authenticated` (`form_errors.sql:40`). O próprio comentário assume-o (`form_errors.sql:23-25`): «o admin usa a mesma chave anon, por isso leitura e limpeza também ficam abertas — alinhado com as restantes tabelas do projeto». A 021 apaga todas as políticas de `form_errors` (`021:56-62`) e recria só `"admin acesso total"` + `"publico regista erros"` (INSERT). **Não confirmado**: qual das duas correu por último na base de dados real — o repo não tem ordenação para o ficheiro sem número e a 021 declara explicitamente que não mexe em grants (`021:23`), pelo que o `grant ... to anon` de `form_errors.sql:40` sobrevive em qualquer cenário. Se as políticas da `form_errors.sql` estiverem em vigor, o `anon` lê e apaga o conteúdo de `form_errors` — que, por desenho, contém `respostas jsonb` («o formData no momento da falha (recuperação!)», `form_errors.sql:18`), `contexto jsonb` («convite, event_type, passo, url, user agent», `form_errors.sql:17`) e `detalhe jsonb` («erro completo (code, details, hint do PostgREST)», `form_errors.sql:16`).

5. **Defesa em camada única para a esmagadora maioria das tabelas.** Só **6** tabelas têm `revoke all ... from anon` explícito: `questionario_grupos` (`062:172`), `respostas_autoria` (`062:173`), `questionario_pedidos` (`062:174`), `evento_fotografias` (`065:129`), `avaliacao_eixos` (`066:118`), `avaliacoes` (`066:169`). As restantes **26** não têm revoke ao `anon` no repo — as 11 do array da 021 (porque a 021 declara que não mexe em grants, `021:23`) e as 15 criadas depois dela: `notas_evento`, `campanhas`, `campanha_intencoes`, `pagamentos`, `pagamentos_previstos`, `notificacoes`, `portal_acessos`, `portal_publicacoes`, `portal_verificacoes`, `portal_actos`, `comunicados`, `comunicado_destinatarios`, `comunicado_modelos`, `portal_condicoes_lidas`, `portal_sinal_confirmacoes`. O grant de tabela herdado dos default privileges do Supabase mantém-se e a negação assenta **só** no RLS. O precedente de que isto importa está documentado no próprio repo: `080:243-251` descreve exactamente esta falha numa vista («no Supabase os privilégios por omissão dão SELECT ao anon em qualquer vista nova do schema public […] Tal como vinha, o anon lia nomes e telefones de toda a gente») e a correcção aplicou **duas** defesas (security_invoker + revoke).

6. **Dois RPCs públicos com uuid como única chave.** `formulario_briefing(uuid)` devolve `to_jsonb(s)` — a linha **inteira** de `submissions`, sem projecção, incluindo `respostas`, `fase`, `status`, `cliente_id` e o que mais lá esteja (`020:340-342`) — mais `to_jsonb(et)` do tipo de evento. `briefing_materiais(uuid)` faz projecção explícita. Ambos aceitam qualquer uuid do `anon` sem token, sem código e sem expiração; o comentário assume o uuid como segredo (`020:332-333`).

7. **`formulario_validar_convite(text)` devolve `to_jsonb(i)`** — a linha inteira de `invites` — mais `respostas`, `data_evento` e `numero_convidados` da submission-alvo (`020:68-82`). O argumento é o código do convite, normalizado por `upper(btrim(...))`. Não existe limite de tentativas, contador nem atraso nesta função — ao contrário de `dlm_portal_verificar`, que tem `tentativas < 5` (`058:161`). A função também nunca recebe `revoke ... from public` (ver 5.3), pelo que conserva o `execute` a `public`.

8. **`captacao_dedupe(text, date)` está no perímetro anónimo por razão declaradamente transitória.** Recebe 9 dígitos de telefone e devolve `cliente_id`/`evento_id` — ou seja, confirma ao `anon` se um número de telefone já existe na base e a que evento corresponde. O próprio ficheiro marca isto como dívida (`043:92`): «Quando o fallback público for removido, retirar o anon.»

9. **A prova de assinatura foi reduzida à posse da ligação.** Antes da 086, `dlm_portal_acto` com `p_acto = 'assinou'` exigia sessão verificada por código; a 086 removeu esse bloco (`086:27-28`, `086:304-313`, `086:342-346`, `086:392-393`) e o `CHECK` da prova forte foi apagado (`086:290-301`: `drop constraint if exists portal_actos_tem_prova`). `assinou` grava `documentos.assinado_em` e `trancado_em = now()` (`086:404-408`). O trilho passa a assentar em token + nome escrito + IP + user-agent (`086:383-398`). O cabeçalho assume o custo às claras (`086:11-16`): «(b) a assinatura deixa de ter a prova forte do código («o código prova que é ela», 057) — fica a prova da ligação: nome escrito, IP, user-agent, data e hora.» É uma decisão registada, não um lapso — mas é um facto do perímetro: **quem tiver o link do portal pode assinar o contrato sem segundo factor.**

10. **`portal_condicoes_lidas` e `portal_sinal_confirmacoes` não têm política de INSERT.** A escrita entra exclusivamente pelas RPC `security definer` (`078:72-74`, `083:138-141`). Efeito colateral factual: nem o backoffice autenticado consegue inserir linhas nestas tabelas por PostgREST directo.

11. **O balde `contratos-assinados` aceita INSERT anónimo.** A política `"portal envia contrato assinado"` (`058:330-336`) é `to anon, authenticated` e o único guarda é o nome do objecto: `name like 'papel\_%'` e `length(name) between 12 and 120`. O ficheiro documenta o achado que a motivou (`058:322-327`): «O `with check` só conferia o nome do balde: com a chave anónima, que está no JavaScript do site, carregava-se o que se quisesse. Provado por fora. O prefixo obrigatório não é segredo nenhum — é o mínimo que impede o balde de virar depósito.» Não há verificação de tamanho de ficheiro nem de MIME nem de ligação ao token do portal na política; o vínculo ao evento faz-se depois, em `dlm_portal_registar_assinado_papel`, que confirma a existência do objecto e uma janela de 30 minutos desde o `created_at` (`060:74-81`). O nome é gerado no browser: `papel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extensao}` (`src/lib/portal.js:270`).

12. **Os baldes `referencias`, `propostas`, `materiais` continuam públicos por GET directo e continuam a aceitar INSERT anónimo.** É explícito e deliberado (`056:11-15`, `056:25-26`); a 056 só fechou a **listagem**. Não existe no repo nenhuma política nominal para estes três baldes — só o `do $$` dinâmico que apaga as que abrangiam o `anon`.

13. **Deriva histórica reconhecida no próprio repo.** `026:2-5`: «versiona as funções `public` que já existiam na base de dados mas nunca tinham ficado no repositório (foram todas criadas directamente no editor SQL do Supabase, nas migrações 010/011/013/016 não guardadas)». São 15 funções (`026:12`). As migrações 001-019 **não existem** em `docs/migracoes/`; o directório começa na 020. Qualquer política ou grant criado nesse intervalo e não coberto pela varredura da 021 ou da 056 é invisível a esta análise.

---

## 6. PÁGINAS PÚBLICAS POR TOKEN

**A rota `/contribuir/:token` EXISTE** — está declarada em `src/App.jsx:107` e serve `src/pages/ContribuirPage.jsx`. Existem três páginas públicas por token, todas documentadas abaixo.

Inventário das rotas com `:token` (`grep ":token" src/App.jsx`): `/contribuir/:token` (`src/App.jsx:107`), `/acompanhar/:token/:vista?/:sub?` (`src/App.jsx:118`), `/comunicado/:token` (`src/App.jsx:123`). **Não existe** rota `/portal/:token` nem qualquer redirecionamento de um slug antigo para `/acompanhar` (comentário explícito em `src/App.jsx:112-113`; `grep -rn "\"/portal" src/` não devolve nada). O endereço do portal compõe-se em `src/lib/portal.js:396-397` (`` `${window.location.origin}/acompanhar/${token}` ``).

---

### 6.1 · `/contribuir/:token` — a campanha de contribuição coletiva

Página: `src/pages/ContribuirPage.jsx` (componente `ContribuirPage`, linha 209; `const { token } = useParams();` linha 210).

**(a) Geração do token.** Na **aplicação**, não na base: `gerarToken` em `src/lib/campanhas.js:28-32` — `new Uint8Array(32)` + `crypto.getRandomValues(bytes)` + hex → **32 bytes aleatórios, 64 caracteres hexadecimais**. Aplicado na criação da campanha em `ativarCampanha` (`src/lib/campanhas.js:62`, `token: gerarToken()`). Decisão registada em `docs/migracoes/033_campanhas.sql:11-13`. Não existe função SQL geradora para este token.

**(b) Onde é guardado.** Tabela `public.campanhas`, coluna `token text not null` com `constraint campanhas_token_unico unique` — `docs/migracoes/033_campanhas.sql:36-37`. Índices relacionados: `campanhas_submission_idx` (`033:46-47`) e `campanhas_uma_ativa_idx` (único parcial `where estado = 'ativa'`, `033:50-52`). A tabela nasce inteira em `033:28-44`; a única coluna acrescentada depois é `como_contribuir text` (`docs/migracoes/034_campanha_publica.sql:24-25`).

**(c) Validação no acesso.** RPC `SECURITY DEFINER`, nunca consulta directa. Leitura: `public.campanha_publica(p_token text)` — versão em vigor em `docs/migracoes/047_pessoas_iguais_dos_dois_lados.sql:29-68` (`language sql`, `security definer`, `set search_path = public`, `stable`), filtro `where c.token = p_token` (`047:67`); `revoke all … from public` + `grant execute … to anon, authenticated` (`047:70-71`). Chamada de `src/lib/campanhas.js:130-136` (`supabase.rpc("campanha_publica", { p_token: token })`). Escrita pública: `public.prometer_contribuicao(p_token, p_nome, p_valor, p_mensagem)` — `docs/migracoes/035_campanha_intencoes.sql:60-105`, `security definer`, exige `where token = p_token and estado = 'ativa'` (`035:75-77`) e levanta `campanha_indisponivel` (`035:80`), `nome_em_falta` (`035:84`), `valor_invalido` (0 < valor ≤ 99999, `035:86-88`), `campanha_cheia` (≥ 200 pendentes, `035:93-95`); o insert trunca `nome` a 80 e `mensagem` a 280 caracteres (`035:117-122` → `left(trim(...), 80)` / `left(trim(...), 280)`); grant a `anon, authenticated` (`035:107-109`). RLS: `campanhas` tem RLS activa e só a política `"admin acesso total" … for all to authenticated` (`033:57-70`); idem `campanha_intencoes` (`035:44`, `035:46-57`). **Não há verificação de comprimento mínimo do token** nesta família de RPC (ao contrário do portal).

**(d) Expiração / revogação.** **Não existem colunas de expiração nem de revogação** em `campanhas` — não há `expira_em`, não há `revogado_em` (confirmado: os únicos `alter table public.campanhas` em `docs/migracoes/` são `033:57` (RLS) e `034:24-25` (`como_contribuir`)). A revogação é por **substituição do token**: `regenerarToken(id)` (`src/lib/campanhas.js:121-122`, `actualizarCampanha(id, { token: gerarToken() })`) — o link antigo passa a devolver zero linhas. Fechar a campanha (`fecharCampanha`, `src/lib/campanhas.js:90-101`, põe `estado = 'fechada'` e `fechada_em`) **não** mata o link: `campanha_publica` continua a devolver a linha, e é a página que desenha «Esta campanha já terminou.» (`src/pages/ContribuirPage.jsx:309`). Quem define: a utilizadora autenticada, pela interface (`src/components/admin/ContribuicaoColetiva.jsx`).

**(e) Dados expostos a quem tem o token.** Exactamente as sete chaves de `047:37-46`: `estado`, `pct` (`least(100, coalesce(round(100 * soma.total / c.objetivo), 0))`), `pessoas`, `mensagem`, `como_contribuir`, `tipo_evento` (`event_types.nome`), `data_evento`. **NUNCA expõe:** valores absolutos contribuídos, o `objetivo`/meta, contribuições individuais, nomes de contribuintes, o `id` da campanha ou o `submission_id` (decisão em `docs/migracoes/034_campanha_publica.sql:10-16` e repetida em `src/pages/ContribuirPage.jsx:17-21`).

**(f) Contagem de acessos / carimbos.** **Não existe** — `campanhas` não tem coluna `n_acessos` nem `ultimo_acesso_em` (nenhum `alter table` as acrescenta), e `campanha_publica` é `stable` e não escreve nada.

**Estado actual da porta:** a página está **desligada no cliente** por `CONTRIBUICAO_COLETIVA_ATIVA = false` (`src/lib/funcionalidades.js:44`). `ContribuirPage` arranca já no estado `"nao-encontrado"` (`src/pages/ContribuirPage.jsx:215-217`) e nem consulta a base (`src/pages/ContribuirPage.jsx:227`, `if (!CONTRIBUICAO_COLETIVA_ATIVA) return;`), mostrando `"Este link já não está ativo."` (`src/pages/ContribuirPage.jsx:280`) / `"Pede um link novo a quem to partilhou."` (`src/pages/ContribuirPage.jsx:283`). As duas RPC continuam concedidas a `anon` — está escrito com todas as letras em `src/lib/funcionalidades.js:38-42`: «um pedido feito à mão, por quem soubesse um token, ainda passaria».

---

### 6.2 · `/acompanhar/:token/:vista?/:sub?` — o Portal do Cliente

Página: `src/pages/PortalPage.jsx` (componente `PortalPage`, linha 243; `const { token, vista, sub } = useParams();` linha 244). Camada de dados: `src/lib/portal.js`.

**(a) Geração do token.** Função SQL `public.dlm_token_portal()` — `docs/migracoes/049_portal_do_cliente_fase1.sql:26-33`:
```sql
select translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
```
**24 bytes aleatórios (pgcrypto) em base64url → 32 caracteres** (o `=` é eliminado pelo `translate`). `language sql`, `volatile`, `set search_path = public, extensions`. Comentário oficial em `049:35-37`: «Não deriva do id do evento — reverter é impossível por desenho». A porta abre-se por `public.dlm_portal_abrir(p_submission_id uuid)` — versão em vigor `docs/migracoes/051_portal_jornada_datas_honestas.sql:255-288`, `security invoker`; devolve o token do acesso vivo se já existir, senão insere um novo. Chamada de `abrirPortal` (`src/lib/portal.js:138-144`), a partir de `src/components/admin/PortalDoClienteSheet.jsx:379`.

**(b) Onde é guardado.** Tabela `public.portal_acessos`, coluna `token text not null unique default public.dlm_token_portal()` — `docs/migracoes/049_portal_do_cliente_fase1.sql:46`. Colunas irmãs (`049:42-60`): `id`, `submission_id` (FK `submissions(id) on delete cascade`), `criado_em`, `expira_em`, `revogado_em`, `motivo`, `ultimo_acesso_em`, `n_acessos`; mais `visita_anterior_em` acrescentada em `docs/migracoes/054_portal_fase2_projeccao.sql:58-59` (comentário de coluna em `054:61-64`). Índices: `portal_acessos_vivo_idx` (único parcial, `where revogado_em is null` — um só acesso vivo por evento, `049:67-69`) e `portal_acessos_token_idx` (`049:71-72`).

**(c) Validação no acesso.** RPC `SECURITY DEFINER`; `anon` nunca lê a tabela (RLS com uma só política, `"admin acesso total" … for all to authenticated`, `049:74`, `049:77-79`).
- Leitura da vitrina: `public.dlm_portal_ver(p_token text)` — versão em vigor `docs/migracoes/085_saudacao_explicita_e_portal_explicito.sql:211-908` (é a mais recente de vinte migrações que a redefinem: 049, 050, 051, 052, 054, 055, 065, 067, 068, 069, 070, 071, 073, 076, 077, 078, 082, 083, 084, 085). Guardas literais: `if p_token is null or length(p_token) < 16 then return jsonb_build_object('estado', 'terminado');` (`085:274-276`); `select * into v_acesso from public.portal_acessos where token = p_token;` (`085:278`); e `if not found or v_acesso.revogado_em is not null or (v_acesso.expira_em is not null and v_acesso.expira_em < now()) then … 'terminado'` (`085:280-285`). Há ainda uma terceira cortina igual se a submissão tiver desaparecido (`085:288-291`). Grants: `revoke all … from public` + `grant execute … to anon, authenticated` (`085:910-911`). Chamada em `getPortal` (`src/lib/portal.js:105-111`).
- Todas as outras RPC do portal passam pela auxiliar `public.dlm_portal_acesso_por_token(p_token text)` — `docs/migracoes/057_portal_fase3_documentos.sql:251-263`, `security definer`, `stable`, com `length(coalesce(p_token,'')) >= 16 and a.revogado_em is null and (a.expira_em is null or a.expira_em > now())`; `revoke all … from public, anon` (`057:265`) — é interna, nem `anon` nem `authenticated` lhe chegam directamente.
- Camada extra para os documentos: código de 6 dígitos pedido por `dlm_portal_pedir_codigo` (versão em vigor `docs/migracoes/061_portal_codigo_ambito_e_revogacao.sql:53-126`, grants em `061:128-129`) e validado por `dlm_portal_verificar` (versão em vigor `docs/migracoes/058_portal_fase3_correccoes.sql:138-192`, grants em `058:194-195`), sessão de 60 minutos (`dlm_portal_sessao`, `057:385-399`, `revoke … from public, anon` em `057:401`). O «véu de valor» corta no servidor para quem não tem sessão verificada: `dlm_velar_instantaneo` — versão em vigor `docs/migracoes/058_portal_fase3_correccoes.sql:37-78`, que substituiu a lista de exclusão da 057 (`057:411-441`, que só cortava `valor`/`valorExtenso`) por uma **lista de permissão**; comentário oficial em `058:80-83`: «O véu de valor do portal, por lista de PERMISSÃO: sem sessão verificada saem só as chaves nomeadas — nunca euros, NIF, morada, contacto nem texto livre onde um preço possa estar escrito. Corta no servidor.»
- Inexistente, revogado e expirado devolvem **a mesma** resposta `{"estado":"terminado"}`, de propósito (`049:151-152`).

**(d) Expiração / revogação.** `portal_acessos.expira_em timestamptz` (`049:49`), definido **na abertura da porta** por `dlm_portal_abrir`: `greatest((data_evento + interval '30 days')::timestamptz, now() + interval '30 days')`, e **`null` se o evento não tiver data** (`051:278-283` — o `case` não tem `else`; comentário em `051:290-293`: «Sem data de evento, fica em aberto e revoga-se à mão»). Revogação: `public.dlm_portal_revogar(p_submission_id uuid, p_motivo text default 'manual')` — `049:123-137`, `security invoker`, escreve `revogado_em = now()` e `motivo`; `grant execute … to authenticated` apenas (`049:340`; `revoke … from public, anon` em `049:338`). O `motivo` é fechado por CHECK a `'avaliado' | 'prazo' | 'manual'` (`049:56-57`) e o CHECK `portal_acessos_revogado_com_motivo` obriga a que `revogado_em` e `motivo` andem juntos (`049:58-59`). Quem define: a utilizadora autenticada, em `src/components/admin/PortalDoClienteSheet.jsx:399` (`revogarPortal(eventoId, "manual")`). A avaliação **não** revoga o acesso (comentário explícito em `085:856-860`). «Pedir outro código» mata o código e a sessão anterior, não o token (`061:93-103`).

**(e) Dados expostos a quem tem o token** — projecção explícita de `dlm_portal_ver` (`085:797-906`), chave a chave:
`estado`; `comunicados[]` = `{titulo, token, enviado_em}` (filtro em `085:620-636`, herdado de `docs/migracoes/082_comunicados_no_portal.sql:425-440`, com `and d.no_portal = true` acrescentado pela 085 em `085:632`); `evento{titulo, modelo, data, local, convidados, dias_para, principio, de_casal}` (`085:800-812`); `jornada[]` = `{etapa, estado, quando}` com `estado ∈ {por_acontecer, feito_sem_data, feito_datado}` (`085:363-365`); `ligacao_ate` (= `v_acesso.expira_em`, `085:817`); `visita_anterior` (`085:821`); `pedido{mensagem, quando, imagens}` (`085:823-827`); `questionario{tem_perguntas, entregue_em, paleta, horas, placa{principal, secundario}, visao}` (`085:829-840`); `fotografias{quando, lista, total}` (`085:850-854`); `avaliacao{convidada, feita_em, frase, palavras_no_site, nome_publicado, foto_no_site}` (`085:861-868`); `marcos_datados{orcamento, projecto, contrato, sinal}` — **sem sinal pago sai só `{orcamento, sinal}`** (`085:874-882`); `resposta_orcamento` = `{acto, em}` (montado em `085:600`, exposto em `085:886`); `publicado_em{proposta, contrato}` ou, sem sinal, `{orcamento}` (`085:894-899`); e a chave `sinal` **só existe quando há orçamento publicado** (`085:904-906`), com `{valor, total, config, estado_do_dia, confirmacao}` (`085:781-794`), sendo `confirmacao` = `{em, metodo, anulada_em}` (`085:771-775`).
**NUNCA expõe:** `submissions.id` nem qualquer id interno — é a regra que a migração existe para respeitar (`049:7-9`, `049:145-149`, e o teste 6.4 em `049:358-360`); morada exacta, quem abre o espaço e o contacto dessa pessoa; briefing, materiais, notas internas (`049:146-149`). Do portão do sinal (`078`) para trás também não saem as etapas 4-7 da jornada (`085:413-417`, `where v_sinal_feito or m.ord <= 3;`) nem os carimbos de projecto/contrato (`085:874-882`).
⚠ Ressalva literal: a regra original de `049:147` («valores em euros (ficam atrás da verificação — fase 4)») deixou de ser inteira — desde a 083 a chave `sinal` devolve `'valor', round(v_total / 2, 2)` e `'total', v_total` sem código nenhum (`085:784` e `085:787`).

**(f) Contagem de acessos / carimbos.** Sim, dentro da própria `dlm_portal_ver`, com **janela de 30 minutos** (`085:498-516`):
```sql
if v_acesso.ultimo_acesso_em is null
   or v_acesso.ultimo_acesso_em < now() - interval '30 minutes'
then
  v_anterior := v_acesso.ultimo_acesso_em;
  update public.portal_acessos
     set visita_anterior_em = ultimo_acesso_em,
         ultimo_acesso_em   = now(),
         n_acessos          = n_acessos + 1
   where id = v_acesso.id;
```
Dentro da janela nada se escreve (`085:512-515`: `v_anterior := v_acesso.visita_anterior_em;`). Estes campos são lidos pelo backoffice em `src/lib/portal.js:128` (`select("token, criado_em, expira_em, ultimo_acesso_em, n_acessos")`), com aviso escrito em `src/lib/portal.js:120-125` de que o backoffice **não** pode usar `dlm_portal_ver` para pré-visualizar, precisamente porque incrementa o contador.

---

### 6.3 · `/comunicado/:token` — a folha de um comunicado

Página: `src/pages/ComunicadoPage.jsx` (componente `ComunicadoPage`, linha 858; `const { token } = useParams();` linha 859). Camada de dados: `src/lib/comunicados.js`.

**(a) Geração do token.** Função SQL `public.dlm_token_comunicado()` — `docs/migracoes/079_comunicados_fase1.sql:89-99`:
```sql
select replace(replace(encode(gen_random_bytes(24), 'base64'), '+', '-'), '/', '_');
```
**24 bytes aleatórios → 32 caracteres base64url**, `language sql`, `volatile`, `set search_path = public, extensions` (correcção assinalada em `079:93-95`). É chamada de dentro de `public.dlm_comunicado_publicar(p_id uuid)` (`079:105-132`), que **não declara `security`** e por isso corre como **invoker** — daí precisar do `grant execute … to authenticated` sobre a geradora (`079:203`, com a razão escrita em `079:197-202`). Republicar depois de retirar **devolve o mesmo endereço** (`079:117-121`). Chamada de `publicarComunicado` (`src/lib/comunicados.js:129-135`).

**(b) Onde é guardado.** Tabela `public.comunicados`, coluna `token text unique` — **`null` enquanto não for publicada** (`docs/migracoes/079_comunicados_fase1.sql:43`). Índice parcial `comunicados_token_idx on public.comunicados (token) where token is not null` (`079:72-73`). O endereço compõe-se em `enderecoDoComunicado` (`src/lib/comunicados.js:146-147`): `` `${window.location.origin}/comunicado/${token}` ``.

**(c) Validação no acesso.** RPC `public.dlm_comunicado_ver(p_token text)`, `SECURITY DEFINER`, `set search_path = public` — versão em vigor `docs/migracoes/085_saudacao_explicita_e_portal_explicito.sql:930-963` (redefinida em 079, 080 e 085). Filtro: `where token = p_token and publicado_em is not null` (`085:943-944`), e cortina se `not found or r.retirado_em is not null or (r.expira_em is not null and r.expira_em < now())` (`085:946-950`). Grants: `revoke all … from public` (`085:965`) + **`grant execute … to anon`** apenas (`085:966`) — **não é concedida a `authenticated`, de propósito**, para uma espreitadela do backoffice não contar como leitura (razão escrita em `079:205-210` e repetida em `085:967-968`); a pré-visualização interna lê a tabela directamente ao abrigo da RLS. RLS de `comunicados`: activa (`079:79`), com uma só política `comunicados_equipa … for all to authenticated using (true) with check (true)` (`079:81-83`). Chamada em `src/pages/ComunicadoPage.jsx:867-868`. **Não há verificação de comprimento mínimo do token** nesta RPC.

**(d) Expiração / retirada.** Colunas em `public.comunicados` (`079:43-46`): `publicado_em`, `retirado_em`, `expira_em` (**`null` = não expira**). Retirar: `public.dlm_comunicado_retirar(p_id uuid)` (`079:134-144`) → `retirado_em = now()`, `grant execute … to authenticated` (`079:195`); chamada em `src/lib/comunicados.js:137-142`. Vocabulário fixado em `079:22-24`: «RETIRAR uma folha (pública) não é REVOGAR um acesso (pessoal)». Quem define `expira_em`: a coluna consta da lista de campos gravável em `guardarComunicado` — `const permitidos = ["titulo", "subtitulo", "saudacao", "blocos", "mensagem", "expira_em", "registo"]` (`src/lib/comunicados.js:108`) — mas **nenhum componente em `src/` passa `expira_em`** (o `grep -rn "expira_em" src/` só devolve `src/lib/comunicados.js:37,108,719,738,739`, `src/lib/portal.js:128,191` e `src/components/admin/PortalDoClienteSheet.jsx:779,986,994`, todos de leitura ou do portal). Não confirmado: se o Hélio a define à mão no SQL editor.

**(e) Dados expostos a quem tem o token.** Exactamente seis chaves (`085:954-961`): `estado`, `titulo`, `subtitulo`, `saudacao`, `registo`, `blocos`. **NUNCA expõe:** o `id` da folha (é seleccionado para uso interno e não sai — `079:175`, «Projecção explícita. O id é usado aqui dentro e não sai.»), a coluna `mensagem` (o texto que acompanha a folha na conversa, `079:38-40`), `n_acessos`, `publicado_em`, `expira_em`, `modelo_id` (`docs/migracoes/081_comunicados_fase3.sql:92-93`), `publico` e `congelado_em` (`docs/migracoes/080_comunicados_fase2.sql:32-35`), nem qualquer destinatário, evento ou cliente — a lista completa de colunas da tabela vê-se no `select` interno de `src/lib/comunicados.js:37`. A folha é «pública e REENCAMINHÁVEL… sem um único dado pessoal» (`079:9-14`; `src/App.jsx:119-122`).

**(f) Contagem de acessos / carimbos.** `public.comunicados.n_acessos integer not null default 0` (`079:48`), incrementado a **cada** chamada da RPC: `update public.comunicados set n_acessos = n_acessos + 1 where id = r.id;` (`085:952`). Comentário de coluna em `079:68-70`: «Total de aberturas. NUNCA se atribui a ninguém: a folha é pública e reencaminhável, logo não se sabe quem a abriu. A interface tem de dizer isto.» **Não há carimbo de instante do acesso** na folha: `ultimo_acesso_em` não existe em `comunicados` (o `grep -rn "ultimo_acesso" docs/migracoes/` só devolve ocorrências de `portal_acessos`). O carimbo por pessoa vive noutro objecto e é **manual**: `comunicado_destinatarios.aberto_em`, escrito pela equipa em `marcarAberto` (`src/lib/comunicados.js:644-645`) e limpável por `limparAberto` (`src/lib/comunicados.js:650`).

---

### 6.4 · Nota — página pública que NÃO usa token

`/briefing/:id` (`src/App.jsx:104`, `src/pages/BriefingPage.jsx`) é pública e endereçada pelo **`id` (uuid) da submissão**, não por token: `supabase.rpc("formulario_briefing", { p_id: id })` (`src/pages/BriefingPage.jsx:472`) e `supabase.rpc("briefing_materiais", { p_id: id })` (`src/pages/BriefingPage.jsx:503`), ambas `SECURITY DEFINER` concedidas a `anon` (`docs/migracoes/020_rpcs_formularios_publicos.sql:358`; `docs/migracoes/031_briefing_materiais.sql:55`). `formulario_briefing` devolve `jsonb_build_object('submission', to_jsonb(s), 'event_type', to_jsonb(et))` — a submissão **inteira** e o modelo inteiro (`docs/migracoes/026_recovery_funcoes_publicas.sql:286-298`, a versão mais recente de duas: 020 e 026) — não há projecção explícita, não há expiração, não há revogação e não há contagem de acessos.

---

## 7. MIGRAÇÕES

**Pasta:** `docs/migracoes/` — 74 ficheiros `.sql`: **69 migrações numeradas** (`020` … `088`, sequência contínua sem saltos) + **5 ficheiros não numerados**.

A cadeia **começa em `020_rpcs_formularios_publicos.sql`**: as migrações 001–019 **não existem** no repositório. Isto está registado em `docs/levantamento-comunicados.md:43` — «**A migração 015 não está no repositório** — `docs/migracoes/` começa em `020_rpcs_formularios_publicos.sql`».

**Última migração existente no repo: `088`.**

### As últimas cinco (ficheiro + o que fazem, lido do cabeçalho)

| # | Ficheiro | O que faz (cabeçalho) |
|---|---|---|
| 084 | `docs/migracoes/084_a_promessa_quebrada_no_portal.sql` | «UM DELTA, e mais nada: no `estado_do_dia`, quando o dia está `'tomado'` E o PRÓPRIO evento tem `dia_guardado_ate >= current_date`, sai `{estado:'tomado', promessa_quebrada:true}`» — para o portal da preterida mostrar as desculpas da casa. |
| 085 | `docs/migracoes/085_saudacao_explicita_e_portal_explicito.sql` | Cinco partes: colunas `saudacao` em `comunicados` e `comunicado_modelos`; migração de dados (extrair a saudação de abertura); coluna `no_portal` em `comunicado_destinatarios` + backfill; `dlm_portal_ver` reescrita por inteiro. «A saudação deixa de derivar da vírgula» e «a presença no portal deixa de ser efeito colateral do carimbo `enviado`». |
| 086 | `docs/migracoes/086_o_contrato_a_vista.sql` | «O véu morre, e o código morre com ele» — `dlm_portal_ver_documento` e `dlm_portal_documentos` reescritas (contrato sai inteiro, `velado=false`, `precisa_codigo=false`); o CHECK `portal_actos_tem_prova` morre; `dlm_portal_acto` reescrita sem o bloco de `precisa_codigo` no `'assinou'`. |
| 087 | `docs/migracoes/087_a_mesa_do_bolo.sql` | `update public.avaliacao_eixos set servicos = array_append(servicos, 'Mesa do bolo') where chave = 'bolo' and not ('Mesa do bolo' = any(servicos));` — «"Mesa do bolo da noiva" passa a "Mesa do bolo"». |
| 088 | `docs/migracoes/088_as_imagens_do_cliente_no_projecto.sql` | Traz a troca `imagem ← imagemCliente` para DENTRO de `dlm_portal_publicar`: «as `seccoes` do instantâneo derivam SEMPRE dos dados frescos que a própria RPC lê, atomicamente — e sobrepõem o que quer que o `p_extra` traga». |

### Aplicadas na BD?

⚠ **Não tenho acesso à base de dados.** Nada abaixo afirma que uma migração foi aplicada — só reporto o que os ficheiros e as decisões dizem sobre o que está **por correr**.

**Migrações declaradas PENDENTES de correr** (fonte: `docs/decisoes-de-produto.md`):

| Migração | Onde está registada a pendência | Texto |
|---|---|---|
| **085** | `docs/decisoes-de-produto.md:1094-1096` e `:1167-1168` | «**Migração 085** escrita e aprovada (5 partes) — correr PERTO do deploy do código da Fase C (janela curta…)»; e «pendências fora de fase: migração 085 (correr perto do deploy da Fase C)». O próprio ficheiro diz, `085_…sql:32`: «ORDEM: correr DEPOIS da 084 e ANTES do código da fase C — mas perto dele». *Não confirmado: nenhuma das entradas posteriores diz que a 085 correu — pode ter corrido sem ficar registado.* |
| **086** | `docs/decisoes-de-produto.md:1277-1278` e `:1301-1302` | «**O véu do contrato morre — migração 086** (escrita, **pendente de o Hélio correr no SQL editor**)»; «Pendência: **correr a 086** (depois da 083; a verificação vem no fim do ficheiro)». Reforçado em `:1305` («A migração 086 (ainda por correr)») e `:1317` («até a 086 correr (o servidor de hoje ainda pede código)»). |
| **087** | `docs/decisoes-de-produto.md:1357-1358` | «a **migração 087** junta a cadeia nova ao eixo "bolo", a antiga fica pelo histórico. Pendência: **correr a 087**.» |
| **088** | `docs/decisoes-de-produto.md:1433-1437` | «a **migração 088** traz a troca para dentro do [`dlm_portal_publicar`] … segurança até a 088 correr. Pendência: **correr a 088** (depois da 087).» |

**Ordem de execução declarada:** 085 → 086 (depois da 083) → 087 → 088 (depois da 087). As 087 e 088 dizem no cabeçalho «Idempotente. Correr primeiro em TESTE, depois em PRODUÇÃO.»

Menção mais antiga e não resolvida no mesmo documento: `docs/decisoes-de-produto.md:40` — «Fica pendente; o id interno…» (contexto de produto, não de migração).

### Ficheiros `.sql` que NÃO são migrações numeradas

| Ficheiro | Natureza | O que é (cabeçalho) |
|---|---|---|
| `docs/migracoes/form_errors.sql` | Criação de tabela avulsa | «`form_errors` — registo de erros dos formulários públicos. **Correr uma vez** no SQL Editor do Supabase». Cria `public.form_errors`. |
| `docs/migracoes/inventario_fecho_duplicados.sql` | Inventário (só SELECTs) | «INVENTÁRIO DE FECHO — duplicados e convites desviados, à prova de NULL. **Só SELECTs**; correr em PRODUÇÃO e TEST e mandar os resultados.» |
| `docs/migracoes/inventario_pre_lote2.sql` | Inventário (só SELECTs) | «INVENTÁRIO PRÉ-LOTE 2 — **só SELECTs**, seguro para PRODUÇÃO e TEST.» Serve de reconhecimento antes da migração 040. |
| `docs/migracoes/limpeza_dados_teste.sql` | Limpeza destrutiva | «**APENAS NO AMBIENTE DE TESTE.** ⚠️ NUNCA correr em produção: apaga TODOS os dados de negócio.» |
| `docs/migracoes/semear-comunicado-condicoes.sql` | Semente de conteúdo | «⚠ **ISTO NÃO É UMA MIGRAÇÃO e não entra na cadeia numerada, de propósito** … Corre-se UMA vez por ambiente, à mão, como a limpeza.» Semeia a folha «Condições para a montagem e recolha», POR PUBLICAR. |

---

## 8. REALTIME

Mecanismo: **Supabase Realtime** (`postgres_changes` sobre a publicação `supabase_realtime`). **Quatro canais** em `src/`, todos com `removeChannel` no cleanup.

### Inventário das subscrições

| # | Ficheiro:linha | Nome do canal | Evento | Tabela | Filtro | O que a app faz à chegada |
|---|---|---|---|---|---|---|
| 1 | `src/lib/notificacoes.js:116-131` | `"notificacoes-changes"` (literal, fixo) | `INSERT` | `public.notificacoes` | **sem filtro** | **Actualização optimista** — `if (payload?.new) onNova(payload.new)`; o payload entra directamente na lista. O `.subscribe((status, err) => …)` regista sempre o status em `console.log("Realtime status (notificações):", …)`. |
| 2a | `src/pages/AdminPage.jsx:500-508` | `"db-changes"` (literal, fixo) | `INSERT` | `public.submissions` | **sem filtro** | **Refetch coalescido** — `aoMudarSubmissoesRealtime()`. |
| 2b | `src/pages/AdminPage.jsx:509-521` | `"db-changes"` (mesmo canal) | `UPDATE` | `public.submissions` | **sem filtro** | **Refetch coalescido** — `aoMudarSubmissoesRealtime()`. |
| 2c | `src/pages/AdminPage.jsx:522-529` | `"db-changes"` (mesmo canal) | `UPDATE` | `public.invites` | **sem filtro** | **Refetch** — `fetchInvites()`. |
| 2d | `src/pages/AdminPage.jsx:530-537` | `"db-changes"` (mesmo canal) | `INSERT` | `public.event_types` | **sem filtro** | **Refetch** — `fetchEventTypes()`. |
| 3 | `src/pages/EventoPage.jsx:832-864` | `` `evento-${id}` `` (por evento) | `UPDATE` | `public.submissions` | **`` `id=eq.${id}` ``** | **Actualização optimista com guarda** (ver abaixo). |
| 4a | `src/components/admin/ContribuicaoColetiva.jsx:268-288` | `` `intencoes-${idCampanha}` `` | `INSERT` | `public.campanha_intencoes` | **`` `campanha_id=eq.${idCampanha}` ``** | **Actualização optimista** — só se `payload.new?.estado === "pendente"`; prepende à lista se ainda não lá estiver, marca `setNovaIntencao(payload.new.id)` e limpa o realce ao fim de 1300 ms. |
| 4b | `src/components/admin/ContribuicaoColetiva.jsx:289-306` | `` `intencoes-${idCampanha}` `` (mesmo canal) | `UPDATE` | `public.campanha_intencoes` | **`` `campanha_id=eq.${idCampanha}` ``** | **Remoção optimista** — se `payload.new?.estado === "pendente"` ignora; caso contrário filtra a intenção para fora da lista («Resolvida noutro separador/dispositivo … era esta cegueira que deixava confirmar a mesma promessa duas vezes»). |

### Detalhes que importam

**Canal `"db-changes"` (AdminPage) — coalescência.** As duas subscrições a `submissions` não chamam o refetch directamente; passam por um debounce de 300 ms (`src/pages/AdminPage.jsx:485-492`):

```js
const aoMudarSubmissoesRealtime = () => {
  if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
  realtimeTimerRef.current = setTimeout(() => {
    fetchSubmissions(true);
    setFunilVersao((v) => v + 1); // acorda a Lista/Funil de Clientes
  }, 300);
};
```

O cleanup (`AdminPage.jsx:541-552`) faz `supabase.removeChannel(channel)` **e** limpa o temporizador — correcção de bug anotada no próprio código («refetch fantasma e aviso de setState depois do desmonte»).

**Canal `` `evento-${id}` `` (EventoPage) — três guardas.** Não é um refetch: aplica `{ ...s, ...normalizeSubmission(payload.new) }`.
1. Se a Nádia está a editar (`aEditarRef.current`), o payload é arquivado em `updatePendenteRef` e **não** se aplica — senão «o guardar reescrevia o valor VELHO por cima da resposta fresca».
2. Se a submissão ainda não pousou (`!s`), o payload é igualmente arquivado em vez de deitado fora.
3. Na retoma (`EventoPage.jsx:870+`), quando a edição fecha, **relê-se a linha fresca da BD** em vez de aplicar o payload arquivado («que já pode ser mais velho do que a gravação dela»).

**Tabelas na publicação `supabase_realtime`, segundo as migrações do repo:**

| Tabela | Migração que a acrescenta |
|---|---|
| `public.submissions` | `docs/migracoes/023_realtime_submissions.sql:18` (array `['submissions', 'invites']`) |
| `public.invites` | `docs/migracoes/023_realtime_submissions.sql:18` |
| `public.notificacoes` | `docs/migracoes/022_notificacoes.sql:125` |
| `public.campanha_intencoes` | `docs/migracoes/035_campanha_intencoes.sql:121` |

⚠ **`public.event_types` não aparece em nenhuma migração do repo a ser acrescentada à publicação `supabase_realtime`** — a subscrição 2d (`AdminPage.jsx:530-537`) existe no código, mas o `alter publication … add table public.event_types` **não existe** em `docs/migracoes/`. *Não confirmado: pode ter sido activada à mão no dashboard do Supabase, ou numa migração 001–019 que não está no repositório.*

**Consumo indirecto do realtime (não é subscrição nova).** `src/components/admin/DocumentosEvento.jsx` recebe uma prop `refrescarEm` que a `EventoPage` muda quando chega por realtime um aviso de carimbo do evento (`contrato_assinado`, `orcamento_aceite`, `projecto_aprovado`) — descrito em `docs/decisoes-de-produto.md:1293-1299`.

---

## 9. WHATSAPP

### (a) Mecanismo exacto e limitações

**Não é API oficial.** São **links `wa.me`** abertos pelo browser. Não existe nenhuma integração com a Cloud API da Meta, Twilio, MessageBird ou equivalente: a procura por `graph.facebook`, `twilio`, `messagebird`, `WABA`, `whatsapp_token` em todo o repositório (excluindo `node_modules`) só devolve `docs/levantamento-comunicados.md` — a única Edge Function do projecto é `supabase/functions/obter-distancia/index.ts`, que nada tem que ver com WhatsApp.

Duas fábricas de link, deliberadamente separadas:

**1. `linkWhatsApp(numero, texto)`** — `src/lib/mensagens.js:121-127` (para números **de terceiros**):

```js
export const linkWhatsApp = (numero, texto = "") => {
  let d = String(numero || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 9) d = `351${d}`;
  if (d.length < 9) return null;
  const query = texto ? `?text=${encodeURIComponent(texto)}` : "";
  return `https://wa.me/${d}${query}`;
};
```

**2. `linkWhatsAppCasa(texto)`** — `src/lib/casa.js:69-70` (para o número **da casa**):

```js
export const linkWhatsAppCasa = (texto = "") =>
  `https://wa.me/${NUMERO_WHATSAPP_CASA}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
```

A separação é intencional e está comentada em `src/lib/casa.js:65-68`: «NÃO reutiliza o `linkWhatsApp` de `mensagens.js` de propósito: aquele normaliza números desconhecidos e vive num ficheiro que importa o cliente supabase — este é constante da casa que qualquer página importa sem trazer o supabase atrás.»

**Terceira forma, sem destinatário:** `https://wa.me/?text=…` — abre o selector de contactos do WhatsApp. Usada em `src/components/admin/ShareSheet.jsx:99` e `src/components/admin/ContribuicaoColetiva.jsx:1015`.

**Limitações (todas confirmadas no código e nos comentários):**
- **Nada é enviado automaticamente.** O link **abre a app/WhatsApp Web** com a mensagem pré-preenchida na caixa de texto; o envio é sempre um toque humano. Doutrina explícita em `src/components/admin/AvisoSinalRecebido.jsx:16-17`: «o envio é sempre um gesto da Nádia, nunca do sistema (doutrina de 09/08)».
- **Sem confirmação de entrega.** A app não sabe se a mensagem seguiu. O `ComunicadoExpedicao` contorna isto com um carimbo *manual antes* de abrir (`src/components/admin/ComunicadoExpedicao.jsx:1025-1039`): `await marcarAberto(l.id)` corre **primeiro** e, se falhar, «a conversa NÃO se abre — senão a lista perdia o rasto de um envio que aconteceu».
- **Um destinatário de cada vez.** Não há envio em massa; para listas há o texto de difusão que a Nádia cola numa lista de transmissão (`textoDifusao`).
- **`linkWhatsApp` devolve `null`** com menos de 9 dígitos — a UI esconde o botão nesse caso (ex.: `src/components/admin/MensagensSheet.jsx:258` — `{linkWhatsApp(whatsapp) && (…)}`), sobrando o «Copiar».
- **Sem `window.open` bloqueado tratado.** Vários sítios chamam `window.open(url, "_blank")` — sujeito a bloqueio de pop-ups.

### (b) O número da casa e onde está definido

| Item | Valor exacto | Ficheiro:linha |
|---|---|---|
| Constante canónica | `"351927177190"` (string, indicativo 351 já incluído, sem `+`) | `src/lib/casa.js:62` — `export const NUMERO_WHATSAPP_CASA = "351927177190";` |
| Versão legível (só para impressão) | `"+351 927 177 190"` (derivado) | `src/pages/ComunicadoPage.jsx:76` — `` const NUMERO_LEGIVEL = `+${NUMERO_WHATSAPP_CASA.slice(0, 3)} ${NUMERO_WHATSAPP_CASA.slice(3, 6)} ${NUMERO_WHATSAPP_CASA.slice(6, 9)} ${NUMERO_WHATSAPP_CASA.slice(9)}`; `` |

Comentário em `src/lib/casa.js:60-61`: «O número do negócio, já canónico (indicativo 351 incluído) — o mesmo por onde a casa fala com as clientes.» O `NUMERO_LEGIVEL` **deriva** da constante «para nunca desencontrar do `wa.me`» (`ComunicadoPage.jsx:75`, decisão registada em `docs/decisoes-de-produto.md:1160`).

**Não existe** variável de ambiente para o número — está literal no código.

### (c) Normalização de números

**Função única:** `linkWhatsApp` em `src/lib/mensagens.js:121-127`. Regras exactas, por ordem:

| Passo | Regra | Código |
|---|---|---|
| 1 | Tudo o que não é dígito cai (`+`, espaços, hífenes, parênteses) | `String(numero \|\| "").replace(/\D/g, "")` |
| 2 | Um `"00"` inicial é removido (prefixo internacional europeu) | `if (d.startsWith("00")) d = d.slice(2);` |
| 3 | **Exactamente 9 dígitos → número português: ganha o indicativo `351`** | `if (d.length === 9) d = \`351${d}\`;` |
| 4 | Menos de 9 dígitos → **não há link**, devolve `null` | `if (d.length < 9) return null;` |
| 5 | Mais de 9 dígitos → **respeita-se tal e qual** (assume-se indicativo já lá) | (nenhuma transformação) |

Documentado no cabeçalho da própria função (`src/lib/mensagens.js:116-120`): «Normalização: só dígitos; "00" inicial cai; 9 dígitos = número português → ganha o 351. Com indicativo já lá (>9 dígitos), respeita-se. Menos de 9 dígitos: não há link (devolve null).»

⚠ O `linkWhatsAppCasa` **não normaliza nada** — a constante já é canónica.

**Fontes do número da cliente** (padrão repetido, com fallback): `getValorAtual(evento, "numeroWhatsapp") || getValorAtual(evento, "contactoPrincipal") || null` — em `src/components/admin/AvisoSinalRecebido.jsx:55-58`, `src/components/admin/PortalDoClienteSheet.jsx:628-631` e `src/pages/EventoPage.jsx:1048-1051`. Em `src/components/admin/CentroNotificacoes.jsx:340`: `linkWhatsApp(whatsapp || contacto)`.

### (d) Todos os formatos/modelos de mensagem existentes

#### d.1 — Modelos guardados na BD (não em código)

`src/lib/mensagens.js` é **CRUD sobre a tabela `mensagens_tipo`** (`getMensagens`, `createMensagem`, `updateMensagem`, `removerMensagem`). Os textos-tipo da Nádia **não estão no repositório**: vivem na tabela. `docs/levantamento-comunicados.md:43` — «**A migração 015 não está no repositório** … do SQL de criação e do seed ("o seed da 015 usa chaves fixas" — `mensagens.js:20-21`) **não encontrei** o ficheiro.» Logo: **o texto exacto desses modelos não existe no repo.**

#### d.2 — O resolvedor de placeholders (a gramática única da casa)

`resolverMensagem(corpo, dados)` — `src/lib/mensagens.js:90-115`. Sete placeholders; sem dados, cada um vira **`"___"`** («a Nádia vê logo o que falta preencher à mão antes de enviar»):

| Placeholder | Resolve para |
|---|---|
| `{NOME}` | `dados?.nomeCliente` |
| `{TIPO_EVENTO}` | `dados?.tipoEvento` |
| `{DATA}` | `dataPT(dados?.dataEvento)` → `DD/MM/AAAA` |
| `{VALOR}` | `euros(valorNum)` → `1250€` ou `1250,50€` |
| `{SINAL}` | `euros(valorNum / 2)` — **metade do valor** |
| `{LINK_INTERESSE}` | `` `${window.location.origin}/interesse` `` |
| `{LINK_FOLHA}` | `dados?.linkFolha` |

#### d.3 — Modelos escritos em código (texto exacto)

**1. `prazoWhatsApp(nome, dataEventoISO, prazoISO)`** — `src/lib/disputaDia.js:314-321`. *O dia guardado: aviso à cliente de que a casa lhe reservou a data até uma dada altura.*

```
{Olá {nome}! | Olá!} Há mais interesse no dia {D de Mês}. Guardámos o dia para si até {D de Mês} — depois fica em aberto. Qualquer dúvida, é só responder por aqui.
```

Datas por `diaPorExtenso` (`disputaDia.js:303-309`): formato `«25 de Setembro»`. Usada em `src/pages/EventoPage.jsx:238-242` e `src/components/admin/PortalDoClienteSheet.jsx:638-642`.

**2. `sinalRecebidoWhatsApp(nome, dataEventoISO, ligacao)`** — `src/lib/disputaDia.js:331-341`. *O sinal entrou: avisar a cliente e mandá-la à página de acompanhamento.* Quatro variantes:

```
Com dia + ligação:
{Olá {nome}!|Olá!} Recebemos o seu sinal — o dia {D de Mês} fica reservado em seu nome. Qualquer dúvida, é só responder por aqui. A sua página acordou por inteiro: {ligacao}

Com dia, sem ligação:
{Olá {nome}!|Olá!} Recebemos o seu sinal — o dia {D de Mês} fica reservado em seu nome. Qualquer dúvida, é só responder por aqui.

Sem dia + ligação:
{Olá {nome}!|Olá!} Recebemos o seu sinal — a sua data fica reservada em seu nome. Qualquer dúvida, é só responder por aqui. A sua página acordou por inteiro: {ligacao}

Sem dia, sem ligação:
{Olá {nome}!|Olá!} Recebemos o seu sinal — a sua data fica reservada em seu nome. Qualquer dúvida, é só responder por aqui.
```

Nota do próprio código (`disputaDia.js:329-330`): «quando há [ligação], a mensagem TERMINA no endereço, **sem ponto a seguir**, para o WhatsApp ler a ligação limpa». Usada em `src/components/admin/AvisoSinalRecebido.jsx:60`.

**3. `getShareMessage(invite)`** — `src/pages/AdminPage.jsx:712-717`. *A partilha do convite/questionário com o cliente.*

```js
`Olá ${getTituloConvite(invite, submissions, eventTypes)}! ${emoji}\n\nO vosso questionário *Do Luxo à Mesa* está pronto.\n\nÉ só clicar aqui para começar: ${url}\n\n(O vosso código de acesso é: *${invite.code}*)\n\n${SLOGAN_CASA} ✨`
```

Renderizado:
```
Olá {título do convite}! 💍

O vosso questionário *Do Luxo à Mesa* está pronto.

É só clicar aqui para começar: {origin}/?codigo={code}

(O vosso código de acesso é: *{code}*)

Planeamos cada detalhe. Criamos memórias inesquecíveis. ✨
```

`emoji` = `"💍"` se `tipo?.icone === "couple"`, senão `"✨"` (`AdminPage.jsx:715`). `SLOGAN_CASA` = `"Planeamos cada detalhe. Criamos memórias inesquecíveis."` (`src/lib/casa.js:87-88`). Consumida por `ShareSheet`, `InviteDetailModal:160` e `InviteCreatedModal`.

**4. `textoParaDestinatario(comunicado, destinatario, endereco)`** — `src/lib/comunicados.js:784-789`. *O texto que sai para UMA pessoa numa expedição de folha.* **Não tem texto fixo** — é o corpo que a Nádia escreveu (`comunicado.mensagem`), ou o texto personalizado dessa pessoa se existir:

```js
destinatario.mensagem ??
  resolverMensagem(comunicado.mensagem || "", {
    nomeCliente: primeiroNome(destinatario.nome),
    linkFolha: endereco,
  });
```

`primeiroNome` (`comunicados.js:775-779`): «De um casal "Maria & João" sai a Maria — a mensagem vai para UM telefone.» De `SEM_NOME` sai `null` → o resolvedor põe `"___"`.

**5. `textoDifusao(comunicado, endereco)`** — `src/lib/comunicados.js:795-803`. *O mesmo texto, mas para colar numa lista de transmissão (ninguém tem nome).* Transformações exactas:

```js
.replace(/Olá,\s*\{NOME\}\s*([!,.])/g, "Olá$1")   // «Olá, {NOME}!» → «Olá!»
.split("{NOME}").join("")                          // {NOME} solto sai
.replace(/[ \t]{2,}/g, " ")                        // espaços a dobrar arrumam-se
.replace(/ ([!?.,;:])/g, "$1");                    // espaço antes de pontuação sai
```
Depois `resolverMensagem(semNome, { linkFolha: endereco })`.

**6. O modelo sugerido da mensagem de folha (placeholder do campo)** — `src/components/admin/MensagemEditor.jsx:266`. Não é valor por omissão; é o `placeholder` do textarea (texto cinzento):

```
Olá, {NOME}! Temos uma folha para si — pode ler e partilhar: {LINK_FOLHA}
```

**7. A semente da folha «Condições»** — `docs/migracoes/semear-comunicado-condicoes.sql:42`. O único texto de mensagem de folha que existe escrito no repo:

```
Olá, {NOME}! Preparámos uma folha com as condições para a montagem e a recolha do vosso grande dia. Pode abri-la aqui — e partilhá-la com o espaço, a wedding planner e os restantes fornecedores: {LINK_FOLHA}
```

**8. `WHATSAPP_URL`** — `src/components/portal/base.js:83-85`. *A ligação de contacto no portal do cliente, com contexto pré-escrito.*

```
Olá! Escrevo a partir da página de acompanhamento do meu evento.
```

Usada em `src/pages/PortalPage.jsx:193-195` e `:474`, e em `src/components/portal/DocumentosVista.jsx:1038, 1076, 1162, 2190`.

**9. `mensagemConversa` (o ecrã do sinal, no portal)** — `src/components/portal/SinalVista.jsx:382`:

```js
`Olá! Escrevo para tratar do sinal do meu evento${quandoDia ? ` de ${quandoDia}` : ""}.`
```
→ `"Olá! Escrevo para tratar do sinal do meu evento de {dia}."` ou, sem dia, `"Olá! Escrevo para tratar do sinal do meu evento."`

**10. O rodapé da folha pública** — `src/pages/ComunicadoPage.jsx:791-794`. Duas variantes, conforme a folha tenha título:

```
Olá! Escrevo sobre a folha «{título}» da Do Luxo à Mesa.
Olá! Escrevo sobre uma folha da Do Luxo à Mesa.
```

**11. As cortinas de erro da folha pública** — `src/pages/ComunicadoPage.jsx:912` e `:926` (prop `mensagemWhatsApp` do componente `Cortina`, definido em `:244`):

```
Olá! Tentei abrir um comunicado da Do Luxo à Mesa e não consegui.
Olá! Abri o endereço que me enviaram e diz que não há nenhum comunicado da Do Luxo à Mesa.
```

**12. A partilha da campanha de contribuição** — `src/components/admin/ContribuicaoColetiva.jsx:1010-1017`. Sem texto fixo próprio: é a mensagem da campanha + o endereço, ou só o endereço:

```js
const url = `${window.location.origin}/contribuir/${campanha.token}`;
const texto = campanha.mensagem ? `${campanha.mensagem}\n${url}` : url;
window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
```

**13. Links sem mensagem** (só abrem a conversa): `src/pages/EventoPage.jsx:1052` — `linkWhatsApp(numeroWhatsapp)`; `src/components/admin/CentroNotificacoes.jsx:340` — `linkWhatsApp(whatsapp || contacto)`; `src/components/admin/MensagensSheet.jsx:258` (teste de existência).

#### d.4 — Formatação: a sintaxe é a do WhatsApp

`src/lib/realce.jsx` implementa `*negrito*` e `_itálico_` **com as regras do WhatsApp, de propósito** (cabeçalho, linhas 1-18): «é a que ela já usa todos os dias nas mensagens da loja — uma só regra em toda a casa (e na mensagem que acompanha o endereço é o próprio WhatsApp que a lê, sem código nenhum)». Regexes exactos (`realce.jsx:20-21`):

```js
const NEGRITO = /\*(\S(?:[^*\n]*\S)?)\*/;
const ITALICO = /_(\S(?:[^_\n]*\S)?)_/;
```

Regras: o marcador abraça o texto (`*assim*`, nunca `* assim *`), não salta linhas, e um marcador sem par fica tal e qual. Negrito a peso 600. Decisão registada em `docs/decisoes-de-produto.md:1170-1175`.

---

## 10. PADRÕES REUTILIZÁVEIS

### (a) Página de LISTAGEM com CRUD — `src/components/admin/ComunicadosTab.jsx`

**Porque é o melhor exemplo.** É a listagem mais recente da casa (fase B dos comunicados) e a única que fecha o ciclo completo *sem* sair do padrão: cria (escolhedor de duas vias, sem escrever nada na base até ao primeiro Guardar), lista (ordenada por peso de estado — `const ordenados = lista ? [...lista].sort((a, b) => PESO[estadoDe(a)] - PESO[estadoDe(b)]) : []`, `:1346-1348`), abre/edita (rota), apaga (duas fases inline, com recusa honesta quando a folha tem história). Tem os quatro estados de carregamento tratados a sério — esqueleto, vazio-convite, erro com «Tentar de novo», e erro de acção separado do erro de lista — e o estado da vista vive no URL, não em `useState`.

| # | Anatomia | Onde |
|---|---|---|
| 1 | **Estado da lista com três valores**: `null` = ainda a caminho, `[]` = vazio de verdade, lista = dados. Nunca um booleano `loading`. | `ComunicadosTab.jsx:1134` (`const [lista, setLista] = useState(null); // null = ainda a caminho`) |
| 2 | **O estado deriva da rota**, não de vistas internas: `idAberto`, `tab`, `vista` são calculados de `rotaP1`/`rotaP2` em render. | `:1143-1146` |
| 3 | **Efeito rota→estado idempotente**, com `replace: true` nas correcções de URL e sem `setState` em seco (comentário explícito: «apagar era escrever estado em seco no efeito, a regra de lint da casa»). | `:1232-1276` |
| 4 | **Leitura em cadeia de promessas, não `async/await`**: «todos os setState vivem dentro de callbacks, e o efeito de arranque não corre nada síncrono. O erro limpa-se QUANDO os dados chegam, não antes de tentar — um recarregar falhado não pisca a mensagem.» | `:1216-1230` |
| 5 | **Apagar em duas fases**, com desarme automático aos 4 s (`setTimeout(… , 4000)`) por efeito com `clearTimeout` no cleanup. | `:1148-1157` e `apagar()` em `:1185-1202` |
| 6 | **Chamada à BD com guarda de domínio no lado da lib**: `apagarComunicado` relê `n_acessos`/`congelado_em` e lança `"Esta folha tem história — leituras ou uma lista de envios. Retira-se; não se apaga."` | `src/lib/comunicados.js:90-104` |
| 7 | **Erro de lista e erro de acção separados**, ambos `role="alert"`, cor `#DC2626`, e o da lista traz um botão `.ligacao` «Tentar de novo». | `:1532-1543` (lista) e `:1545-1549` (apagar) |
| 8 | **Esqueleto com a forma do que vem** (3 blocos `h=68 r=12`), não spinner. | `:1551-1557` |
| 9 | **Estado vazio como convite**, com uma acção concreta (`Convite` partilhado: «Nenhuma folha, por enquanto.» + «Escrever a primeira folha»). | `:1559-1568` |
| 10 | **Acessibilidade**: `role="tablist"`/`aria-label="Envios ou modelos"`/`role="tab"`/`aria-selected` nas duas vistas irmãs; a razão do X esmaecido desarma sozinha aos 6 s, por clique fora **e por Escape** («quem abre por teclado fecha por teclado»), nunca por `title` escondido. | `:1442-1476` e `:1159-1183` |

**Peças partilhadas que reutiliza:** `Convite` e `Esqueleto` de `src/components/admin/acabamento.jsx:19` e `:71`; a camada de interacção `.acao`, `.acao--ouro`, `.ligacao` de `src/index.css:189-501`; `listarComunicados`/`getComunicado`/`apagarComunicado`/`prepararDeModelo` (`comunicados.js:946`)/`rotuloDaRegra` (`:1140`) de `src/lib/comunicados.js`; a lista de modelos delegada em `ComunicadoModelos.jsx`; um bloco `<style>{`…`}</style>` local só para os *hovers* que estilos inline não dão (`:1364-1393`, classes `dlm-`).

**Runner-up com CRUD ainda mais completo (criar + editar + inline + soft-delete):** `src/components/admin/MateriaisInventario.jsx` — grelha de cartões com filtro por grupo, busca, *stepper* inline optimista com debounce de 600 ms (`:491`) e *flush* no `unmount` **e** no `pagehide` (`:494-515`), erro de gravação encaminhado para o pai porque o cartão pode já estar desmontado (`:145-157`). Não é o exemplo canónico porque usa emoji como ícone (`🔍` `:293`, `✕` `:338`, `⚠`/`✓` `:261`,`:276`) e *handlers* `onFocus`/`onBlur` a escrever `style` à mão (`:312-319`), ambos contra a doutrina actual.

---

### (b) FORMULÁRIO — `src/components/captacao/CaptacaoForm.jsx`

**Porque é o melhor exemplo.** É o único formulário **partilhado entre porta pública e porta interna** — o cabeçalho di-lo por escrito: «UM formulário, UMA verdade: os campos, labels e regras são os MESMOS em todas as portas (pedido explícito de consistência).» (`:17-18`). Tem validação por campo com mensagens que dizem o que fazer, limpeza do erro no próprio `onChange`, regras que mudam consoante a porta (`modoInterno`), progresso reportado ao exterior com **o mesmo critério do `validar()`** («barra cheia tem de significar validação a passar»), telemetria de falha para a BD, e um estado pós-submissão de deduplicação que explica em vez de bloquear.

| # | Anatomia | Onde |
|---|---|---|
| 1 | **Um `useState` por campo** (+ `tipos`) + `erros` (mapa por campo) + `enviando` + `erroGeral` + `avisoDedupe` + `disputaDia`. Sem biblioteca de formulários. | `:66-97` |
| 2 | **`validar()` puro** que devolve/`setErros` um objecto `{campo: frase}` e retorna booleano; nenhuma validação em `useEffect`. | `:232-270` |
| 3 | **O erro morre no `onChange` do próprio campo**: `setErros((p) => ({ ...p, nome: undefined }))`. | `:443-448` e repetido em todos os campos |
| 4 | **Erros em cascata limpos juntos** quando uma escolha muda as regras: mudar serviços limpa `servicos`, `buffet`, `balcao` **e** `convidados` (`:196-205`, dentro de `toggleServico` `:187-205`); mudar o espaço limpa `espaco`, `localOutro` **e** `convidados` (`:579-587`). | `:196-205`, `:579-587` |
| 5 | **Regras diferentes por porta**, justificadas: `convidadosObrigatorios = !modoInterno && !pedidoSoCenario` (`:134-138`); mínimo de 9 dígitos no contacto só na porta pública, porque «o dedupe do Postgres não consegue comparar». | `:237-245` |
| 6 | **Progresso derivado com o mesmo critério da validação**, num efeito que só reporta para fora. | `:143-185` |
| 7 | **Chamada à BD**: `submeterCaptacao(...)` de `src/lib/captacao.js`; leitura autenticada extra do nome da ficha reutilizada (`supabase.from("clientes")`), *best-effort* com `console.warn`. | `:287-336` |
| 8 | **Falha registada na base**, não só na consola: `registarErroFormulario({origem:"captacao", erro, contexto, respostas})` grava em `form_errors` com as respostas do cliente para recuperação. | `:340-357`; lib em `src/lib/errosForm.js:40-66` |
| 9 | **Feedback de erro**: por campo (`<Erro>` 12px `#DC2626`, `:884-890`), geral acima do botão (13px `#DC2626`, `:824-834`), borda do campo a `1.5px #DC2626` (`inputStyle`, `:892-902`). Nenhum `alert()`. | — |
| 10 | **Acessibilidade**: `<label>` por campo no helper `Campo` (`:862-882`), `aria-label` nos botões-ícone («Remover imagem» `:765`, «Adicionar imagens» `:799`), `type="button"` (5 ocorrências) nos botões que não submetem. | — |

**Peças partilhadas que reutiliza:** `src/lib/captacao.js` (`submeterCaptacao`, `getTiposParaCaptacao`, `MAX_IMAGENS_REFERENCIA`), `src/lib/errosForm.js`, `src/lib/disputaDia.js` (`irmaosDoDia`), `src/components/AvisoDiaDisputado.jsx`, `src/lib/supabase.js`. Os helpers de aparência (`Campo`, `Erro`, `inputStyle`, `pillStyle`) são **locais ao ficheiro** — não existe um módulo de campos de formulário partilhado no admin.

**Nota:** o formulário público multi-passo (`src/pages/FormPage.jsx` + `src/components/form/FormField.jsx` + `src/lib/validation.js`) é o outro pólo: tem validadores nomeados (`phone`, `email`, `futureDate`, `positive` — `validation.js:70,74,78,82`) e `validateStep` (`:91`), mas o `FormField` escreve `style` directamente no DOM em `onFocus`/`onBlur` (`FormField.jsx:123-138`) e usa `⚠️` como glifo (`:226`) — padrões que a casa já não repete.

---

### (c) MODAL / folha lateral — `src/components/admin/PortalDoClienteSheet.jsx`

**Porque é o melhor exemplo.** É a folha que resolve os quatro problemas todos de uma vez: abertura com foco, fecho por Escape **sem roubar a tecla a um campo**, devolução do foco a quem abriu, e — o que a distingue — **o conteúdo é um componente à parte montado só quando a folha abre**, para o estado nascer limpo sem ser reposto dentro de um efeito. O comentário nomeia a razão: «O CONTEÚDO é componente à parte, montado só quando a folha abre. Assim o estado nasce limpo a cada abertura sem ser reposto dentro de um efeito — que é a família do bug de produção do documento, e que o linter proíbe com razão.» (`:74-77`).

| # | Anatomia | Onde |
|---|---|---|
| 1 | **Casca separada do conteúdo**: `PortalDoClienteSheet` (invólucro + foco + Escape) e `Conteudo` (todo o estado). | `:2238` e `:227` |
| 2 | **Foco ao abrir**: guarda `document.activeElement` em `origemRef` e faz `painelRef.current?.focus({ preventScroll: true })`. | `:2245-2248` |
| 3 | **Escape que não rouba a tecla**: ignora quando o alvo é `INPUT`/`TEXTAREA`/`SELECT`. | `:2249-2254` |
| 4 | **Devolve o foco no cleanup**: `if (origemRef.current?.focus) origemRef.current.focus();` | `:2256-2259` |
| 5 | **Atributos de diálogo**: `role="dialog"`, `aria-modal="true"`, `aria-label="A página que a cliente pode acompanhar"`, `tabIndex={-1}`. | `:2283-2286` |
| 6 | **Véu que fecha ao clicar fora** (`rgba(26,26,26,0.32)`, `zIndex: 1000`) + `stopPropagation` no painel. | `:2266`, `:2287` |
| 7 | **Movimento**: `AnimatePresence` + véu 0.2 s e painel 0.32 s na curva de folha iOS `[0.32, 0.72, 0, 1]`; sobe de baixo (`alignItems: "flex-end"`), `maxWidth: "520px"`, `borderRadius: "16px 16px 0 0"`, `padding: "24px 24px 28px"`, `boxShadow: "0 -8px 40px rgba(0,0,0,0.15)"`, `maxHeight: "88vh"`, `overflowY: "auto"`. | `:2263-2302` |
| 8 | **Erros por zona, junto ao gesto que falhou**: `erro` é `{zona, mensagem}` e cada secção pinta o seu — «nunca no fundo da folha (que rola, e onde ninguém está a olhar)»; texto `12.5px` `#B91C1C`. | `ErroDaZona` `:208-225`; `setErro({zona:…})` ao longo de `:360-603` |
| 9 | **Rede de segurança do erro**: se a zona já não estiver montada (`zonasMontadas`, `:787-800`), o erro pinta-se no fim — «nunca pode simplesmente desaparecer». | `:2207-2219` |
| 10 | **Confirmação inline, no próprio ecrã**, a nomear o que se perde: «nunca window.confirm, e nunca um «tem a certeza?» que não diz o que se perde.» | `:2088-2100` (fechar o acompanhamento) e `:266-268` (limpar a configuração) |

**Peças partilhadas que reutiliza:** `framer-motion` (`motion`, `AnimatePresence`); a camada de interacção do `index.css`; `src/lib/portal.js` para os actos. **Não existe** um componente `Modal`/`Sheet` genérico partilhado — os dez ficheiros com `Modal`/`Sheet`/`Drawer` no nome (`DeleteInviteModal`, `InviteCreatedModal`, `InviteDetailModal`, `MaterialModalRico`, `MensagensSheet`, `PortalDoClienteSheet`, `RemoverEventoModal`, `ReservaModal`, `ShareSheet`, `SubmissionDrawer`) são todos específicos do seu conteúdo. O padrão replica-se por cópia disciplinada: `src/components/admin/CentroNotificacoes.jsx:1529-1608` tem exactamente o mesmo bloco de foco/Escape (gaveta lateral, `role="dialog"` `:1573`, mola `damping:30 / stiffness:320` `:1580`), e `src/components/admin/SubmissionDrawer.jsx:147-153` é a origem citada do padrão do Escape.

**Onde `role="dialog"` existe de facto** — só 10 ficheiros em `src/`: `CentroNotificacoes.jsx`, `ComunicadoEditor.jsx`, `ComunicadoExpedicao.jsx`, `FormularioDoEvento.jsx`, `GuardarComoMolde.jsx`, `MensagemEditor.jsx`, `PortalDoClienteSheet.jsx`, `portal/AsFotografias.jsx`, `portal/DocumentosVista.jsx`, `portal/PorticoDoSinal.jsx`. Nenhum dos outros `*Modal`/`*Sheet`/`*Drawer` o tem (zero `aria-modal` em `ShareSheet`, `MensagensSheet`, `ReservaModal`, `RemoverEventoModal`, `DeleteInviteModal`, `InviteDetailModal`, `InviteCreatedModal`, `MaterialModalRico`, `SubmissionDrawer`).

**Variantes canónicas por forma:**
- **Ecrã inteiro** (editor): `src/components/admin/MensagemEditor.jsx:159-172` — `role="dialog"` + `aria-modal` + `aria-label="A mensagem da folha"`, fundo `var(--cream)`, `zIndex: 60`, cabeçalho e rodapé fixos, corpo com scroll, `role="alert"` no rodapé (`:425`), visto 900 ms antes de fechar (`:136`), bloco `<style>` local `dlm-token` (`:175-185`).
- **Gaveta de baixo**: `src/components/admin/GuardarComoMolde.jsx:226-278` — véu `rgba(26,26,26,0.28)` com `transition: opacity 200ms`, `role="dialog"` + `aria-modal="true"` + `aria-label="Guardar como modelo"` + `aria-hidden={!aberta}` (`:255-258`), `transform: translateY(105%)` → `0` em `320ms cubic-bezier(0.32,0.72,0,1)` (`:269-270`), `useReducedMotion()` a desligar as duas transições, `borderRadius: "18px 18px 0 0"` (`:266`), `boxShadow: "0 -12px 48px rgba(0,0,0,0.12)"` (`:267`), pega de 36×4 px (`:277`).
- **Diálogo simples de confirmação**: `src/components/admin/EventTypesTab.jsx:449-559` — véu `rgba(0,0,0,0.35)`, cartão branco `borderRadius:16px`, `padding:24px`, `boxShadow:"0 8px 48px rgba(0,0,0,0.15)"`, erro traduzido do código Postgres `23503` para linguagem humana (`:31-39`). **Não tem** `role="dialog"` nem gestão de foco — é o padrão antigo (o gémeo é `MaterialModalRico.jsx:148-172`, também sem `role`).

---

### ANTI-PADRÕES que a casa proíbe explicitamente

| Proibição | Citação literal | Ficheiro:linha |
|---|---|---|
| `alert()` | «Barra no próprio cartão — a regra da casa não deixa alert()» | `src/components/admin/ErrosFormulario.jsx:49` |
| `alert()` | «…e o alert() está proibido pela regra da casa.» | `src/components/admin/MateriaisInventario.jsx:78` |
| `alert()` | «Falhas de upload/gravação falam aqui — a regra da casa proíbe alert()» | `src/components/admin/orcamentos/GerarOrcamento.jsx:132` (gémeo em `GerarProposta.jsx:53`) |
| `alert()` | «Devolve { ok } — falso quando o browser bloqueia o pop-up, para o ecrã avisar na barra da casa (nunca alert()).» | `src/lib/imprimirConferencia.js:10-11` |
| `alert()` / diálogos do browser | «Nunca `alert()`/diálogos do browser — tudo se diz na própria página, no lugar onde aconteceu.» | `docs/identidade-visual.md:253-254` (repetido em `docs/levantamento-comunicados.md:540`) |
| `window.confirm` | «Nunca window.confirm — regra da casa.» | `src/components/admin/RemoverEventoModal.jsx:22` |
| `window.confirm` | «O mesmo botão, armado: o segundo clique é que remove (confirmação inline no próprio sítio — nunca window.confirm, regra da casa)» | `src/components/admin/EventTypeEditor.jsx:251-252` |
| `window.confirm` (na lib) | «Apaga um pagamento — a UI tem de confirmar com valor+data ANTES de chamar isto (ver PagamentosEvento.jsx). Nunca window.confirm.» | `src/lib/pagamentos.js:235-236` |
| `window.confirm` (na lib) | «A UI confirma antes de chamar — nunca window.confirm (mesmo padrão da remoção de pagamentos).» | `src/lib/notas.js:87-88` |
| Confirmação vazia | «nunca window.confirm, e nunca um «tem a certeza?» que não diz o que se perde.» | `src/components/admin/PortalDoClienteSheet.jsx:2090-2091` |
| `setState` no corpo de um efeito | «Recarga por contador, e não por chamada directa dentro do efeito: o linter proíbe setState no corpo de um efeito, e com razão — é a família do bug que chegou a produção. Aqui o efeito só arranca o pedido; quem escreve estado é a resposta.» | `src/components/admin/FotografiasEvento.jsx:79-82` |
| `setState` no corpo de um efeito | «O estado DERIVA de a resposta guardada ser deste token, em vez de ser reposto por um setState no corpo do efeito (que o linter proíbe, com razão — é a família do bug de produção do documento).» | `src/pages/PortalPage.jsx:416-418` |
| `setState` no corpo de um efeito | «…a chave é derivação pura em render (o linter novo da casa não deixa setState em efeitos — a primeira versão caiu aí e foi reescrita)» | `docs/decisoes-de-produto.md:1298-1299` |
| Misturar funções puras com componentes | «o linter da casa proíbe misturá-las com componentes no mesmo ficheiro (react-refresh/only-export-components)» | `src/components/portal/base.js:5-6` (repetido em `pecas.jsx:21-22`, `conteudo.js:5-6`) |
| `lib/` importar de `components/` | «a regra da casa é que lib/ não importa de components/» | `src/components/admin/faseConfig.js:104-105` (e `src/lib/fases.js:11-12`) |
| Bibliotecas de ícones, glifos ✓ ✕ ● ○, emoji como ícone | «**Proibido no backoffice**: bibliotecas de ícones, glifos de texto (✓ ✕ ● ○) como marcas, e emoji como ícone.» — com a excepção declarada a seguir: «**No público, o 🥂 é permitido** — mas só dentro de frases de celebração…» | `docs/identidade-visual.md:225-226` (excepção em `:227-228`) |
| Glifos como marcas (razão técnica) | «Existem porque os glifos de texto ✓/✕ variavam de peso e de linha de base conforme a fonte do sistema — uma marca é desenho, não texto.» | `src/components/admin/marcas.jsx:5-7` |
| Tailwind / CSS externo | «Estilos INLINE, como o resto da aplicação. Nada de Tailwind, nada de CSS externo.» | `src/components/portal/pecas.jsx:12-13` |
| `@import` de fontes no CSS | «NÃO as tragas de volta para aqui: o `@import "tailwindcss"` da linha acima é substituído pelo plugin por milhares de linhas de CSS… foi o que aconteceu, e a aplicação inteira pintou em Noto durante esse tempo todo.» | `src/index.css:2-7` (e `index.html:34-49`) |
| Loops de animação perpétuos / animar ao abrir | «Regra nº 1: o movimento marca acontecimentos; o estado é imóvel… **Nada anima ao abrir.**» | `docs/identidade-visual.md:133-141` |
| `#9B9B9B` em algo clicável | «`#9B9B9B` nunca serve algo que se clica — não chega ao contraste mínimo.» | `docs/identidade-visual.md:70-72` |
| Spinners | «esqueletos com a forma do conteúdo que vem… nunca spinners, nunca frases a fingir de conteúdo.» | `docs/identidade-visual.md:177-179` |
| pt-BR / segunda pessoa | «Português europeu, sempre — nunca pt-BR… Terceira pessoa em todo o texto, nos dois registos» | `docs/identidade-visual.md:234-241` |

**Violações vivas da regra do `alert()`** (o levantamento é do código real, não do ideal): `src/components/admin/FichaEvento.jsx:440` `alert("Não foi possível adicionar. Tenta novamente.")` e `:453` `alert("Não foi possível remover. Tenta novamente.")`. São as duas únicas chamadas a `alert()` em `src/`; não há nenhuma a `window.confirm`/`confirm()`.

---

## 11. DESIGN SYSTEM

**Não existe um ficheiro único de design system.** Não há `design-system.js`, `tokens.js`, `theme.js` nem equivalente em `src/`; os únicos ficheiros `.css` de toda a aplicação são dois. O que existe é:

- `src/index.css` (712 linhas) — 6 custom properties, a camada de interacção por classes, as animações e os `prefers-reduced-motion`;
- `src/lib/tour.css` (76 linhas) — tematização do `driver.js`, isolada por `.dlm-tour-popover`;
- `src/components/portal/base.js` (251 l.) — helpers de tipografia (`overline`, `playfair`), `HACHURA`, datas e dinheiro;
- `src/components/portal/pecas.jsx` (231 l.), `documentos-pecas.jsx` (610 l.), `questionario-pecas.jsx` (414 l.), `divisoes.jsx` (594 l.) — as peças do registo público;
- `src/components/admin/acabamento.jsx` (108 l.) — `Convite` (`:19`), `Esqueleto` (`:71`), `useContagemAnimada` (`:81`); `src/components/admin/marcas.jsx` (49 l.) — `MarcaVisto`, `MarcaCruz`;
- `src/lib/casa.js` — identidade da empresa e `FONTE_ASSINATURA_CASA` (`:50-51`);
- `docs/identidade-visual.md` (293 l.) — o guia escrito, **documentação e não código**: os seus valores não são importáveis por ficheiro nenhum.

Tudo o resto são valores literais escritos em cada sítio de uso.

### (a) TOKENS DE COR

**As únicas CSS custom properties definidas** — `src/index.css:9-16`:

| Token | Valor | Usos em `src/` |
|---|---|---|
| `--gold` | `#c9a84c` | 375 |
| `--gold-light` | `#e8d5a3` | 347 |
| `--gold-dark` | `#a07830` | 229 |
| `--cream` | `#fafaf8` | 40 |
| `--charcoal` | `#1a1a1a` | 276 |
| `--gray-mid` | `#6b6b6b` | 572 |

**Duas variáveis usadas mas NUNCA definidas** (só sobrevivem pelo *fallback*): `var(--hairline, #F0E6D0)` — 20 ocorrências (`PortalDoClienteSheet.jsx` 9, `FotografiasEvento.jsx` 6, `AvaliacoesTab.jsx` 4, `orcamentos/GerarContrato.jsx:1048` 1) — e `var(--branco-quente, #FDFBF5)` — 6 ocorrências (`LacunasFormulario.jsx:72`; `PortalDoClienteSheet.jsx:928`, `:1252`, `:1285`, `:1338`, `:1513`). O `--hairline:` e o `--branco-quente:` **não existem** em `:root` nem em lado nenhum de `src/` ou do `index.html`.

**Hexadecimais soltos, por frequência** (`grep -rhoE "#[0-9A-Fa-f]{6}" src/`, normalizado para maiúsculas):

| Ocorr. | Hex | Papel observado no código |
|---|---|---|
| 168 | `#F0E6D0` | hairline padrão — divisores, bordas de cartão |
| 168 | `#9B9B9B` | rótulos apagados, meta, overlines cinzentos |
| 98 | `#C9A84C` | o ouro escrito à mão em vez de `var(--gold)` |
| 97 | `#FBF7EF` | lavado quente — hover de botão contornado, fundos de secção |
| 73 | `#DC2626` | vermelho de erro (texto) |
| 69 | `#E8D5A3` | o ouro claro escrito à mão em vez de `var(--gold-light)` |
| 63 | `#92400E` | âmbar escuro de aviso |
| 62 | `#FEF9EC` | lavado de pastilha — selos e etiquetas douradas |
| 54 | `#B91C1C` | vermelho de erro alternativo |
| 52 | `#FECACA` | borda de perigo |
| 50 | `#FEF2F2` | fundo de perigo |
| 49 | `#F0D9B5` | borda de aviso |
| 44 | `#E8DCC0` | aro de engaste (passo futuro), trilho |
| 44 | `#166534` | verde de sucesso / dinheiro recebido |
| 43 | `#FDFBF5` | branco-quente — engastes vazios, «por preencher» |
| 40 | `#A07830` | o ouro escuro escrito à mão |
| 35 | `#FEF3E2` | fundo de aviso |
| 35 | `#F5ECD7` | hairline leve — linhas de tabela |
| 33 | `#FFFFFF` | branco explícito (a maioria usa `"white"`) |
| 29 | `#6B7280` | cinzento neutro/terminado |
| 26 | `#9C5A3C` | o «tijolo» — só marcas de 6 px e traços de «tirar», nunca fundos nem botões (`documentos-pecas.jsx:16-18`) |
| 23 | `#1A1A1A` | o charcoal escrito à mão |
| 22 | `#EF4444` | vermelho de botão destrutivo |
| 21 | `#BBF7D0` | borda de sucesso |
| 18 | `#F0FDF4` | fundo de sucesso |
| 15 | `#B45309` | âmbar de aviso (texto) |
| 14 | `#E5E7EB` | cinzento neutro de borda |
| 11 | `#F3EBDA` | hairline do papel (folhas impressas) |
| 11 | `#C4C4C4` | traços quase invisíveis (acções destrutivas discretas) |
| 11 | `#6B6B6B` | o gray-mid escrito à mão |
| 10 | `#FFFDF6` | lavado de aviso suave |
| 10 | `#22C55E` | verde vivo (pastilhas de estado: `faseConfig.js:96`, `ReservaModal.jsx:337`, `MateriaisInventario.jsx:268`) |
| 10 | `#8900FF` | **não é da casa** — o roxo do logótipo do Vite em `src/assets/vite.svg`, resíduo do template |

`rgba(201,168,76, …)` — o halo dourado — aparece **85 vezes** em `src/` (fora do `index.css`), mais **7** no próprio `index.css`: anéis de foco `0.28` (`:431`) e `0.12` (`:456`), realce `0.16` ×2 (`:542`, `:547`), pulso `0.5`→`0` (`:561`, `:564`) e a sombra fixa `0.35` do `prefers-reduced-motion` (`:633`).

### (b) TIPOGRAFIA

**Três famílias, carregadas no `<head>` do `index.html:50-58`** (Google Fonts, com `preconnect`), nunca por `@import` no CSS:
- `Playfair Display` — `ital,wght@0,400;0,600;1,400`
- `Inter` — `wght@300;400;500;600;700`
- `Great Vibes` — só a assinatura da casa (`FONTE_ASSINATURA_CASA` em `src/lib/casa.js:50-51`, pilha `'"Cochocib Script Latin Pro", "Great Vibes", cursive'`; a primeira é comercial e ainda não está licenciada — `casa.js:44-49`).

Aplicação base: `body { font-family: "Inter", sans-serif; }` e `h1,h2,h3 { font-family: "Playfair Display", serif; }` (`index.css:22-33`).

| Papel | Valores exactos | Onde |
|---|---|---|
| Overline público | `font: "700 9.5px Inter, sans-serif"`, `letterSpacing: "0.22em"`, `uppercase`, `color: "#A07830"` (parâmetros por omissão) | `src/components/portal/base.js:56-62` |
| Overline público, cinzento | `overline("#9B9B9B", "0.22em", "9px")` | `pecas.jsx:45`, `:156`, `:171`; `documentos-pecas.jsx:25` |
| Overline interno A | `9.5px / 700 / 0.15em / var(--gold-dark)` | `ComunicadosTab.jsx:137`, `ComunicadoModelos.jsx:26`, `MensagemEditor.jsx:48`, `GuardarComoMolde.jsx:30`, `ComunicadoEditor.jsx:68`, `FormularioDoEvento.jsx:42` — seis cópias; só duas (`ComunicadosTab`, `FormularioDoEvento`) incluem `textTransform: "uppercase"`, nas outras quatro a caixa alta fica no sítio de uso |
| Overline interno B | `10px / 700 / 0.16em / uppercase / var(--gold-dark) / margin:0` | `PortalDoClienteSheet.jsx:84`, `FotografiasEvento.jsx:31`, `AvaliacoesTab.jsx:22` (três cópias literais) |
| Mini-overline | `9px / 700 / 0.14em / #9B9B9B` | `ComunicadoModelos.jsx:33` |
| Assinatura de rodapé | `font: "700 9px Inter, sans-serif"`, `0.22em`, `uppercase`, `var(--gold-dark)`, `opacity: 0.62` | `pecas.jsx:209-226` |
| Título de página (interno) | Playfair `24px / 400 / lineHeight 1.3` | `ComunicadoModelos.jsx:197-206` |
| Título de secção (interno) | Playfair `22px / margin "0 0 4px 0"` | `ComunicadosTab.jsx:1494-1503` |
| Título de sobreposição | Playfair `21px / lineHeight 1.25` | `MensagemEditor.jsx:210-219`; `GuardarComoMolde.jsx:281` (`21px / 1.35`) |
| Frase de divisão (público) | `playfair` + `21px / textWrap: "balance"`, `lineHeight 1.3` (`pecas.jsx:128`) e `1.32` (`pecas.jsx:197`) | `pecas.jsx:128`, `:197` |
| Citação dela | Playfair itálico `16px / lineHeight 1.72 / var(--charcoal)` (predefinições) | `pecas.jsx:145-154` |
| Título de modal antigo | `16px`, Playfair, `uppercase`, `0.05em` | `MaterialModalRico.jsx:161-172`, `EventTypesTab.jsx:478-489` |
| Corpo | `13px` (237×) e `12.5px` (235×), `lineHeight` 1.6 / 1.65 / 1.7 | transversal |
| Secundário / meta | `12px` (360×, o tamanho mais usado da app), `11.5px` (166×) | transversal |
| Micro / notas | `11px` (231×), `10.5px` (45×), `10px` (109×) | transversal |
| Rótulo de campo (form) | `11px / 600 / uppercase / 0.05em / var(--charcoal)` | `CaptacaoForm.jsx:865-877`; variante `0.06em` em `MaterialModalRico.jsx:668-676` |
| Cabeçalho de secção de modal | `10px / 700 / uppercase / 0.1em / var(--gold-dark)` com `borderBottom: 1px solid var(--gold-light)` | `MaterialModalRico.jsx:606-622` |
| Números | `fontVariantNumeric: "tabular-nums"` — **70 ocorrências** (`NotasEvento.jsx:66`, `documentos-pecas.jsx:25,100,103`, `PortalPage.jsx` ×4, `ComunicadoExpedicao.jsx` ×3, …) | — |
| Grande número | `22px / 600 / lineHeight 1` | `MateriaisInventario.jsx:653-654` e `:669-670` |
| Monospace | só duas ocorrências em toda a app: código do material (`MateriaisInventario.jsx:583`) e a pré-visualização de importação (`ImportarTab.jsx:231`) | — |

`letterSpacing` em uso, por frequência: `0.05em` (42), `0.06em` (34), `0.08em` (33), `0.14em` (25), `0.02em` (21), `0.1em` (20), `0.15em` (19), `0.12em` (18), `0.16em` (17), `0.04em` (17), `0.18em` (14), `0.22em` (13), `0.03em` (12), `0.07em` (6).

### (c) RAIOS

| Valor | Ocorr. | Significado observado |
|---|---|---|
| `999px` | 198 em `borderRadius` inline (202 no total de `src/`, contando `index.css:143`, `tour.css:48` e dois blocos `<style>` locais em `PainelNovoFormulario.jsx:290` e `FormularioDoEvento.jsx:345`) | pílulas: pastilhas de filtro, selos, botões-cápsula, pega de gaveta, *scrollbar thumb* |
| `10px` | 152 | botões de acção, avisos, cartões pequenos |
| `8px` | 126 | campos de formulário, botões discretos, `.icone-botao` (`index.css:348`) |
| `12px` | 119 | cartões pequenos, caixas de texto, blocos de opção |
| `50%` | 90 | pontos, medalhões, engastes, cursor do deslizador (`index.css:692` e `:700`) |
| `14px` | 72 | **cartões de conteúdo** — `CartaoBranco` (`pecas.jsx:94`), `.cartao-escrita` (`index.css:452`), cartão de nota (`NotasEvento.jsx:142`), cartão de modelo (`ComunicadoModelos.jsx:366`) |
| `16px` | 34 | modais centrados (`MaterialModalRico.jsx:152`, `EventTypesTab.jsx:290` e `:471`), `.dlm-tour-popover` (`tour.css:8`) |
| `9px`, `7px`, `6px`, `5px`, `4px`, `3px`, `2px` | 12/4/7/2/8/4/2 | detalhes pequenos, esqueletos, pastilhas de código |
| `18px`, `20px`, `24px` | 3/5/1 | superfícies grandes |
| Assimétricos | — | `"18px 18px 0 0"` gaveta ×3 (`GuardarComoMolde.jsx:266`), `"20px 20px 0 0"` ×2, `"16px 16px 0 0"` folha de baixo (`PortalDoClienteSheet.jsx:2296`), `"10px 10px 0 0"` ×2, `"0 0 16px 16px"`, `"0 0 10px 10px"`, `"0 8px 8px 0"`, `"0 10px 10px 0"`, `"14px 14px 4px 14px"` (balão de WhatsApp, `MensagemEditor.jsx:338`) |
| **Cantos vivos (sem `borderRadius`)** | — | **só a folha e a placa dos documentos**: «Cantos vivos SÓ na folha e na placa: são objectos impressos, não cartões do ecrã» — `documentos-pecas.jsx:15-16`, componente `Folha` em `:35-49` |

### (d) ESPAÇAMENTOS

Escala real, medida por frequência em `src/`:

- **`gap`**: `8px` (116), `10px` (113), `12px` (99), `6px` (64), `14px` (36), `7px` (34), `16px` (21), `11px` (19), `9px` (17), `4px` (14), `13px` (6), `5px` (10), `24px` (7), `1px` (5 — usado de propósito para fazer hairlines entre linhas de uma lista com fundo `#F0E6D0`, `ComunicadoModelos.jsx:283-284`).
- **`padding` de controlo**: `"10px 14px"` (44), `"12px 14px"` (35), `"10px 12px"` (21), `"8px 14px"` (20), `"6px 12px"` (17), `"9px 16px"` / `"9px 12px"` / `"12px 16px"` (15 cada), `"8px 16px"` (13), `"10px 20px"` (12), `"5px 12px"` (11 — pastilhas).
- **`padding` de superfície**: `"14px"` (16), `"18px"` (13), `"16px 18px"` (13), `"20px"` (14), `"24px"` (12); modais a `24px` (`MaterialModalRico.jsx:153`, `EventTypesTab.jsx:291`), folha de baixo a `"24px 24px 28px"` (`PortalDoClienteSheet.jsx:2297`), `CartaoBranco` a `"22px 20px"` (`pecas.jsx:89`).
- **Larguras máximas**: `"640px"` (listas do admin), `"720px"` (corpo de editor), `"780px"` (coluna de notas), `"480px"` / `"520px"` / `"560px"` (público e gavetas), `"440px"` (linha de explicação sob um título).
- **Coluna lateral fixa**: `width: 220px; position: sticky; top: 120px` — `index.css:463-467`, com a nota «se a moldura mudar de altura, acerta-se AQUI, num sítio só». Usada em `NotasEvento.jsx:481` e `VisaoGeralEvento.jsx:322`.

### (e) SOMBRAS e BORDAS

Sombras, por frequência:

| Ocorr. | Valor | Papel |
|---|---|---|
| 31 | `0 2px 12px rgba(0,0,0,0.05)` | cartão |
| 17 (+5 com `0.3`) | `0 4px 12px rgba(201,168,76,0.30)` | botão dourado cheio |
| 6 | `0 8px 48px rgba(0,0,0,0.15)` | modal centrado |
| 5 | `0 8px 48px rgba(0,0,0,0.08)` | popover |
| 5 | `0 8px 24px rgba(0,0,0,0.1)` | flutuante |
| 5 | `0 2px 12px rgba(0,0,0,0.04)` | cartão leve |
| 4 | `0 4px 16px rgba(201,168,76,0.4)` | botão de acção principal de separador |
| 4 | `0 2px 24px rgba(0,0,0,0.08)` / `0 2px 16px rgba(0,0,0,0.06)` | cartão elevado |
| 3 | `0 14px 36px rgba(26,26,26,0.18)` | sobreposição grande |
| 3 | `0 10px 24px -16px rgba(180,140,40,0.6)` | dourada difusa (rara) |
| — | `0 -12px 48px rgba(0,0,0,0.12)` / `0 -8px 40px rgba(0,0,0,0.15)` | gavetas que sobem |
| — | `0 1px 0 #F6EFE0, 0 12px 30px -16px rgba(45,33,10,0.26)` | **sombra de papel** da `Folha` (`documentos-pecas.jsx:41-43`; selada: `0 1px 0 #F3EBDA`) |

Bordas — dominam duas espessuras, mas **não são as únicas**: em valores inline, `1px` aparece 497×, `1.5px` 179×, `2px` **19×**, e há um `3px` e um `5px`.

| Ocorr. | Valor |
|---|---|
| 104 | `1px solid var(--gold-light)` |
| 78 | `1.5px solid var(--gold-light)` |
| 47 | `1px solid #F0E6D0` |
| 39 | `1px solid #FECACA` |
| 35 | `1px solid #F0D9B5` |
| 30 | `1.5px solid var(--gold)` |
| 20 | `1px solid var(--hairline, #F0E6D0)` |
| 16 / 14 / 14 / 14 | `1px solid #E8D5A3` / `1px solid var(--gold)` / `1px solid #E8DCC0` / `1.5px solid #F0E6D0` |
| 13 | `1px solid #BBF7D0` |

Botões da camada de interacção usam `1.5px` (`index.css:271`, `281`, `290`, `301`, `310`, `319`); pastilhas e alternadores usam `1px` (`:359`, `:376`). **Bordas tracejadas: 29 ocorrências em 16 ficheiros** — não são um caso isolado. Os papéis são: estado vazio (`1.5px dashed #E8DCC0`, `ComunicadoModelos.jsx:249`), o «+» de adicionar imagem (`1.5px dashed var(--gold)`, `CaptacaoForm.jsx:793`), engastes por preencher e blocos por rever (`FormularioDoEvento.jsx:638`,`:764`; `ConferenciaPeriodo.jsx:395`,`:621`,`:857`; `EventTypeEditor.jsx:376`,`:895`,`:1582`), separadores de folha impressa (`imprimirConferencia.js:195`) e linhas de corte (`ComunicadoExpedicao.jsx:533`,`:1448`; `PagamentosEvento.jsx:1246`; `ClienteVista.jsx:252`; `GerarOrcamento.jsx:433`).

**Foco**: `outline: 2px solid var(--gold); outline-offset: 2px` para toda a camada de interacção mais a classe `.foco` (`index.css:240-252`); caixas de texto usam `box-shadow: 0 0 0 2.5px rgba(201,168,76,0.28)` (`index.css:429-432`); o `.cartao-escrita` acende inteiro com `focus-within` (`:454-457`, `0 0 0 3px rgba(201,168,76,0.12)`).

**Movimento em CSS** (`index.css`): transição de `140ms ease` em sete propriedades para toda a camada de interacção (`:196-216`); `scale(0.98)` no clique de botões e `scale(0.92)` nos ícones (`:254-262`); `@keyframes` — `painel-entra` (`:506`, 160 ms, `cubic-bezier(0.32,0.72,0,1)`), `esqueleto-ondula` (`:522`, 1.6 s infinito), `linha-chega` (`:538`, 1.1 s), `realce-pulso` (`:559`, 1.2 s ×2), `portal-filete` (`:574`, 2500 ms linear, uma vez), `portal-sopro` (`:585`, 6 s infinito), `portal-mola` (`:604-617`, sem classe que a use no próprio ficheiro).

**`prefers-reduced-motion`**: três blocos separados — `:593-598` (filete e sopro), `:619-635` (jornada, pílula, painel, esqueleto, linha, realce — este último troca a animação por `box-shadow: 0 0 0 3px rgba(201,168,76,0.35)`), `:637-652` (todas as transições da camada de interacção). Em JS, `useReducedMotion()` do framer-motion em **14 ficheiros** (`ComunicadosTab`, `ComunicadoEditor`, `ComunicadoExpedicao`, `ComunicadoRecorte`, `GuardarComoMolde`, `CentroNotificacoes`, `ConferenciaPeriodo`, `ContribuicaoColetiva`, `DocumentosEvento`, `FormularioDoEvento`, `Jornada`, `PagamentosEvento`, `PortalPage`, `ContribuirPage`) e `window.matchMedia("(prefers-reduced-motion: reduce)")` em `acabamento.jsx:90`.

**Media queries de impressão em `src/index.css`: não existem.** As regras `@media print` / `@page` vivem só nos geradores de documento: `src/lib/imprimirFicha.js:232`, `src/lib/imprimirConferencia.js:200`, `src/pages/BriefingPage.jsx:678-682`, `src/pages/ComunicadoPage.jsx:55-56`, `src/components/portal/documentos-pecas.jsx:587`, `orcamentos/GerarProposta.jsx:128-141`, `GerarOrcamento.jsx:293-312`, `GerarContrato.jsx:299-308`. As margens não são todas iguais: `@page { size: A4; margin: 2cm }` no contrato multi-página (`GerarContrato.jsx:308`), `margin: 0` no orçamento, na proposta e no briefing (para matar cabeçalhos e URL do browser), e `margin: 13mm 15mm 12mm` na folha pública do comunicado (`ComunicadoPage.jsx:55`).

Outras media queries de `index.css`: `max-width: 600px` (`:61-105`), `min-width: 768px` (`:149-156`, `:162-166`), `pointer: coarse` (`:169-177` — `min-height: 42px` nos botões e `font-size: 16px !important` nos campos para evitar o zoom do iOS), `min-width: 900px` (`:183-187`).

### (f) MÉTODO DE ESTILIZAÇÃO

**Estilos inline em objectos JS, esmagadoramente.** `style={{` aparece **3 842 vezes** em `src/`. As classes existem só para o que um atributo `style` não consegue fazer:

1. **A camada de interacção** (`index.css:189-501`) — hover, `:focus-visible`, `:active`, `:disabled`, `:focus-within`. Uso medido (ocorrências do nome exacto da classe em `src/`, incluindo as definições no próprio `index.css`): `.acao` 134 + variantes (`--cheia` 36, `--ouro` 33, `--neutra` 19, `--verde` 5, `--perigo` 4, `--perigo-cheia` 3), `.ligacao` 61, `.caixa-texto` 46, `.foco` 47 (classe só-de-foco, sem estilo próprio), `.toca` 23, `.icone-botao` 22 (+ `--perigo` 4), `.esqueleto` 21, `.pastilha-escolha` 14 (+ `--activa` 6), `.alternador` 13 (+ `--activo` 2), `.separador-aba` 9 (+ `--activa` 3), `.indice-item` 9 (+ `--activa` 3), `.campo-editavel` 9, `.realce-pulso` 7, `.h-scroll` 7, `.linha-nova` 6, `.caixa-fantasma` 5, `.cartao-escrita` 5, `.etapa-jornada` 5, `.pilula-seta` 5, `.jornada-bola` 4, `.painel-aba` 3, `.coluna-lateral` 3, `.pilula-gesto` 3. A doutrina está escrita no topo do bloco: «As variantes carregam a identidade (cor, borda, fundo), para o hover poder responder sem lutar com estilos inline; tamanho e disposição ficam no sítio de uso, que é onde variam.»
2. **Blocos `<style>{`…`}</style>` locais** — **17 ficheiros `.jsx`**. Sete deles são backoffice com prefixo `dlm-`, sempre justificados por um hover que o inline não dá (ex.: `ComunicadoModelos.jsx:181-195` — «Os hovers que os estilos em linha não dão (regra da camada de interacção)»; `MensagemEditor.jsx:175-185`; `ComunicadosTab.jsx:1364-1393`; `ComunicadoEditor`, `CentroNotificacoes`, `InicioTab`, `Navegacao`). Os outros dez não usam `dlm-`: são CSS de impressão e de documento (`BriefingPage`, `ComunicadoPage`, `documentos-pecas`, `GerarProposta`, `GerarOrcamento`, `GerarContrato`) ou selectores próprios (`FormPage`, `DocumentosLista`, `PainelNovoFormulario`, `FormularioDoEvento`).
3. **Pseudo-elementos** — a excepção declarada, `index.css:654-661`: «A casa usa estilos inline em todo o lado. Estas quatro regras são a excepção porque NÃO TÊM equivalente inline: o cursor de um `input[range]` só se estiliza por pseudo-elemento, e um pseudo-elemento não cabe num atributo `style`.»

**Tailwind está instalado mas é resíduo, não método.** `tailwindcss ^4.3.0` e `@tailwindcss/vite ^4.3.0` estão em `devDependencies` (`package.json:38` e `:30`) e `@import "tailwindcss"` é a linha 1 do `index.css`, mas de **404 atributos `className`** em `src/` apenas **9** contêm utilitários Tailwind: `ProtectedRoute.jsx:20` (`min-h-screen flex items-center justify-center`) e `:23` (`text-sm`), e as sete de `src/components/form/ProgressBar.jsx` (`:5`, `:7`, `:8`, `:11`, `:17`, `:19`, `:25`). A regra escrita é a de `pecas.jsx:12-13`: «Estilos INLINE, como o resto da aplicação. **Nada de Tailwind, nada de CSS externo.**»

**Bibliotecas de ícones: nenhuma.** Todo o traço é SVG à mão, `strokeWidth` entre `1.5` e `2.2`, `strokeLinecap="round"`, `strokeLinejoin="round"`, cor herdada por `currentColor` (`marcas.jsx:13-49`, `pecas.jsx:55-60`, `ComunicadoModelos.jsx:81-101`). Bibliotecas de ícones, glifos `✓ ✕ ● ○` e emoji como ícone estão proibidos no backoffice (`docs/identidade-visual.md:225-226`) — violações vivas: `MateriaisInventario.jsx:293` (`🔍`), `:338` (`✕`), `:261` (`⚠`), `:276` (`✓`), `EventTypesTab.jsx:245` (`✏️`) e `:263` (`🗑`), `MaterialModalRico.jsx:659` (`✓`), `FormField.jsx:226` (`⚠️`).

---

## 12. EQUIPA

Grep exaustivo, insensível a maiúsculas, por `equipa|staff|colaborador|funcionari|pessoal|fornecedor|prestador|ajudante|montador|escala|turno|team|crew` em `src/`, `docs/migracoes/*.sql`, `supabase/` e `docs/*.md`.

### (a) TABELAS na BD — **não existe**

Não existe nenhuma tabela de equipa, staff, colaboradores, funcionários, fornecedores, prestadores, escalas ou turnos. As 22 tabelas criadas em `docs/migracoes/*.sql` são: `avaliacao_eixos`, `avaliacoes`, `campanha_intencoes`, `campanhas`, `comunicado_destinatarios`, `comunicado_modelos`, `comunicados`, `evento_fotografias`, `form_errors`, `notas_evento`, `notificacoes`, `pagamentos`, `pagamentos_previstos`, `portal_acessos`, `portal_actos`, `portal_condicoes_lidas`, `portal_publicacoes`, `portal_sinal_confirmacoes`, `portal_verificacoes`, `questionario_grupos`, `questionario_pedidos`, `respostas_autoria`. As relações anteriores à migração 020 (sem ficheiro no repositório, portanto **não confirmado por SQL**, só por uso em `.from(...)` no código) são: `app_config`, `clientes`, `documentos`, `evento_materiais`, `event_types`, `invites`, `materiais`, `mensagens_tipo`, `reservas`, `submissions`, e a vista `v_destinatarios_possiveis`. Nenhuma delas é de pessoal.

**O que aparece por acaso e NÃO é uma camada de equipa:**

- A palavra `equipa` em **nomes de políticas RLS**, onde significa «qualquer utilizador autenticado»: `comunicados_equipa` (`079_comunicados_fase1.sql:81-82`), `comunicado_destinatarios_equipa` (`080:111-112`), `comunicado_modelos_equipa` (`081:79-80`), `comunicados_img_equipa_escreve` (`080:188-189`), e as três políticas de storage `"equipa carrega fotografias"` / `"equipa ve fotografias"` / `"equipa apaga fotografias"` (`065_fotografias_do_dia.sql:47-58`). São todas `to authenticated`, sem distinção de pessoa.
- A palavra `equipa` como **valor de enum a designar um LADO, não uma pessoa**: `respostas_autoria.autor text not null check (autor in ('cliente', 'equipa'))` (`062_questionario_grupos_e_autoria.sql:91`). O comentário da tabela é explícito: «`autor` é o LADO (cliente ou equipa), não a pessoa» (`062:103`).
- **`por_equipa`** — chave booleana da projecção JSON das RPCs do questionário, derivada desse enum: `'por_equipa', coalesce(v_autoria.autor = 'equipa', false)` (`063_questionario_rpcs_do_portal.sql:173`, `064_questionario_autoria_dos_dois_lados.sql:230`), lida em `QuestionarioVista.jsx:620`, `:626`, `:673`. Continua a ser o LADO: nunca identifica quem.
- **Um eixo de avaliação chamado `'A equipa em serviço'`** (`066_avaliacao_estrutura_e_eixos.sql:96`, ligado a `array['Balcão']`, com as pontas «fizeram o que era preciso» / «nem se deram por eles»). Avalia a equipa **no colectivo** — não há linha por pessoa nem sequer um campo para a nomear.
- A palavra `fornecedor` só em **texto**: o comentário de negócio em `062:51` («quando o fornecedor de flores mudar de antecedência») e o corpo da folha de condições semeada em `semear-comunicado-condicoes.sql:41`.

### (b) PÁGINAS / componentes — **não existe**

Não existe página, separador, componente nem rota de equipa, staff, colaboradores ou fornecedores. Os **12 separadores** do backoffice estão enumerados em `src/lib/rotasAdmin.js:28-40` (`SLUG_POR_ID`): `inicio`, `clientes→contactos`, `calendario→agenda`, `orcamentos→documentos`, `operacional→logistica`, `convites→formularios`, `mensagens`, `comunicados→envios`, `dashboard`, `avaliacoes`, `tiposEvento→modelos-evento`, `importar→importar-clientes`. Nenhum é de pessoal. O separador Logística (`OperacionalTab.jsx:20-23`, `const SUB_VISTAS = ["materiais", "conferencia", "alertas"]` em `:42`) tem três sub-vistas — todas sobre material, nenhuma sobre pessoas.

Nenhum ficheiro em `src/components/` tem no nome equipa/staff/colaborador/fornecedor/escala/turno.

**O que aparece por acaso e NÃO é uma camada de equipa** — a palavra «equipa» é vocabulário de UI a falar da equipa da casa no colectivo, sempre sem nomear ninguém (34 ocorrências em `src/`, uma das quais é falso positivo: «equipamentos», em `orcamentos/contratoConfig.js:78`):

- `src/components/portal/questionario-pecas.jsx:300` — `"Guardado agora mesmo · a equipa fica a saber"`; `:331` e `:341` — `"actualizado pela equipa a {quando}"` / `"Actualizado pela equipa a {quando}."`; o comentário em `:319` diz «"a equipa", no colectivo — nunca um nome».
- `src/components/portal/QuestionarioVista.jsx:302` — `"seguiu para a equipa"`; `:308` — `"Já seguiu para a equipa"`; `:406-407` — `"para a equipa"` como valor por omissão; `:157`, `:646`, `:690` — as mesmas frases no corpo do ecrã.
- `src/components/admin/PortalDoClienteSheet.jsx:1840`, `:1854`, `:1949`, `:2149` — texto do ecrã («com registo da equipa», «O registo da equipa das «folhas da casa»…»); `:563` — comentário sobre gravar em `respostas_autoria` «como equipa».
- `src/components/admin/PagamentosEvento.jsx:1263` — `"Flores, deslocação, equipa — o que o evento custou, ao lado do que rendeu."` (texto descritivo; não há campo de custo de equipa).
- `src/components/admin/FichaEvento.jsx:862` — `placeholder="Notas para a equipa..."` (é a coluna de observações da ficha de materiais, texto livre).
- `src/components/portal/conteudo.js:114` — `"É delas que sai o trabalho da equipa no dia."`
- `src/pages/BriefingPage.jsx:940` — comentário «a folha anda com a equipa».
- Comentários em `src/lib/imprimirFicha.js:8` e `:131`, `src/lib/fotografias.js:7`, `src/lib/comunicados.js:10` e `:588`, `src/components/admin/ComunicadoEditor.jsx:27`, `src/pages/FormPage.jsx:606`.
- `fornecedor` aparece **2 vezes** em `src/`, ambas em texto/comentário e nunca como entidade: `src/lib/eventTypes.js:37` («quando o fornecedor de…») e `src/pages/ComunicadoPage.jsx:21` («para o espaço, para a wedding planner, para os fornecedores»).
- `escala` aparece **5 vezes** e **nunca** significa turno: é `escala` de tamanho (`LogoDourado.jsx:9`, `PainelDeslocacao.jsx:19`, `AvaliacaoVista.jsx:399`) ou o verbo «escalar com lugares» (`GerarOrcamento.jsx:92`, `:230`). `montador`, `ajudante`, `prestador`, `crew`, `staff`, `funcionário`, `turno`, `colaborador`: **zero ocorrências** em `src/` (as duas correspondências de `team` são o falso positivo `ConviteAMeio`).

### (c) CAMPOS soltos em tabelas / JSONB existentes

Existem **quatro** colunas relacionadas com autoria, e nenhuma delas identifica um membro de equipa como recurso planeável:

| Coluna | Tabela | Tipo | O que guarda |
|---|---|---|---|
| `autor` | `notas_evento` | `text` (nullable) | Texto livre. Na UI nunca é preenchido: `criarNota(submissionId, { tipo, corpo, autor = null })` (`src/lib/notas.js:69`) e o cartão mostra `entrada.autor \|\| "Nádia"` (`NotasEvento.jsx:170`). Definição em `029_notas_evento.sql:43`. |
| `autor` | `respostas_autoria` | `text check in ('cliente','equipa')` | O LADO, não a pessoa (`062:91`, `:103`). |
| `autor_id` | `respostas_autoria` | `uuid` (sem FK) | «a pessoa fica em autor_id para o backoffice» (`062:104-105`). Não é lido em `src/` — grep por `autor_id` em `src/`: zero resultados. |
| `criado_por` | `evento_fotografias` | `uuid` (sem FK) — `065_fotografias_do_dia.sql:97` | Escrito com `sessao?.user?.id \|\| null` em `src/lib/fotografias.js:82`. Não é lido nem mostrado em lado nenhum. |

Não existe nenhum campo `responsavel`/`atribuido`/`assigned`/`operador` no sentido de pessoal. Os `nome_responsavel` / `contacto_responsavel` / `relacao_responsavel` que existem (`src/lib/submissionFields.js:19-21` → rótulos «Responsável no Dia», etc.; o `exports.js` que também os tinha foi removido a 14/08/2026) são **respostas do cliente** dentro do JSONB `submissions.respostas` — o «Responsável no Dia» é uma pessoa do lado do cliente (a irmã, a wedding planner), não da casa.

A ausência é **deliberada e está registada por escrito**: `docs/decisoes-de-produto.md:507-511` — «O que o sistema não regista não aparece (**fornecedores, quem-faz-o-quê**); e assume-se, por decisão de simplicidade da Nádia, que TODOS os eventos passam pelos mesmos processos — diferenciar por tamanho fica para quando doer».

### Quantos utilizadores / perfis de acesso o sistema conhece

**Um só papel, sem tabela de utilizadores nem perfis.** O sistema conhece exactamente dois estados de acesso, e ambos vivem no Supabase Auth, não em código da casa:

1. **`authenticated`** — quem tem sessão. É o backoffice inteiro, com acesso total: as políticas são todas da forma `for all to authenticated using (true) with check (true)` (ex.: `062:108-110`). A migração 021 é a base: «`authenticated` acesso total (021:64-66)» (descrito em `docs/levantamento-comunicados.md:428`). Nos ficheiros de migração há **37 `create policy`**; as cláusulas de destinatário (políticas + `grant`) contam 57 `to authenticated`, 85 `to anon` e 96 `to public`.
2. **`anon`** — o público, com o mínimo: SELECT em `event_types` (021:70-73), INSERT em `form_errors` (021:75-78), e as RPCs explicitamente concedidas do portal/captação (`dlm_portal_*`, `dlm_comunicado_*`, `captacao_submeter`, `formulario_*`, `contribuicao_registar`, …).

Onde isto está no código:

- `src/lib/sessao.js:18-42` — `useSessao()`, o único sítio que responde «quem está lá dentro»; devolve a sessão do Supabase (`getSession` + `onAuthStateChange`), com três estados (`undefined` = ainda não sei, `null` = sem sessão, objecto = com sessão; comentário em `:12-15`). **Não lê papel, nem `user_metadata`, nem `app_metadata`, nem tabela de perfis.**
- `src/components/ProtectedRoute.jsx:12-39` — a porta: sem sessão → `/admin/login`, com o destino em `state.from`. Não há verificação de permissão para além da existência de sessão.
- `src/pages/LoginPage.jsx:161` — `supabase.auth.signInWithPassword({ email, password })`. É a **única** chamada de autenticação de escrita em `src/`: não existe registo (`signUp`), nem recuperação de palavra-passe, nem gestão de utilizadores em lado nenhum.
- Grep por `profiles`, `perfis`, `roles`, `user_metadata`, `app_metadata`, `.role` em `src/`: **zero resultados**.

A doutrina está escrita na migração das notas: «RLS — mesmo padrão da migração 021: só authenticated (a Nádia com login) mexe nisto. Sem excepção nenhuma para o público (anon): as notas internas são, literalmente, "só eu vejo".» (`docs/migracoes/029_notas_evento.sql:52-54`). E `src/lib/casa.js:12-14` confirma o pressuposto de instância única: «**NÃO é multi-tenancy**: um objecto, uma fonte, lido de um sítio só. No dia em que houver um segundo negócio, a camada de configuração entra AQUI».

**Não confirmado:** quantas contas existem de facto em `auth.users` — não há acesso à BD a partir do repositório, e nenhum ficheiro do repositório enumera utilizadores. O que o *código* sabe é: um só perfil de acesso, sem distinção entre pessoas autenticadas.

---

## 13. DIVERGÊNCIAS

### 13.1 · Copy visível ao cliente (grave)

| # | Ficheiro:linha | Texto exacto | Divergência |
|---|---|---|---|
| 1 | `src/lib/invites.js:119` | `"Este convite não tem um tipo de evento associado. Contacta Do Luxo à Mesa."` | «convite» está na lista de abandonar para quem preenche (glossário l. 496). A **mesma função**, sete linhas abaixo (`invites.js:126`), diz `"Este questionário já foi submetido. Se precisares de alterar alguma resposta, contacta Do Luxo à Mesa."` — duas palavras para o mesmo objecto no mesmo ecrã de erro. Viola o corolário (l. 79-80) |
| 2 | `src/components/portal/DocumentosVista.jsx:93` | `"A folha completa está a seguir — isto é só o resumo."` | «folha» a significar o **orçamento/contrato**. No mesmo portal, `divisoes.jsx:310` («As folhas da casa») e `:335` («Ler a folha») usam «folha» no sentido canónico (a página do comunicado). Uma palavra, dois trabalhos — precisamente o que o glossário existe para evitar (l. 15) |
| 3 | `src/components/portal/DocumentosVista.jsx:95` | `"Os valores não aparecem aqui sem o código — se algum mudou, este resumo não o mostra. A folha completa está a seguir."` | idem #2 |
| 4 | `src/components/portal/DocumentosVista.jsx:1811` | `"Assine na última folha"` | idem #2 (aqui «folha» = página de papel — terceiro sentido; ver também `:1850` "a data que conta é a que escrever na folha") |
| 5 | `src/components/portal/DocumentosVista.jsx:2081` | `"A mesa desenhada espera a sua aprovação — no fim da folha."` | idem #2 |
| 6 | `src/components/portal/DocumentosVista.jsx:2086` | `"Este orçamento espera a sua resposta — no fim da folha, quando quiser."` | idem #2 — «orçamento» e «folha» na mesma frase, a folha a ser o orçamento |
| 7 | `src/components/portal/DocumentosVista.jsx:2441` | `"A sua resposta está no fim da folha ↓"` | idem #2 |
| 8 | `src/pages/CaptacaoPage.jsx:236` + `src/components/captacao/CaptacaoForm.jsx:57` | `"Pedido recebido 🤍"` / `textoBotao = "Enviar pedido"` | O quadro (l. 223) manda que a coluna «Quem chega lê» diga **«pedido de orçamento»**. A porta pública `/interesse` nunca escreve essa expressão — só «pedido». *Não confirmado se é intencional: a Fase E de Content UX (`decisoes-de-produto.md:1145-1152`) reviu a folha pública, não a página de captação.* |

### 13.2 · Copy visível à Nádia, no backoffice (grave para a coerência interna)

| # | Ficheiro:linha | Texto exacto | Divergência |
|---|---|---|---|
| 9 | `src/components/admin/PortalDoClienteSheet.jsx:2166` vs `:2198` | `"Comunicados enviados"` … `"Ver a folha"` | O renomeado de 10/08/2026 (l. 515) diz que **no backoffice a coisa é «a folha»**. Os dois nomes convivem no **mesmo bloco**. O varrimento de 10/08 apanhou 32 strings dos Envios (`decisoes-de-produto.md:1323`) e não passou por este ficheiro |
| 10 | `src/components/admin/EventTypeEditor.jsx:1431` | `{editingId ? "Editar Tipo de Evento" : "Novo Tipo de Evento"}` | O separador chama-se **«Modelos de Evento»** (`Navegacao.jsx:33`) e o glossário fixa **modelo de evento** (l. 225). O editor desse mesmo separador diz «Tipo de Evento» |
| 11 | `src/components/admin/EventTypeEditor.jsx:1479` | `"Nome do Tipo de Evento *"` | idem #10 |
| 12 | `src/components/admin/EventTypeEditor.jsx:1649` | `"Guardar Tipo de Evento"` | idem #10 |
| 13 | `src/components/admin/EventTypeEditor.jsx:188` | `"Dá um nome ao tipo de evento."` | idem #10 (também `:1474` "⚠ Este é o tipo de evento predefinido…") |
| 14 | `src/lib/camposFormulario.js:145` | `"O tipo de evento deste formulário já não existe. Recarrega a página; se o aviso persistir, verifica o modelo no editor de Modelos de Evento."` | **Três nomes para o mesmo objecto na mesma frase**: «tipo de evento», «o modelo», «Modelos de Evento». Corolário l. 79-80 |
| 15 | `src/components/admin/RemoverEventoModal.jsx:99` | `"Não é possível remover: há um convite/formulário já preenchido ligado a este evento."` | **Os dois nomes com barra, na mesma frase.** O glossário fixa «formulário» |
| 16 | `src/components/admin/RemoverEventoModal.jsx:276-277` | `"esse convite fica solto e, se for preenchido, cria um cliente e um evento novos"` / `"esses convites ficam soltos e, se forem preenchidos, criam clientes e eventos novos"` | «convite» onde o glossário diz «formulário» — e no **mesmo bloco**, `:272` já diz «formulários por preencher» |
| 17 | `src/components/admin/InvitesList.jsx:209` | `title="Remover convite"` | idem #16 (o botão vizinho, `:183`, já diz `title="Preencher o formulário"` — incoerência dentro do mesmo componente) |
| 18 | `src/components/admin/DocumentosEvento.jsx:674` | `"As respostas ficaram noutro evento (convite antigo sem alvo) — cria um formulário novo apontado a este evento"` | **«convite» e «formulário» na mesma frase** |
| 19 | `src/pages/AdminPage.jsx:611` | `"Nenhum tipo de evento disponível para associar ao convite."` | dois termos antigos numa frase (é `console.error`, não copy de ecrã — a string vizinha `:614` já diz «Não foi possível criar o formulário.») |
| 20 | `src/components/admin/PainelNovoFormulario.jsx:94` | `{aberto ? "▾" : "▸"} Dados da captação ({linhas.length})` | «captação» é palavra a abandonar (l. 493) e a incoerência **#4** do glossário (l. 535-539) manda **remover** o bloco. O próprio comentário do ficheiro (`:34-36`) reconhece a pendência: «*O bloco «Dados da captação» viaja intacto — nome e conteúdo. O glossário diz que ele desaparece com a ponte pedido→formulário, mas isso é projecto separado.*» |
| 21 | `src/components/admin/PainelNovoFormulario.jsx:140` | `{copiado === rotulo ? "✓ Copiado" : "Copiar"}` | os botões «Copiar» que a ponte devia ter matado (l. 165-169). **A ponte já existe** (`pontePedido.js`) — só não chegou a este painel, que ficou fora do âmbito por decisão (`decisoes-de-produto.md:884-887`) |
| 22 | `src/components/admin/CentroNotificacoes.jsx:1291` | `"Quando alguém preencher o formulário de interesse — ou mexer no acompanhamento de um evento — aparece aqui ao segundo."` | «formulário de interesse» está explicitamente na tabela de abandonar (l. 495) |
| 23 | `src/lib/avisosAtualizacao.js:52` | — | **Resolvida a 14/08/2026** — o ficheiro foi removido com o sistema de avisos bloqueantes inteiro |
| 24 | `src/components/admin/AvisoDataDoEvento.jsx:495` | — | **Resolvida a 14/08/2026** — o ficheiro foi removido na limpeza de código morto |
| 25 | `src/lib/avisosAtualizacao.js:114` | — | **Resolvida a 14/08/2026** — idem #23 |
| 26 | `src/components/admin/ClientesLista.jsx:358` | `"Nenhum cliente encontrado."` | O separador é «Contactos» e a base são **contactos** (l. 221, 259-261). A lista de contactos diz «cliente» |
| 27 | `src/components/admin/ClientesLista.jsx:176` | `setErro("Não foi possível carregar os clientes.")` | idem #26 |
| 28 | `src/components/admin/ClientesLista.jsx:454` | `title="Ficha da cliente"` | idem #26 (`ClienteVista.jsx` já se descreve como a casa de UM contacto) |
| 29 | `src/lib/reservas.js:92` | `"Esta pessoa já tem um evento vivo nesta data — abre-o em Clientes/Funil em vez de criares uma reserva nova."` | manda a Nádia a um separador **que já não se chama «Clientes»** desde 29/07/2026 |
| 30 | `src/components/admin/Navegacao.jsx:34` (+ `rotasAdmin.js:40` `importar: "importar-clientes"`) | `label: "Importar clientes"` | a base é «contactos»; a incoerência #3 do glossário (l. 534) renomeou o separador irmão mas não este |
| 31 | `src/components/admin/ImportarTab.jsx:552` | `selecionados.length === 1 ? "cliente" : "clientes"` | idem #30 — o que se importa são contactos (podem ser interessados) |
| 32 | `src/components/admin/VisaoGeralEvento.jsx:880` e `:888` | `titulo="Nesta folha"` / `"A folha sai sempre completa — com a ficha de materiais e sem pagamentos. Cada campo corrige-se aqui mesmo; o endereço /briefing/:id continua a abrir só a folha."` | «folha» a significar o **briefing**, no backoffice, enquanto o separador Envios usa «folha» para a página do comunicado. *Semi-autorizado: o próprio glossário chama ao briefing «a folha de trabalho» (l. 232) e «a folha imprimível» (l. 301) — a colisão nasce no glossário* |
| 33 | `src/components/admin/ComunicadoExpedicao.jsx:743` vs `src/components/admin/CentroNotificacoes.jsx:1824` | `"Deixar como está"` … `aria-label="Dispensar"` | O acto que o glossário baptiza **«dispensar»** (l. 477) nunca diz o seu nome no ecrã; e a palavra «Dispensar» **está** visível noutro sítio, para **fechar uma notificação** — outro acto. A palavra ficou a fazer o trabalho errado |
| 34 | `src/components/admin/EventTypesTab.jsx:115` | `"Cada tipo de evento define as perguntas que o organizador vê no…"` | «organizador» já corrigido, «tipo de evento» não — meio-alinhamento na mesma frase (também `:136` "+ Criar Tipo de Evento", `:488` "Remover tipo de evento?", `:35` "…associadas a este tipo de evento.") |

### 13.3 · Nomes internos (menor)

| # | Ficheiro:linha | Texto exacto | Divergência |
|---|---|---|---|
| 35 | `src/components/admin/PortalDoClienteSheet.jsx:79` | `"Registo de OFÍCIO, não de montra: sem cerimónia, sem Playfair…"` | «montra» foi substituída por «vitrina» a 30/07/2026 (l. 407). O **gémeo** deste comentário, `AvaliacoesTab.jsx:9`, já diz `"Registo de OFÍCIO, não vitrina: sem Playfair, sem cerimónia, sem movimento."`. A mesma fórmula com duas palavras. **Não é o caso autorizado** do `MateriaisInventario.jsx:13` (que usa «montra» no *outro* sentido) |
| 36 | `src/components/admin/GuardarComoMolde.jsx:374,378` | `htmlFor="dlm-nome-molde"` / `id="dlm-nome-molde"` | id de DOM com a palavra abandonada. Tecnicamente camada (b), autorizado, mas é o único «molde» que atravessa a fronteira para o HTML servido |
| 37 | `src/lib/comunicados.js:806,808,817,871,902` · `ComunicadoModelos.jsx:12,14,538` · `GuardarComoMolde.jsx:15` · `ComunicadoExpedicao.jsx:307,799` · `EventTypeEditor.jsx:1450` | `"modelo de comunicado"` (comentários) | O ecrã diz **«Modelos de folha»** (`ComunicadoModelos.jsx:206`) e «modelo de folha» (`ComunicadoExpedicao.jsx:804`); os comentários dizem **«modelo de comunicado»**. A causa está no glossário (ver #38) |
| 38 | `docs/glossario.md:248, 459, 460, 464-465, 467` vs `docs/glossario.md:503, 515` | «**modelo de comunicado**» vs «molde → **modelo de folha**» | **O glossário contradiz-se a si próprio.** O quadro dos nomes (l. 248), o título e o corpo da secção datada (l. 459-467) dizem «modelo de comunicado»; as tabelas dos renomeados de 09/08 (l. 503) e de 10/08 (l. 515) dizem «modelo de folha». O código seguiu «folha» no visível e «comunicado» nos comentários — a divergência #37 é filha desta |
| 39 | `docs/glossario.md:223, 224, 225, 232` | `captacao` (fica) · `orcamento` (fica) · `tiposEvento` (fica) · `briefing` (fica) | Nenhum destes é o nome de máquina real: não há tabela `captacao`, `orcamento`, `tiposEvento` nem `briefing`. Os reais são `submissions`/`clientes` (+RPCs `captacao_submeter`, `captacao_dedupe`), `documentos.tipo='orcamento'`, `event_types`, e a rota `/briefing/:id` (+RPCs `formulario_briefing`, `briefing_materiais`). O quadro dá por nome de máquina o que é rótulo ou id de separador |
| 40 | `docs/glossario.md:227-228` | linhas «A instância que a Nádia monta» e «O separador onde ela os gere» com a coluna «No código» a **—** | O glossário não regista os nomes de máquina que existem: tabela **`invites`** e id de separador **`convites`**. Sem esse registo, «convite» reaparece em copy (divergências #1, #15-19) sem nada que o trave |
| 41 | `docs/glossario.md:326-327` vs `src/lib/portal.js:39-40` e `src/components/admin/jornadaEtapas.js:29-36` | glossário: `projecto` → `contrato`; código: `contrato` → `projecto` | A tabela das sete etapas inverte a ordem que a migração 077 fixou («o sinal paga-se ANTES do contrato», `jornadaEtapas.js:26-28`). Aqui o **glossário está errado**, não o código — e o glossário declara-se autoridade sobre o `portal.js` (l. 339) |
| 42 | `docs/glossario.md:139` | «*(Direcção de arquitectura a implementar — não é só um nome, é um problema a resolver.)*» | A ponte pedido→formulário **já está implementada** (`src/lib/pontePedido.js`, consumida por `FormularioDoEvento.jsx`), com decisões registadas em `decisoes-de-produto.md:875-895`. O glossário continua a descrevê-la no futuro, e a secção «O que muda por camadas» (l. 554-556) ainda a lista como projecto por fazer |

### 13.4 · Divergências autorizadas (não contam)

| Ocorrência | Onde | Autorização |
|---|---|---|
| Overline `COMUNICADO` na folha pública | `ComunicadoPage.jsx:277,648` e o espelho `ComunicadoEditor.jsx:629` | `glossario.md:517-518` + `decisoes-de-produto.md:1333-1335` («FICA "comunicado" onde é público e certo») |
| «um comunicado, uma oferta, uma campanha» no estado vazio | `ComunicadosTab.jsx:1563` | `glossario.md:515` («os géneros dizem-se UMA vez, na definição do estado vazio») + `decisoes-de-produto.md:1327-1329` |
| Rota `/comunicado/:token`, tabelas `comunicados`, `comunicado_destinatarios`, `comunicado_modelos`, RPCs `dlm_comunicado_*` (`publicar`, `retirar`, `ver`) | `App.jsx:123`, `comunicados.js:12,130,138,705` | `glossario.md:518-521` («mudar a rota partia os endereços já entregues») |
| Colunas `congelado_em`, `retirado_em`, `dispensado_em`, `publico`, `registo` com valores `aviso`/`oferta` | `comunicados.js:37,73,571,579,874,1109` | `glossario.md:7` (regra de ouro), `:439` («Na base ficam `aviso`/`oferta`, quietos»), `:243-249` (quadro) |
| `ComunicadoExpedicao.jsx`, props `onExpedicao`/`onAbrirExpedicao`/`onVoltarExpedicao`, `vista === "expedicao"`, ids de sub-aba `feitos`/`moldes` | `ComunicadosTab.jsx:297,1145-1146,1410,1427,1454-1455`, `ComunicadoRecorte.jsx:129` | `glossario.md:498-499` («ficam só nos nomes de máquina, que não vale o risco de mexer») |
| `congelarLista`, `desfazerCongelamento`, `nomesCongelados`, `podeCongelar` | `comunicados.js:477,590`, `ComunicadoRecorte.jsx:150,252` | idem |
| `GuardarComoMolde.jsx`, `guardarComoMolde`, `gavetaMolde`, `moldeGuardado`, classes `dlm-molde-*` | `comunicados.js:906`, `ComunicadosTab.jsx:1213-1214`, `ComunicadoModelos.jsx:182-191,430,468` | idem |
| `src/lib/captacao.js`, `CaptacaoForm`, `CaptacaoPage`, RPCs `captacao_submeter`/`captacao_dedupe`, `CAMPOS_CAPTACAO` (`BriefingPage.jsx:270`) | vários | `glossario.md:488-489` («Ficam só onde ninguém as lê — nomes de ficheiro no código») |
| «captação», «onboarding», «lead» **em comentários** | `clientes.js:230,253,671`, `invites.js:25,83`, `reservas.js:15,65`, `CaptacaoForm.jsx:13,131,240`, `DashboardTab.jsx:270,474`, `LacunasFormulario.jsx:18` | idem |
| `origem: "onboarding"` / `"onboarding:markInviteUsed"` gravado em `form_errors` | `FormPage.jsx:612,639`, `errosForm.js:36` | idem (valor de máquina, nunca chega ao ecrã) |
| Chave `interessada` no feminino em `ROTULO_ETAPA` | `portal.js:36` (+ nota no comentário `:27`) | `glossario.md:331-336` («Não se corrigiu porque é chave de máquina e o rótulo já resolve») |
| «montra» em `MateriaisInventario.jsx:13` | comentário | `glossario.md:412-416` («Ficou como estava de propósito») |
| ids de separador `clientes`, `convites`, `orcamentos`, `comunicados`, `tiposEvento` | `Navegacao.jsx:16-34`, `rotasAdmin.js:28-41` | `glossario.md:7` + `Navegacao.jsx:13` («Os ids dos separadores NUNCA mudam (regra de ouro)»); `rotasAdmin.js` é a tradução única id↔slug, com `SLUG_ANTIGO` (`:76-78`) a manter vivos `clientes` e `comunicados` |
| O painel antigo com «Dados da captação» **existir ainda** no separador Formulários | `PainelNovoFormulario.jsx` | `decisoes-de-produto.md:884-887` («Âmbito: a ficha do evento. O painel antigo continua no separador Formulários (cliente novo, sem evento — não há ponte possível); a sua vez chega com a aba "O pedido"») — **mas a decisão não autoriza a palavra «captação» no rótulo, e a incoerência #4 do glossário continua aberta**: por isso #20 e #21 ficam como divergências |
| Rotas `/formulario` e `/interesse` com vocabulário antigo | `App.jsx:63,66` | `glossario.md:593-603` (pendência 4: já circularam; a regra é redireccionar, não partir) |
| «noivo/noiva/noivos» em campos de casamento | `clientes.js`, `submissionFields.js:6-7` (o `exports.js` foi removido a 14/08/2026) | `glossario.md:98-101` («podem aparecer *dentro* de um evento concreto — um casamento tem mesmo noivos») |
| «Clientes» como **nome da fase** (coluna do funil, botão de avanço) | `FunilBoard.jsx:1013` `titulo="Clientes"`, `:1674` "Para Clientes — mantém o estado", `fases.js:25` `cliente: "Cliente"` | `glossario.md:236,265-268` (a fase chama-se mesmo «Cliente») |
| «Clientes:» no contrato | `src/components/admin/orcamentos/GerarContrato.jsx:774` | documento jurídico, contraentes — fora do âmbito do glossário. *Não confirmado: o glossário não trata a linguagem contratual* |
| aba «O pedido» não existir | `EventoPage.jsx:69-78` | `glossario.md:553-558` (é «arquitectura de dados e fluxo — projeto próprio», não pendência de nomes) |

---
