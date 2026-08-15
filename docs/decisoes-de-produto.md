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
**pedido**. E a 14/08/2026: o formulário longo chama-se **formulário** dos
DOIS lados — a dupla «formulário/questionário» morreu.)

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

- **02/08/2026 — Migração 072: TODOS os actos da cliente tocam na Caixa
  de Entrada.** O dlm_portal_acto só avisava «pediu_alteracao»; aceitar o
  orçamento, aprovar o projecto e assinar o contrato digital eram
  silêncio — precisamente os momentos de agir na hora (o contrato
  assinado é a deixa do sinal). Entram `orcamento_aceite`,
  `projecto_aprovado` e `contrato_assinado`, todos a abrir na folha do
  Acompanhamento. O Hélio apanhou-o à espera de um toast que nunca podia
  chegar: não havia nada a caminho.
- **02/08/2026 — A ficha do evento ganha a Caixa de Entrada na sidebar**
  (badge + painel completos, como no resto do backoffice) — o item só se
  pintava onde a página lhe dava o gesto, e a ficha não dava.
- **02/08/2026 — Os avisos tocam onde a Nádia está: o toast (e o canal
  realtime) passam a viver também na ficha do evento.** Antes eram só do
  AdminPage e um pedido de código chegado com a ficha aberta ficava mudo
  até se mudar de página — meio aviso. Abrir do toast cumpre a promessa
  do próprio aviso: os do portal DESTE evento abrem a folha do
  Acompanhamento ali mesmo (pela porta guardada que respeita o
  portalIndisponivel); os de outro evento viajam para lá; a captação vai
  à Caixa de Entrada, que abre já com o aviso expandido.

- **02/08/2026 — Migração 073: o contrato e o projecto PUBLICADOS são
  pendências dela, como o orçamento sempre foi.** A lista de documentos
  dizia «à sua espera» e a jornada jurava «passamos a escrito… chega-lhe
  aqui» — o marco na projecção era a assinatura, e a publicação não saía
  de lá. Entra `publicado_em` {proposta, contrato} (só carimbos), a
  pendência com ligação («Ler e assinar» / «Ver o projecto»), a novidade
  («O contrato chegou»), e a linha do «connosco» cala-se ao publicar.
  Apanhado pelo Hélio no telemóvel: duas áreas da mesma página a contar
  histórias diferentes.

- **02/08/2026 — Migração 074 A: AS ASSINATURAS NA FOLHA.** A assinatura
  digital da cliente vivia no registo mas a folha saía com as linhas
  vazias; e a casa não tinha como assinar do lado dela. Sem serviço
  externo (pago e desalinhado): a prova da cliente é o código; a prova
  da casa é a sessão autenticada da Nádia. Colunas
  `assinado_casa_em/por` — que o tranco da 057 NÃO guarda, de propósito:
  assinar pela casa nunca muda conteúdo e pode pousar num contrato já
  trancado pela cliente. As duas assinaturas pintam-se na folha (backoffice,
  impressão e portal).
- **02/08/2026 — Migração 074 B: a morada valida-se NUM TOQUE — mas
  continua a não se editar directamente no portal** (a decisão de
  01/08 mantém-se na sua razão: a morada alimenta a deslocação do
  orçamento, e mudá-la em silêncio mexia num preço acordado). O que
  muda: o pedido de alteração do campo morada passa a ESTRUTURADO
  (as cinco partes escritas pela cliente, `dados` jsonb no pedido) e a
  folha do Acompanhamento ganha «Aplicar esta morada» — escreve nas
  respostas com autoria da equipa, marca o pedido tratado, e avisa se o
  orçamento aceite tinha a deslocação calculada com a morada antiga.
  Ela escreve, a Nádia valida, ninguém copia à mão.

- **03/08/2026 — Os textos das etapas SABEM o que já aconteceu.** Com o
  orçamento respondido, o cartão «agora» deixa de dizer «Sem pressa para
  decidir» (diz «Aceitou-o. O contrato é o passo que se segue.» ou «Pediu
  uma alteração…»); com o contrato/projecto publicados, o «A seguir»
  deixa de prometer «chega-lhe aqui» — «Já está consigo, à espera da sua
  assinatura». Estático por etapa era mentira assim que a realidade
  andava (apanhado pelo Hélio no telemóvel).

- **03/08/2026 — Na régua da Jornada do backoffice, a EVIDÊNCIA acende o
  Contrato; a fase confirma-se no funil.** Com o contrato assinado e
  trancado no documento mas a fase ainda atrás, a régua mandava «preparar
  o contrato para assinar». Agora a etapa acende pelo `assinado_em` do
  documento, com o sub «assinado · por avançar no funil» (o gémeo do
  «sinal saldado» que a régua já tratava), e o gesto salta para «registar
  o sinal — o contrato está assinado». Os documentos chegam à régua pelos
  donos dela (EventoPage e drawer buscam; a régua recebe, nunca faz
  queries).

- **03/08/2026 — Migração 075: o funil ACOMPANHA OS FACTOS — a regra
  «sugere-se, nunca se executa» (27/07) fica afinada, não traída.** A
  distinção que faltava: quando a transição de fase é o espelho de um
  FACTO já registado com trilho (orçamento publicado; aceite registado;
  assinatura com código ou papel confirmado; sinal saldado no registo do
  pagamento), a decisão humana já aconteceu — obrigar a Nádia a repeti-la
  no funil era contabilidade em dobro. Essas sincronizam sozinhas:
  publicar → ≥ orcamento; aceite → ≥ contrato; assinatura → ≥ sinal
  (no servidor, junto do facto); sinal saldado → cliente (no backoffice,
  no fim do registo). Guardas invioláveis: NUNCA recua, NUNCA toca num
  perdido, e falhar o avanço nunca falha o acto. Os JUÍZOS comerciais
  (dar por perdido, arrancar com o projecto) continuam sugeridos, nunca
  executados — e os botões manuais do funil ficam, para os factos que
  acontecem fora do sistema (aceites por telefone, importações). Os
  banners «por avançar» ficam como rede, não como caminho.

- **03/08/2026 — Migração 076: a Preparação acende pelo TRABALHO, nunca
  pela fase.** A inferência da 069 (fase cliente/projecto ⇒ preparação
  em marcha) era preguiçosa e invisível — a fase avançava tarde, à mão.
  Com a 075 a avançar sozinha, o portal dizia «compras feitas, listas
  fechadas» no instante seguinte ao sinal, ao lado de um questionário
  por responder. Passa a acender só pelo questionário entregue ou pelo
  estado operacional que a Nádia marca — o mesmo critério da régua do
  backoffice. Depois do sinal, o portal volta ao roteiro §2.3: «Onde
  estamos agora: A data reservada» · «A seguir: O projecto».

- **03/08/2026 — O questionário do portal NÃO precisa de convite — e o
  backoffice fica a sabê-lo.** A pendência do portal aparece pós-sinal
  sem formulário criado, por desenho: são duas portas para as mesmas
  respostas (o convite clássico serve quem não usa o acompanhamento).
  O que faltava era o espelho: respondido pelo portal, o selo da régua
  passa a «Respondido no acompanhamento» e a linha do Formulário na aba
  Documentos deixa de convidar a criar um convite inútil — mostra a
  entrega e «Ver respostas». Levantado pelo Hélio ao estranhar a
  pendência sem formulário criado.

## O sinal antes do contrato — a ordem FINAL (03/08/2026)

A Nádia reviu a decisão de 02/08 (que pusera o contrato antes do sinal).
A ordem que fica, migração **077**:
**interessado → orçamento → [Aceite] → sinal (50%, reserva a data) →
[Sinal recebido] → contrato (por assinar) → [assinado] → cliente →
projecto (terminal)**.

- **03/08/2026 — Semântica final das fases:** `sinal` = aceite, 50% por
  pagar (o limbo pós-aceite); `contrato` = sinal pago (data reservada),
  contrato por assinar; `cliente` = contrato assinado, fechado por
  inteiro. **Pós-sinal (data garantida) = contrato · cliente ·
  projecto.** O aviso «sinal sem contrato assinado» dos Pagamentos
  morre — no desenho novo o sinal vem primeiro por definição.
- **03/08/2026 — A sincronização (075) re-aponta-se:** aceite → ≥ sinal;
  sinal saldado → ≥ contrato; assinatura (código ou papel) → ≥ cliente;
  publicar orçamento → ≥ orcamento. As três guardas mantêm-se (nunca
  recua, perdidos intocados, falhar o avanço nunca falha o acto).
- **03/08/2026 — Migração de dados da 077:** fase `contrato` da 071
  (aceite, por assinar, sem sinal) → `sinal`; fase `cliente` sem
  assinatura e com evento por vir → `contrato`; o resto fica. Na jornada
  do portal o contrato infere-se só do carimbo ou da fase `cliente` —
  nunca de `projecto` (legados).

## O pórtico das condições e o que o sinal abre (03/08/2026)

O problema da Nádia: os clientes demoram eternidades a pagar o sinal e ela
vive a mandar mensagens a lembrar. Migração **078**.

- **03/08/2026 — O 1.º ponto das condições ganha o valor:** «Reserva
  mediante pagamento de sinal de 50% do valor total» (redacção afinada da
  ideia da Nádia, «confirmação de 50%», que ficava ambígua). Só os
  orçamentos novos — os publicados guardam o texto congelado no
  instantâneo, como deve ser.
- **03/08/2026 — O pórtico das condições:** o cliente não abre o orçamento
  no portal sem confirmar que leu e entendeu as condições. Tela escura
  quase opaca, condições à luz, o 1.º ponto em destaque com caixa de
  confirmação. O destaque é DOURADO forte da casa, nunca vermelho — o
  escuro já faz o drama; vermelho num orçamento de luxo lê como alarme.
- **03/08/2026 — A confirmação grava-se com carimbo** (prova real): mesa
  própria `portal_condicoes_lidas` — NÃO em `portal_actos`, para não
  diluir o invariante de prova da 059 (sessão verificada ou confirmação
  humana); aqui a prova é o token privado + IP + user-agent + data.
  Pede-se uma vez por evento, nunca por versão. O backoffice mostra
  «Condições confirmadas a DD/MM» na folha do portal.
- **03/08/2026 — «O acompanhamento abre com o sinal» é um PORTÃO, não uma
  promessa** (o Hélio corrigiu o sentido antes de a 078 correr): sem o
  sinal pago, o portal acaba no orçamento — inclusive. O cliente não vê o
  contrato, não vê as etapas seguintes (nem os nomes na jornada), não vê
  documento nenhum além do orçamento. O corte é no SERVIDOR (dlm_portal_
  ver com jornada de 3 etapas, dlm_portal_documentos só orçamento,
  dlm_portal_ver_documento devolve 'nada' para contrato/projecto — tudo
  na 078) e o front espelha-o. A inferência de «sinal pago» é a canónica
  da etapa 3 (carimbo, fase pós-sinal, ou pagamento origem sinal).
- **03/08/2026 — A divisão «O QUE O SINAL ABRE» é a explicação do corte:**
  aparece sempre que a jornada está cortada e o orçamento já chegou
  (antes e depois da resposta), com o questionário, o projecto, a
  preparação e as fotografias como o que espera do outro lado. Promessa,
  nunca ameaça — a pressão elegante que a casa sabe fazer.
- **03/08/2026 — Efeito nos eventos da era 071:** quem tinha contrato
  publicado sem sinal pago (migrados para fase `sinal` pela 077) deixa de
  ver o contrato no portal até o sinal entrar — correcto à luz da regra
  nova (a Nádia quer o sinal primeiro, sempre), mas convém ela saber que
  a esses clientes o portal recolheu o contrato.
- **03/08/2026 — O sinal pós-aceite é pendência DELA** (revê o lado
  escolhido na ronda 077): com «O QUE O SINAL ABRE» no mesmo ecrã, deixar
  o sinal em «o que está connosco» fazia a página dizer «nada falta de
  si» a quem deve o sinal — as duas divisões contavam histórias opostas.
  A pendência «O sinal» leva à conversa («Combinar pela conversa», o
  WhatsApp da casa) porque o pagamento não se faz no portal.

