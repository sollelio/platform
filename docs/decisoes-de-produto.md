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

## Portal do Cliente — as peças do desenho sem caminho (01/08/2026)

Cinco peças vinham do desenho e não conseguiam aparecer no código. Decididas
uma a uma; **duas foram riscadas do desenho, não construídas**.

- **01/08/2026 — Não há IVA no orçamento: o total é único.** O valor que a
  Nádia escreve **é** o que a cliente paga. Porquê: partir esse número em
  «sem IVA» + «IVA 23%» inventava um imposto que a casa não factura assim,
  e obrigava o gerador a calcular uma coisa que ninguém lá escreve. O
  desenho tinha as duas linhas; saem do desenho.
- **01/08/2026 — A paleta vive na divisão «As suas cores», não dentro do
  Projecto.** Porquê: já está lá, tirada do questionário. Repeti-la no
  documento dizia a mesma coisa duas vezes e obrigava o gerador de Projecto
  (que só guarda `titulo · imagem · descrição`) a passar a guardar cores
  que a Nádia nunca escreveu.
- **01/08/2026 — A assinatura em papel deixa acto A SÉRIO no trilho, sem
  código.** Fica quem assinou (o nome escrito no papel), quem confirmou (a
  Nádia), quando, e a fotografia — e **tranca** o contrato, tal como o
  digital. Porquê: a alternativa era um carimbo de segunda categoria, e
  metade das clientes desta casa assina em papel. Não se lhes dá prova
  mais fraca por isso. Custo: `portal_actos.verificacao_id` passou a
  nullable, com um `CHECK` a garantir que há **sempre uma** das duas
  provas. Não se pediu código à cliente: o código prova que é ela do outro
  lado da ligação, e no papel quem responde por isso é a Nádia a olhar
  para a folha.
- **01/08/2026 — O cartão de diferenças é só do orçamento.** Compara linha
  a linha entre versões: o que entrou, o que saiu, o que mudou. Porquê:
  no projecto e no contrato o que muda é texto, e um comparador de texto
  diria pior do que a Nádia diz na conversa.
- **01/08/2026 — Sob o véu, o cartão de diferenças nomeia o que não
  consegue ver.** O servidor não põe os valores a zero: **tira** a chave
  `valor` das linhas. Logo, sem código, a comparação é cega a alterações
  de preço — e um cartão chamado «O que mudou» que cala uma subida de
  preço é pior do que cartão nenhum, porque dá por completa uma lista que
  não é. Decisão: mostra o que sabe (que serviços entraram e saíram) e
  acrescenta que os valores não aparecem sem o código. Porquê: a
  alternativa era fazer sair do servidor o que ele decidiu não deixar
  sair.

## Portal — o âmbito do código (01/08/2026)

- **01/08/2026 — Só o acto de ASSINAR exige um código pedido a partir do
  contrato.** Aceitar o orçamento e pedir alteração continuam a servir-se
  de qualquer sessão viva. Porquê: assinar é o acto que TRANCA e que fica
  como prova — é o único onde «verificado com o código» tem de ser verdade
  inteira. Apertar os outros obrigava a dois códigos para ler dois
  documentos: atrito sem ganho. Ler nunca foi apertado — o véu já decide o
  que sai, e são os dados dela.
- **01/08/2026 — Pedir outro código mata o anterior: o código E a sessão
  que ele abriu.** Porquê: matar só o código deixava de pé quem já o tinha
  usado, que é precisamente a pessoa de quem ela desconfia. Custo assumido:
  se estava a ler com os valores abertos, volta a escrever um código — que
  é o que ela já ia fazer de qualquer maneira. Um pedido **por atender**
  continua a não gerar aviso repetido; isso é eco, e a Nádia já o tem à
  frente.

## Questionário no acompanhamento — fase 5 (01/08/2026)

