# Decisões de produto

Registo vivo das decisões de produto do Hélio. Cada entrada: data, decisão,
uma linha de porquê. Este ficheiro é a fonte — o chat não conta. Reler
sempre que se recupera âmbito depois de uma compactação de contexto.

As entradas até 27/07/2026 foram reconstruídas do histórico da sessão ao
criar o ficheiro; se alguma estiver mal reconstruída, corrige-se aqui.

**Sobre os nomes:** a autoridade é o `GLOSSARIO.md`. Este ficheiro guarda
*decisões*; o glossário guarda *como se chamam as coisas*. Se divergirem,
o glossário ganha e corrige-se aqui. (Vocabulário atualizado a 29/07/2026:
«clientes» como base de pessoas passou a **contactos**; «captação» passou a
**pedido**; o formulário longo é **formulário** do lado da Nádia e
**questionário** do lado de quem o preenche.)

---

## Identidade e duplicados

- **26/07/2026 — Sem ferramenta de fusão de contactos.** Há ~9 contactos no
  sistema; duplicados fundem-se à mão. Porquê: construir fusão automática
  para uma dúzia de registos é risco sem retorno.
- **27/07/2026 — Email fica fora do dedupe** (Lote 3). Dados: 0 emails em
  12 contactos. Se um dia entrar, fica pré-aprovada a opção **aviso, nunca
  funde**. Porquê: o email não é chave fiável neste negócio; fusões
  automáticas são irreversíveis.
- **27/07/2026 — Telefone é a chave canónica de dedupe**, normalizado para
  os formatos reais (ex.: `931699846`, `925 956 617`, `+351 966 413 181`,
  `+491726435834`). Porquê: é o identificador que a Nádia realmente tem.
- **27/07/2026 — A RPC do questionário NÃO recusa formulário sem alvo com
  evento vivo na mesma data.** O aviso vai para a **criação do formulário no
  backoffice**. Porquê: a recusa na RPC dispararia no ecrã de quem preenche,
  que não tem como a corrigir.
  *(Estado a 30/07/2026: **nunca foi implementado** — não existe verificação
  de colisão de datas no painel. O que existe é o dedupe do pedido (mesmo
  telefone + mesma data), que é outra coisa. A âncora original era «ao lado
  do seletor de alvo», mas esse selector deixa de existir: o painel em
  Formulários passa a ser só «cliente novo». A casa do 1A é precisamente
  esse painel — é lá que se cria sem alvo. Fica pendente; o id interno
  continua `convites`.)*
- **27/07/2026 — O aviso de duplicado no pedido público nunca mostra
  nomes ao anónimo** — o nome do contacto existente só aparece a sessões
  autenticadas. Porquê: a RLS é a fronteira; a porta pública não revela
  quem já é contacto da casa.

## Funil, fases e pagamentos

- **27/07/2026 — "Sugere-se, nunca se executa":** avanços de fase são
  sempre sugeridos (banner com botão), nunca automáticos. Porquê: a Nádia
  decide; o sistema não muda o estado do negócio sozinho.
- **27/07/2026 — Recuperar um evento perdido é uma escolha informada:**
  quando há pagamentos registados, a recuperação pergunta para onde volta
  (com o saldo do sinal à vista), não adivinha. Porquê: o par fase/status
  é um invariante com CHECK na BD (migração 040).

## Atualização em direto

- **27/07/2026 — O realtime suspende-se enquanto houver edição por
  gravar** e retoma depois com **refetch fresco** (nunca aplicando o
  payload guardado em buffer). Porquê: preferível a fundir em direto —
  a edição dela nunca é clobbered, e o que se mostra no fim é a verdade
  da BD.

## UI — regras da casa

- **26/07/2026 — Nunca `window.confirm`/`alert`/`prompt`:** confirmações
  inline no próprio ecrã, erros em barras no próprio ecrã. Porquê:
  diálogos do browser são alheios à estética e bloqueiam a app.
- **26/07/2026 — Nada de ações destrutivas dentro do detalhe:** remoção em
  lote é seleção múltipla + barra de ações + confirmação inline.

## Design — os dois critérios (27/07/2026)

- **As superfícies julgam-se por dois padrões distintos e não se
  misturam.** INTERNAS (drawer, página do evento, Jornada, Logística):
  o critério é OFÍCIO — precisão "porta de Rolls-Royce", o filtro é
  «isto aguenta ser visto cinquenta vezes por semana?». PÚBLICAS
  (contribuição coletiva, futuro portal do cliente): o critério é
  DESLUMBRE — vender o sonho, com brief próprio, noutro momento.
  Porquê: um gesto que encanta à primeira e irrita à quinquagésima
  está errado numa ferramenta diária; e o deslumbre da vitrina não
  pertence à bancada de trabalho.
- **Mockup antes de UI nova** (convenção da casa): mudanças grandes
  mostram-se antes de se construírem; várias direções valem mais do
  que uma; os estados difíceis (vazio, concluído, perdido/recuperado)
  mostram-se sempre — é neles que a qualidade se decide.

## Logística — conferência "O que sai" (27/07/2026)

- **A aritmética da conferência conta só eventos pós-sinal**
  (`FASES_POS_SINAL` do `faseConfig.js` — não uma lista nova). Orçamentos
  com ficha preenchida aparecem **à parte, como carga provisória** —
  visíveis, mas fora dos totais e do alarme "Não chega para tudo".
  Porquê: a conferência é a folha do que se carrega na carrinha; um
  orçamento não se carrega, e um alarme que mente é um alarme que a Nádia
  deixa de ler.