## A logística entre moradas, diluída (03/08/2026)

A morada-base do calculador de deslocação não é o armazém: a Nádia gasta
**25€ fixos por evento** no trajecto entre os dois, que ninguém pagava.

- **03/08/2026 — Os 25€ diluem-se pelos serviços do orçamento,
  automaticamente:** reparto proporcional ao valor de cada linha,
  arredondado a euros inteiros (resto à linha maior); o total final é
  exactamente a soma crua + 25. O cliente nunca vê os 25€ — nem linha,
  nem nota; vê os serviços ligeiramente mais cheios. A Nádia vê tudo no
  gerador («inclui +N€ de logística» por linha, nota junto ao total).
- **03/08/2026 — Nunca absorvem:** o «Pacote Buffet» (regra da Nádia) e a
  «Deslocação» (é o número que choca os clientes — engordá-lo iria
  contra a razão de ser da regra). Sem linha elegível, aviso no gerador
  e os 25€ ficam de fora — o buffet nunca leva, custe o que custar.
- **03/08/2026 — A parcela viaja congelada:** chave `__logistica`
  ({total, parcelas por índice}) nos dados do documento — entra no
  instantâneo publicado, o véu da 058 descarta-a no estado velado (lista
  de permissão), e os documentos legados sem a chave mostram-se como
  sempre. Zero migrações.
- **03/08/2026 — «Pacote Buffet» entra no catálogo do gerador** — só o
  nome, «Inclui:» vazio (a Nádia escreve o que compõe cada pacote).
- **03/08/2026 — Buffet no pedido público:** lotações corrigidas —
  Premium 50+, Supreme até 35, Essence até 20 (estavam trocadas entre
  Premium e Essence; pedidos antigos guardam o texto da altura).

## Comunicados — fase 1, a folha (04/08/2026)

O módulo nasce pelo desenho do Claude Design (seis momentos) e pela
migração do Hélio (nascida 078, renumerada **079** — o 078 já era do
pórtico). Fase 1: compor, publicar, retirar, imprimir. A expedição, os
destinatários e os modelos são fase 2/3 e não se anteciparam.

- **04/08/2026 — Blocos sem tipo, papel derivado:** o Design fixou os
  blocos como {id, rótulo, texto} e o papel (prosa, nota, grupo,
  cláusula, remate) deriva da posição e do conteúdo — numa função só
  (comporFolha), porque há duas folhas a compor (pré-visualização e
  página pública). O comentário «blocos tipados» da migração original
  foi corrigido para dizer a verdade.
- **04/08/2026 — A folha não leva um dado pessoal** — é o que a torna
  reencaminhável; as leituras contam-se no total e a interface diz
  porquê. Retirar ≠ revogar (glossário). Republicar devolve o MESMO
  endereço.
- **04/08/2026 — dlm_comunicado_ver é só do anon:** conta uma leitura
  por chamada; se o backoffice a chamasse, a espreitadela da Nádia
  contava como leitura de cliente. A pré-visualização lê a tabela.
- **04/08/2026 — O cartão do WhatsApp é o caminho (a):** etiquetas OG
  estáticas no index.html, iguais para todos os comunicados — o cartão
  diz «isto vem da casa», a mensagem ao lado diz o assunto. O caminho
  (b) (função de fronteira na Netlify a injectar etiquetas por
  comunicado) fica anotado para quando fizer falta. A imagem
  (public/cartao-comunicado.png, **1200×630**) exporta-se do desenho.
- **04/08/2026 — Duas correcções reais na migração** (assinaladas no
  ficheiro): grant do gerador de token a authenticated (publicar corre
  como invoker e falhava sem ele) e search_path do pgcrypto (precedente
  da 049).

## Comunicados — fase 2, o público e a expedição (04/08/2026)

Migração **080** (número confirmado livre). As decisões que moldam a fase:

- **04/08/2026 — A vista do recorte nasce fechada à chave** (a correcção
  que o aviso do Hélio previa, noutro sítio): no Supabase o anon ganha
  SELECT por omissão em vistas novas, e uma vista corre com os direitos
  do dono — por cima do RLS. `v_destinatarios_possiveis` levaria nomes e
  telefones ao anon. Ficou `security_invoker` + revoke, defesa dupla.
- **04/08/2026 — O email sai das folhas** (correcção do dono ao desenho):
  nenhuma das treze clientes usa email; o contacto é o WhatsApp da casa.
  O número passou a viver num módulo só (`src/lib/casa.js`) e o portal
  lê-o de lá — acabou o número cravado em dois sítios.
- **04/08/2026 — Tokens na gramática da casa:** `{NOME}` e `{LINK_FOLHA}`
  (nunca `{nome}`/`{endereço}` do desenho); o resolvedor é o MESMO do
  `mensagens_tipo` — uma gramática, um resolvedor. Os botões falam
  português humano («+ nome», «+ endereço»); o que inserem é o token.
- **04/08/2026 — Blocos tipados só onde o conteúdo não chega:** um bloco
  pode trazer `tipo` (imagem, chamada) e o tipo manda; sem tipo, deriva
  como na fase 1. A armadilha da saudação (vírgula em falta cala a
  cerimónia) fica REGISTADA em comentário no comporFolha, por decisão —
  não se resolve agora.
- **04/08/2026 — Cliente/interessado é a definição do funil:** cliente =
  fases pós-sinal; interessado = antes disso. O código já respondia
  assim e coincide com a proposta do dono — confirmado, não inventado.
- **04/08/2026 — A recusa de promoções só filtra recortes por CONTACTOS**
  — um aviso operacional a quem tem evento marcado nunca é promoção.
- **04/08/2026 — Nada se marca sozinho na expedição:** dois carimbos
  (abriu-se a conversa / a mensagem saiu), regresso por visibilitychange,
  estado na tabela (sobrevive a fechar a app). «Enviado» = «a conversa
  abriu-se e a mensagem saiu» — a frase da honestidade é parte do ecrã.
- **04/08/2026 — «Começar outro envio» (do desenho do Fim) não entrou:**
  é reutilização de recortes, fase 3. O fecho guarda a linha de ouro:
  «Mais leituras do que envios é bom sinal: alguém partilhou.»

## Comunicados — fase 3, os moldes (04/08/2026)

Migração **081** (número confirmado livre). Fecha o círculo: *modelo de
evento → formulário* :: *molde de comunicado → comunicado*.

- **04/08/2026 — O invariante que faltava na migração:** nada impedia uma
  linha dispensada de ganhar carimbos de envio — e a difusão da fase 2
  («marcar todos como enviados») produzia exactamente isso em silêncio:
  «a mensagem saiu» sobre quem ela decidiu não contactar. CHECK novo
  (dispensada nunca tem carimbos) + o código a excluí-las — cinta e
  suspensórios. Verificação 5 acrescentada.
- **04/08/2026 — O que envelhece marca-se ao GUARDAR, com a heurística
  como ajuda** (a alínea (b) com a (a) do brief): ao guardar o molde, o
  sistema propõe as linhas onde encontrou datas/meses/anos/prazos, já
  assinaladas; ela confirma, desmarca ou acrescenta, e a pergunta que
  aparecerá ao usar («Vem de agosto de 2026. A data ainda serve?») é
  editável. A heurística serve para ela não se esquecer, não para
  decidir sozinha. `rever`/`pergunta` vivem no próprio bloco (jsonb) —
  a mesma regra dos blocos tipados da fase 2, zero migração.
- **04/08/2026 — Publicar com revisões pendentes não se bloqueia** — o
  rodapé avisa («Pode publicar mesmo assim — mas a data acima fica como
  está.»). Avisar, nunca trancar.
- **04/08/2026 — «Desfazer» a dispensa limpa a coluna** e a linha entra
  na lista como acrescentada — a letra do brief; o protótipo voltava à
  pergunta, e o desvio fica registado. «Acrescentada» deriva-se
  (created_at > congelado_em), sem coluna nova.
- **04/08/2026 — Nascer de molde mantém os ids dos blocos:** cada
  comunicado é uma cópia independente e os ids só têm de ser únicos
  DENTRO da folha; mantê-los é o que deixa um bloco marcado no molde
  ser encontrado na folha que dele nasceu (a marca `rever` aponta ao
  mesmo id). Regenerar não protegia nada e apagava essa ponte.
- **04/08/2026 — A história do molde deriva-se** (count/max sobre os
  comunicados com o modelo_id) — contador guardado é contador que
  deriva. «Guardado, ainda não usado» é o caso de zero e o mais comum.
- **04/08/2026 — Sem separador novo:** os moldes vivem dentro de
  Comunicados, em dois separadores internos (Feitos · Moldes). Doze é o
  que há e doze é o que fica.

## Comunicados — fase 4, a costura e os enxertos (04/08/2026)

O nome Celebra mudou para Sollelio a 15/08

A adenda (semear o primeiro comunicado) ficou fora da cadeia de
migrações, de propósito: conteúdo de um negócio nunca vive no esquema que
todos os negócios correm (Sollelio). E semeia só a folha, por publicar —
os gestos são o produto.

- **04/08/2026 — A migração 082 foi escrita com o corpo à frente** (a
  lição das quatro correcções): cópia fiel da dlm_portal_ver da 078 + a
  chave 'comunicados' {titulo, token, enviado_em} — só folhas enviadas
  àquele evento e ainda no ar; retirada ou expirada sai da projecção em
  vez de virar ligação morta. Corre depois da 080 e da 081.
- **04/08/2026 — Os comunicados ficam FORA do portão do sinal:** a folha
  é pública e reencaminhável, e já foi entregue à mão na conversa —
  escondê-la no portal não protege nada e faz o portal mentir sobre o
  que ela já tem.
- **04/08/2026 — O portal nunca chama a dlm_comunicado_ver:** contaria
  uma leitura por visita ao portal. O portal mostra a ligação; a leitura
  conta-se quando ela abre a folha, que é o que a leitura significa.
- **04/08/2026 — A secção do portal transfere a permissão por palavras,
  nunca por botão:** a folha é para partilhar (o espaço, a wedding
  planner) e o endereço do portal é só dela — as duas linhas ditas, e
  nenhum «partilhe» ao lado do endereço do portal.
- **04/08/2026 — «Enviado», nunca «recebido»** — também na ficha do
  evento e no portal: o carimbo diz que a conversa se abriu e a mensagem
  saiu, não que chegou nem que foi lida.
- **04/08/2026 — A costura da marca é costura, não camada:** um objecto
  em src/lib/casa.js, lido de um sítio só; paleta e tipografias ficam
  fora (são o sistema de desenho, não a identidade do negócio). O dia do
  segundo negócio, a camada entra ali sem reescrever nada.

## Comunicados — o rasto do rascunho (04/08/2026, revê a fase 1)

O teste real do Hélio apanhou o que a fase 1 decidiu mal: o «+ Novo
comunicado» criava a linha na base ao abrir o editor, e cancelar deixava
um «Sem título, por enquanto» na lista, sem remédio.

- **04/08/2026 — A folha nasce ao PRIMEIRO GUARDAR**, nunca ao abrir o
  editor. Cancelar deixa zero rasto. (Revê a decisão da fase 1 «a folha
  nasce e o editor abre logo».)
- **04/08/2026 — Apagar existe, mas só para folhas SEM HISTÓRIA** — nem
  leituras, nem lista de expedição — em duas fases no cartão da lista,
  como os moldes. A regra vive na camada de dados (o método recusa),
  não só no ecrã. Uma folha lida ou expedida é registo do que
  aconteceu: o gesto público para essas é RETIRAR, nunca apagar.

## A ponte pedido→formulário na ficha do evento (04/08/2026)

O Hélio apanhou no teste real o que o glossário já condenava: o painel
de novo formulário nascia debaixo do cartão, com um bloco «DADOS DA
CAPTAÇÃO» e botões Copiar — «captação» é palavra abandonada, e o
transporte manual é a app a pedir à Nádia o trabalho do código.