- **01/08/2026 — Responder e rever são o MESMO ecrã.** Não há assistente à
  parte no portal: as respostas vivem agrupadas pelos passos do modelo e
  mudam-se onde estão. Porquê: o desenho não traz assistente nenhum — e é
  deliberado, porque o preenchimento de raiz já existe em `/formulario`.
  Construir um a mais era inventar visual que a tela não mostra. Efeito
  lateral bem-vindo: responder pela primeira vez e corrigir a dez dias do
  dia passam a ser o mesmo gesto.
- **01/08/2026 — O prazo é do GRUPO, e o grupo marca-se no PASSO do
  modelo.** ~5 decisões por modelo em vez de 40, a Nádia já pensa em passos,
  e o desenho já agrupa a revisão por passos. **Um passo sem grupo nunca
  fecha** — nada se tranca por omissão, porque protecção que ninguém pediu é
  castigo. Ver [[glossario]] · Grupo de prazo.
- **01/08/2026 — Os prazos são da casa, não do modelo nem do evento.** Três
  linhas na base (14 / 7 / 2 dias), mudáveis sem migração. Porquê: um
  casamento e um aniversário compram flores com a mesma antecedência — o que
  muda é o volume, não o prazo do fornecedor.
- **01/08/2026 — Modelos com menos de 5 campos não têm questionário no
  portal.** Nem convite, nem revisão, nem pendência. Sai dos dados: os que
  são mesmo questionário têm 12 e 44 campos; os outros três têm 1, 1 e 3.
  Sem este mínimo, um interessado de um modelo de um campo abria «As suas
  respostas» com o campo que a **captação** encheu por ele — e a página dava
  por respondido um questionário que não existe. Consequência assumida: o
  questionário desaparece em 4 dos 6 modelos até a Nádia os encher.
- **01/08/2026 — Responder não exige código.** Precedente da 061: só o acto
  que TRANCA exige verificação. Responder não tranca nada, e pedir um código
  para escrever o nome do bolo é atrito sem ganho.
- **01/08/2026 — O fecho é do servidor, nunca só do ecrã.** O campo mostra-se
  em leitura, mas quem recusa a escrita é a RPC. Um fecho que vive só no
  ecrã não é um fecho.
- **01/08/2026 — `submissions.respostas` fica como está.** A autoria vive ao
  lado, em `respostas_autoria`, uma linha por escrita e com o valor
  anterior. Porquê: reestruturar o mapa das respostas partia dezenas de
  leitores — briefing, logística, contratos, quatro projecções do portal. De
  caminho ganha-se histórico.
- **01/08/2026 — A marca «actualizado pela equipa» só aparece quando o valor
  MUDA MESMO.** Gravar o briefing sem tocar em nada não marca nada. Sem esta
  condição, a cliente abria o questionário com uma marca em cima de cada
  linha — o oposto do pedido, que é marca nenhuma na maioria delas. E diz-se
  «a equipa», no colectivo: nunca um nome, nada acusa ninguém.
- **01/08/2026 — A paleta e a morada não se editam no portal.** Não há aqui
  selector de cor nem formulário de morada, e fingir que há era pior. Mudam-se
  por pedido — que é, aliás, o que o próprio desenho faz no ecrã do pedido de
  alteração.
- **01/08/2026 — «Marcar como tratado» não muda a resposta.** Fecha o pedido
  e reabre a porta a um pedido novo ao mesmo campo. Mudar a resposta é o
  briefing, e é outro gesto. Sem este ecrã, a cliente pedia uma vez e ficava
  sem caminho para sempre — a mesma armadilha do contrato em papel, evitada
  antes de doer.

## As fotografias do dia — fase 6 (01/08/2026)

- **01/08/2026 — Sem fotografias não há secção.** Nem rótulo, nem espaço
  reservado, nem «ainda sem fotografias». Porquê: um lugar reservado
  transforma uma surpresa numa promessa por cumprir — e a maior parte do
  tempo é assim que está.
- **01/08/2026 — Tudo o que a equipa carrega, a cliente vê.** Não há
  visibilidade por fotografia. Porquê: uma opção que se decide a cada
  carregamento é uma opção que vai ser ignorada ou enganada. Se um dia
  fizerem falta fotografias internas, é outra funcionalidade.
