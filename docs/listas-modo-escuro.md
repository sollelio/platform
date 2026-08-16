# Modo escuro — as três listas (16/08/2026)

Fecho da migração: 35 ficheiros migrados em 13 lotes + etapa do papel,
portão (esbuild + eslint + build) verde entre todos, eslint 70 → 70
(zero erros novos, conferido por ficheiro), ~900 traduções para tokens.

---

## 1 · Cores que não coube traduzir, e porquê

**Joias — o ouro desenhado para brilhar, não para seguir tema:**
- Gradientes dos medalhões (`#E8D5A3 → #C9A84C → #A07830`) — CentroNotificacoes ×3, toast incluído
- A Taça da contribuição (`#E8D29A/#C9A84C/#F3E5BB/#E3C878`) — partilhada com a página pública
- O LogoDourado inteiro (halos champanhe, poeira, brilhos) — a poeira estava atrelada à ponte `var(--gold)` e foi presa a `#C9A84C` para a joia ficar inteira
- O shimmer do toast `rgba(232,213,163,0.45)` — é luz a varrer; funciona nos dois modos

**Véus sobre conteúdo (fotografia/imagem — não é tema):**
- Selo «Capa» `rgba(255,253,246,0.94)` + par ouro preso ao claro (FotografiasEvento)
- ✕ das miniaturas `#1A1A1A` + branco (GerarOrcamento, GerarProposta — presos ao claro)
- Selo do código sobre fotografia `rgba(255,255,255,0.85)` + `#A07830` (MateriaisInventario)
- Aros `rgba(0,0,0,0.08)` sobre amostras de paleta (VisaoGeral, SeletorPaleta)

**Sombras pretas dispersas** (`rgba(0,0,0, 0.04–0.2)`, desfoques 8–48px) —
no escuro somem e a borda dos tokens carrega a separação; só os dois
box-shadows exactos da identidade viraram tokens (`--sombra-cartao`,
`--sombra-flutuante`). As variantes 0.04/48px/40px/32px repetem-se —
candidatas a unificar nos tokens de sombra, decisão tua.

**Ilhas claras deliberadas (par inteiro preso ao claro, comentado no sítio):**
- As 4 colunas do FunilBoard (duas famílias fora de paleta; quadro coerente como ilha — escurecê-lo pede primeiro a decisão da paleta das fases)
- A ilha do perdido na Jornada (cinzas fora de identidade)
- Cartão comErro do Importar `#FFF9F9` e linha de rutura da Conferência `#FFF8F8` — com `.papel` condicional para o texto tokenizado não morrer lá dentro
- Célula do dia do Calendário (`#FFFDF5` + grelha), caixa «Ainda sem eventos» (ClienteVista), pastilhas `#FBF9F4` (Avaliações, Fotografias), banda «folha retirada» (ComunicadosTab), cena WhatsApp do MensagemEditor (`#ECE7DE`, cenografia), aviso do predefinido (EventTypeEditor), botão «É deste» (FormulariosOrfaos), chips auto/manual (ConsultaDeslocacao, PainelDeslocacao), régua/tramado do PainelDeslocacao, cartão «Gastos» (Pagamentos), toggle Perdidos (FunilBoard), estado «ok»/«vazio» (MateriaisInventario), mosaico Copiar (ShareSheet), ilha `#7F1D1D` (RemoverEventoModal), par verde (ReservaModal)
- EnvBanner por inteiro (alarme de ambiente — a moldura vermelha grita igual nos dois modos)

**Estados de gesto presos ao claro (padrão, 7 sítios):** «A criar…/A
guardar…/A validar…/A gravar…» com `#E8D5A3` — o token equivalente no
escuro é tom de borda, e um botão a meio do gesto não se apaga (login,
PainelNovoFormulario, MensagensSheet, EventTypeEditor, MaterialModalRico,
ImportarTab ×2, ReservaModal).