- **04/08/2026 — Mockups antes de UI, como manda a convenção:** duas
  direcções desenhadas (A «a bancada da ponte» / B «a ponte à vista»);
  o Hélio escolheu **A + o momento da B** — a bancada como estrutura
  (sobreposição de ecrã inteiro, o compositor da casa), o teatro só na
  ENTRADA (a cascata dos campos a assentar + a banda «A ponte assentou
  N dados do pedido.» que se dissolve), uma vez por abertura.
- **04/08/2026 — A ponte é código, não cópia:** os dados do pedido
  fluem sozinhos para os campos correspondentes (mapa explícito, nunca
  adivinha de string; escolhas só se o valor existir nas opções); o que
  não aterra fica no cartão «O PEDIDO», à vista, sem um único botão
  Copiar. A palavra «captação» não aparece no ecrã novo.
- **04/08/2026 — A proveniência é do valor, não do campo:** o
  distintivo «do pedido» sai se ela alterar o valor à mão.
- **04/08/2026 — Âmbito:** a ficha do evento. O painel antigo continua
  no separador Formulários (cliente novo, sem evento — não há ponte
  possível); a sua vez chega com a aba «O pedido» (projecto próprio do
  glossário).
- **04/08/2026 — Mudar o tipo re-corre a ponte SEM apagar trabalho:**
  o que a Nádia escreveu à mão sobrevive quando o campo existe no tipo
  novo (continua sem distintivo — é dela, não da ponte); os valores da
  ponte recalculam-se para o tipo novo. Campos adicionados mas ainda
  vazios não viajam — como no painel antigo, que recomeçava do zero.
- **04/08/2026 — Os campos do composer reutilizam o FormField:** é a
  peça que já sabe desenhar todos os tipos (radio, checkbox, paleta,
  morada, textarea) com erros e foco resolvidos; reconstruir inputs
  próprios seria uma segunda linguagem de campo a divergir da primeira.
  O cartão fino do mock dá a moldura (passo + distintivo + remover), o
  FormField dá o campo.
- **04/08/2026 — «Pedido» inclui a reserva provisória:** a reserva
  escreve as mesmas chaves canónicas da entrada (nomeDoCliente,
  contactoPrincipal, mensagemInicial) — para a ponte é a mesma conversa
  inicial, e o cartão «O PEDIDO» mostra-a. Um evento criado à mão (sem
  nenhuma chave da entrada) é o estado «sem pedido de orçamento».
- **04/08/2026 — O nome nunca é par de referência:** no cartão «O
  PEDIDO» o nome é o cabeçalho (Playfair); repeti-lo nos pares seria
  dizê-lo duas vezes.

## Caixa de Entrada — serviços com hierarquia (06/08/2026)

- **06/08/2026 — As pastilhas de «Serviços pedidos» ganham hierarquia
  (direção B, linhas de serviço).** Os serviços simples ficam na fila
  de pastilhas de sempre; um serviço com detalhe (pacote de buffet,
  tipos de balcão) ganha a sua linha — o nome em charcoal firme à
  esquerda, os filhos como pastilhas ao lado. Escolhida sobre mockup
  de três direções nos estados difíceis. Porquê: o parentesco
  comunica-se por posição e texto de alto contraste, e estende a
  gramática rótulo/valor que o painel já usa. A alternativa A
  (pastilha composta) criava a pastilha multi-linha, forma que a casa
  proíbe; a C (ninho) assentava num contorno abaixo do limiar de
  contraste não-textual (WCAG 3:1).
- **06/08/2026 — O agrupamento é pelo campo de origem, nunca por
  texto:** `servicosBuffet` agrupa sob «Buffet», `servicosBalcao` sob
  «Balcão» — as grafias históricas de julho («Cocktail & bar»,
  lotações trocadas de 22 Jul–3 Ago) agrupam na mesma e são dado
  gravado, não UI. O grupo consome o pai; pai sem detalhe (Buffet de
  11–22 Jul sem pacote) fica pastilha plana; `pretende` legado é
  sempre plano; deduplicação por texto no fim (corrige também a chave
  React dupla num registo importado com os dois campos). A pastilha
  deixou de ser nowrap: o texto livre legado («Outro: …») quebra em
  vez de transbordar o cartão.
- **08/08/2026 — Ênfase invertida a pedido da Nádia:** na linha do
  serviço com detalhe, o pai é a **pastilha** («Buffet», «Balcão» — a
  mesma pastilha dos serviços simples) e os filhos ficam a **negrito**
  (13px/600 charcoal, separados por vírgula, quebra sempre entre itens
  e nunca a meio de um nome). Porquê: preferência direta da
  utilizadora — os serviços mantêm todos a mesma forma no painel, e o
  realce passa para o detalhe escolhido. (Revê o desenho da linha de
  06/08; a regra de dados não muda.)
- **Pendentes desta decisão:** (1) o mesmo achatamento existe no
  composer da ponte pedido→formulário (`pontePedido.js`) e no
  `PainelNovoFormulario.jsx` — levar lá a direção B fica por decidir;
  (2) o dourado do texto das pastilhas (#a07830 sobre creme, ≈3.8:1)
  fica aquém do AA em todo o painel — escurecer para ≈#8a6528 é
  decisão de casa, por tomar.

## Deslocação — km inteiros (08/08/2026)

- **08/08/2026 — A distância calculada arredonda ao km inteiro** (≥,50
  sobe, <,50 desce: Ericeira 6,90 → 7; 6,4 → 6). O arredondamento vive
  em `obterDistancia` — a porta única — para o painel do orçamento, a
  consulta rápida e a regra de custo verem todos o mesmo número; a
  cache guarda já o valor redondo. Porquê: a Nádia trabalha em km
  redondos, e o custo acompanha o número que ela vê (7 km → 2 km fora
  do raio, não 1,9). Os km escritos à mão ficam como escritos.
- **08/08/2026 — A Edge Function devolve o km cru; o arredondamento
  vive só no cliente.** O `obter-distancia` arredondava a 1 decimal
  antes de responder, criando dupla arredondação (6,45 reais → 6,5 →
  7, quando a regra sobre o valor real dá 6). Alteração preparada em
  `supabase/functions/obter-distancia/index.ts`; **carece de deploy
  pelo Hélio** (`supabase functions deploy obter-distancia`). Até lá,
  a janela [x,45–x,50) sobe um km a mais — no máximo 2 € a 4 troços.
- **08/08/2026 — As calculadas já guardadas também se mostram redondas**
  (reforço da Nádia: nunca 6,50 no ecrã). Ao reabrir uma linha com
  distância de origem «auto» gravada com decimais, o painel mostra-a
  já arredondada; a gravação acontece na primeira edição real — nunca
  ao montar, respeitando a regra de que abrir um documento não toca no
  Valor (€). Até essa edição, o Valor gravado pode divergir um passo do
  cálculo mostrado — resolve-se ao primeiro toque. (De caminho, a
  guarda «nunca escrever ao montar» passou de booleano a snapshot: o
  StrictMode em dev corria o efeito duas vezes e a segunda escrevia —
  era por aí que, em `npm run dev`, abrir uma linha antiga sem
  metadados zerava o Valor (€). Corrigido para dev e produção.)

## O ecrã do sinal e a disputa do dia (08/08/2026)

O Hélio aprovou o mockup completo (17 decisões) do redesenho do fluxo
do sinal no Portal do Cliente + a gestão de conflitos de data. A fonte
visual é o mockup validado; aqui fica a substância:

- **08/08/2026 — O véu dos valores do orçamento morre** — valores à
  vista desde sempre. O véu do CONTRATO fica (tapa NIF/morada/contacto).
  O mecanismo do código fica (é a prova da assinatura); aceitar e pedir
  alteração passam a servir-se da ligação privada, sem código — custo
  assumido: a posse da ligação é a prova do aceite. Assinar não muda.
- **08/08/2026 — O ecrã do sinal** (vista própria `/acompanhar/:token/
  sinal`): convite sereno pós-aceite → «Quero pagar o sinal» revela a
  forma de pagamento configurada pela Nádia por evento (MB Way+IBAN |
  conversa/WhatsApp | dinheiro | à minha maneira; sem escolha → dados
  da casa, e sem MB Way da casa registado o default é só IBAN) → caixa
  «já fiz o pagamento» (+ método indicado, opcional) → aviso
  `sinal_confirmado` na Caixa. A confirmação NUNCA reserva — quem
  carimba é o registo da Nádia. Valor do sinal = metade do total do
  instantâneo da versão aceite, calculado na projecção (nunca do plano
  de pagamentos, que pode não existir). Quem já pagou e volta é
  devolvido à jornada.
- **08/08/2026 — O destaque escuro do acompanhamento** reusa o padrão
  do pórtico (rgba(26,24,20,0.94), sem blur) como versão expandida da
  divisão «O que o sinal abre» (linhas idênticas); SEM código novo —
  a ligação é a chave, o sinal abre-a. As frases «pela conversa» da
  pendência e do fecho reescrevem-se (apontam ao ecrã do sinal; só
  dizem conversa quando a config é essa).
- **08/08/2026 — A disputa do dia:** tomado = evento vivo com sinal
  feito (pagamento origem sinal OU fase pós-sinal); vivo = fase ≠
  perdido, data futura, reservas provisórias contam. Sem prazo dado,
  os clientes não veem a disputa (a pressão visível é gesto da Nádia).
  O prazo «guardado para si até DD/MM» (um por dia, no máximo) mostra-se
  no portal do preferido e fecha o ecrã do sinal aos rivais por inteiro.
  «Em confirmação» (cliente confirmou «já paguei») fecha o ecrã aos
  rivais até a Nádia registar ou limpar — ESTREITA a janela do duplo
  pagamento, não a fecha; o desfecho do cruzamento é a devolução
  integral do segundo sinal. Tudo deriva de `data_evento` em leitura
  (padrão do caducou): mudar a data dissolve disputa/prazo/preferência.
- **08/08/2026 — A guarda do dia no servidor:** TODAS as portas por
  onde um dia muda de mãos passam pela mesma verificação — registo na
  ficha, «Sinal recebido» do Funil (ordem invertida: guarda primeiro,
  fase depois), avulsos/importados de origem sinal, e avanço de fase à
  mão para pós-sinal. A Nádia pode registar por cima de um prazo ativo
  (o sistema avisa que quebra a promessa — o portal da preterida
  mostra-o com as desculpas da casa); o rival nunca é marcado perdido
  automaticamente. Aviso âmbar também na criação com data disputada
  (absorve a decisão pendente de 30/07) e na recuperação de perdidos.
- **08/08/2026 — Verdade da canalização:** a RPC do «já paguei»
  reconfere o dia no clique (dia_tomado/em_confirmacao); o portal
  reconfere ao voltar à página e ao ganhar foco. Sem prometer «na
  hora» (canal em directo fica como bloco opcional futuro).
- **09/08/2026 — Três acrescentos ao Bloco 4** (cenário da Carla, a
  contactar pelo Insta/telefone): (1) a notificação de pedido novo na
  Caixa leva a marca âmbar «dia disputado» quando a data colide; (2) a
  **Consulta da Data** no Início, ao lado da consulta de deslocação —
  escolhe uma data e vê livre / em negociação (quem, fase, há quanto
  tempo) / preferência até / tomado, alimentada pela dlm_dia_estado;
  (3) ao dar o prazo, a folha oferece o WhatsApp pré-escrito no tom da
  casa («guardámos o dia para si até…») — o sistema nunca envia
  sozinho. O formulário público /interesse NÃO revela a agenda (dia
  disputado ≠ indisponível; o aviso é para os olhos da Nádia).
- **09/08/2026 — Confirmado com o Hélio (cenário Carla/Gina):** com
  prazo alheio ativo, o rival não paga pelo portal (ecrã fechado), não
  confirma (RPC recusa 'fechado') e o registo é recusado à própria
  Nádia sem forçar consciente — o dia não muda de mãos durante um
  prazo por acidente. A janela residual (sem prazo, sem confirmação,
  transferências cruzadas) é infechável por desenho e tem desfecho:
  devolução integral do segundo sinal.
- **Estado dos blocos (09/08/2026):** 1) migração 083 ✓ corrida e
  testada; 2) ecrã do sinal no portal ✓; 3) destaque escuro ✓;
  4) o lado da Nádia ✓ (folha com config+prazo+WhatsApp, selo e banner
  da disputa, as 4 portas com a guarda — Funil com a ordem invertida —,
  Consulta da Data no Início, avisos de criação em pedido/formulário/
  reserva, migração 084 ✓ corrida); 5) Caixa de Entrada ✓ (aviso
  sinal_confirmado, marca âmbar «dia disputado», e três textos antigos
  corrigidos — codigo_pedido pós-véu, orcamento_aceite e
  contrato_assinado que ainda contavam a ordem pré-077).