- **01/08/2026 — Aba própria, não secção na Visão geral.** A Visão geral é
  o briefing e imprime-se; fotografias da montagem não são briefing. E o
  gesto acontece no espaço, ao telemóvel: quer-se chegar a um sítio e largar
  as fotografias, não descer uma folha de 900 linhas. De caminho, a aba dá
  contagem na etiqueta.
- **01/08/2026 — O momento (montagem ou evento) é CAMPO, com omissão
  derivada da data.** Porquê: derivar sozinho parte-se assim que ela carregar
  as fotografias da montagem no dia seguinte — que não é o caso raro, é
  terça-feira. Ela quase nunca lhe toca, e quando for preciso corrige.
- **01/08/2026 — A capa é a primeira, e a casa escolhe-a ordenando.** A
  regra da casa é que seja a mais adiantada: o trabalho a acontecer aparece
  por baixo. O código **não adivinha** o que é «mais adiantada» — ninguém
  precisa de ver o espaço a meio às onze da manhã, mas só uma pessoa sabe
  qual é a fotografia que já mostra a mesa posta.
- **01/08/2026 — Duas versões por fotografia, comprimidas no browser.**
  Pequena a 1000px para a capa e o mosaico, grande a 1800px para a ampliada.
  Porquê: 3 a 5 MB de origem, vistos a 390px, muitas vezes na rua e com
  dados móveis. A poupança é de mais de dez para um.
- **01/08/2026 — O balde é público para ler e fechado para enumerar, à
  nascença.** Um GET directo não passa pelas políticas; a listagem é que
  exige SELECT. É mais apertado que o `referencias` — aquele precisa de
  INSERT anónimo por causa do formulário público, este não. É o primeiro
  balde da casa que nasce fechado, em vez de o ser depois de aberto.
- **01/08/2026 — As frases com horas desaparecem quando não se resolvem.**
  «Faltam cinco horas» e «Ficamos no espaço até às 18h30» saem dos rótulos
  que a Nádia escreveu, porque zero dos 192 campos tem `papel`. Quando o
  rótulo não bate, a frase não aparece. Porquê: uma hora adivinhada num
  ecrã que diz «estamos no espaço» manda alguém sair de casa à hora errada.

## A avaliação e a despedida — fase 7 (01/08/2026)

- **01/08/2026 — Os eixos da avaliação saem dos SERVIÇOS contratados, e o
  mapa vive em tabela.** Há eventos sem comida: perguntar pelo sabor a quem
  comprou um cenário é dizer que não se sabe o que se lhe vendeu. Duas ou
  três linhas, nunca mais — à quarta deixa de ser um gesto e passa a ser um
  formulário. **A tranquilidade fecha sempre**, seja o que for que ela
  contratou: é o que a casa vende de facto.
- **01/08/2026 — Um eixo aceita VÁRIAS cadeias de serviço.** Descoberto nos
  dados: o formulário oferece «Cenário fotografável» e os dez eventos que o
  contrataram têm guardado «Cenário». Pelo catálogo do código, dez em treze
  ficavam sem eixo nenhum — e sem maneira de dar por isso a olhar para o
  ecrã. **A ordem das perguntas é do mapa, nunca do array do evento**, que
  varia de cliente para cliente para a mesma compra.
- **01/08/2026 — A avaliação NÃO revoga o acesso.** Estava no plano e
  mudou. Fechar a porta a quem acabou de dar uma frase e uma fotografia é o
  gesto errado no momento errado: o portal entra em despedida e vive até o
  prazo acabar, com as fotografias e nada a pedir. O `motivo='avaliado'`
  fica, a significar revogação **à mão** por esse motivo.
- **01/08/2026 — O convite aparece três dias depois, não no dia seguinte.**
  Tempo para as fotografias estarem carregadas e para ela ter dormido. E
  quem não avalia nunca vê nada de diferente — não há prazo à vista, não há
  «por responder», não há sinal de que faltou alguma coisa.
- **01/08/2026 — A autorização é dela e é só sobre AS PALAVRAS. A
  fotografia é decisão da CASA.** Se tiver convidados reconhecíveis, essas
  pessoas não consentiram, e a anfitriã não pode consentir por elas — por
  isso não se lhe pergunta. Quem sabe é quem lá esteve.
