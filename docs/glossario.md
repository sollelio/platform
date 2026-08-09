# Glossário — a linguagem da casa

Este ficheiro é a **fonte única de verdade** para os nomes que usamos, em três sítios:
o que **quem chega lê** (páginas públicas), o que **nós dizemos** entre nós (Helio + Nádia),
e o que está **no código** (nomes de ficheiros, variáveis, tabelas).

Regra de ouro: **os nomes que as pessoas leem podem mudar; os nomes que a máquina usa ficam quietos.**
É a mesma lógica do `slug ↔ id` do routing — uma coisa canónica no código, várias leituras por cima.
Quando um nome muda, muda-se **aqui primeiro**, e só depois no resto.

---

## O princípio que resolve quase tudo

Uma palavra só deve fazer **um trabalho**. A confusão toda vinha de duas palavras a fazerem dois:

- **"Cliente"** era ao mesmo tempo *toda a gente na base* e *quem fechou negócio*.
- **"Orçamento"** arriscava ser *o que a pessoa pede* e *o documento que a Nádia devolve*.

Este glossário separa cada palavra num só sentido. Depois disso, dá para dizer uma frase
sobre o negócio sem tropeçar — coisa que antes era impossível.

---

## A simetria da casa

O negócio tem dois momentos com a **mesma forma**: a pessoa envia um formulário, a Nádia
produz um documento. Ver isto torna tudo fácil de explicar.

| Momento | A pessoa envia (formulário) | A Nádia produz (documento) |
|---|---|---|
| **No início** (ainda a decidir) | **pedido** | **orçamento** |
| **Depois de fechar** (evento confirmado) | **questionário** | **briefing** |

> A Nádia recebe sempre um **formulário** e responde com um **documento**.
> Pedido → orçamento no início. Questionário → briefing depois.

---

## Os três níveis do formulário (molde → instância → cara pública)

Isto é a peça que faltava, e a raiz de uma confusão antiga. O "formulário" que o organizador
preenche não nasce do nada — atravessa **três níveis**, cada um com o seu nome:

| Nível | O que é | Quem lhe mexe | Nome |
|---|---|---|---|
| 1 · o molde | A estrutura de um tipo de evento: os passos e os campos. "Casamento = 5 passos, 44 campos." Feito uma vez, reutilizável. | Nádia (raramente) | **modelo de evento** |
| 2 · a instância | Um formulário concreto para um evento, feito a partir do molde. "O formulário da Marta, baseado no molde Festinhas." | Nádia (por evento) | **formulário** |
| 3 · a cara pública | O mesmo formulário, do lado de quem o preenche. As perguntas que o organizador vê e responde. | Organizador | **questionário** |

> **Sobre "molde":** é a *metáfora* que explica o conceito (a estrutura a partir da qual se
> faz cada formulário), não o nome. O separador chama-se **"Modelos de Evento"** — "modelo" é
> a palavra que as pessoas já esperam para "estrutura reutilizável" (modelo de documento,
> modelo de email), enquanto "molde" é físico de mais para uma estrutura de dados. A metáfora
> ajuda a entender; o nome tem de ser reconhecível.

O nível 2 e o nível 3 são **o mesmo objecto visto de dois lados**:

> Do lado da Nádia é um **formulário** — ela monta-o, escolhe os campos, gere uma lista deles.
> Do lado do organizador é um **questionário** — recebe um código e responde às perguntas.

É a mesma dupla-face de sempre (como `slug ↔ id`): uma coisa, duas leituras conforme quem
olha. O separador da Nádia chama-se **"Formulários"** (é o trabalho dela) e a página
pública fala em **"questionário"** (é o que o organizador faz). Não competem — encaixam.

### Qual das duas palavras usar (a regra de desempate)

Nem sempre é óbvio, porque há frases *no ecrã da Nádia* que falam do que o **organizador**
faz. A regra:

> **A palavra segue de quem é a acção que a frase descreve — não de quem está a ler o ecrã.**