- **09/08/2026 — Duas nuances de comportamento decididas na obra:**
  (a) o H″ (as desculpas da promessa quebrada) dissolve-se quando o
  prazo prometido passa — a contradição visível morre com ele; (b) o
  selo «dia disputado» do cabeçalho acende também com o dia TOMADO por
  rival (o caso mais grave); a gravidade conta-a o banner. Sinalizado
  ao Hélio, não bloqueante: a EventoPage usa hojeISO em UTC
  (pré-existente) enquanto o resto da disputa compara com a data local.

## Comunicados — o briefing das melhorias (09/08/2026, fases A-C)

O Hélio entregou um briefing formal por fases (o ficheiro é a fonte do
método; aqui ficam as decisões aprovadas fase a fase).

- **Fase A ✓ — o vocabulário** (glossário primeiro, código depois):
  molde → **modelo de comunicado**; público → **quem recebe**; congelar
  → **fechar a lista**; expedição → **enviar/Envios**; registo →
  **aspecto** (Sóbrio/Convidativo; `aviso`/`oferta` quietos na BD); o
  separador → **Envios**; «Feitos» → **Envios | Modelos**. As duas
  linhas de doutrina nos editores (modelo de evento = ligação viva;
  modelo de comunicado = cópia). Grafia da casa: «aspecto», pré-acordo.
- **Fase B ✓ — o percurso do envio** (Hipótese 1, arrumar): o detalhe
  virou percurso de 4 passos com pílulas (padrão do Importar + visto),
  secções na ordem do ciclo, passos futuros visíveis mas dormentes, a
  mensagem no passo Enviar (editável desde o início; o Enviar prende
  sem ela), retirada = faixa transversal com pílulas congeladas,
  concluído = balanço. Criação simétrica: «Começar de um modelo» abre o
  editor pré-preenchido EM MEMÓRIA (o ecrã de nascimento morreu — um
  ecrã a menos); escolhedor de duas vias no «+ Novo». O estado foi para
  o URL (`/admin/envios/:id/quem-recebe|enviar`, slug novo com
  redirecção do antigo).
- **Fase C ✓ (aprovada; código em obra) — matar a magia invisível:**
  pré-visualização promovida a coluna persistente ≥1240px (a gaveta
  fica abaixo disso), etiquetas de papel por bloco (recompõem ao largar
  o arrasto; a linha de instrução fica — etiquetas dizem o que É, ela
  ensina o gesto); **saudação explícita** em coluna própria (a regra da
  vírgula morreu; migração 085 migra as folhas existentes — só a
  saudação de abertura — e a dlm_comunicado_ver passou a projectá-la;
  guarda anti-duplicação com gesto de um toque); o X sempre presente
  com a razão a responder no ecrã; **portal por escolha** por
  destinatário (`no_portal`, caixa viva em todos os estados da linha,
  difusão nunca liga; backfill honesto: os envios de até hoje ficam
  como a 082 os mostrava; novos nascem desligados).
- **Migração 085** escrita e aprovada (5 partes) — correr PERTO do
  deploy do código da Fase C (janela curta em que a folha pública
  compõe sem saudação entre uma coisa e outra).
- **Fase D ✓ (09/08/2026) — o passe de Content UX:** 368 strings da
  interface julgadas pelos 9 princípios do briefing; 302 ficaram, 14
  cortaram-se, 52 reescreveram-se — zero texto acrescentado. A tabela
  aprovada (o pré-acordo, linha a linha) vive em
  **docs/comunicados-fase-d-strings.md**. A voz única fixada: folha ·
  endereço · fechar a lista · envios · quem recebe · **escolha** (nunca
  «recorte» nem «filtros» em ecrã) · «a mensagem que ACOMPANHA o
  endereço» · e o par canónico do medo, «Cria o endereço. Ainda não
  envia nada.» com o espelho no fechar da lista. Decisões do Hélio:
  placeholder da saudação «Queridas clientes,»; os cortes apoiados na
  pré-visualização aplicam-se (a Nádia trabalha em ecrã largo); a intro
  permanente da lista encolheu (a definição completa vive no estado
  vazio). Notas: os throw de guarda de programador na lib mantêm
  «recorte» (nunca chegam ao ecrã); comunicadoTempo.js ficou intocado
  (as 4 linhas eram «=»); a ComunicadoPage é da Fase E.
- **Fase E — decidido (09/08/2026): briefing próprio.** O Hélio pediu
  para seguir a recomendação, e a recomendação é esta: a folha pública
  não se revê com a régua da Fase D, porque muda o leitor — a Fase D
  falava à Nádia (operadora, ecrã largo, treinada pelo percurso); a
  folha pública fala às clientes dela, que a leem uma vez, sem
  contexto, provavelmente no telemóvel, e é a cara da casa. Os 9
  princípios foram afinados para carga cognitiva de operador; virados
  a fora, o registo é outro (hospitalidade, estética dourada) e há
  acoplamento com a migração 085 (saudação explícita, janela de
  deploy). Rascunho do briefing em
  **docs/comunicados-fase-e-briefing.md** — aguarda aprovação do
  Hélio antes de qualquer aplicação.
- **Fase E — as quatro decisões reservadas ✓ (09/08/2026, palavra do
  Hélio):** (1) mantém-se **«endereço»** — uma palavra, um trabalho:
  «endereço» é o da folha, «ligação» é a da internet; (2) coabitação
  **comunicado/folha** — fora da folha aberta (cortinas e o
  pré-escrito da cortina) diz-se «comunicado»; dentro da folha aberta
  (rodapé e o seu pré-escrito) pode dizer-se «esta folha»; (3) o corpo
  do erro **corta a repetição do botão** — «Verifique a ligação à
  internet. O endereço que recebeu continua válido.»; (4) o **`alt` da
  legenda entra no passe** — `alt=""` quando a legenda visível existe.
  A régua fecha-se com a aprovação do Hélio ao rascunho revisto pela
  crítica; depois a tabela, só depois o código.
- **Fase E — régua aprovada ✓ (09/08/2026) e crítica integrada.** O
  painel de três críticos (fidelidade · completude · leitora) correu
  DEPOIS da aprovação; as emendas estão integradas no briefing e
  listadas lá em «O que a crítica mudou» — as maiores: a **lei
  lusófona** (identidade-visual §6) entrou no princípio 3 e no
  varrimento final; o princípio 4 **autoriza expressamente a saída na
  cortina de erro** (hoje é um beco: só o botão, sem WhatsApp nem
  domínio); o 7 alargou-se ao papel (frase impressa funciona sem
  toque); o 9 deixou de ser absoluto (só se acrescenta o que outro
  princípio exigir, marcado como ACRESCENTA); nasceram o **10.º
  princípio** (a folha prova quem é e nunca pede nada) e a **regra dos
  pré-escritos** (a única voz que é da leitora: soar a pessoa,
  identificar a folha, descrever o que viu). A tabela vive em
  **docs/comunicados-fase-e-strings.md** — 25 linhas: 18 «=», 5
  reescritas, 2 ACRESCENTA (P4 e P7, com mockup antes), 0 cortes —
  aguarda aprovação linha a linha. Três linhas pedem a palavra do
  Hélio em especial: P:890 (a crítica propõe cortar também «continua
  válido» — a promessa pode desmentir-se na cortina seguinte; revê a
  2.ª frase da decisão 3) e os dois ACRESCENTA.
- **Fase E ✓ (09/08/2026) — tabela aprovada e aplicada.** O Hélio
  aprovou a tabela por inteiro, incluindo as três ★ (o corpo do erro
  fica só «Verifique a ligação à internet.» — a revisão da decisão 3
  aceite; a cortina de erro ganhou a mesma saída da cortina morta,
  com pré-escrito próprio; o rodapé impresso ganhou o número da casa
  à vista, `.so-print`, derivado de `NUMERO_WHATSAPP_CASA` para nunca
  desencontrar do wa.me). Verificador independente antes da
  aplicação: 23/23 ANTES palavra por palavra, contagens certas, cinco
  emendas suas integradas na tabela. Aplicação verificada palavra a
  palavra (7 DEPOIS presentes, ANTES todos retirados, fallback do
  pré-escrito sem título mantido) e varrimento limpo (lista negra
  pública + lei lusófona). Portão: esbuild ✓ eslint ✓ build ✓. Por
  commitar — o git é do Hélio. **O briefing dos comunicados está
  completo: Fases A, B, C (código em obra), D e E fechadas**; pendências
  fora de fase: migração 085 (correr perto do deploy da Fase C) e as
  notas «fora da fase» do briefing E (contagem de leituras, cartão OG).
- **Realce nos textos dos envios ✓ (09/08/2026) — a sintaxe é a do
  WhatsApp.** Pedido do Hélio: a Nádia precisa de pôr partes do texto
  a negrito. Decisões dele: sintaxe **à WhatsApp** (`*negrito*` e
  `_itálico_` — a que ela já usa todos os dias; na mensagem que
  acompanha o endereço é o próprio WhatsApp que a lê, sem código) em
  vez de Markdown clássico; e o ensino é **dica curta + a
  pré-visualização** (a linha de instrução dos blocos ganhou
  «*Negrito* e _itálico_, como no WhatsApp.» — dita UMA vez; a coluna
  da Fase C mostra o resultado ao vivo). O motor vive em
  **src/lib/realce.jsx**: regras mínimas à WhatsApp (o marcador
  abraça o texto, não salta linhas, sem par fica literal — nunca
  desaparece texto), nós de React sem dangerouslySetInnerHTML,
  negrito a 600 (o semibold da casa). Aplica-se aos QUATRO textos
  (prosa, cláusula, nota, remate) na folha pública e nas quatro peças
  gémeas da pré-visualização do editor. Fora, de propósito: saudação
  (cerimónia própria), rótulos/overlines, legenda da imagem e nota da
  chamada (linhas curtas — se fizer falta, é chamar a mesma função
  lá; a pré-visualização mostra a fronteira ao vivo).
- **Reordenar os cartões de Documentos na ficha ✓ (10/08/2026).**
  Pedido do Hélio: a Nádia quer arrastar os cartões (Briefing,
  Formulário, Orçamento, Projecto, Contrato) e pô-los na ordem dela —
  a organização visual importa-lhe. Decisão dele: **ordem global,
  guardada no navegador** (localStorage, chave
  `dlm.documentosEvento.ordem`) — uma ordem só para todas as fichas,
  sem migração; noutro computador volta à ordem de origem e
  reordena-se uma vez. O gesto é o do editor de blocos, tal e qual:
  punho ⠿ à esquerda do ícone, fantasma na mão, os cartões trocam ao
  vivo debaixo do dedo. A ordem lida valida-se (só cartões
  conhecidos, sem repetidos; um cartão novo da casa entra no fim). O
  destaque dourado do «gesto a seguir» continua a ser da fase do
  funil, esteja o cartão onde estiver. Portão: esbuild ✓ build ✓;
  eslint com **zero erros novos** — nota à parte: a versão nova do
  plugin react-hooks acusa 88 erros pré-existentes no repo (3 neste
  ficheiro, já no HEAD); a limpeza é tarefa própria, por decidir.
