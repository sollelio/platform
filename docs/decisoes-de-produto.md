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

## Validação — regra da casa

- **30/07/2026 — O portão é esbuild + eslint + build, sempre os três.**
  Porquê: duas vezes neste projeto o build passou com um erro que o eslint
  apanhou e que teria rebentado no ecrã da Nádia (uma importação em falta
  que viajou com um handler). O build sozinho não chega.