- **01/08/2026 — A fotografia tem TRÊS estados, não dois:** por rever · sem
  convidados · com convidados. Com um booleano, a página dizia à cliente
  que a fotografia dela tem convidados **sem ninguém ter olhado** — que é a
  maioria. «Por rever» não publica e não se explica; só a marcada leva
  pastilha.
- **01/08/2026 — O nome publicado calcula-se só no servidor.** Fazer a
  conta no browser obrigava a mandar o nome inteiro na resposta — e quem
  escolheu «sem nome» ficava com ele a viajar na mesma.
- **01/08/2026 — Publicar no site fica de fora.** O site está em
  reconstrução e não há para onde publicar. Constrói-se a captação e o
  `publicada_em`; a ponte faz-se quando o site existir.
- **01/08/2026 — Na vista das avaliações não há véu.** Mostram-se todas,
  incluindo as que ficaram só para a casa: são precisamente essas que dizem
  o que melhorar.

## Revisão UX do portal, de ponta a ponta (01/08/2026)

Uma passagem completa — 137 descobertas verificadas uma a uma, ~130
correcções aplicadas. As decisões que ficam:

- **01/08/2026 — A dobra ganha um fio.** No caso mais comum (evento novo,
  num telefone com as barras do browser) a cerimónia acabava exactamente
  onde o ecrã acaba e a página lia-se como completa. Entra um fio dourado
  de 22px sob a frase de cerimónia — fica cortado pela dobra e diz, sem
  palavras, que há caminho para baixo. O ritmo vertical apertou ~20px sem
  violar o respiro de 40px+ do topo (identidade §4).
- **01/08/2026 — Cada troca de vista entra pelo topo; o regresso à jornada
  devolve ao ponto onde se estava.** O browser fica fora disto
  (`scrollRestoration = manual` enquanto o portal vive): a restauração
  nativa corre assíncrona sobre o DOM errado e aterra num ponto grampeado.
  O ponto de leitura memoriza-se em contínuo, ignorando leituras em que a
  página encolheu — é o sinal de que o DOM da vista já trocou.
- **01/08/2026 — A jornada refresca em silêncio ao regressar de uma
  vista.** Os dados velhos ficam pintados até os frescos chegarem — nunca
  um esqueleto no regresso. Sem isto, o convite «Contar como correu»
  reaparecia a quem acabara de avaliar.
- **01/08/2026 — Migração 070: `resposta_orcamento` na projecção.** A
  jornada cobrava resposta ao orçamento já aceite porque o acto não vinha
  na projecção — e a regra da casa é «se o portal precisa de mais um dado,
  é SQL, não JavaScript». Só o gesto e o instante; nem nome, nem valores.
- **01/08/2026 — Código recusado dá para reescrever.** O ecrã da recusa
  mostrava as células mas sem submissão — e a única saída, «Pedir outro
  código», MATA o código válido (061). Um dedo trocado custava outra ronda
  de espera pela Nádia. O servidor dá cinco tentativas exactamente para
  isto: entra a saída «Escrever o código outra vez»; pedir outro fica como
  segunda via.
- **01/08/2026 — O separador do browser fala a língua de quem o lê.** No
  portal, «O seu acompanhamento / Os seus documentos / O questionário / A
  avaliação — Do Luxo à Mesa»; no backoffice, «Sistema DLM» (reafirmado no
  arranque do EventoPage); no index.html fica o neutro «Do Luxo à Mesa».
  «Sistema DLM» é vocabulário interno e não aparece à cliente.
- **01/08/2026 — A faixa «Ambiente de Teste» acende em `test` E em
  `development`, por lista explícita** — nunca `!== "production"`: se PROD
  um dia se esquecer da variável, a cliente não pode ver uma moldura
  vermelha. Comparava só com «development» e o ambiente real chama-se
  «test»; a faixa nunca aparecia onde fazia falta.