- **O «Ver o que se abre» da SinalVista caiu ✓ (10/08/2026, correcção
  do Hélio).** No ecrã do sinal, o teaser «Ver o que se abre» acendia
  o destaque escuro (DestaqueAcompanhamento) — mas esse escuro dizia
  o que o acompanhamento já conta em claro na divisão «O que o sinal
  abre», que aparece sempre entre o orçamento feito e o sinal. O link
  não fazia nada a sério; o **«Voltar ao acompanhamento» é o
  suficiente** e fica. A promessa de duas linhas («Depois do sinal —
  O seu evento, acompanhado em tempo real.») mantém-se no ecrã do
  sinal, agora sem link. O DestaqueAcompanhamento continua vivo na
  divisão da jornada («Ver melhor o que se abre», decisão de 08/08) —
  só perdeu a segunda porta. E o portão combinado não mudou: o
  acompanhamento em tempo real desbloqueia com a confirmação do
  sinal. Portão: esbuild ✓ eslint ✓ build ✓.
- **O pórtico do sinal ✓ (10/08/2026) — o escuro deixou de ser
  espreitadela e passou a portão da raiz.** Correcção do Hélio, com o
  print na mão: o «Ver melhor o que se abre» da divisão também caiu
  (um link para espreitar o escuro não fazia nada a sério), e aquele
  mesmo escuro — «Depois do sinal / O seu evento, em tempo real.», as
  quatro linhas, «A ligação que tem nas mãos é a chave. O sinal
  abre-a.» — é agora o **PorticoDoSinal.jsx**: impõe-se sozinho na
  página raiz do acompanhamento na janela entre o **orçamento aceite**
  (`resposta_orcamento.acto === "aceitou"`, a leitura da SinalVista) e
  o **sinal confirmado** (a etapa da jornada), venha o contacto pelo
  botão, pelo gesto de voltar ou pelo endereço. Sem Esc e sem
  «Voltar»: a única porta é a cápsula **«Pagar o sinal»** (a cápsula
  branca do escuro, o desenho do pórtico das condições) — é o funil
  que desperta a vontade de pagar já. Guardas: caducado ou a caducar
  hoje, o pórtico cala-se como as outras promessas. A divisão «O que o
  sinal abre» continua em claro na janela pré-aceite; as quatro linhas
  seguem numa lista única (conteudo.js). O DestaqueAcompanhamento.jsx
  morreu — o pórtico é o herdeiro. Portão: esbuild ✓ eslint ✓ (0→0
  nos dois ficheiros tocados; o novo, limpo) build ✓.
- **O aviso do sinal recebido ✓ (10/08/2026) — o elo que faltava no
  funil.** Pergunta do Hélio: como fica a cliente a saber que a casa
  confirmou o sinal? Diagnóstico: o portal é só *pull* (a página
  responde quando ela olha; ninguém lhe dizia para olhar) e as duas
  portas do registo (aba Pagamentos e «Sinal recebido →» do Funil)
  terminavam em silêncio. A ideia do **código foi posta de lado com
  razão dada**: o código de 6 dígitos autentica a cliente perante a
  casa (véu dos valores, assinar); aqui o sentido é o inverso e o
  desbloqueio já é automático no servidor — seria um ritual vazio.
  Decisão: **o padrão do prazo aplicado ao desfecho** — quando o sinal
  entra no livro (qualquer das portas, incluindo o registo forçado da
  disputa), a folha oferece o WhatsApp pré-escrito
  (`sinalRecebidoWhatsApp`, gémea da `prazoWhatsApp` em disputaDia.js):
  «Olá {nome}! Recebemos o seu sinal — o dia {data} fica reservado em
  seu nome. Qualquer dúvida, é só responder por aqui. A sua página
  acordou por inteiro: {ligação}» — a mensagem termina no endereço,
  sem ponto, para o WhatsApp a ler limpa; sem acompanhamento aberto a
  frase da página cala-se; sem número da cliente fica só o copiar. A
  oferta vive no componente **AvisoSinalRecebido.jsx** (cartão
  dourado, «Avisá-la pelo WhatsApp» + «Copiar a mensagem» + «o envio é
  sempre um gesto seu, nunca do sistema»), passageiro — fecha-se e não
  volta. Reforço aprovado: a **reconferência do foco chegou à raiz do
  portal** (só na jornada; a SinalVista já tinha a sua) — quem deixa a
  página aberta e volta a ela encontra a verdade fresca. Realtime no
  portal: posto de lado por agora (anon por token, cuidado com RLS,
  caso raro). Portão: esbuild ✓ eslint zero erros novos (PagamentosEvento
  3→3 e FunilBoard 7→7 pré-existentes; o componente novo, limpo) build ✓.
- **Bug do «Abrir ficha completa» ✓ (10/08/2026) — a lista que
  divergiu.** Sintoma (Hélio): o botão da Caixa de Entrada umas vezes
  abria a ficha, outras caía na lista de contactos. Causa: a lista dos
  avisos «cuja casa é a folha do Acompanhamento» existia em TRÊS
  cópias — AdminPage, EventoPage/Caixa e EventoPage/toast — e a 083 só
  acrescentou o «sinal_confirmado» à primeira; visto de dentro de uma
  ficha, esse aviso caía no apanha-tudo (`caminhoDoSeparador("clientes")`).
  Cura pela regra da casa (uma lista só): **TIPOS_DO_ACOMPANHAMENTO**
  exportada de `lib/notificacoes.js` (com o porquê de cada tipo, 072 e
  083 incluídos) e importada pelos três sítios — o drift deixa de ser
  possível. Portão: esbuild ✓ eslint zero erros novos (AdminPage 9→9 e
  EventoPage 4→4 pré-existentes) build ✓.
- **O contrato à vista + os carimbos do cartão ✓ (10/08/2026).**
  Pedido do Hélio em três partes; a investigação mudou o desenho de
  duas. **(1) O véu do contrato morre — migração 086** (escrita,
  pendente de o Hélio correr no SQL editor): `dlm_portal_ver_documento`
  e `dlm_portal_documentos` reescritas da 083 com um delta cada — o
  contrato sai sempre inteiro (velado=false) e `precisa_codigo` passa a
  false; custo assumido e registado na própria migração: NIF, morada,
  contacto e contraentes passam a estar à vista de quem tem a ligação
  (a régua da 083: «a posse da ligação é a prova»). **O código FICA na
  assinatura** — `dlm_portal_acto` intocada («o código prova que é
  ela»); o pedido falava em revelar informação, não em assinar — se o
  Hélio quiser o assinar sem código, é decisão nova. A folha do portal
  não precisa de mudanças: obedece a `velado`/`precisa_codigo` do
  servidor, e os ramos velados ficam como degradação graciosa até a 086
  correr (o padrão da 085). **(2+3) Os carimbos já existiam no
  servidor** — publicar carimba `enviado_em` desde a 057 (em vigor na
  075) e o assinar do portal (e o papel confirmado) carimba
  `assinado_em`+`trancado_em` (083/077). O que faltava era o CARTÃO
  ficar a saber: o separador Documentos só lia a tabela ao montar.
  Cura: `refrescarEm` no DocumentosEvento — a EventoPage muda a chave
  ao fechar a folha do Acompanhamento (pode ter publicado) e quando
  chega por realtime um aviso de carimbo deste evento
  (contrato_assinado, orcamento_aceite, projecto_aprovado); a chave é
  derivação pura em render (o linter novo da casa não deixa setState em
  efeitos — a primeira versão caiu aí e foi reescrita). Portão:
  esbuild ✓ eslint zero erros novos (EventoPage 4→4, DocumentosEvento
  3→3) build ✓. Pendência: **correr a 086** (depois da 083; a
  verificação vem no fim do ficheiro).
- **Assinar sem código ✓ (10/08/2026, palavra do Hélio) — a 086 cresceu
  duas peças.** A decisão que ficara em aberto fechou: «não é
  necessário código para assinar o contrato». A migração 086 (ainda
  por correr) ganhou: peça 3 — o CHECK `portal_actos_tem_prova` morre
  (com o assinar servido pela ligação, a excepção cobriria os três
  actos e o CHECK ficava vazio de sentido — morre às claras); peça 4 —
  `dlm_portal_acto` reescrita da 083 com um delta: o bloco que devolvia
  `precisa_codigo` ao 'assinou' desapareceu; a sessão, quando existir,
  regista-se na mesma. A prova do acto ganhou o terceiro nome na
  projecção: **'papel'** (confirmado_por) · **'codigo'** (sessão de
  antes) · **'ligacao'** (a nova — nome escrito, IP, user-agent, data).
  No portal: o registo pós-acto e a linha «As assinaturas» dizem a
  prova verdadeira (código só quando o houve), e o pé da assinatura
  promete a ligação, não o código. O FluxoCodigo fica como degradação
  graciosa até a 086 correr (o servidor de hoje ainda pede código); as
  RPCs do código ficam de pé, sem chamador obrigatório. O caminho do
  papel não muda. Portão: esbuild ✓ eslint 0→0 build ✓.
- **«Folha» é a palavra dos Envios ✓ (10/08/2026).** O Hélio apontou:
  em Envios ainda se lia «comunicado» (o botão «+ Novo comunicado» e
  mais), mas a coisa criada abrange comunicados, ofertas, campanhas. O
  varrimento apanhou 32 strings de ecrã; a regra fixada (no glossário,
  secção dos renomeados): **a coisa é «a folha»** — «+ Nova folha»,
  «Modelos de folha», «modelo de folha», «← A folha», overlines
  «FOLHA»; a overline-mãe da lista e a do editor dizem «ENVIOS»; os
  géneros dizem-se UMA vez, na definição do estado vazio («Uma folha é
  uma página pública com endereço próprio — um comunicado, uma oferta,
  uma campanha.»). Duas emendas de desambiguação: «O comunicado e as
  leituras» (fecho da expedição) virou «O percurso e as leituras» (ao
  lado de «Ver a folha», falar de duas folhas era ambíguo); o aria do
  editor virou «Editar a folha» (a troca literal dava «a folha da
  folha»). FICA «comunicado» onde é público e certo: a overline da
  ComunicadoPage e o seu espelho na pré-visualização (mexer aí é
  decisão da folha pública, sinalizada ao Hélio), e os nomes de máquina
  (tabelas, RPCs, a rota `/comunicado/:token` — mudá-la partia os
  endereços já entregues). Portão: esbuild ✓ eslint 0→0 nos sete
  ficheiros build ✓.

## O pedido /interesse — convidados e a mesa do bolo (10/08/2026)

- **O nº de convidados é obrigatório na porta pública ✓ (10/08/2026,
  palavra do Hélio) — excepto quando o pedido é SÓ o cenário
  fotografável.** O orçamento depende da lotação em tudo o que a casa
  vende — menos no cenário, que não se vende ao convidado. A regra é
  dinâmica: o campo nasce obrigatório (asterisco e barra dourada
  contam com ele, o total passa de 5 a 6) e dispensa-se no momento em
  que a única opção escolhida é «Cenário fotografável»; juntar
  qualquer outro serviço volta a exigi-lo. Na porta INTERNA fica
  livre: a Nádia transcreve leads de Instagram e nem sempre sabe já o
  número — o mesmo racional da regra dos 9 dígitos do contacto
  (rigidez pública, flexibilidade interna). Validação: vazio ou <1
  acende «Indica o número de convidados.»
- **«Mesa do bolo da noiva» passou a «Mesa do bolo» ✓ (10/08/2026,
  palavra do Hélio).** Nem toda a mesa do bolo é de noiva. O mapa das
  avaliações foi desenhado para renomes (066: várias cadeias por
  eixo): a **migração 087** junta a cadeia nova ao eixo «bolo», a
  antiga fica pelo histórico. Pendência: **correr a 087**.

## Portal — a saída do ecrã do acto (10/08/2026)