- **A conferência respeita a flag `lista_carga`.** Regra mais forte que a
  decisão: **a conferência e a Lista de Carga impressa do evento dão
  sempre o mesmo número** — qualquer divergência entre as duas é bug e
  corrige-se.
- **Eventos vizinhos contam:** material fora de casa num evento cuja
  janela de buffer se sobrepõe ao período escolhido **desconta na
  disponibilidade**, mesmo que o evento caia fora das datas. Porquê: a
  conferência reflete a disponibilidade física real; Alertas e
  conferência não se podem contradizer sobre a mesma realidade.
- **Materiais desativados aparecem na conferência com marca que peça
  ação.** Porquê: o soft-delete existe para não partir fichas antigas;
  omiti-los faz a carrinha partir sem eles.
- **Os Alertas ficam radar lato — mas sem mentir.** *(Decisão delegada
  pelo Hélio a 27/07/2026 — «escolhe aquele que fizer mais sentido» —
  e escolhida pelo assistente.)* Os orçamentos sem sinal continuam a
  contar nos Alertas (o valor do radar é avisar ANTES de se aceitar o
  sinal de dois eventos incompatíveis), e as linhas fora da lista de
  carga também (a Montagem também sai de casa — a ocupação física não
  é a folha da carrinha). Em contrapartida, um alerta que só existe
  por causa de orçamentos é **condicional**: âmbar, marcado «só se o
  orçamento fechar», fora do badge vermelho — o badge conta só ruturas
  entre eventos confirmados. Porquê esta via e não o alinhamento total
  com a conferência: alinhar apagava o aviso precoce (descobrir-se-ia
  a rutura só depois de aceitar o segundo sinal, tarde demais para
  comprar ou negociar datas); manter sem marca fazia o badge gritar
  por hipóteses — e um badge que grita por hipóteses deixa de ser
  lido.

## Formulários — onde se criam (30/07/2026)

- **30/07/2026 — O que não tem evento vive em «Formulários»; o que tem
  evento vive no evento.** Não são excepções, é a regra: a acção fica onde
  a intenção nasce, e quando não há evento a intenção nasce em Formulários
  porque não há mais nada onde nascer. Em Formulários ficam: o «cliente
  novo» (sem alvo, o fluxo principal de captação), os órfãos, e a
  supervisão. No evento fica a criação do formulário desse evento, com
  painel curto (o alvo é conhecido; um selector de evento dentro de um
  evento seria UI morta). Porquê: acabava o teleporte — a intenção nascia
  no evento e a acção acontecia noutro ecrã.
- **30/07/2026 — Os órfãos: lista em Formulários *e* aviso no evento** (as
  duas direcções, não uma). A lista dá casa ao órfão que nunca vai ser
  visitado; o aviso dentro do evento apanha o erro no instante em que
  nasce — quando ela ia criar o segundo formulário. Efeito: o selector de
  alvo passa a **último recurso**, não gesto principal. Porquê escolher as
  duas: escolher uma era escolher qual dos dois buracos deixar aberto.
  *O aviso respeita as três condições da adopção* (`!reserva_id`, e mesmo
  `event_type_id` ou órfão sem tipo) — apontar um Aniversário a um
  Casamento reescreveria o tipo e fundiria respostas de outro modelo.
- **30/07/2026 — A lista de lacunas usa `FASES_POS_SINAL`** (cliente ·
  projecto · contrato), a mesma lista canónica da conferência da Logística
  — **não uma lista nova**. Afinações: eventos passados ficam de fora (não
  têm lacuna, têm história); eventos sem data entram (não se pode afirmar
  que passaram, e entre esconder e mostrar a mais, mostra-se). Porquê:
  cada pedido e cada reserva nascem em «interessado» — sem critério, a
  lista de lacunas era a lista de leads. E fecha com o glossário: o
  questionário prepara a montagem de um evento confirmado; um interessado
  precisa de orçamento, não de questionário.
- **30/07/2026 — Um formulário que já existe nunca desaparece da
  supervisão.** O critério de fase decide **que lacunas se mostram**, não
  que formulários. Porquê: sem isto, um formulário já enviado
  desaparecia por o evento estar na fase «errada», e ela ficava sem saber
  que o tinha enviado.
- **30/07/2026 — As linhas «sem formulário» não têm botão de criar** — a
  acção honesta é abrir o evento. Porquê: com botão, a página voltava a
  ser sítio de criação para coisas que têm evento, e a regra desfazia-se.
- **30/07/2026 — O caminho da reserva antiga sem evento morreu.** Contagem
  em produção: zero. Fica uma guarda que **diz**, em vez de abrir um painel
  a meio, se alguma vez reaparecer. Porquê: retrocompatibilidade sem
  utilizadores é peso morto.
- **30/07/2026 — O vínculo `reserva_id` vem dos dados, não da navegação.**
  A aba lê a reserva provisória do evento em vez de receber o id por
  handshake. Porquê: acrescentar um handshake no lote em que se removeu
  outro seria trocar uma fragilidade por outra. Efeito lateral
  bem-vindo: passa a acontecer sempre que ela cria o formulário de um
  evento com reserva à espera, não só entrando pelo botão da Agenda.
- **30/07/2026 — Sem aviso bloqueante para anunciar a mudança** — em vez
  disso, uma linha de orientação junto ao botão em Formulários. Porquê: o
  botão não desaparece (o «cliente novo» fica), a disrupção é pequena, e
  avisos bloqueantes ensinam a dispensar avisos.

## Validação — regra da casa

- **30/07/2026 — O portão é esbuild + eslint + build, sempre os três.**
  Porquê: duas vezes neste projeto o build passou com um erro que o eslint
  apanhou e que teria rebentado no ecrã da Nádia (uma importação em falta
  que viajou com um handler). O build sozinho não chega.