- **01/08/2026 — Depois do dia (negócio fechado), «O que falta de si» não
  se pinta.** «Daqui até ao dia, o trabalho é nosso» não se diz de um dia
  que já foi — a página é memória (roteiro §10). E no dia zero de um
  pedido que nunca fechou (`caducaHoje`) cala-se o mesmo que no caducado —
  excepto o «Esta data já passou», que nesse dia ainda mentiria.
- **01/08/2026 — Erros de rede têm sempre um gesto no lugar.** A cortina
  de erro ganha «Tentar novamente» (refaz o pedido, sem recarregar);
  pedir código, verificar, guardar resposta e abrir a avaliação com a
  rede em baixo dizem o que aconteceu junto ao gesto — nunca em silêncio,
  nunca só no topo da página fora do ecrã.
- **01/08/2026 — Alvos de toque ≥44px sem mudar o desenho.** O sublinhado
  vive num `<span>` interior e o alvo cresce por padding compensado com
  margens negativas. `#9B9B9B` saiu de tudo o que se clica (a regra dura
  da identidade); a `LigacaoDiscreta` corrigiu-se na origem.
- **01/08/2026 — `prefers-reduced-motion` passa a valer de uma vez** via
  `MotionConfig reducedMotion="user"` no App — deixa de depender de cada
  componente se lembrar da regra. E a mola das novidades corre UMA vez por
  janela de visita (sessionStorage com o carimbo da visita anterior).
- **02/08/2026 — No portal, quem fala é «a Do Luxo à Mesa», nunca «a
  Nádia».** Pedido do Hélio: o nome próprio saiu de todo o texto virado à
  cliente (18 frases). No backoffice e nos comentários do código, a Nádia
  continua a ser a Nádia — é ela quem lá trabalha.
- **02/08/2026 — O cartão do véu nomeia o DESTINATÁRIO do código, não o
  remetente.** Era «uma pessoa no meio» (a Nádia com fotografia); com a
  casa no lugar do nome próprio ficava a casa a apresentar-se a si própria
  dentro da própria página. O que explica o véu a quem tem a ligação na
  mão é o outro lado: os valores abrem-se a quem tem o telefone da ficha,
  e essa pessoa tem nome — o titular da jornada, que a projecção já
  mostrava. A frase de cima continua a dizer quem envia (a casa); o número
  nunca aparece (a projecção não o traz, de propósito).
- **02/08/2026 — O cartão do véu diz o ESTADO na prosa; a espera vê-se uma
  vez só.** O Hélio sentiu a confusão no telefone e tinha razão: a prosa
  do cartão descrevia sempre o estado «nunca pedi», o estado real vivia
  escondido no rótulo do botão, e o botão levava a um ecrã que repetia o
  que o cartão acabara de dizer — uma viagem para não saber nada de novo.
  Agora o cartão tem três tempos: sem pedido → o porquê do véu + «Pedir o
  código»; pedido por atender → «O código já está pedido.» + «Já tenho o
  código» (direito às células, com «Se tiver pressa, fale pelo WhatsApp»);
  emitido → «O seu código já seguiu.» + «Escrever o código». O ecrã de
  espera ficou só para o momento a seguir ao acto de pedir (acto →
  confirmação, com o sopro), com a frase nova «O pedido ficou com a Do
  Luxo à Mesa.» — «Enviamos-lho» era ambíguo entre passado e futuro e
  mandava gente ao WhatsApp à procura de um código que ainda não seguiu.
  Regra que fica: cada superfície responde a UMA pergunta, e um botão
  nunca é o único sítio onde o estado se lê.
- **01/08/2026 — `formatarEuroPT` fica «1 291,50 €»** (espaço nos
  milhares, espaço antes do €), contra a letra da identidade §2
  («1500,50€»). Porquê: é o formato dos documentos que a cliente recebe, e
  a coerência portal↔papel manda mais do que o guia. Fica anotado para o
  Hélio decidir se o guia se corrige ou o formato muda nos dois sítios ao
  mesmo tempo.

## O contrato antes do sinal — a ordem real do negócio (02/08/2026)