Exemplo real: no briefing (que a Nádia lê) havia a frase *"as respostas do questionário…
quando o formulário for preenchido"* — duas palavras para a mesma coisa, na mesma frase.
Como ambas as metades falam do que o **organizador faz** (responder, preencher), a palavra é
**questionário** nas duas. Se a frase falasse do que a Nádia faz ("cria o formulário", "envia
o formulário"), seria **formulário**.

Corolário: duas palavras diferentes para o mesmo objecto na **mesma frase** lê-se sempre como
erro, seja qual for o lado. Se acontecer, escolhe uma segundo a regra acima.

> **Modelo de evento** (o molde) → **formulário** (a instância que a Nádia cria) →
> **questionário** (o que o organizador responde).

---

## Quem preenche: o organizador (não "casal/família")

Quem preenche um formulário — o pedido ou o questionário — nem sempre é íntimo do evento.
Pode ser uma noiva, uma mãe, a assistente de uma empresa que dá um jantar de Natal, o
responsável de um grupo de amigos que celebra a amizade. O que têm em comum não é a *relação*
com o evento — é **tratarem dele**.

Por isso o nome é **organizador**: quem organiza o evento. É neutro quanto a pessoa ou
empresa, íntimo ou profissional, e descreve a **função**, não o laço. Substantiva-se bem —
"os dados do organizador", "o organizador respondeu".

**A abandonar:** "casal", "família", "noivos" como forma de falar de quem preenche. Excluem
metade dos clientes reais — uma empresa lê "as perguntas que o casal vê" e sente que o produto
não é para ela. Estas palavras podem aparecer *dentro* de um evento concreto (um casamento tem
mesmo noivos), mas não como o nome genérico de quem trata do evento.

> **Nota:** "organizador" não é o mesmo que **"responsável no dia"** (a pessoa de contacto na
> montagem, ex. a Ana Silva). O organizador trata do evento ao longo do processo; o
> responsável no dia é quem está lá no dia. São dois papéis diferentes.

---

## Pedido e questionário: material de entrada vs peça de trabalho

Os dois são formulários que alguém preenche — partilham a **forma**. Mas fazem papéis
diferentes no fluxo, e isso explica porque vivem em sítios diferentes.

| | O pedido | O questionário |
|---|---|---|
| O que é | o **material de entrada**: o que a pessoa envia ao bater à porta | a **peça de trabalho** que a Nádia acompanha |
| Campos | fixos, sempre os mesmos (nome, contacto, data, local, serviços, notas, imagens) | dependem do modelo de evento (um Casamento tem 44, uma Festinha tem 3) |
| Chega | uma vez, no início | é criado e acompanhado ao longo do processo |
| Onde vive | numa **aba própria do evento — "O pedido"** — preservado tal como chegou | listado em "Formulários", com estado, para a Nádia acompanhar |
| Para que serve depois | alimenta o formulário e o briefing; fica consultável | continua a ser a peça de trabalho do evento |

O **pedido** é o que entra: chega uma vez, cria o contacto + evento, e **fica guardado
inteiro** — os dados originais *e* as imagens de referência — numa aba própria do evento
chamada **"O pedido"**. Não se derrete nem desaparece: a Nádia volta a ele quando desenha o
evento. Não fica em "Formulários" porque não é uma peça que ela *gere* — é material que
*entrou*, e a casa dele é o evento a que pertence.

O **questionário** é a peça de trabalho com vida própria: cria-se, envia-se, preenche-se, e a
Nádia acompanha o seu estado.

> A diferença não é "um dura e o outro não" — **ambos duram**. É de papel: o pedido é o que
> *entra* (fica na aba "O pedido"), o questionário é o que a Nádia *trabalha* (fica em
> "Formulários"). Por isso o pedido nunca aparece na lista de "Formulários".

---

## A ponte entre o pedido e o formulário

*(Direcção de arquitectura a implementar — não é só um nome, é um problema a resolver.)*

O pedido e o formulário estão em **duas margens**:

- O **pedido** tem campos fixos — os mesmos para toda a gente, seja casamento ou jantar de
  empresa.
- O **formulário** tem campos que **mudam com o modelo de evento** — 44 num Casamento, 3 numa
  Festinha.

Alguns campos coincidem (a data, o nº de convidados, o local), outros não têm par de nenhum
lado (o pedido não pergunta a paleta de cores; o formulário não tem campo para "notas da
conversa"). Não é um mapeamento 1-para-1 — depende do tipo de evento.

**Hoje a Nádia atravessa esta distância a remo:** o ecrã de criação de formulário mostra os
dados do pedido numa coluna com botões "Copiar", e ela transporta-os campo a campo, à mão.
É a app a pedir à *pessoa* o trabalho que o *código* devia fazer.

**O objectivo é uma ponte** — uma transição suave do pedido para o formulário:

- os campos do formulário que **têm correspondência** nascem **já preenchidos** com os dados do
  pedido (a data, o local, os convidados aparecem sozinhos);
- os campos **sem correspondência** ficam vazios, à espera do organizador;
- os dados do pedido que **não coubem em nenhum campo** não se perdem — vivem na aba "O pedido".

**Pista, não prescrição:** a correspondência provavelmente vive no **modelo de evento** (é lá
que os campos do formulário já se definem). Mas a solução exacta é para o Claude Code desenhar
com o código à frente — o importante é o resultado: **o "Copiar" campo a campo desaparece**, e
o pedido flui para o formulário sem transporte manual.

**Consequência:** o ecrã de criação de formulário, com o seu bloco "dados da captação" e os
botões "Copiar", **deixa de fazer sentido como está** — a ponte torna-o desnecessário.

---

## Onde se cria um formulário: a regra da casa

> **O que não tem evento vive em "Formulários". O que tem evento vive no evento.**

- **Formulário de um evento que já existe** → cria-se **dentro do evento** (aba Documentos), com
  um painel curto: o alvo já é conhecido, por isso não há selector de evento nem nada que o
  suponha desconhecido.
- **Cliente novo (não há evento ainda)** → cria-se em **"Formulários"**. Este é o **fluxo
  principal de captação** da app: o formulário sem alvo, que ao ser preenchido cria cliente +
  evento de uma vez. Está documentado como legítimo no `decisoes-de-produto.md` e no cabeçalho
  da migração 036.
- **Órfãos** (formulários que perderam o evento — apagar um evento faz `SET NULL` no alvo) →
  vivem em **"Formulários"**, com a rede de reparação ("É deste evento"). Por definição não têm
  evento onde morar, e cada órfão é uma porta para cliente+evento duplicados.
- **Supervisão de tudo** (que formulários existem, em que estado) → **"Formulários"**.

**Isto não são excepções à regra — é a regra.** A acção fica onde a intenção nasce; quando não
há evento, a intenção nasce em Formulários, porque não há mais nada onde nascer.

> **Implementado a 30/07/2026.** Antes havia um *teleporte*: a intenção nascia no evento (botão
> "Formulário por criar") e a acção acontecia em Formulários. Agora, se há evento faz-se no
> evento; Formulários guarda só o que não tem evento, mais a supervisão.

**A página "Formulários" tem três secções, num gradiente de urgência a descer:**

| Secção | O quê | A acção |
|---|---|---|
| **Sem evento associado** · N | os órfãos | apontar ao evento (último recurso) |
| **Sem formulário** · N | as lacunas — eventos pós-sinal que ainda não têm | abrir o evento |
| A lista | o estado do que já existe | partilhar · preencher · apagar |

Primeiro o que está solto, depois o que falta, por fim o que já existe.

**O critério das lacunas:** `FASES_POS_SINAL` (cliente · projecto · contrato) — a mesma lista
canónica da conferência da Logística, **não uma lista nova**. Fecha com este glossário: o
questionário existe para preparar a montagem de um evento **confirmado**; um interessado precisa
de orçamento, não de questionário.

**Nota de desenho:** as linhas "sem formulário" **não levam botão de criar** — a acção honesta é
*abrir o evento*. Senão a página volta a ser sítio de criação para coisas que têm evento, e a
regra desfaz-se.

---

## O quadro dos nomes

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
| A casa do material de entrada, no evento | — | aba **"O pedido"** | — |
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

Repara na última coluna: quase tudo **fica como está**. O trabalho de renomear é sobretudo
nos rótulos que se leem — menu, slug, e algumas frases nas páginas. Baixo risco no código.

---

## Cada nome, e porquê

### Contactos (a base de pessoas)
A base guarda **toda a gente**: quem só mostrou interesse, quem fechou, quem se perdeu pelo
caminho. Chamar-lhe "Clientes" era mentir — a maioria não é cliente. **"Contactos"** descreve
o que realmente lá está: pessoas com quem a casa teve contacto.

Esta é a mudança-mãe. É ela que **liberta a palavra "cliente"** para significar só uma coisa.

### Cliente (a fase, não a base)
Agora "cliente" é inequívoco: um contacto que **fechou negócio**. Passa a dar para dizer
*"tenho 40 contactos, 12 são clientes"* — uma frase que antes não fazia sentido nenhum,
porque "clientes" já eram os 40.

### Pedido / orçamento — os dois lados, sem colisão
Este é o par mais subtil, e o mais fácil de estragar.

- **Pedido** é o que a **pessoa envia** quando quer ser ajudada. É o input, o gesto de quem
  chega: *"quero um orçamento para o meu evento."* Vale por duas portas (ver abaixo), mas é
  sempre o mesmo gesto.
- **Orçamento** é o documento com valores que a **Nádia devolve** em resposta. É o output.
  É deste orçamento que a Nádia fala no dia-a-dia — é uma das folhas do evento.

> A pessoa faz um **pedido**. A Nádia responde com um **orçamento**.

Não lhes chamar ambos "orçamento" foi deliberado: seriam dois "orçamentos" a significar
coisas opostas (o que se pede vs. o que se entrega) — o mesmo erro do "cliente", outra vez.

**Público:** o formulário curto diz **"pedido de orçamento"** (é o que o site já diz —
"Pedir o meu orçamento"). **Interno:** dizemos **"pedido"** — *"chegou um pedido", "a Sofia
fez um pedido"*.

### As duas portas do pedido
O mesmo formulário serve dois momentos que **parecem** diferentes mas são o mesmo gesto:

1. A Nádia, ao telefone ou no Instagram, **pede à pessoa** que o preencha para a poder ajudar.
2. Um desconhecido, no site, **pede um orçamento** por iniciativa própria.

Em ambos, acontece exactamente o mesmo: uma pessoa conta à casa o que quer, e a casa passa a
poder responder. Por isso tem **um nome só** — dois nomes fragmentariam uma coisa que é uma.
O que muda entre as portas não é *o quê*, é *quem preenche*.

### Questionário / briefing — o par de atelier
Depois de fechar, o cliente recebe um **código de acesso** e preenche o **questionário do
evento** — as perguntas detalhadas sobre a montagem, o estilo, os convidados. Dele sai o
**briefing**: a folha imprimível com que a Nádia trabalha no dia.

**"Questionário"** e não "formulário" porque para quem preenche "formulário" é frio e não diz
nada; "questionário" diz o que é — um conjunto de perguntas sobre o evento dela. E forma um
par de ofício com o resultado: *questionário (as perguntas que se fazem) → briefing (a folha
com que se trabalha)*. Isto é vocabulário de atelier, que é o registo certo — não jargão de
software.

### Funil
A pipeline por onde um contacto caminha: **Interessado → Orçamento → Cliente**. Fica "funil"
— é a palavra que já usamos e que se entende.

### As sete etapas do acompanhamento

O Portal do Cliente (`/acompanhar/:token`) mostra à cliente onde vai o evento
dela. A base guarda **chaves**; a cliente lê **rótulos**. É a regra de ouro deste
ficheiro aplicada a sete pares — e a razão da migração 050, que tirou os rótulos
do servidor: com eles lá dentro, mudar uma palavra que uma pessoa lê obrigava a
uma migração.

| Chave (`etapa`) | O que a cliente lê | Porquê |
|---|---|---|
| `interessada` | **O seu pedido** | é o nome que este glossário dá ao gesto de quem chega |
| `orcamento` | **O orçamento** | o documento que a casa devolve |
| `sinal` | **A data reservada** | «sinal» é palavra de negócio; do lado dela o que aconteceu foi a data ficar guardada |
| `projecto` | **O projecto** | — |
| `contrato` | **O contrato** | — |
| `preparacao` | **A preparação** | — |
| `grande_dia` | **O grande dia** | — |

> **A chave `interessada` está no feminino** e a `submissions.fase` diz
> `interessado` — a pendência #2 deste ficheiro a aparecer num sítio novo. Não se
> corrigiu porque é chave de máquina e o rótulo já resolve a exclusão do lado de
> quem lê. Fica registado que **é agora que é grátis**: nenhum outro consumidor
> depende dela.

No código, os rótulos vivem em `src/lib/portal.js` (`ROTULO_ETAPA`), com os textos
de acompanhamento de cada etapa ao lado — um para quando é o presente, outro para
quando é o passo seguinte. **Este ficheiro manda; o `portal.js` segue.**

---

### A pauta (o questionário no acompanhamento)

O traço dourado por baixo de uma resposta. **Com pauta, muda-se ali; sem pauta,
passa por nós.** É o único sinal que distingue os dois estados nas quarenta
respostas de um casamento — não há cadeados, não há cinzento-desactivado, não há
riscos.

Escolheu-se um sinal só, e discreto, por duas razões: quem usa a página uma vez
aprende-o sem explicação, e um cadeado ao lado de uma resposta lê-se como castigo.
Não é castigo — é que aquilo já foi comprado.

### Grupo de prazo

O momento em que um conjunto de respostas deixa de se poder mudar sozinho. **O
prazo não é do questionário: é de cada grupo**, porque o que trava a mudança é o
mundo — o que já foi encomendado, impresso ou entregue à equipa.

| Chave | O que a Nádia lê | Fecha | Porquê |
|---|---|---|---|
| `compras` | **Compras e stock** | 14 dias antes | as flores e o material encomendam-se com duas semanas de antecedência |
| `producao` | **Produção** | 7 dias antes | os textos vão para impressão uma semana antes |
| `palavras` | **Palavras** | 2 dias antes | a equipa recebe o briefing final dois dias antes |

Os rótulos, os dias e o **porquê** vivem na tabela `questionario_grupos` — não no
código. O porquê é coluna porque é o que a cliente lê quando encontra uma resposta
fechada, e a razão material tem de poder mudar com o prazo.

**Um passo sem grupo marcado nunca fecha**, e um evento sem data também não. Nada
se tranca por omissão.

---

### A capa e o momento (as fotografias do dia)

**Capa** é a primeira fotografia da secção, a que sangra até às margens. A
casa escolhe-a **ordenando** — não há botão de «tornar capa», há uma ordem.
A regra da casa é que seja a **mais adiantada**: o trabalho a acontecer
aparece por baixo, nunca primeiro. O código não adivinha o que é «mais
adiantada»; só uma pessoa sabe qual é a fotografia em que a mesa já está
posta.

**Momento** é a que tempo a fotografia pertence — `montagem` ou `evento`. É
o que decide os dois enquadramentos da mesma secção: antes do dia mostram-se
só as da montagem; depois, todas. O valor por omissão sai da data em que se
carrega, mas é campo e corrige-se: carregar as fotografias da montagem no
dia seguinte não é o caso raro.

| | antes do dia | depois |
|---|---|---|
| tempo | presente, expectativa | passado, memória |
| cor do rótulo | dourado | cinzento |
| legendas | assunto e tempo | **caem todas** |

E a regra que governa a secção inteira: **sem fotografias, não há secção**.
Nem rótulo, nem espaço reservado.

---

### Vitrina (o registo público)
As superfícies da casa são de duas classes que não se julgam pelo mesmo padrão: as **internas**
(a bancada de trabalho da Nádia, onde o critério é o ofício) e as **públicas** — abertas poucas
vezes, por alguém emocionalmente investido, onde o critério é o deslumbre. **Vitrina** é o nome
dessa segunda classe: a página de contribuição, a de captação, o futuro portal do cliente.

**Substituiu "montra" a 30/07/2026.** As duas palavras são portuguesas e as duas estavam certas
— mas "montra" só existe em Portugal, e a linguagem da casa passou a servir todo o espaço
lusófono (ver `identidade-visual.md`, secção 6). "Vitrina" mantém a grafia portuguesa e
entende-se em todo o lado; "vitrine" resolvia o alcance mas é a forma brasileira.

> **Cuidado com o segundo sentido.** Um comentário em `MateriaisInventario.jsx` usa "montra"
> para uma *vista de materiais* no backoffice — outra coisa, que por acaso usava a mesma
> palavra. Ficou como estava de propósito: alinhá-la punha a palavra a fazer dois trabalhos,
> que é precisamente o que este glossário existe para evitar.

### Comunicado / folha / retirar (04/08/2026)
**Comunicado** é o que a casa diz a muitos de uma vez — condições de montagem, avisos
operacionais, mais tarde promoções. A palavra estava livre (o levantamento confirmou-o) e as
vizinhas têm dono: **mensagem** é da biblioteca de mensagens-tipo, **notificação** é da Caixa
de Entrada, **aviso** é a família âmbar e o conteúdo de uma notificação. Nenhuma delas podia
fazer este trabalho sem passar a fazer dois.

**Folha** é a página do comunicado: endereço próprio, pública, feita para ser lida e
**reencaminhada** — dos noivos para o espaço, para a wedding planner, para os fornecedores.
Por isso não leva um único dado pessoal, e por isso não vive no portal (que é pessoal e
escrevível). As leituras contam-se **no total**, nunca por pessoa — a interface di-lo.

**Retirar** é tirar uma folha pública do ar. **Não confundir com revogar**, que é fechar um
acesso pessoal (o portal do cliente). Actos diferentes sobre objectos diferentes ficam com
palavras diferentes. Retirar é reversível: voltar a publicar devolve o **mesmo** endereço,
porque o endereço é a identidade da folha.

### Aspecto / fechar a lista / enviar (04/08/2026 — fase 2; renomeados a 09/08/2026)
**Aspecto** é o temperamento da folha: **Sóbrio** (operacional, o tom dos avisos da casa) ou
**Convidativo** (desejável, de campanha). Não são duas folhas nem dois componentes — é a mesma
folha com duas caras. A palavra evita «tipo», que já faz outros trabalhos (tipo de evento,
tipo de bloco), e desfaz a sobrecarga tripla de «registo», que já era o registo linguístico e
o registo público da Vitrina. Na base ficam `aviso`/`oferta`, quietos — a regra de ouro.

**Fechar a lista** é fixar os nomes de quem recebe. A lista deixa de seguir a regra que a
produziu: se entrar um evento novo no recorte, a lista **não muda** — não se mexe debaixo dos
pés de quem está a meio de enviar. Fechar guarda instantâneos (nome, âncora, número), não
referências. «Congelar» era jargão de sistema. Cuidado assumido: «fechar» passa a três
trabalhos na casa (fechar negócio, fechar um passo do questionário, fechar a lista) — nos
botões e rótulos, sempre com o complemento.

**Enviar** é o acto de fazer o comunicado chegar à lista fechada, conversa a conversa — o
ecrã chama-se «Enviar», e a família inteira, no separador, chama-se «Envios» («Expedição» era
palavra de armazém, não do dia-a-dia). O vocabulário honesto fica: «enviado» quer dizer que a
conversa se abriu e ela confirmou que a mensagem saiu — não que foi recebida ou lida; as
leituras da folha contam-se no total, nunca por pessoa. Nada se marca sozinho.

**Cliente / interessado** (a definição do funil, confirmada na fase 2): **cliente** é quem já
passou o sinal — as fases pós-sinal (`FASES_POS_SINAL`: contrato · cliente · projecto);
**interessado** é quem tem evento vivo antes disso. É a definição que o código já dava e que
coincide com a proposta do dono.

### Modelo de comunicado / dispensar (04/08/2026 — fase 3; renomeado a 09/08/2026)
**Modelo de comunicado** é o que se guarda de um comunicado para voltar a usar: **a folha, a
mensagem e a regra de quem recebe** — nunca os nomes, nunca o endereço, nunca as leituras.
«Molde» era a metáfora a fazer de nome, contra a nota dos modelos de evento (a metáfora
explica, não baptiza) — e a máquina sempre disse `comunicado_modelos`; humano e máquina ficam
alinhados. Diz-se sempre **qualificado**: há três famílias (modelo de evento, modelo de
comunicado, modelo de mensagem) e «modelo» sozinho não diz qual. Cada comunicado que nasce de
um modelo é novo: conta os nomes outra vez e ganha endereço próprio ao publicar. É o par dos
modelos de evento (*modelo de evento → formulário* :: *modelo de comunicado → comunicado*) —
MAS os dois comportam-se ao contrário, e cada editor di-lo numa linha sempre visível: o de
evento é **ligação viva** («Alterações aplicam-se já aos formulários por responder.»); o de
comunicado é **cópia** («Alterações só valem para envios novos.»). O **nome** do modelo é
interno — só o vê a casa; as clientes vêem o **título** da folha. É a regra geral: *nome* é de
dentro, *título* é o que se lê. Apagar um modelo **não leva os comunicados atrás** (ficam,
órfãos do modelo), e a interface di-lo antes de ela confirmar. Um bloco do modelo pode estar
marcado como **a rever** (`rever` + `pergunta`, decididos ao guardar — a heurística das datas
propõe, ela decide): ao usar o modelo, essas linhas nascem editáveis com a pergunta ao lado.

**Dispensar** é decidir que alguém que entrou **depois de a lista fechar** não recebe — e não
se volta a perguntar por essa pessoa. Grava-se (`dispensado_em`, com o instantâneo do nome);
«Desfazer» limpa a coluna e a linha entra na lista como acrescentada. Uma dispensada nunca tem
carimbos de envio — é o invariante da 081. Não confundir com o «Agora não» do convite ao
modelo, que é só desta visita e não se grava.

---

## Palavras a abandonar

Estas são anglicismos de funil de vendas — o registo errado para uma casa que vende mesas
postas, e a fonte de metade da confusão. Ficam **só onde ninguém as lê** (nomes de ficheiro
no código, que não vale o risco de mexer).

| Não dizer | Dizer |
|---|---|
| captação, capturar, lead | **pedido** (o gesto), **contacto** (a pessoa) |
| onboarding | **questionário** (é o que a pessoa faz depois de fechar) |
| "formulário de interesse" | **pedido de orçamento** |
| "formulário" (para quem preenche) | **questionário** (o longo) ou **pedido** (o curto) |

E os renomeados de 09/08/2026 (a razão vive nas secções datadas acima) — ficam só nos nomes
de máquina, que não vale o risco de mexer:

| Não dizer | Dizer |
|---|---|
| molde | **modelo de comunicado** |
| congelar (a lista) | **fechar a lista** |
| expedição | **enviar** (o gesto) · **Envios** (a família, o separador) |
| registo (da folha) | **aspecto** (Sóbrio / Convidativo) |
| público (a audiência) | **quem recebe** |
| Feitos (o sub-separador) | **Envios** (a lista) · **Modelos** (os modelos de comunicado) |

---

## Incoerências a corrigir (a linguagem contradiz-se hoje)

Sítios onde a app diz nomes diferentes para a mesma coisa. Corrigir para o glossário alinhar:

1. **Mensagem de WhatsApp** diz *"o vosso formulário está pronto"* → a página onde a pessoa
   aterra diz *"questionário"*. Alinhar a mensagem para **"questionário"**.
2. **Página-guia** (dlm-jornada) diz *"Preencher o formulário de interesse"* → o site diz
   *"Pedir o meu orçamento"*. Alinhar a página-guia para **"Pedir orçamento"** / **"Preencher
   o pedido de orçamento"**, para condizer com o destino.
3. **Separador "Clientes"** mostra interessados e perdidos → renomear para **"Contactos"**.
4. **Ecrã de novo formulário** tem um bloco *"DADOS DA CAPTAÇÃO (9)"* com botões "Copiar".
   Duas coisas erradas: "captação" é palavra a abandonar, e o transporte manual campo a campo
   é a app a pedir à Nádia o trabalho do código. Com a **ponte pedido→formulário** (ver
   secção acima), este bloco **deixa de existir** — os dados fluem sozinhos para o formulário,
   e os que não coubem ficam na aba **"O pedido"**. Não é renomear; é remover.

---

## O que muda por camadas (dos nomes à arquitectura)

Nem tudo aqui tem o mesmo peso. Por ordem de esforço:

**Só nomes (strings — leve):** "Clientes" → "Contactos"; "casal/família" → "organizador" na
descrição dos modelos; alinhar a mensagem de WhatsApp em "questionário".

**Arquitectura de navegação (médio) — ✅ FEITO a 30/07/2026:** a criação de formulários mudou-se
para dentro do evento; "Formulários" passou a supervisão (mais o "cliente novo" e os órfãos, que
não têm evento onde morar).

**Arquitectura de dados e fluxo (sério — projeto próprio):** a aba **"O pedido"** no evento
(que preserva dados originais + imagens de referência, hoje perdidas); e a **ponte
pedido→formulário** (que faz o pedido pré-preencher o formulário e remove o "Copiar" manual).
Isto é trabalho de fundo, com inventário e bloco a bloco, como foi o routing — não se mistura
com a limpeza de nomes.

---

## Pendências descobertas no inventário (29/07/2026)

Duas coisas que o varrimento do código revelou e que ficam para a fase seguinte:

**1 · Duas fontes de verdade para os rótulos de fase.** Existe um segundo mapa
(`FASE_LABEL_PRE_SINAL`, em `clientes.js`) separado do `faseConfig.js`, com palavras
*diferentes* para os mesmos estados: "Interessada" vs "Interessado", "Orçamento enviado" vs
"Orçamento", "A aguardar sinal" vs "Aguarda sinal". A Nádia lê nomes diferentes para a mesma
fase conforme o ecrã. É o mesmo mal que a migração 047 veio corrigir noutro sítio. **Solução:
uma fonte só, com o `faseConfig.js` a ganhar.**

**2 · "Interessada" está no feminino** — e assume que quem organiza é mulher. É a mesma
exclusão que o **organizador** veio corrigir: uma empresa ou um cliente homem lê "Interessada"
e o produto não fala com eles. Resolve-se no mesmo gesto que a pendência 1.

> **Hipótese a discutir com a Nádia (não decidida):** as fases descrevem *estados da relação*,
> não *pessoas*. "Interesse" em vez de "Interessado/a" resolveria o género e ficaria coerente
> com "Orçamento", que já é uma coisa e não uma pessoa. Mas mexe em vocabulário que a Nádia já
> validou — é conversa a ter com ela, não decisão de gabinete.

**3 · Vocabulário que a base de dados escreve (não o React).** O "Novo interessado" do
CentroNotificacoes vem de um **gatilho da base** (migração 024), e o "Interessada — primeiro
contacto" de `notas.js` grava-se em histórico. Isto abre uma categoria que a regra geral não
previa: *nomes que as pessoas leem mas que a máquina escreve*. Mudá-los é **migração, não
string** — aplica-se a regra de SQL da casa (idempotente, teste primeiro, depois produção).

> **Consequência a decidir:** mudar a fonte **não reescreve o passado**. As notificações e
> notas já gravadas mantêm a palavra antiga, e fica-se com histórico misto. Ou se aceita isso
> (mais simples, e o histórico é passado), ou se migram os dados existentes. Decisão consciente
> a tomar, não obstáculo.

**4 · Slugs públicos já circulados: `/formulario` e `/interesse`.** Têm vocabulário antigo, mas
**já foram enviados a clientes reais** — há links vivos em conversas de WhatsApp.

> **Regra para os mudar com segurança: o slug antigo nunca morre.** O novo passa a canónico, o
> antigo fica a redirecionar permanentemente. Assim nada parte, e a coordenação com os outros
> repositórios deixa de ser bloqueante — muda-se aqui primeiro, os outros actualizam-se depois.
>
> **Atenção à cadeia:** o site aponta para o guia interactivo, e o guia aponta para
> `/interesse`. São **três repositórios em fila** — mudar o slug sem redirect parte o meio da
> cadeia. (A mesma lógica vale para o token `{LINK_INTERESSE}` dos modelos de mensagem, que
> está guardado na base: quando se mudar, **aceitar os dois tokens**, não migrar à força.)

---

## Como manter isto vivo

- Este ficheiro muda **primeiro**. Tudo o resto (código, página de explicação, o que se diz à
  Nádia) deriva daqui.
- Antes de aplicar no código, **validar com a Nádia** — o teste real é se os nomes lhe saem
  naturais. Se ela disser sempre "orçamento" onde aqui está "pedido", é o glossário que se
  ajusta, não a Nádia.
- Só depois de validado é que o Claude Code aplica os rótulos no código, bloco a bloco.