**Papel trocado no claro — traduzir mudava pixels, fica literal e na lista 2:**
- `#EF4444` como TEXTO de erro (login ×6, EventTypeEditor ×2, EventTypesTab ×2, RemoverEventoModal)
- `#DC2626` como botão/badge CHEIO (FunilBoard, DeleteInviteModal, MaterialModalRico, ReservaModal, OperacionalTab)
- `#166534` e `#B91C1C` como FUNDOS de gesto (PortalDoClienteSheet ×4, FotografiasEvento, ReservaModal `#92400E`)
- `#9B9B9B` em coisas que se CLICAM (pega do ComunicadoEditor, ContribuicaoColetiva ×3)

**Sem token, mas NA identidade (decidir se ganham token):**
- `#B08A3C` — «rótulo dourado de contraste» (CabecalhoEvento, Pagamentos «Falta»)
- `#E5DCC3` — o «trilho» (ComunicadoExpedicao, Jornada)

**Dados, não tema:** paletas de evento (`c.hex`, SeletorPaleta),
`GOLD_SHADES`/séries de gráfico (Dashboard), marcas de terceiros
(WhatsApp/Instagram no ShareSheet), pastilhas fora-de-paleta do
`faseConfig` (ver lista 2), cores das folhas geradas (dentro de `.papel`).

**Véus deliberadamente diferentes (RESPONDIDO, Hélio 16/08):** o 0.28
das gavetas dos comunicados (×3) e o 0.5 do ShareSheet ficam como
estão — uma gaveta e uma folha de partilha não são o mesmo papel que
uma cortina modal: não é divergência, é desenho.

---

## 2 · Violações de identidade encontradas (não corrigidas)

**Famílias inteiras fora da paleta:**
- Azul «Em Preparação» `#EFF6FF/#3B82F6/#BFDBFE` (faseConfig/STATUS_COLORS, CalendarioTab, FunilBoard coluna, Dashboard KPI `#3B82F6`) — família que a identidade não tem
- Pastilhas do faseConfig: amarelo `#FEF9C3/#854D0E`, laranja `#FFEDD5/#C2410C`, roxo `#F3E8FF/#6B21A8`, índigo `#E0E7FF/#3730A3`, perdido `#F3F4F6`
- Âmbar divergente `#FEF3C7/#FDE68A` (EventTypeEditor — o da casa é `#FEF3E2/#F0D9B5`)
- Cinzas «neutros» divergentes: `#9CA3AF`, `#D1D5DB` ×3, `#F3F4F6` ×4, `#4B5563`, e os cinzas do perdido `#C9CBD1/#B8BBC0/#A7AAB0/#FCFCFD` (Jornada)

**Verdes divergentes:** `#16A34A` ×5 (vistos de guardar — o vivo da casa
é `#22C55E`), `#15803D` ×2 (texto — o da casa é `#166534`), `#3B6D11/#EAF3DE`
(MateriaisInventario), `#CDEBD3/#F6FBF6` (coluna do funil), `#BBE5C8` ×2
(≈`--sucesso-borda` `#BBF7D0` — provável gralha)

**Vermelhos divergentes:** `#F87171` + halo (borda de erro do login),
`#FCA5A5` ×2, `#7F1D1D` (≈`--perigo-texto`), `#FFF5F5/#FFF9F9/#FFF8F8/#FDE7E7`
(lavados fora do `#FEF2F2`), `#F0D0D0` (≈`--perigo-borda`)

**O ferrugem dos botões de remover** `#A63D2F/#E5E0D5/rgba(166,61,47,·)`
(CentroNotificacoes) — sem razão registada (procurado 16/08); fica.
Decisão confirmada (Hélio 16/08): se um dia se unificar, é decisão de
identidade visual, não de tema.