Decisão da Nádia, trazida pelo Hélio. O fluxo passa a ser:
**interessado → orçamento → [Aceite] → contrato → [assinado] → sinal
(sempre 50%) → cliente → projecto (terminal do funil)**.

- **02/08/2026 — O contrato assina-se ANTES do sinal, e a data só se
  reserva com o sinal pago.** O contrato deixa de ser o fim da linha: é o
  fecho do negócio. É o próprio contrato que diz «paga 50% para avançar» —
  o sinal é a primeira obrigação dele, não um passo solto. A fase
  «contrato» passa a ser o limbo pós-aceite (onde os negócios morrem — a
  coluna que a Nádia mais precisa de ver); «sinal» passa a «assinado, 50%
  por pagar»; «projecto» é o terminal (o trabalho operacional corre no
  eixo STATUS, como sempre).
- **02/08/2026 — O sinal é sempre 50% do orçamento.** Os textos podem
  dizê-lo por extenso («metade do valor»).
- **02/08/2026 — Migração 071: os dados antigos leem-se à luz nova.**
  Fase `contrato` antiga (terminal, projecto+contrato feitos) → `projecto`;
  fase `sinal` antiga SEM contrato assinado → `contrato` (o limbo novo);
  quem já tinha assinatura fica em `sinal`, que agora diz a verdade. O
  invariante da 040 aperta: pós-sinal = (cliente, projecto).
- **02/08/2026 — Na jornada do portal, a etapa do contrato NÃO se infere
  das fases pós-sinal.** Só o carimbo da assinatura ou a fase `sinal` a
  acendem. Porquê: os eventos antigos chegaram a cliente/projecto pelo
  fluxo velho, com o contrato no fim — inferir «assinado» ser-lhes-ia
  mentir. Sem carimbo, a etapa fica apagada a meio da linha, que a página
  nem mostra.
- **02/08/2026 — Registar um sinal sem contrato assinado AVISA, nunca
  bloqueia** («sugere-se, nunca se executa»). A realidade às vezes foge à
  regra; cada fuga passa a ser uma escolha consciente, não um esquecimento.
- **02/08/2026 — A coluna «Em Preparação» DERIVA da realidade do
  trabalho.** Um cartão pós-sinal atravessa de Clientes para Em
  Preparação quando a preparação começa DE FACTO: formulário enviado ou
  respondido, projecto em mãos, ou ficha de materiais com linhas — o
  contrato não conta como gatilho (no fluxo da 071 já vem assinado de
  trás e acenderia tudo à nascença). O status manual do drawer continua
  a valer e a mandar; a coluna não escreve nada na base («sugere-se,
  nunca se executa» fica intacta — isto é leitura, não escrita).
  «Clientes» fica para o que está ganho e ainda intocado. Pedido do
  Hélio, palavras da Nádia: os processos SÃO a preparação, e o cartão
  passa quando ela lhes pega.
- **02/08/2026 — O TRILHO DE PREPARAÇÃO vive só nos cartões de Em
  Preparação.** Quatro marcas de relance (vazio · meia-lua · visto):
  formulário, projecto, contrato (visto na assinatura; nos legados
  pré-071 pode aparecer por fazer — é verdade, não é bug) e materiais.
  Em Clientes não há trilho: por definição estaria todo vazio, e quatro
  círculos vazios são ruído. Uma só ida à base para o board inteiro; se
  falhar, os cartões pintam-se sem as marcas e a coluna cai no critério
  do status — o funil nunca escurece por causa do trilho. O que o
  sistema não regista não aparece (fornecedores, quem-faz-o-quê); e
  assume-se, por decisão de simplicidade da Nádia, que TODOS os eventos
  passam pelos mesmos processos — diferenciar por tamanho fica para
  quando doer.

## Validação — regra da casa

- **30/07/2026 — O portão é esbuild + eslint + build, sempre os três.**
  Porquê: duas vezes neste projeto o build passou com um erro que o eslint
  apanhou e que teria rebentado no ecrã da Nádia (uma importação em falta
  que viajou com um handler). O build sozinho não chega.