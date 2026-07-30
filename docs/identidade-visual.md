# Do Luxo à Mesa — identidade visual

Guia para desenhar sem acesso ao código. Tudo o que aqui está foi
extraído do produto real, tal como ele é hoje.

**A casa numa frase:** produção e aluguer de decoração para eventos
de luxo, em Portugal — o material sai de casa, veste o evento e volta.
A linguagem é dourado sobre creme, serifa de cerimónia sobre sans de
trabalho, e a riqueza vive no material (traço, tempo, assentamento),
nunca no ruído.

**Os dois registos.** O produto tem duas famílias de superfícies e
elas não se julgam pelo mesmo padrão:

- **Backoffice (interno)** — ferramenta diária. O critério é OFÍCIO:
  precisão de porta de Rolls-Royce, zero espetáculo. O filtro de tudo:
  *isto aguenta ser visto cinquenta vezes por semana?*
- **Público (vitrinas)** — aberto poucas vezes, por alguém
  emocionalmente investido, no telefone. O critério é DESLUMBRE:
  vender o sonho, comover — com a elegância da casa, nunca com kitsch.

**Este documento serve os dois, e assinala sempre o que muda entre
eles. A página a desenhar é pública: em caso de dúvida, o registo é o
da secção final («A vitrina»).**

**Sobre nomes:** este guia trata de *como a casa se parece e se move*.
Para *como se chamam as coisas* (contactos, pedido, orçamento,
formulário/questionário, briefing, organizador), a autoridade é o
`GLOSSARIO.md`.

---

## 1 · Paleta

### O dourado (a identidade)

| Papel | Valor |
|---|---|
| **Ouro da casa** — ações primárias, marcas de "feito", identidade | `#C9A84C` |
| **Ouro escuro** — texto dourado legível, overlines, hovers de ligação | `#A07830` |
| **Ouro claro** — hairlines, bordas de cartão, estados suaves | `#E8D5A3` |
| Ouro carregado — hover do botão dourado cheio; aro de cunhagem | `#B9973E` |
| Rótulo dourado de contraste (par do número) | `#B08A3C` |
| Halo dourado (sombras/anéis de foco suaves) | `rgba(201,168,76, 0.14–0.30)` |

### Os fundos (do mais frio ao mais quente)

| Papel | Valor |
|---|---|
| **Creme** — o fundo de página, sempre | `#FAFAF8` |
| Branco — cartões e superfícies de conteúdo | `#FFFFFF` |
| Lavado quente — cartões destacados, hover de botão dourado-contorno | `#FBF7EF` |
| Lavado de pastilha — selos, etiquetas douradas | `#FEF9EC` |
| Lavado de aviso suave — linhas com atenção pendente | `#FFFDF6` |
| Branco-quente — elementos "por preencher" (engastes vazios) | `#FDFBF5` |

### Hairlines e neutros

| Papel | Valor |
|---|---|
| Hairline padrão — divisores, bordas finas | `#F0E6D0` |
| Hairline leve — linhas de tabela | `#F5ECD7` |
| Trilho — a linha por preencher de uma régua/progresso | `#E5DCC3` |
| Aro de engaste — borda de um passo futuro | `#E8DCC0` |
| **Texto** — quase-preto da casa | `#1A1A1A` |
| **Texto secundário** | `#6B6B6B` |
| Rótulos apagados, cabeçalhos de tabela — **nunca em algo que se clica** | `#9B9B9B` |
| Traços quase invisíveis (ações destrutivas discretas) | `#C4C4C4` |

**Regra de contraste (vale nos dois registos):** `#9B9B9B` nunca serve
algo que se clica — não chega ao contraste mínimo. Ligações secundárias
em `#6B6B6B` (≈5.1:1), com hover dourado `#A07830`.

### Semânticos (sempre o trio texto/fundo/borda)

| Família | Texto | Fundo | Borda |
|---|---|---|---|
| Sucesso / dinheiro recebido | `#166534` (ou `#22C55E`) | `#F0FDF4` | `#BBF7D0` |
| Perigo / rutura / erro | `#DC2626` (ou `#B91C1C`) | `#FEF2F2` | `#FECACA` |
| Aviso / atenção | `#B45309` (ou `#92400E`) | `#FEF3E2` | `#F0D9B5` |
| Terminado / perdido / neutro | `#6B7280` | `#F9FAFB` | `#E5E7EB` |

Regra: o vermelho e o âmbar são estados, nunca decoração. O dourado
nunca é usado para erro nem aviso grave.

---

## 2 · Tipografia

Duas famílias, papéis rígidos:

- **Playfair Display** (serifa) — pesos 400 e 600, itálico 400. É a
  voz de cerimónia: títulos de página, nomes de eventos/casais, frases
  de remate («Percurso completo…»), a mensagem da anfitriã. **Nunca**
  em UI de trabalho: botões, tabelas, campos, rótulos.
- **Inter** (sans) — pesos 300–700. Todo o resto: corpo, botões,
  tabelas, formulários, avisos.

