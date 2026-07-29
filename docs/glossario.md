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

> **Sobre "molde":** é a *metáfora* que explica o conceito (a estrutura a partir da qual se
> faz cada formulário), não o nome. O separador chama-se **"Modelos de Evento"** — "modelo" é
> a palavra que as pessoas já esperam para "estrutura reutilizável" (modelo de documento,
> modelo de email), enquanto "molde" é físico de mais para uma estrutura de dados. A metáfora
> ajuda a entender; o nome tem de ser reconhecível.
| 3 · a cara pública | O mesmo formulário, do lado de quem o preenche. As perguntas que o organizador vê e responde. | Organizador | **questionário** |

O nível 2 e o nível 3 são **o mesmo objecto visto de dois lados**:

> Do lado da Nádia é um **formulário** — ela monta-o, escolhe os campos, gere uma lista deles.
> Do lado do organizador é um **questionário** — recebe um código e responde às perguntas.

É a mesma dupla-face de sempre (como `slug ↔ id`): uma coisa, duas leituras conforme quem
olha. O separador da Nádia chama-se **"Formulários"** (é o trabalho dela) e a página
pública fala em **"questionário"** (é o que o organizador faz). Não competem — encaixam.

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

## "Formulários" é uma vista de estado, não um balcão de criação

Onde um formulário se **cria** e onde se **vê o estado de todos** são coisas diferentes:

- **Criar/gerir o formulário de um evento** → acontece **dentro do evento** (aba Documentos).
  O formulário é sempre *de um evento*, por isso nasce e vive lá, ao pé de tudo o resto desse
  evento. Sem saltar para outro separador.
- **Ver o estado de todos os formulários ao mesmo tempo** → é a página **"Formulários"**: um
  painel de supervisão onde a Nádia vê, de uma vez, quais estão por preencher e quais já foram
  respondidos, através de todos os eventos.

> Regra: a **acção** (criar) fica onde a intenção nasce — no evento. A **supervisão** (ver o
> conjunto) é que é transversal. Hoje está trocado: a intenção nasce no evento mas a criação
> acontece na página Formulários, obrigando a um salto. Isto inverte-se.

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

**Arquitectura de navegação (médio):** mover a criação de formulários para dentro do evento;
"Formulários" passa a vista de estado transversal.

**Arquitectura de dados e fluxo (sério — projeto próprio):** a aba **"O pedido"** no evento
(que preserva dados originais + imagens de referência, hoje perdidas); e a **ponte
pedido→formulário** (que faz o pedido pré-preencher o formulário e remove o "Copiar" manual).
Isto é trabalho de fundo, com inventário e bloco a bloco, como foi o routing — não se mistura
com a limpeza de nomes.

---

## Como manter isto vivo

- Este ficheiro muda **primeiro**. Tudo o resto (código, página de explicação, o que se diz à
  Nádia) deriva daqui.
- Antes de aplicar no código, **validar com a Nádia** — o teste real é se os nomes lhe saem
  naturais. Se ela disser sempre "orçamento" onde aqui está "pedido", é o glossário que se
  ajusta, não a Nádia.
- Só depois de validado é que o Claude Code aplica os rótulos no código, bloco a bloco.