- **«Voltar ao acompanhamento» passou a «Acompanhar evento em tempo
  real» ✓ (10/08/2026, palavra do Hélio) — SÓ na cápsula vazada do
  ecrã de confirmação do acto** (DocumentosVista: o ecrã que aparece
  depois de aceitar/assinar, onde convive com «Tratar do sinal»).
  Porquê: nesse momento o botão não é um regresso, é a promessa — o
  evento passa a acompanhar-se em tempo real. As restantes portas
  discretas de regresso (fim da lista de documentos, contrato em
  repouso, questionário, sinal, avaliação) continuam «Voltar ao
  acompanhamento»: aí são mesmo regresso.

## A assinatura à vista — orçamento e contrato (10/08/2026)

- **A Nádia demorou a perceber que devia assinar — e o código explica
  porquê:** o pé do acto («A sua resposta» / «A assinatura») vive no
  fim da folha, depois do corpo todo (no contrato, depois de TODAS as
  cláusulas), e nada no primeiro ecrã anunciava que ele existia. A
  lista tinha o chip «à sua espera»; o documento aberto, silêncio.
- **Direção C escolhida ✓ (10/08/2026, escolha do Hélio sobre mockup
  — `docs/mockup-assinatura-a-vista.html`, 3 direções):** as duas
  peças, nenhuma tocando no acto («o acto vive no pé do documento» é
  decisão registada que fica de pé).
  - **A faixa da espera** (`FaixaEspera`, documentos-pecas): o espelho
    da FaixaSelo no topo da folha — engaste vazio (o que ainda não
    aconteceu) + «Por assinar»/«Por responder»/«Por aprovar» + a frase
    do que se espera. Informa, não pede: sem botão. Ao assinar, dá
    lugar à FaixaSelo — o mesmo engaste, agora com o visto.
  - **A cápsula-guia**: o desenho da pílula dos opcionais da
    /interesse — flutua no fundo enquanto o pé está fora do ecrã
    («A assinatura está no fim da leitura ↓»), um toque leva lá
    (scroll seco) e dissolve-se ao chegar. Branca, de guia — a única
    cápsula cheia da página continua a ser a do acto.
  - As duas só existem quando o pé do acto existe (`!velado &&
    !respondeu && !versãoAntiga`), ficam fora do papel
    (acomp-nao-imprime), por baixo dos pórticos (zIndex 40 < 60), e
    com movimento reduzido nada transiciona. Medição em layout effect:
    nada anima ao abrir.

## O projecto — imagens de trabalho vs imagens do cliente (10/08/2026)

- **As imagens que a Nádia põe no projecto são só dela ✓ (10/08/2026,
  palavra do Hélio; solução escolhida por mim com o mandato «a de menor
  custo»).** Ela imprime o projecto para trabalhar com as imagens dela;
  ao cliente quer mostrar OUTRAS fotos. A folha é a mesma — só as
  imagens divergem.
- **Solução (zero migrações, zero mudanças no portal e nas RPCs):**
  cada secção ganhou a chave `imagemCliente` no JSONB
  (`documentos.dados.seccoes`). O editor (GerarProposta) tem dois
  lugares por secção: «A tua imagem — só no PDF» e «Para o cliente —
  acompanhamento». Ao publicar, a folha do portal
  (PortalDoClienteSheet) usa o `p_extra` que o `dlm_portal_publicar`
  já tinha (fusão rasa) para substituir `seccoes` pela versão do
  cliente: `imagem` ← `imagemCliente`, e a chave `imagemCliente` é
  despida. O instantâneo contém EXACTAMENTE o que a cliente vê — a
  imagem de trabalho nunca sai de casa, nem escondida no JSON.
- **Regra estrita, de propósito:** secção sem `imagemCliente`
  publica-se SEM imagem (nunca há fallback para a de trabalho — o
  esquecimento não pode virar fuga). O editor avisa na própria secção:
  «Sem imagem para o cliente, esta secção publica-se sem imagem». ⚠
  Consequência transitória: republicar uma proposta antiga sem
  preencher as imagens do cliente publica as secções sem imagem — a
  Nádia deve preencher «Para o cliente» antes de publicar versão nova.
  As publicações JÁ feitas não mudam (instantâneos congelados).
- **A revisão adversarial apanhou 4 defeitos reais na primeira versão,
  todos curados:** (1) o ramo sem secções deixava os dados passar
  verbatim pela fusão — o extra agora segue SEMPRE (`seccoes: []` no
  mínimo); (2) dois uploads em simultâneo roubavam o indicador um ao
  outro e o retry podia perder para o upload antigo — os lugares de
  imagem ficam todos bloqueados enquanto um upload voa; (3) secção só
  com imagem do cliente saía como página em branco no PDF dela — o
  filtro do PDF ignora `imagemCliente`; (4) o instantâneo podia sair
  «rasgado» (secções lidas no browser mais velhas que os dados que a
  RPC congela) — a **migração 088** traz a troca para dentro do
  `dlm_portal_publicar`, atómica sobre os dados frescos, sobrepondo o
  que o backoffice enviar; o extra do backoffice fica como cinto de
  segurança até a 088 correr. Pendência: **correr a 088** (depois da
  087).

## A letra da assinatura da casa (10/08/2026)

- **Cochocib Script Latin Pro para a assinatura da casa ✓ (10/08/2026,
  palavra do Hélio) — com a ressalva da licença.** A Cochocib é fonte
  COMERCIAL (Saffatin.co / MyFonts) e não se embute sem comprar; os
  «downloads grátis» são cópias sem licença e ficaram fora. A pilha
  (`FONTE_ASSINATURA_CASA`, lib/casa.js) põe a Cochocib primeiro — no
  dia em que a licença se comprar, junta-se o ficheiro + um @font-face
  e a assinatura muda sozinha — e vale entretanto a **Great Vibes**
  (Google Fonts, SIL), a caligráfica de casamento mais próxima.
- **Onde:** SÓ a assinatura da casa — o nome da 2.ª contraente na folha
  do contrato (GerarContrato, 22px) e o nome no registo «As
  assinaturas» do portal (17px, só o nome; o resto da linha continua
  registo). A assinatura do CLIENTE fica em itálico como estava, por
  pedido explícito («apenas para a assinatura da casa»).

## O MB Way da casa (10/08/2026)

- **`EMPRESA.mbway = 927 177 190` nasceu em casa.js ✓ (10/08/2026,
  palavra do Hélio).** É o número do WhatsApp da casa sem o indicativo.
  Fecha a ressalva da decisão 8 do ecrã do sinal (08/08: «sem MB Way da
  casa registado, o default é só IBAN»): o ecrã do sinal já esperava
  pelo campo e passou a mostrá-lo por defeito ao lado do IBAN, sem
  outras mudanças — copia sem espaços, como o IBAN. Na folha do
  acompanhamento, o placeholder do campo MB Way passou a mostrar o
  número da casa, em espelho do IBAN.

## Fim dos portões de reconhecimento (14/08/2026)

- **14/08/2026 — Os avisos bloqueantes morreram todos.** O sistema
  `AvisosBloqueantes` + registo `avisosAtualizacao.js` foi removido por
  inteiro (pedido directo do Hélio): nenhuma página do admin volta a
  ficar desfocada e sem cliques até a Nádia reconhecer uma
  actualização. Porquê: um portão que impede o trabalho para anunciar
  melhorias é fricção desproporcionada — a razão da decisão de 30/07
  («avisos bloqueantes ensinam a dispensar avisos») passa de excepção a
  regra. Os avisos contextuais que não bloqueiam (AvisoDataDoEvento,
  AvisoMoradaDoEvento, AvisoSinalRecebido) ficam.

## A grande limpeza de código morto (14/08/2026)

- **14/08/2026 — Código morto sai, sempre; o git é o arquivo.** Varredura
  completa (knip + grafo de imports + verificação adversarial símbolo a
  símbolo): caíram 5 ficheiros inteiros, ~360 linhas de símbolos sem
  uso, 6 classes CSS órfãs, 3 imagens nunca referidas e 3 dependências
  npm. Porquê: o Hélio pediu — o peso morto estava a custar manutenção
  e desempenho. Tudo recuperável do histórico git.
- **14/08/2026 — A exportação Excel/PDF morreu de vez (por agora).**
  `src/lib/exports.js` estava desligado do AdminPage desde 15/06/2026 e
  nunca foi religado; foi removido com as dependências `xlsx`, `jspdf` e
  `jspdf-autotable`. Porquê: uma funcionalidade desligada há dois meses
  é peso morto; se a exportação voltar ao desenho, recupera-se do git
  (commit 046403c) e repensam-se as bibliotecas nessa altura.
- **14/08/2026 — Morreram também os dois cartões pedagógicos órfãos**
  (`AvisoDataDoEvento`, `AvisoMoradaDoEvento`) e a rota pública de
  pré-visualização `/__preview_aviso` que mantinha o primeiro vivo.
  Porquê: eram o resto do sistema de avisos bloqueantes removido nesta
  mesma data; uma rota pública sem protecção para pré-visualizar
  backoffice era, além de morta, uma fresta desnecessária.

## O mecanismo único de imagens (14/08/2026)

- **14/08/2026 — Toda a imagem que sobe passa por `imagemOtimizada.js`.**
  Um mecanismo só (redimensiona ao lado máximo do sítio + WebP com
  qualidade alta; JPEG/PNG onde não houver WebP; SVG, GIF e PDF passam
  intactos; nunca piora — se o resultado ficar maior, vai o original)
  substituiu os três compressores artesanais (captacao, materiais,
  fotografias) e tapou o único buraco: o contrato assinado no portal
  subia a foto CRUA do telemóvel (3-5 MB) e passou a subir otimizada a
  2200px/q0.9 — o texto do papel continua legível ao ampliar. Porquê:
  espaço e largura de banda pagam-se, e a qualidade visual fixa-se por
  sítio (600 vinheta de material, 1200 referências/propostas, 1600
  folha, 1000/1800 fotografias, 2200 papel), não por adivinhação.
- **14/08/2026 — `flores.png` (2,8 MB) passou a `flores.webp` (291 KB).**
  A decoração das páginas públicas era o maior peso do primeiro
  carregamento; 900px a q85 com transparência intacta cobre o dobro da
  densidade do maior tamanho a que alguma vez se mostra (380px CSS).

## «Formulário», não «questionário» (14/08/2026)

- **14/08/2026 — O formulário chama-se «formulário» dos dois lados, palavra
  da Nádia.** Porquê: «questionário» soa a inquérito opcional — não passa a
  ideia de obrigatoriedade — e ela via as pessoas adiarem o preenchimento.
  Inverte a doutrina dos dois nomes de 29/07 e a justificação antiga do
  glossário («formulário é frio»); o glossário foi corrigido primeiro, como
  manda a regra. Varridas as ~75 ocorrências visíveis no front (zero
  restantes); os nomes de máquina (`questionario_*` em tabelas, RPCs, tipos
  de notificação e o slug do portal) ficam quietos — mudá-los partia URLs e
  código por uma palavra que o cliente não vê. Na base, a migração **089**
  (por correr) põe as duas notificações compostas no servidor a dizer
  «formulário» e corrige os títulos já guardados.

## Validação — regra da casa

- **30/07/2026 — O portão é esbuild + eslint + build, sempre os três.**
  Porquê: duas vezes neste projeto o build passou com um erro que o eslint
  apanhou e que teria rebentado no ecrã da Nádia (uma importação em falta
  que viajou com um handler). O build sozinho não chega.

## Multi-tenant — o gestor deixa de servir uma casa só (15/08/2026)

Sete migrações (090-096) em dois dias. O pressuposto «há uma casa» estava
enterrado em 32 tabelas, 35 políticas e 56 funções — sai todo. Cumpre-se a
regra de 04/08 («conteúdo de um negócio nunca vive no esquema que todos os
negócios correm»), agora com nome próprio.