Escala típica (px):

| Uso | Tamanho / peso |
|---|---|
| Título de página (interno) | Playfair 24–28 / 400, tracking −0.01em |
| Frase-título pública | Playfair 22–24 / 400 |
| Frase de cerimónia secundária | Playfair 16–17 (itálico quando é citação) |
| Corpo | Inter 13–14 / 400 |
| Secundário | Inter 12–12.5 |
| Meta/notas | Inter 11–11.5 (itálico para notas honestas) |
| Rótulos pequenos | Inter 9.5–10 / 600 |
| Overline (ver abaixo) | Inter 9–10 / 700 |

Regras duras:
- **Números que mudam ou se comparam**: `tabular-nums` sempre — nada
  de números a dançar de largura.
- **Títulos que quebram**: `text-wrap: balance`; parágrafos longos:
  `text-wrap: pretty`.
- **Euros**: `1500€`, `1500,50€` — símbolo colado, vírgula decimal,
  sem separador de milhares.

### Overlines (os "versaletes" da casa)

Etiquetas curtas em MAIÚSCULAS, Inter 9–10px, peso 700, com tracking
largo. É o gesto tipográfico mais assinatura da casa:

- **Interno**: tracking `0.14–0.16em`, cor ouro-escuro `#A07830` (ou
  cinza `#6B7280` em contextos terminados).
- **Público**: tracking `0.22em` — mais cerimónia, mais respiro.

---

## 3 · Movimento — a disciplina

**Regra nº 1: o movimento marca acontecimentos; o estado é imóvel.**
No backoffice não existem loops perpétuos — um pulso permanente na
visão periférica é imposto, não encanto. **No público os loops
ambiente são permitidos** (é o papel da vitrina), mas lentos, orgânicos
e discretos — brilho que respira, nunca coisas que saltam.

Regras duras (valem nos dois registos):
- **Nada anima ao abrir.** O passado não volta a "acontecer" a cada
  visita — molas e celebrações só quando algo muda à frente dos olhos.
- **`prefers-reduced-motion` sempre respeitado**: tudo troca de estado
  seco, sem transições, sem exceções.
- **Zero jank.** Uma hesitação mata mais luxo do que qualquer escolha
  estética. Animar só `transform`/`opacity` onde possível.

As curvas da casa:

| Curva | Papel |
|---|---|
| `cubic-bezier(0.22, 1, 0.36, 1)` — "EASE LUXO" | Entradas de conteúdo, revelações, contagens, enchimentos |
| `cubic-bezier(0.32, 0.72, 0, 1)` — folha iOS | Superfícies que deslizam: drawers (0.32s), popovers e painéis (0.14–0.16s) |
| `cubic-bezier(0.34, 1.56, 0.64, 1)` — ressalto | SÓ clímax raros e deliberados |

As molas (spring stiffness/damping):

| Mola | Carácter |
|---|---|
| 500/28 | O "pop" de uma marca a assinar (um visto que aparece) |
| 600/42 | Deslize firme sem ressalto (uma pastilha que viaja entre opções) |
| 55/15 | Líquido a assentar (o nível de uma taça) |

Escala de durações:
- **Micro (140–180ms)** — toda a camada de interação (hover, foco,
  cor) vive a 140ms ease; popovers 140–160ms.
- **Padrão (200–320ms)** — véus 200ms, superfícies grandes 320ms.
- **Média (400–600ms)** — enchimentos de progresso (~480ms), números
  que contam até ao valor novo (~480ms, easeOutCubic; na primeira
  pintura mostram logo o final).
- **Ambiente (1.1s+)** — só no registo público e em esqueletos de
  carregamento (ondulação de 1.6s).

Micro-interações canónicas: botões afundam a `scale(0.98)` no clique
(ícones 0.92); uma seta avança 2px no hover da sua pílula; um elemento
clicável "levanta" 1.5px.

**Estados de carregamento**: esqueletos com a forma do conteúdo que
vem (blocos arredondados a ondular entre `#F3EEE1` e `#FAF6EC`),
nunca spinners, nunca frases a fingir de conteúdo.

**Foco de teclado**: anel `2px` dourado `#C9A84C` com offset 2px —
nunca se remove o foco sem o substituir por algo melhor.

---

## 4 · Espaço e raios

Raios de canto (do menor ao maior):
- `6–8px` — campos pequenos, botões discretos
- `10–12px` — botões, popovers, cartões pequenos, avisos
- `14–16px` — cartões de conteúdo, modais
- `999px` — pílulas: etiquetas, seletores de estado, ações-cápsula
- `50%` — pontos e medalhões

Espaço:
- Padding de cartão: `16–24px` (interno denso: 16–20; público: 20–24).
- Página interna: 40px de margens laterais.
- **Página pública: coluna única centrada, largura máxima ~480px,
  respiro vertical generoso (40px+ no topo), tudo `text-align:center`
  exceto formulários (esquerda).**