**Quase-acertos de hairline/lavado (prováveis gralhas, um a um):**
- `#F0EBE0` ×4 e `#F0EDE8` (≈`--borda` `#F0E6D0`)
- `#F5EFE2`, `#F1EAD6`, `#F1EBDD` ×6, `#F3F1EC` ×2 (≈`--borda-leve` `#F5ECD7`)
- `#FFFDF5` (≈`--superficie-atenta` `#FFFDF6` — off-by-one no Calendário)
- `#FCFBF7` ×2 (≈`--superficie-espera` `#FDFBF5`), `#FDF6E8`, `#FBF9F4` ×4, `#F5F1E8`, `#F6F2E9` (mesa da pré), `#FBF0D9`
- `#DFD3B8` ×2, `#DCD3C0`, `#DCD5C4` ×3, `#E4DCCB` ×3 (≈`--aro` `#E8DCC0`)
- Bordas dos selos TIPOS_NOTA: `#FADCB4` (≈`#F0D9B5`) e `#E4DCCB` (≈`#E8DCC0`)
- `#D9A441` ×4 (PortalDoClienteSheet) e `#D9A441`≈`#D9A441` do funil — âmbar-ouro sem família
- Cinzas-quentes órfãos: `#B0A88F` ×4, `#B0A68E`, `#C0B79F` ×3, `#B9A97E` ×2, `#CBB77E`, `#C4C7CC`, `#A08B55`, `#9C5A3C` ×2, `#EAD9AC` ×2, `#854D0E`(tb. acima)
- `#FEFCF7` (citação do portal — a gémea usa `--superficie-quente`)
- `#E4DCCB`/`rgba(255,255,255,0.75)`→resolvido com token; `#DCD3C0` (CabecalhoEvento)
- Sombra `0 2px 12px rgba(0,0,0,0.04)` ×3 (≈`--sombra-cartao` 0.05)
- Sombra do toast `rgba(160,120,48,0.28)` vs a «dourada difusa» da tabela

**Regras da casa já violadas no claro (não repetidas no escuro):**
- `#9B9B9B` em clicáveis (pega do ComunicadoEditor, setas da ContribuicaoColetiva)
- `#EF4444`-como-texto e `#DC2626`-como-cheio (papéis trocados dentro da própria família)

---

## 3 · Ficheiros onde o claro mudou

**Zero por acidente.** Verificação mecânica em todos os 40+ ficheiros
tocados: cada literal removido é o valor claro exacto de um token; cada
pin é o mesmo hex que lá estava; nenhum literal novo fora de paleta.

**Cinco pixels mudaram POR DECISÃO registada (um véu, um valor):**
1. CentroNotificacoes — véu `rgba(26,26,26,0.4)` → `--cortina` (0.35)
2. FichaEvento — véu `rgba(0,0,0,0.4)` → `--cortina`
3. InviteCreatedModal — véu `rgba(0,0,0,0.4)` → `--cortina`
4. InviteDetailModal — véu `rgba(0,0,0,0.4)` → `--cortina`
5. DeleteInviteModal — véu `rgba(0,0,0,0.4)` → `--cortina`
6. PortalDoClienteSheet — véu `rgba(26,26,26,0.32)` → `--cortina`

(seis sítios, cinco valores distintos → um. Diferença visual no claro:
≤0.05 de opacidade num véu preto.)

---

## Perguntas em aberto e respondidas

**Respondidas (Hélio, 16/08):**
- Véus 0.28 (gavetas) e 0.5 (ShareSheet): ficam — papel próprio, desenho e não divergência.
- Os quase-acertos de gralha da lista 2: não se tocam nesta passagem — mudam o claro, e foi o claro não mudar que tornou a tarefa verificável. Ficam listados para outra passagem, com o mesmo critério.
- O ferrugem: fica — unificá-lo seria decisão de identidade visual, não de tema.

**Continuam em aberto:**
1. A paleta das fases/estados fora de identidade (azul, amarelo, laranja, roxo, índigo) — enquanto não houver decisão, o funil e as pastilhas dessas famílias ficam ilhas claras no escuro
2. `#B08A3C` (rótulo dourado de contraste) e `#E5DCC3` (trilho): estão na identidade — ganham token?
3. A falha AA conhecida (ouro sobre creme das pastilhas, ≈3.8:1) continua no claro, como mandado — o escuro não a herdou (8:1)