- **15/08/2026 — A empresa chama-se Sollelio; Sollelio fica como nome do
  produto.** Sol (Solange) + Hélio — os dois nomes dizem sol, em português
  e em grego. Porquê Sollelio morreu como nome de casa: é palavra comum do
  idioma e, nas classes de festas e eventos, o INPI trata-a como
  descritiva — registável só como marca mista, com protecção fraca; e
  prendia a empresa ao nicho que ela quer ultrapassar. Como nome de
  produto continua a servir.
- **15/08/2026 — Uma base de dados para todas as casas, nunca uma por
  casa.** Banco por cliente esgota a quota ao segundo, obriga a repetir
  cada migração à mão, e produz o bug corrigido num sítio e esquecido no
  outro. A casa passa a ser uma linha em `tenants`, não uma peça de
  infraestrutura. Feito AGORA, com uma casa e zero dados de terceiros:
  o backfill é uma constante. Com cinco casas seria arqueologia.
- **15/08/2026 — Raízes têm coluna; folhas delegam.** Onze tabelas levam
  `tenant_id`; as outras vinte e uma chegam à casa por ligação já
  existente (quase sempre `submission_id`). Porquê: dar coluna própria a
  uma folha cria uma segunda fonte de verdade para a mesma pergunta, e com
  ela a hipótese de divergirem sem ninguém dar por isso.
- **15/08/2026 — A casa DERIVA-SE, nunca se recebe do browser.** Um uuid
  de casa vindo de fora é um pedido para escrever na casa alheia. O portal
  resolve pelo token; o formulário pelo código do convite; o pedido
  público pelo slug do endereço (`/interesse/:slug`), por uma porta única
  (`tenant_por_slug`). O slug é público por desenho — está no endereço,
  não é credencial, e sozinho não abre nada.
- **15/08/2026 — Os seis modelos de evento são da Nádia; nenhum é modelo
  de plataforma.** Estão todos em uso, moldados aos serviços que ela vende
  («Brunch Elegante», «Cenário Decorativo» não são categorias universais).
  Porquê não os oferecer como ponto de partida à segunda casa: seria o
  trabalho dela a servir um concorrente. A coluna admite `tenant_id` nulo
  para modelos genéricos escritos de raiz, se um dia fizerem falta.
- **15/08/2026 — O developer vê tudo pela `service_role`, nunca por
  super-utilizador nas políticas.** Um `or is_super_admin()` entraria nas
  32 políticas, correria em cada consulta e ficaria lá para sempre — e o
  isolamento passaria a depender de uma função que ninguém revê. O
  dashboard já contorna RLS por definição. Ganha-se de caminho uma frase
  verdadeira para dizer a clientes: a aplicação não deixa o developer ver
  os vossos dados.
- **15/08/2026 — Contas separadas para o Hélio e para a Nádia.** Até aqui
  eram as mesmas credenciais: ela não podia mudar a password sem lhe
  cortar o acesso, e os registos de autenticação não distinguiam quem
  entrou. A membership do Hélio na casa dela é TEMPORÁRIA por desenho —
  sai quando existir um tenant de demonstração da Sollelio para testes.
- **15/08/2026 — O briefing saiu da rua** (migração 094). A rota
  `/briefing/:id` era pública com o uuid a fazer de chave — decisão
  defensável com uma casa, insustentável com duas (um uuid vale em
  qualquer sessão). A Nádia imprime a folha a partir do admin, onde já tem
  sessão; ninguém de fora precisava dela. Com a rota privada, a projecção
  explícita deixou de fazer sentido: a folha lê os campos por
  `getValorAtual` a partir dos `steps` do modelo, e uma lista fixa de
  colunas ficaria desactualizada ao primeiro campo novo — um campo em
  branco na folha que ela leva para o evento.
- **15/08/2026 — Um fallback que a política nega falha em SILÊNCIO — e por
  isso morre.** O padrão «se a RPC não existir, faz por passos» serviu
  para publicar o front antes da migração. Depois da RLS por casa, esses
  ramos não dão «função em falta»: dão zero linhas, e a página pinta-se
  vazia sem erro nenhum. Removidos na captação e no briefing; ficam
  `clientes.js`, `briefingEdicao.js`, `campanhas.js` e `invites.js`.
- **15/08/2026 — Três falhas que a RLS não travava, porque `SECURITY
  DEFINER` ignora políticas por definição.** `captacao_dedupe` procurava
  contacto por telefone em todas as casas (não vazava dados — escrevia-os
  no sítio errado, que é pior: não dá erro e não se desfaz);
  `dlm_dia_estado` devolvia `rival_nome`, o nome de uma cliente de outra
  casa, no calendário do admin; `dlm_fase_avancar_ate` aceitava ESCRITA
  anónima em `submissions` — qualquer pessoa com um uuid avançava a fase
  de qualquer evento.
- **15/08/2026 — Um DEFAULT em coluna obrigatória não chega ao anónimo, e
  isso é deliberado.** A 090 pôs `not null` sem default e partiu todos os
  inserts (a 092 curou com `tenant_actual()`). Mas `auth.uid()` é null nas
  funções públicas: o default devolve null e o insert falha na mesma.
  Porquê não remendar: obriga a resolver a casa explicitamente em cada
  porta pública, em vez de a adivinhar.
- **15/08/2026 — Um DEFAULT novo num argumento cria SOBRECARGA, não
  substituição.** A 093 acrescentou `p_tenant` ao `dlm_dia_estado` e
  ficaram duas funções com o mesmo nome; o `dlm_portal_ver` continuou a
  chamar a antiga, sem escopo. A 095 apagou-a; a 096 fez a função deduzir
  a casa do `p_excluir` (que É a submissão a consultar o dia, e vem da
  base, não do browser) em vez de reescrever as 300 linhas do portal.
  Regra que fica: ao mudar assinatura de função, verificar sempre se a
  antiga ficou de pé.
- **15/08/2026 — A base fica na Irlanda (eu-west-1), como já estava.** A
  Do Luxo à Mesa opera em Portugal e o sistema guarda dados de convidados
  — incluindo restrições alimentares, que sob o RGPD podem contar como
  categoria especial. Ser gratuito não isenta. Região de projecto Supabase
  não se muda sem migração completa; a que existe é a certa.
- **15/08/2026 — Só o `sollelio.com`, por agora.** `.pt` e `.com.br`
  ficam adiados: para um nome inventado, sem tráfego e sem reputação, o
  risco de alguém os registar é baixo, e sobe só quando houver dinheiro
  para os comprar. O que tem relógio a correr é a MARCA, não o domínio —
  e em Portugal antes do Brasil, porque é lá que o produto está em uso.

## O frontend deixa de saber o nome da casa de cor (099 · 15/08/2026)

A 097 pôs a identidade em `tenants` e a 098 abriu as portas; faltava o
lado de cá. Trinta e três ficheiros liam-na de constantes em JavaScript.

- **15/08/2026 — Cada página pública embrulha-se no SEU Provider e diz
  de onde vem a casa.** A porta é sempre a que a página já tem na mão: o
  token no comunicado, no portal e na campanha; o slug na captação; o
  código do convite no formulário. A alternativa — um Provider no `App`
  a ler a rota — punha a identidade a depender da NAVEGAÇÃO, e a casa já
  tem regra contra isso (30/07). Nenhuma passa a identidade por props:
  os componentes-filhos chamam `useCasa()`, porque um logótipo que viaja
  por prop é um sítio por onde pode chegar errado.
- **15/08/2026 — O backoffice leva UM Provider, numa rota-molde sem
  caminho.** `AreaAutenticada` embrulha o `ProtectedRoute` e as três
  páginas de dentro. Um por página fazia três pedidos da mesma casa e
  recomeçava-os a cada salto do painel para um evento; um à volta das
  `Routes` todas punha as páginas públicas a perguntar por uma sessão
  que não têm. Aqui a identidade carrega depois de a sessão estar
  confirmada — que é a ordem que a 098 exige, porque a RPC deriva a casa
  de `auth.uid()`.
- **15/08/2026 — O login veste a identidade de omissão, e isso é a
  resposta certa.** É rota irmã da protegida: quem ainda não entrou não
  tem sessão, a RPC devolve null. A porta de entrada é do PRODUTO, não
  de uma casa — saber de que casa é alguém antes de se identificar era
  exactamente o que a 093 proibiu.
- **15/08/2026 — Os literais de texto visível migram; os comentários
  não.** Vinte e cinco frases diziam «Do Luxo à Mesa» à mão, sem passar
  por constante nenhuma — o grep da 099 não as apanhava e mentiriam
  exactamente como o `EMPRESA` mentia. Nos comentários a Nádia continua
  a ser a Nádia (regra de 02/08).
- **15/08/2026 — Conteúdo de NEGÓCIO não é identidade e não migra
  aqui.** As cláusulas do contrato, a nota de higienização do orçamento
  e os textos-sugestão dos geradores são frases escritas pela titular,
  com a casa cosida por dentro («sob a designação comercial X», «o foro
  da X»). Trocar o X por `casa.nome` não as torna da casa seguinte —
  torna-as só menos verdadeiras. Ficam para migração própria, em que
  passam a texto por casa na base de dados, não a molde com furos.
- **15/08/2026 — Onze das doze exportações-ponte caíram; sobra o
  `EMPRESA`, e sobra sozinho.** É o preço da decisão anterior: o
  `contratoConfig.js` é o único consumidor, está nomeado no comentário
  do `casa.js`, e a condição de saída está escrita. Um segundo ficheiro
  nesse grep quer dizer que alguém voltou a atravessar a ponte.
- **15/08/2026 — Os módulos que não são componentes recebem a casa por
  ARGUMENTO.** `imprimirFicha`, `imprimirConferencia`, `conteudo.js` e o
  `validateCode` não têm hook à mão; quem chama é componente e passa o
  `useCasa()`. Nada de estado global — seria uma segunda fonte de
  verdade a divergir do Provider em silêncio. A excepção é o
  `useNotificacoes`: é um hook, e um hook lê o contexto.
- **15/08/2026 — Ao interpolar a casa em HTML de impressão, escapa-se.**
  As folhas de armazém montavam o cabeçalho com constantes literais, e
  interpolar sem escapar era seguro. Deixou de ser: o nome vem agora da
  base, e um `&` no nome de uma casa partia a folha.

### Pendências desta decisão

- **100 · O token morto veste a casa de omissão.** ~~Um token revogado
  faz a RPC devolver null, e o Provider mantém a identidade anterior.~~
  **Fechada pela 100** — e não como estava previsto aqui: a porta passou
  a resolver a casa do token morto em vez de lhe apagar a marca. Ver a
  secção abaixo.
- **O texto dos documentos ainda é de UMA casa.** A lista completa está
  na 099: `orcamentoConfig.js` (nota de rodapé, condições, catálogo de
  serviços, os 25 € entre as duas moradas dela), `contratoConfig.js` (as
  onze cláusulas e a composição por lugar) e os textos-sugestão do
  `GerarProposta` e do `GerarOrcamento`. Enquanto isto viver em
  JavaScript, a segunda casa assina o contrato da primeira.
- **`src/lib/casa.js` é identidade de UMA casa, cravada em JavaScript**
  (WhatsApp, MB Way, IBAN, assinatura do titular). A decisão de 04/08 já
  o previa: «o dia do segundo negócio, a camada entra ali sem reescrever
  nada». **Fechada pela 099** — os campos vêm de `tenants` pelo
  Provider; o que fica no ficheiro é a omissão e a FORMA.
- **Chaves de texto ainda únicas GLOBALMENTE**: `app_config.chave`,
  `event_types.nome`, `avaliacao_eixos.chave`, `questionario_grupos.chave`.
  A segunda casa que quiser um tipo «Casamento» leva erro de constraint.
- **`form_errors` aceita insert anónimo sem limite** — o caminho mais
  fácil para encher os 500 MB do plano gratuito.
- **Sem autoria**: não há `criado_por` em lado nenhum e
  `respostas_autoria` grava `'cliente'` como texto fixo, não um `user_id`.
  Duas contas dão dois logins, não histórico de quem fez o quê.