- Gaps típicos: 6/8/10/12px.

Sombras (poucas e leves):
- Cartão: `0 2px 12px rgba(0,0,0,0.05)`
- Flutuante (popover/modal): `0 8px 28–48px rgba(0,0,0,0.12–0.15)`
- Botão dourado cheio: `0 4px 12px rgba(201,168,76,0.30)`
- Dourada difusa (raro): `0 10px 24px -16px rgba(180,140,40,0.6)`

Hairlines: `1px` (ou `1.5px` para cartões) — a espessura é parte da
linguagem; bordas grossas não existem.

---

## 5 · O traço (ícones e marcas SVG)

Tudo desenhado à mão, num só vocabulário:

- **Stroke 1.5–2.2px, pontas e uniões redondas** (`round`), sem
  preenchimentos complexos.
- A cor herda-se do texto do elemento (o botão é quem manda).
- Tamanhos: 11–14px dentro de botões e medalhões.
- Marcas canónicas: o **visto** (duas retas, ângulo aberto), a
  **cruz**, a **meia-lua** (metade preenchida = "a meio"), a **taça de
  champanhe** em line-art.
- **Proibido no backoffice**: bibliotecas de ícones, glifos de texto
  (✓ ✕ ● ○) como marcas, e emoji como ícone.
- **No público, o 🥂 é permitido** — mas só dentro de frases de
  celebração («A meta foi atingida. 🥂»), nunca como botão ou marca.

---

## 6 · Escrita

- **Português europeu, sempre — nunca pt-BR.** As armadilhas do
  costume: nada de «você», nada de gerúndio progressivo («estamos a
  enviar», nunca «estamos enviando»). Se soa a Brasil, está errado
  para esta casa.
- **Terceira pessoa em todo o texto, nos dois registos** — «o seu
  evento», «receberá um aviso», «se precisar». Nunca «o teu»,
  «avisamos-te», «escreve-nos».
- **A linguagem serve todo o espaço lusófono.** A grafia continua
  portuguesa, mas o vocabulário evita as palavras que só existem em
  Portugal: «telemóvel», «ecrã», «casa de banho», «autocarro».
- **Aspas angulares «»** para citações e para nomear botões/estados em
  texto corrido.
- Frases completas e calmas; nada de fragmentos tipo dashboard.
- **Erros dizem o que aconteceu e o que fazer a seguir**, sem jargão:
  «Não foi possível registar. Tente novamente daqui a um momento.» Um
  erro terminal diz que é terminal em vez de convidar a repetir.
- Maiúsculas só nos overlines. Títulos em caixa normal.
- Celebração com sobriedade: uma frase serena vale mais do que três
  pontos de exclamação (a casa quase não os usa).
- Nunca `alert()`/diálogos do browser — tudo se diz na própria página,
  no lugar onde aconteceu.

---

## 7 · A vitrina — o registo público (a referência é a página de contribuição)

A anatomia de uma página pública da casa, de cima para baixo:

1. **O logo com tratamento de joalharia** (~150px): halo radial de
   champanhe (`rgba(232,213,163,0.62)` a dissolver-se para o creme),
   **poeira de ouro** — meia dúzia de partículas que brilham e derivam
   em ciclos longos e dessincronizados (5–7s, tempos primos entre si:
   o brilho parece vivo, não coreografado) — e um raio de luz cónico
   que dá uma volta completa em **24 segundos**. É o único lugar onde
   a casa se permite este espetáculo, e mesmo ele entra devagar (1.1s,
   EASE LUXO).
2. **Overline** de cerimónia (tracking 0.22em, ouro-escuro).
3. **Frase-título** em Playfair 22–24 — uma frase, não um cabeçalho
   («Uma mesa posta por muitos.»).
4. **Meta discreta** em cinza (tipo de evento · data por extenso).
5. **A citação da anfitriã** em Playfair itálico 16, ouro-escuro,
   entre «aspas angulares».
6. **A peça central emocional** (na contribuição, a taça que enche com
   mola líquida e faíscas que sobem).
7. **Formulário em cartão branco** de hairline dourada, radius 14px,
   campos de 14px com borda `1.5px #E8D5A3` — alinhado à esquerda
   dentro da página centrada.
8. **Rodapé-overline** com a assinatura da casa.

Princípios do registo público:
- Telefone primeiro: coluna única, ~480px máx, botões generosos.
- **Privacidade por desenho**: a página pública mostra percentagens e
  contagens de pessoas — nunca valores absolutos, metas em euros nem
  nomes de terceiros.
- Estados difíceis com a mesma dignidade: link expirado, campanha
  fechada e erro de rede têm cada um a sua frase serena (overline +
  Playfair + linha de ajuda) — nunca uma página crua.
- O deslumbre é **atmosfera** (luz, brilho, tempo), nunca **ruído**
  (confetti, cores fora da paleta, saltos). A paleta não muda entre
  registos — muda a quantidade de ar e a permissão para brilhar.