- **Os nomes de máquina continuam a dizer `dlm_` e `captacao_`** — 43 das
  56 funções levam o nome da primeira casa, e a palavra abandonada a 29/07
  vive nas RPCs. Renomeia-se numa migração própria, com invólucros, nunca
  a meio de outra coisa.
- **Quando existir a segunda casa:** sai o redirect de `/interesse` (o
  slug fixo passa a mandar leads para a casa errada), sai a membership do
  Hélio na Do Luxo à Mesa, e o isolamento testa-se a sério — com um
  tenant só, nenhum teste distingue «filtra pela casa certa» de «não
  filtra».
- **15/08/2026 — A 099 não tem ficheiro em `docs/migracoes/`, e é de
  propósito.** Foi migração de FRONTEND: o `casa.js` deixou de conter a
  identidade e passou a compô-la, o `CasaProvider` entrou, e 33
  ficheiros trocaram as constantes pelo hook. Zero SQL. A pasta das
  migrações é para o que corre na base; pôr lá um número sem ficheiro
  seria mentir sobre o que há para correr. O salto de 098 para 100 na
  pasta explica-se aqui, e o trabalho vive no histórico do git.
## A casa desconhecida não empresta marca (100 · 15/08/2026)

A pendência 100 da 099. O SQL correu em test e em produção antes do
frontend; o resto está em `docs/prompt-100-casa-desconhecida.md`.

- **15/08/2026 — Um token morto continua a ter dono, e fica com a marca
  dele.** A 100 TIROU os filtros de validade de dentro do
  `identidade_por_token`: revogado, expirado ou retirado, o token está na
  base e sabe-se de quem é. Um prazo terminado é o acesso que acabou, não
  a casa que desapareceu — e a página que diz «isto terminou» é mais
  humana com o nome deles do que sem. Foi assim que a pendência se
  fechou: não apagando marca, mas resolvendo a casa certa.
- **15/08/2026 — A moldura nua é o caso RARO, não o comum.** Fica para
  dois casos só: o endereço que nunca existiu, e a casa `suspenso` ou
  `encerrado`. O segundo é o que ninguém ia testar — uma casa que deixa
  de pagar não ficava às escuras, ficava **com a cara de outra**, porque
  todos os tokens dela continuavam a abrir com a identidade de omissão.
  Suspender é cortar a presença, não só o acesso.
- **15/08/2026 — Sem casa não se veste a de outra, nem a nossa.** A
  correcção óbvia era trocar os valores da omissão pelos da Sollelio. Não
  chega: quem abre um endereço que não é de ninguém não tem nada que
  aprender sobre a Sollelio, e pôr-lhe a marca do produto à frente é usar
  o desapontamento dela como montra. A cortina diz o que tem a dizer e
  **não oferece saída nenhuma** — uma saída para o sítio errado é pior do
  que nenhuma. A Sollelio é o nome que se vê por dentro, não à porta.
- **15/08/2026 — A migração correu à frente do frontend, e a app ignorou
  a identidade da base durante essa janela.** As RPCs passaram a devolver
  `{estado, casa}`; o `pedir()` continuou a entregar o envelope inteiro e
  o `comOmissao()` espalhou-o — `{...CASA_OMISSAO, casa, estado}` — pelo
  que TODOS os campos caíram na omissão. O logótipo do Storage não era
  usado, o IBAN vinha da constante, e nada disto dava erro: com uma casa
  só, a omissão e a verdade são iguais ao pixel. Regra que fica: **uma
  migração que muda a FORMA da resposta não pode correr antes de o
  frontend a saber ler** — não parte nada, só mente. Ficou também um
  `SEM_CASA` chamado sem estar definido, que o eslint apanhou como
  `no-undef` e teria sido um `ReferenceError` à primeira resposta
  `desconhecida`.
- **15/08/2026 — A guarda das funções derivadas é sobre o CAMPO, não
  sobre «há casa».** Uma regra só serve os dois casos: o endereço que não
  é de ninguém e a casa real a que falta o MB Way ou o foro — que a 097
  sempre admitiu e que até aqui punha `undefined` no papel do orçamento.
  Excepção única: o `logoDe`, porque `logo_url` nulo quer dizer «esta
  casa não carregou logótipo», não «não há casa».
- **15/08/2026 — O nulo apaga o ELEMENTO, não só o valor.** Um
  `href={null}` navega para a própria página e um `<img src={null}>`
  faz o browser pedi-la. Esconder identidade é não desenhar a etiqueta,
  nunca desenhá-la vazia.

- **15/08/2026 — O nome do produto sai do código para uma variável de
  ambiente.** `VITE_NOME_PRODUTO`, hoje «Celebra». Não é da casa e não é
  da base: é de build, como a fonte da assinatura. E em variável porque o
  nome ainda não está decidido — a marca «Celebra» já está registada por
  outros em Portugal e no Brasil, e o dia em que mudar não pode ser um dia
  de procurar a palavra por trinta ficheiros. Sem a variável fica vazio, e
  quem o desenha omite-o: nenhum nome é melhor do que o nome errado.
- **15/08/2026 — A `LoginPage` veste o PRODUTO, e nada mais.** Sem sessão
  a RPC responde `desconhecida` — em todos os carregamentos. O título usa
  o nome do produto; a linha de marca e o slogan são da CASA e caem.
  Emprestá-los ao produto seria a mesma mentira em sentido contrário.
- **15/08/2026 — A `CaptacaoPage` com slug inventado não abre o
  formulário.** É a única página pública que não INFORMA, RECOLHE: despir
  a moldura deixava-a a pedir nome, telefone e data de casamento para lado
  nenhum, com a pessoa a acreditar que os entregou a alguém. Cortina sem
  saída. Onde a página só informa (comunicado, portal, formulário), basta
  despir; onde recolhe, fecha-se.
- **15/08/2026 — Num título o nome desaparece com o elemento; numa frase
  cai em «casa».** Um `<h1>` vazio abre um buraco no desenho e sai
  inteiro. Uma frase não pode sair — e numa template string o `null`
  imprime-se por extenso («Avisar a null»). O `nomeDaCasa()` devolve
  «casa», que não é palavra nova: é a que o portal já usa quando não a
  nomeia («pela casa», «as condições da casa», «quem é da casa»).

### Pendências desta decisão
- **⚠ `identidade_da_casa` e `identidade_conhecida` respondem ao `anon`.**
  As duas migrações fazem `revoke all ... from public` e não concedem
  nada ao `anon`, e o comentário da 097 é explícito: «Não se concede ao
  anon: recebe um uuid, e um uuid vindo de fora não se aceita.» Na
  prática devolvem HTTP 200 ao anon (verificado em test). A causa
  provável é o `alter default privileges` que o Supabase aplica ao
  esquema `public` — o `revoke from public` não apaga o grant explícito
  ao `anon`. Impacto baixo (a identidade não é segredo, e é preciso saber
  o uuid da casa), mas o padrão do `revoke` está a dar falsa segurança em
  TODAS estas migrações e vale a pena confirmar quantas mais afecta.
- **15/08/2026 — O «connosco» dispensa o nome.** A frase da data passada
  na `SinalVista` nomeava a casa a meio e, sem casa, lia «a casa no seu
  evento». Reescrita para «Se ainda quiser contar connosco no seu evento»
  — a primeira pessoa do plural resolve o que a substituição não
  resolvia. Fica como padrão para as frases que precisam de se referir à
  casa dentro do texto corrido: preferir a voz à etiqueta.
  A linha «Entre X e Maria» do contrato mantém-se como ficou: sem nome
  sai inteira, porque ali o nome é uma das PARTES e não há como a
  substituir.
- **O portal de uma casa SUSPENSA deve FECHAR, não abrir despido.** A
  `CaptacaoPage` já não abre; o portal, o comunicado e o formulário
  continuam a servir conteúdo sem marca. A correcção é no SERVIDOR e não
  no frontend — as RPCs passam a devolver `estado: terminado` quando a
  casa não está activa. Fica para a **migração 103**.

## Os fallbacks que a RLS nega (104 · 15/08/2026)

O padrão «se a RPC não existir, faz por passos» serviu para publicar o
frontend antes de as migrações correrem. Depois da RLS por casa (091)
deixou de fazer o que promete, e a 099 já o tinha tirado da captação e
do briefing. Ficavam quatro; saem dois, e os outros dois têm outro
problema por baixo.

- **15/08/2026 — Um ramo que testa «função em falta» não apanha «política
  nega».** Provado contra a base: `submissao_fundir_respostas` chamada
  sem sessão responde **42501 permission denied**, não PGRST202. O
  `ehFuncaoRpcEmFalta` devolve falso e o erro sobe — mas onde o caminho
  antigo era um SELECT, a resposta é pior: zero linhas, sem erro, e a
  página pinta-se vazia a dizer que não há nada.
- **15/08/2026 — Removidos os dois fallbacks de caminho autenticado.**
  `briefingEdicao.fundirCampos` (o pré-038: reler, fundir no browser e
  gravar) e `campanhas.registarContribuicao` (a assinatura de 7
  argumentos da 039 e a conta antiga no browser). O erro passa a ser
  lançado em vez de degradar.
- **15/08/2026 — Um fallback arrasta andaimes, e os andaimes também
  saem.** Com a conta antiga foram-se os parâmetros `previstos` e
  `pagamentos` do `registarContribuicao` (só a serviam), o
  `marcarIntencaoConfirmada` e o erro
  `INTENCAO_CARIMBADA_SEM_DINHEIRO` — que descrevia um meio-estado
  «promessa carimbada, dinheiro por registar» que só existia porque a
  escrita não era transaccional. Com a RPC não é produzível. Deixá-los
  seria deixar uma armadilha: quem lesse a assinatura julgaria que
  aqueles números ainda contam.

### Pendências desta decisão

- **16/08/2026 — Removidos também os dois de caminho PÚBLICO, e eram os
  piores.** `invites.validateCode` e `clientes.submeterFormulario` liam e
  escreviam as tabelas em nome do `anon` — `invites`, `clientes`,
  `submissions` —, o que a 091 fechou. O do `validateCode` não dava sequer
  erro: o SELECT devolvia zero linhas e a função respondia «Código
  inválido» a quem tinha um código bom.
- **16/08/2026 — Remover a `markInviteUsed` FECHA um risco, não o abre.**
  Confirmado campo a campo antes de sair: fazia dois updates — o convite
  («Preenchido» + submission_id) e a reserva de origem («Convertida» +
  submission_id) — e nada mais. A `formulario_submeter` faz os mesmos
  dois, nas linhas 233 e 238 da 036, dentro da MESMA transação. O que se
  perde é o modo de falhar: soltos no browser, o segundo update podia
  falhar e deixar a reserva por converter na agenda, com o erro engolido
  de propósito para não mandar a cliente resubmeter. O sintoma aparecia
  semanas depois. Regra que fica: antes de apagar uma escrita porque «o
  servidor já a faz», comparar campo a campo — o que ela faz A MAIS é o
  que desaparece em silêncio.
- **16/08/2026 — Os andaimes do lado de cá também caem.** Com o fallback
  do `submeterFormulario` foram-se a bandeira `conviteMarcado` (existia
  só para dizer a quem chamava se faltava marcar o convite à parte), o
  bloco da FormPage que a lia, e as duas funções que só ela usava —
  `submeterQuestionario` e `atualizarEventoComQuestionario`, 94 linhas
  que reimplementavam no browser o que a RPC faz numa transação.
- **16/08/2026 — O `ehFuncaoRpcEmFalta` saiu; o `rpc.js` fica.** O
  `codigoErroRpc` tem consumidores vivos (campanhas, FormPage,
  VisaoGeralEvento, SubmissionDrawer) e é outra coisa: lê os códigos de
  negócio que as funções sinalizam de propósito, em vez de adivinhar
  migrações por correr. O cabeçalho do ficheiro foi reescrito — descrevia
  o padrão inteiro, e o padrão já não existe.
