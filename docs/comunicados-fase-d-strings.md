# FASE D — Passe de Content UX sobre os Comunicados (tabela única)

**O papel.** Content Designer: reduzir carga cognitiva e cortar — nunca persuadir, nunca acrescentar.
**A fronteira.** Entram: rótulos, títulos de secção, botões, estados vazios, confirmações, erros, ajudas, placeholders e a mensagem de WhatsApp por omissão. Não entram: o conteúdo dos envios (é da Nádia), comentários de código, aria-labels puramente técnicos.
**As fontes.** Os três lotes (percurso · editores · envio) fundidos, criticados contra os 9 princípios, a regra de corte e `docs/glossario.md`, com varrimento próprio dos ficheiros por strings que escaparam. pt-PT pré-acordo em todas as propostas.

**Estatísticas.** 368 strings revistas (contadas por linha de tabela; algumas linhas agrupam variantes da mesma frase) · 302 ficam iguais («=») · 14 cortadas (CORTA) · 52 reescritas — 66 mudanças ao todo, e nenhuma acrescenta: todas cortam, encurtam ou uniformizam.

**A voz única (uniformizada entre lotes).** O mesmo conceito, as mesmas palavras em todos os ecrãs:
**folha** (nunca «página/documento») · **endereço** (nunca «link/URL/token») · **lista** e **fechar a lista** (nunca «congelar/fixar») · **envios / enviar** (nunca «expedição») · **quem recebe** (nunca «público/destinatários») · **escolha** (nunca «recorte» nem «filtros») · **a mensagem que acompanha o endereço** (nunca «que leva o endereço») · **contam-se no total** (a doutrina das leituras, dita UMA vez por ecrã) · **modelo de comunicado** (qualificado onde o contexto não qualifica) · o par canónico do medo: **«Ainda não envia nada.»**

---

## ★ As 15 mudanças que mais importam (do conjunto)

1. **TAB:912-914 + TAB:932** — o parágrafo do publicar CORTA e a nota do botão ganha o par canónico: «Cria o endereço. Ainda não envia nada.»
2. **TAB:596-598 + TAB:611-612** — «{N} leituras · contam-se no total.» substitui um parágrafo inteiro de doutrina.
3. **TAB:1545-1547** — a intro permanente da lista encolhe para uma frase; o percurso já ensina o resto.
4. **TAB:704** — a faixa da retirada perde o jargão «o percurso está suspenso»; as pílulas esmaecidas já o mostram.
5. **TAB:983** — «Vê-se quantos são antes de fechar a lista.» — saem «recorte» e «fixar» da frase do passo 3.
6. **LIB:558 + R:566 + R:87/89** — «recorte» sai de TODAS as strings de ecrã; a palavra única passa a **«escolha»** (o lote 3 propunha «filtros» num sítio e o lote 1 «esta escolha» noutro — uniformizado).
7. **R:565** — «Fixa estes nomes. Ainda não envia nada.» — o espelho do par do publicar, no fechar da lista.
8. **CE:1244 + CE:1245** — as duas descrições do aspecto CORTAM: a pré-visualização recompõe ao alternar.
9. **CE:1126 + CE:1148 + CE:1178 + CE:1731** — placeholders e ajudas que repetiam o rótulo ou explicavam o que a pré-visualização mostra: CORTAM.
10. **CE:1252-1254** — a instrução dos blocos cai para metade: as etiquetas da Fase C ensinam ao vivo.
11. **CE:1578** — «Confirmar? O bloco sai.» — corrigido na crítica: o lote propunha «Apagar?», que quebrava o padrão armado da casa (TAB:1690, E:730, M:463).
12. **ME:268** — a mensagem de WhatsApp por omissão cai para metade, neutra ao propósito, com os dois tokens à vista.
13. **ME:253-257** — a explicação da mensagem perde a 2.ª frase (ensinava um ecrã que ainda não está à frente dela).
14. **GM:371-373 + M:568-569** — a doutrina do modelo («cada comunicado é novo…») deixa de se repetir três vezes; fica a linha-contrato «Alterações só valem para envios novos.» onde é lei.
15. **E:809 + E:798-801 + E:1573-1575** — o fecho perde a formalidade assumida («cada casamento novo») e a doutrina repetida; a honestidade do «enviado» fica inteira em metade das palavras.

**Correcção transversal da crítica:** o lote 1 propunha «a mensagem que **leva** o endereço» em TAB:1112 e TAB:518 — mas «que **acompanha** o endereço» é a palavra de ME:251, GM:208, M:44 e E:1234. Duas palavras para a mesma coisa é o erro que o glossário existe para evitar. Uniformizado: **«acompanha»** em todo o lado; TAB:1112 volta a «=» e TAB:518 corta só a repetição.

Legenda: **=** fica como está · **CORTA** sai · ★ mudança das mais importantes. Caminhos: TAB `ComunicadosTab.jsx` · CE `ComunicadoEditor.jsx` · ME `MensagemEditor.jsx` · GM `GuardarComoMolde.jsx` · R `ComunicadoRecorte.jsx` · E `ComunicadoExpedicao.jsx` · M `ComunicadoModelos.jsx` · T `comunicadoTempo.js` · LIB `lib/comunicados.js`.

---

## Ecrã 1 — A lista (Envios)

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| TAB:1472 | COMUNICADOS | = | Overline curta, situa. |
| TAB:1476 | Envios ou modelos | = | Aria-label da tablist, lê-se bem. |
| TAB:1486-1487 | Envios / Modelos | = | Vocabulário da Fase A, 1 palavra cada. |
| TAB:1534 | Envios | = | Título do ecrã, coincide com a tab — coerente. |
| ★ TAB:1545-1547 | Folhas públicas com endereço próprio — escrevem-se uma vez e chegam a muitos: o espaço, a wedding planner, os fornecedores. Publicar dá o endereço; retirar tira a folha do ar. | Folhas públicas com endereço próprio — escrevem-se uma vez e chegam a muitos. | Regra de corte 1: o percurso ensina publicar/retirar passo a passo; a lista de destinatários assumia formalidade (princípio 9). |
| TAB:1561 | + Novo comunicado | = | O botão nomeia o que cria. |
| TAB:1260 | Não foi possível carregar os comunicados. | = | Erro com acção ao lado (Tentar de novo) — princípio 8. |
| TAB:1573 | Tentar de novo | = | Diz o que fazer. |
| TAB:1595 | Nenhuma folha, por enquanto. | = | Estado vazio calmo, 3 palavras. |
| TAB:1596 | Um comunicado é uma folha pública com endereço próprio — escreve-se uma vez, publica-se, e o endereço passa de mão em mão até chegar a quem precisa de o ler. | = | Só se lê UMA vez (enquanto não há folhas) — é onde a definição deve morar; a intro permanente encolhe, esta fica. |
| TAB:1597 | Escrever a primeira folha | = | Estado vazio diz o que fazer a seguir — princípio 7. |
| TAB:1661 | Sem título, por enquanto | = | Honesto e sem culpa. |
| TAB:1667 | 1 leitura / N leituras | = | Número com rótulo, curto. |
| TAB:1669 | guardada {hoje às 15:42} | = | Tempo dito como a casa fala. |
| TAB:110,128 | PUBLICADA / RETIRADA / POR PUBLICAR | = | Estados de 1-2 palavras, mostrados com o visto/anel. |
| TAB:1690 | Confirmar? A folha apaga-se. | = | A confirmação nomeia a consequência — princípio 3; é o padrão armado da casa. |
| TAB:1695-1696 | Apagar a folha | = | Aria-label/title do X, 3 palavras. |
| TAB:1613 | Já tem leituras — só pode ser retirada do ar. | = | A razão do X diz o limite E a saída — princípio 8. |
| TAB:1614 | Já tem lista fechada — só pode ser retirada do ar. | = | Idem. |
| TAB:1792 | Abrir a folha | = | A razão termina com a acção — o retirar mora lá dentro. |
| TAB:1231 | Não foi possível apagar a folha. Tente outra vez. | = | Erro com saída. |

## Ecrã 2 — Novo comunicado (o escolhedor)

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| TAB:1833 | Novo comunicado | = | Overline do modal, eco do botão. |
| TAB:1844-1845 | Começar de um modelo | = | Nomeia a via; o modal «Novo comunicado» qualifica o «modelo». |
| TAB:1342 | Não foi possível carregar os modelos. | = | Erro com Tentar de novo ao lado. |
| TAB:1862-1863 | Ainda não há modelos de comunicado — guardam-se a partir de uma folha, em «Guardar como modelo». | Ainda não há modelos — guardam-se a partir de uma folha, em «Guardar como modelo». | «De comunicado» é redundante dentro do modal «Novo comunicado» — o contexto qualifica, como o glossário pede. |
| TAB:1868-1870 | {nomes} — a folha, a mensagem e quem recebe, prontos a rever. | = | Uma frase que diz o que o modelo traz; sem pré-visualização aqui, ainda é precisa. |
| TAB:1905-1906 | Usar este modelo (— {nome}) | = | O botão nomeia o objecto. |
| TAB:1921-1922 | Começar do zero | = | Título da via 2. |
| ★ TAB:1925 | Uma folha em branco. Nada fica guardado até ao primeiro Guardar. | Nada fica guardado até ao primeiro Guardar. | «Uma folha em branco» repete o título «Começar do zero» mesmo por cima — fica a frase que acrescenta (o rasto zero). |
| TAB:1939 | Começar do zero | = | Botão = título da via, sem surpresa. |
| TAB:1955 | Cancelar | = | 1 palavra. |

## Ecrã 3 — O percurso: cabeçalho e bandas

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| TAB:658 | ← Envios | = | Voltar nomeado pelo destino. |
| TAB:661 | COMUNICADO | = | Overline. |
| TAB:673 | Sem título, por enquanto | = | O mesmo da lista — coerente. |
| ★ TAB:704 | A folha saiu do ar — o percurso está suspenso. O endereço fica reservado. | A folha saiu do ar. O endereço fica reservado. | «O percurso está suspenso» é jargão da interface (princípio 4) e as pílulas esmaecidas já o mostram (princípio 5). |
| TAB:735-738 | Nascida do modelo {nome} — quem recebe já veio pré-escolhido. | = | Uma frase, vocabulário do glossário, só aparece quando é verdade. |
| TAB:771 | Modelo guardado: {nome} | = | Confirmação de 3 palavras + nome. |
| TAB:774 | Fica em Envios · Modelos. | = | Diz ONDE mora — mostra o caminho, não explica. |
| TAB:782 | Ver → | = | 1 palavra + seta. |
| TAB:483 | 1 · A folha / 2 · Publicar / 3 · Quem recebe / 4 · Enviar | = | Os nomes da Fase A, 1-2 palavras cada. |

## Ecrã 3 — Passo 1 · A folha

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| TAB:794-796 | Um bloco pede revisão. / {N} blocos pedem revisão. | = | Número com significado, por extenso até dez. |
| TAB:800 | a rever | = | Etiqueta da Fase C — mostra, não explica. |
| TAB:816 | Rever a folha | = | O botão nomeia o gesto. |
| TAB:823-825 | 1 bloco / {N} blocos · guardada {quando} · Editar a folha | = | Resumo de passo feito em meia linha — o padrão certo. |

## Ecrã 4 — Editar a folha (ComunicadoEditor)

### Cabeçalho e campos do topo

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| CE:988 | Editar a folha do comunicado (aria) | = | Lida por leitor de ecrã; diz o que a porta é. |
| CE:1043 | COMUNICADO | = | Overline de contexto, uma palavra. |
| CE:1052 | Editar a folha | = | Vocabulário da Fase A («folha»), certo. |
| CE:1085 | Pré-visualizar | = | Uma palavra, nomeia o gesto. |
| CE:1090 | Fechar sem guardar (aria) | = | Nomeia a consequência (princípio 3). |
| CE:1120 | TÍTULO DA FOLHA | = | 3 palavras, glossário em dia. |
| ★ CE:1126 | O nome do comunicado (placeholder) | CORTA | Repete o rótulo e troca «título» por «nome» — no glossário, nome é interno, título é o que se lê. |
| CE:1139 | LINHA DE APRESENTAÇÃO (opcional) | = | Nomeia o sítio; «(opcional)» tira pressão. |
| ★ CE:1148 | Uma linha por baixo do título, se a folha a pedir (placeholder) | CORTA | A pré-visualização mostra onde a linha pousa — mostrar em vez de escrever. |
| CE:1160 | SAUDAÇÃO | SAUDAÇÃO (opcional) | Sem a linha de ajuda (cortada abaixo), é o «(opcional)» que diz que se pode deixar vazio — o padrão do campo irmão. |
| CE:1166 | Queridos noivos, (placeholder) | Queridas clientes, | «Noivos» assume casamento (princípio 9 + glossário); «as clientes» é a voz da casa (GM:398) — palavra final da Nádia. |
| ★ CE:1178 | Abre a folha em itálico de cerimónia. Vazio = sem saudação. | CORTA | A pré-visualização mostra o itálico ao escrever; «Vazio = sem saudação» é telegrama de sistema — o «(opcional)» resolve. |

### O aspecto

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| CE:1184 | ASPECTO | = | Glossário 09/08 em dia. |
| CE:1188 | O aspecto da folha (aria) | = | Frase lida por leitor de ecrã, curta. |
| CE:1217 | Sóbrio | = | Palavra do glossário. |
| CE:1218 | Convidativo | = | Palavra do glossário. |
| ★ CE:1244 | A folha ganha desejo: título maior, prosa centrada, imagem à largura. | CORTA | A pré-visualização recompõe ao alternar — descreve o que o olho já vê (princípio 5). |
| ★ CE:1245 | A folha fala sóbria — o tom dos avisos da casa. | CORTA | Mesma razão; «Sóbrio»/«Convidativo» já carregam o sentido. |

### Os blocos

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| CE:1250 | OS BLOCOS | = | 2 palavras. |
| ★ CE:1252-1254 | A ordem compõe a folha: o primeiro bloco com rótulo é a nota em destaque, o último é o remate, e um bloco só com rótulo abre um grupo. | A ordem dá o papel a cada bloco — a etiqueta de cada cartão mostra-o. | As etiquetas da Fase C mostram o papel ao vivo; a regra de três cláusulas era o manual que elas dispensam (24→12 palavras). |
| CE:151-157 | Prosa · Nota em destaque · Grupo · Remate · Imagem · Chamada · Vazio (etiquetas de papel) | = | Fase C: nomes humanos, 1-3 palavras. |
| CE:162 | Cláusula {n} (etiqueta) | = | Número com significado. |
| CE:1301-1302 | Arrastar para reordenar (aria + title) | = | Frase lida por leitor de ecrã; diz o gesto. |
| CE:1330 | A rever (pastilha) | = | 2 palavras, estado claro. |
| CE:1355 | Está certo | = | Fecha a revisão com a resposta à pergunta — humano. |
| ★ CE:1578 | Confirmar? | Confirmar? O bloco sai. | Corrigido na crítica: o lote propunha «Apagar?», mas o padrão armado da casa é «Confirmar? + consequência» (TAB:1690, E:730, M:463) — alinha sem quebrar a família. |
| CE:1583-1584 | Remover bloco (aria + title) | = | Nomeia acção e objecto. |

### Cartão de imagem

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| CE:1424/1449 | A carregar… | = | Estado sereno. |
| CE:1442 | Escolher a fotografia… | = | Nomeia o gesto. |
| CE:1377-1378 | Trocar a imagem (aria + title) | = | Nomeia a consequência do clique na miniatura. |
| CE:1391 | A imagem do bloco (alt) | = | Alt digno quando não há legenda. |
| CE:1455 | Legenda (opcional) (placeholder) | = | 2 palavras. |
| CE:430 | Não foi possível carregar a imagem. Tente outra vez. | = | Erro que diz o que fazer (princípio 8). |

### Cartão de chamada e cartão de texto

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| CE:1470 | O texto do botão (placeholder) | = | Diz exactamente o que o campo é. |
| CE:1478 | O endereço que o botão abre (https://…) (placeholder) | = | «Endereço», não «URL» — e o exemplo mostra o formato. |
| CE:1485 | Nota por baixo do botão (opcional) (placeholder) | = | Diz onde pousa. |
| CE:1495 | Rótulo (opcional) (placeholder) | = | 2 palavras. |
| CE:1504 | O texto do bloco (placeholder) | = | Mínimo digno. |
| CE:1535-1537 | Esta primeira linha parece uma saudação — a saudação já vive no campo lá de cima. | Esta linha parece uma saudação — já há um campo para ela, lá em cima. | Mesma informação, menos palavras; o aviso continua a apontar o caminho. |
| CE:1555 | Tirar a linha do bloco | = | O botão nomeia a consequência exacta. |

### Gestos de acrescentar, assinatura e fantasma

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| CE:1654 | + Texto | = | 1 palavra. |
| CE:1687 | + Imagem | = | 1 palavra. |
| CE:1718 | + Chamada | = | 1 palavra. |
| ★ CE:1731 | A assinatura — «{despedida} {nome}» — fecha todas as folhas da casa. | CORTA | A pré-visualização já mostra a assinatura no fim da folha — mostrar em vez de explicar. |
| CE:343-349 | (sem rótulo) · (sem legenda) · (sem texto do botão) · (sem texto) (fantasma do arrasto) | = | Faltas honestas, entre parêntesis. |

### Pré-visualização (gaveta e coluna)

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| CE:1738 | Pré-visualização da folha (aria) | = | Lida por leitor de ecrã. |
| CE:1757 | compõe-se a cada tecla | CORTA | Escrever e ver a folha mudar já o mostra; texto a explicar o evidente. |
| CE:1917 | PRÉ-VISUALIZAÇÃO | = | Título da gaveta. |
| CE:1920 | Fechar a pré-visualização (aria) | = | Nomeia o gesto. |
| CE:628 | COMUNICADO (overline da folha) | = | É a folha pública em miniatura — fiel. |
| CE:641 | Sem título, por enquanto | = | Estado vazio sem ralhar; o campo do título está mesmo ali. |
| CE:696/724 | A imagem da folha (alt) | = | Alt digno. |
| CE:782 | (sem texto do botão) | = | Falta honesta na pré. |

### Rodapé e validações

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| CE:1789 | Cancelar | = | Padrão da casa. |
| CE:1822 | Guardar / Guardado | = | O visto + a palavra confirmam o gesto. |
| CE:450 | A folha precisa de um título. | = | Erro curto que aponta o campo. |
| CE:452 | Há uma imagem a carregar — um instante, e a folha guarda-se. | = | Diz o que fazer: esperar. |
| CE:458 | O {n}.º bloco é uma imagem sem fotografia — escolha-a ou remova o bloco. | = | Número com significado + duas saídas. |
| CE:462 | O {n}.º bloco é uma chamada sem o texto do botão — escreva-o ou remova o bloco. | = | Idem. |
| CE:465 | O {n}.º bloco é uma chamada sem endereço — cole-o ou remova o bloco. | = | Idem; «cole-o» é o gesto real. |
| CE:468 | O {n}.º bloco está vazio — escreva-o ou remova-o. | = | Idem. |
| CE:536 | Não foi possível guardar a folha. Tente outra vez. | = | Erro que diz o que fazer. |

## Ecrã 3 — Passo 2 · Publicar

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| TAB:879 | Abre com a folha revista e guardada. | = | Secção dormente que diz o que a acorda — princípio 7. |
| TAB:885 | A folha está pronta; falta dar-lhe um endereço. | = | O estado + o que falta, numa frase. |
| TAB:900 | — ainda sem endereço — | = | Mostra o vazio onde o endereço vai nascer — princípio 5. |
| ★ TAB:912-914 | Publicar cria o endereço público da folha. A partir daí, qualquer pessoa com o endereço pode abri-la e reencaminhá-la — é assim que ela chega ao espaço e aos fornecedores. | CORTA | Duas frases onde o princípio 2 permite uma; «o espaço e os fornecedores» assume o destinatário (princípio 9); o essencial passa para a nota do botão (932). |
| TAB:929 | Publicar a folha | = | O botão do briefing, palavra por palavra. |
| ★ TAB:932 | Pode retirá-la do ar a qualquer momento. | Cria o endereço. Ainda não envia nada. | O par canónico do princípio 3 — nomeia a consequência e desfaz o medo de disparar envios; o «retirar» mostra-se logo a seguir, no cartão publicado. |
| TAB:835 | A folha deixou de estar no ar. | = | Frase central do estado retirado. |
| TAB:846-848 | O endereço continua reservado a esta folha, mas quem o abrir agora encontra uma página da casa a dizer que não há nada para ler — sem nomes nem detalhes. | Quem abrir o endereço agora encontra uma página da casa a dizer que não há nada para ler — sem nomes nem detalhes. | A primeira oração repete a faixa («O endereço fica reservado», 704) — corta-se a repetição, fica a garantia de privacidade. |
| TAB:851-853 | Foi aberta {N} vezes enquanto esteve no ar. | = | Número com contexto, uma linha. |
| TAB:868 | Voltar a publicar | = | Nomeia o gesto de regresso. |
| TAB:871 | O mesmo endereço volta a abrir a folha. | = | A consequência do botão, numa frase. |
| TAB:945 | No ar · {N} leituras · Ver o endereço | = | Resumo de passo feito — o padrão certo. |
| TAB:593 | Copiar endereço / Endereço copiado | = | Par botão/confirmação de 2 palavras. |
| ★ TAB:596-598 | {N} leituras até agora. | {N} leituras · contam-se no total. | O rótulo do princípio 6 resolve sozinho o que hoje pede um parágrafo — a nota longa por baixo sai. |
| ★ TAB:611-612 | Contam-se no total: a folha é pública e reencaminhável, e não se sabe quem a abriu nem quantas pessoas são. | CORTA | Com «contam-se no total» colado ao número, a explicação passa a redundante — regra de corte 2 (mostrada em vez de escrita). |
| TAB:630 | Confirmar? A folha sai do ar. | = | Confirmação armada que nomeia a consequência. |
| TAB:644 | Retirar a folha do ar | = | O botão diz exactamente o que faz. |
| TAB:411 | Não foi possível publicar a folha. Tente outra vez. | = | Erro com saída — princípio 8. |
| TAB:433 | Não foi possível retirar a folha. Tente outra vez. | = | Idem. |

## Ecrã 3 — Passo 3 · Quem recebe

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| TAB:964-966 | Lista fechada {dia} · {N} nomes · Ver quem recebe | = | Resumo de passo feito, meia linha. |
| ★ TAB:972 | Falta dizer a quem se destina. | Falta escolher quem recebe. | «Quem recebe» é o nome do passo, do botão e do glossário — «destina-se» introduzia um sinónimo sem ganhar nada. |
| ★ TAB:983 | O recorte responde com a contagem antes de fixar seja o que for. | Vê-se quantos são antes de fechar a lista. | «Recorte» está na lista negra do princípio 4 e «fixar» é sinónimo solto de «fechar» — só palavras do glossário. |
| TAB:996 | Escolher quem recebe → | = | Botão = nome do passo. |
| TAB:1002-1004 | A regra do modelo: {rótulo} — a lista conta-se ao fechar, de novo. | Do modelo: {rótulo} — a lista conta-se ao fechar. | «A regra» é sistema e o «de novo» pendurado confunde; metade das palavras diz o mesmo. |
| TAB:1011 | Abre quando a folha voltar ao ar. / Abre quando a folha tiver endereço. | = | Dormente que diz o que a acorda. |

## Ecrã 5 — Quem recebe (ComunicadoRecorte)

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| R:317 | ← O comunicado | = | Nomeia o destino, curto. |
| R:321 | COMUNICADO · {título} | = | Overline de contexto, mínimo. |
| R:332 | Quem recebe | = | O nome do glossário. |
| R:335 | A regra que diz quem recebe. A lista só fica fixa quando a fechar. | A lista só fica fixa quando a fechar. | A 1.ª frase repete o título que está mesmo acima. |
| R:383 | Por eventos | = | Rótulo do comutador de origem, 2 palavras — escapou aos lotes; acrescentado no varrimento. |
| R:401 | Por contactos | = | Idem. |
| R:33-35 | Por vir · Já passaram · Todos | = | Rótulos de 1-2 palavras, certos. |
| R:43-45 | Todos os contactos · Só clientes · Só interessados | = | Vocabulário do glossário, curto. |
| R:49 | Toda a base: quem fechou, quem ficou a pensar, quem só perguntou. | = | Uma frase que dá o alcance real. |
| R:50 | Só quem já fechou negócio com a casa. | = | Uma frase, definição do funil. |
| R:51 | Quem mostrou interesse e ainda não fechou. | = | Idem. |
| R:63 | Ainda não há eventos de {tipo}. A contagem responde quando houver. | Ainda não há eventos de {tipo} — experimente outro tipo ou janela. | Estado vazio passa a dizer o que fazer a seguir. |
| R:65 | {n} evento(s) de {tipo} por vir · {n} já passou/passaram, fora da janela. | = | Número com significado, já resolve. |
| R:66 | Só o que já aconteceu: {n} evento(s) de {tipo}. | = | Idem. |
| R:67 | {n} eventos de {tipo}: {n} por vir, {n} já passaram. | = | Idem. |
| R:74-79 | {n} eventos na janela, {n} pessoas: a {nome} tem dois eventos e conta uma vez. | = | Explica o único número que surpreende. |
| ★ R:87 | Ninguém — não há ninguém no recorte. | Ninguém. | «Recorte» é jargão; o cartão já mostra o 0 mesmo acima. |
| R:89 | Ninguém: {n} pessoa(s) tem/têm número utilizável — na ficha ou nas respostas do evento. | Ninguém: {n} pessoa(s) tem/têm número utilizável. | A origem do número é detalhe que ninguém pediu aqui. |
| R:91 | Ninguém: a única pessoa do recorte tem número utilizável. | Ninguém: a única pessoa tem número utilizável. | «Recorte» é jargão e a frase vive sem ele. |
| R:92 | Ninguém: os {n} têm número utilizável. | = | Curta e honesta. |
| R:94-96 | Fica(m) de fora {n}: {nome} — {porquê}; … | = | O FICA DE FORA nomeado com o porquê é o coração do cartão. |
| R:102 | Ninguém pediu, até hoje, para não receber promoções — quando alguém pedir, sai daqui sozinho. | Ninguém pediu para não receber promoções. | A promessa de futuro é explicação a mais; quando acontecer, R:104 mostra-o. |
| R:104-105 | Fora, a pedido: {nome(s)} pediu/pediram para não receber promoções. | = | Nomeado e com o porquê. |
| R:416 | TIPO DE EVENTO | = | Rótulo de secção certo. |
| R:428 | Ainda não há tipos de evento. | Ainda não há tipos de evento — criam-se em Modelos de Evento. | Estado vazio diz o que fazer a seguir. |
| R:434 | Não foi possível carregar os tipos de evento. | Não foi possível carregar os tipos de evento. Recarregue a página. | Erro passa a dizer o que fazer (não há botão de repetir aqui). |
| R:437 | JANELA | = | 1 palavra. |
| R:448 | QUEM | = | 1 palavra. |
| ★ R:457 | Não há evento nenhum no meio: é a base de contactos, tal como está. | CORTA | Os chips «Todos os contactos / Só clientes / Só interessados» + a frase do cartão (R:49-51) já mostram exactamente isto. |
| ★ R:485 | Não foi possível contar o recorte. | Não foi possível contar. | «Recorte» é jargão; o «Tentar de novo» ao lado já dá o caminho. |
| R:491 | Tentar de novo | = | Erro com acção, certo. |
| R:502 | pessoa / pessoas | = | — |
| R:515 | FICA DE FORA | = | O rótulo da honestidade, fica. |
| R:560 | Fechar a lista · {n} nome(s) | = | O botão nomeia a consequência e traz o número. |
| R:561 | Não há ninguém para receber | = | Diz porque não há nada para fechar. |
| ★ R:565 | Fixa estes nomes agora — o envio trabalha sobre eles, sem surpresas. | Fixa estes nomes. Ainda não envia nada. | A consequência que importa é a que tira o medo do toque: fechar não é enviar — o espelho do par do publicar. |
| ★ R:566 | Ajuste o recorte até a contagem responder. | Ajuste a escolha até a contagem responder. | Corrigido na crítica: o lote propunha «filtros» (também jargão); «escolha» é a palavra do erro irmão (LIB:558) — uma voz. |
| R:275 | Não foi possível fechar a lista. Tente outra vez. | = | Erro com acção. |
| R:295 | Não foi possível desfazer o fecho da lista. | Não foi possível desfazer o fecho da lista. Tente outra vez. | Erro passa a dizer o que fazer, como os irmãos. |
| R:598-602 | Lista fechada: {n} nomes, {quando}. | = | O carimbo, com número e hora. |
| R:605 | Se entrar um evento novo, esta lista não muda. | = | Uma frase, e é a garantia central do fecho. |
| R:618 | Desfazer | = | 1 palavra. |
| R:636 | Abrir o envio → | = | Nomeia o destino. |

## Ecrã 3 — Passo 4 · Enviar

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| TAB:1021-1023 | A conversa saiu. / As {N} conversas saíram. | = | O balanço em 3-4 palavras, vocabulário da Fase A. |
| TAB:1026-1028 | Enviada(s) {dia} · Ver os envios | = | Meta curta + porta. |
| TAB:1042 | Guardar como modelo | = | Nome do glossário. |
| TAB:1059 | Nenhuma mensagem saiu ainda. | = | Estado honesto em 4 palavras. |
| TAB:1081-1083 | Uma conversa à espera. / {N} conversas à espera. | = | Número com significado, por extenso até dez. |
| TAB:1087 | {N} de {M} enviadas. | = | Progresso em 4 palavras. |
| TAB:1093 | Editar a mensagem | = | Ligação que nomeia o gesto. |
| TAB:1106,1131 | Enviar → | = | 1 palavra + seta, aceso ou inerte. |
| ★ TAB:1112-1113 | Falta a mensagem que acompanha o endereço. Escrever a mensagem | = | Corrigido na crítica: o lote propunha «que leva o endereço», mas «acompanha» é a palavra de ME:251, GM:208, M:44 e E:1234 — uma voz só; a frase original já a usa. |
| ★ TAB:1133-1135 | O Enviar acende com a mensagem escrita. | CORTA | A linha de cima já diz o que falta e dá a ligação; o botão apagado mostra o resto — regra de corte 1 + princípio 5. |
| TAB:508-511 | A mensagem veio do modelo: «{excerto}» · Editar a mensagem | = | Proveniência + excerto mostrado — nada a explicar. |
| TAB:513 | A mensagem que acompanha o endereço está escrita. | A mensagem está escrita. | Passo feito em resumo: metade das palavras; o papel da mensagem só precisa de ser dito quando FALTA. |
| ★ TAB:518-521 | A mensagem que acompanha o endereço ainda está por escrever — é ela que leva o endereço. Escrever a mensagem | A mensagem que acompanha o endereço ainda está por escrever. Escrever a mensagem | «Que acompanha o endereço» e «é ela que leva o endereço» dizem o mesmo na mesma frase — fica a primeira, que é a voz de todos os ecrãs (crítica: o lote preferia «leva»; uniformizado para «acompanha»). |
| TAB:1066,1145 | Os envios abrem com a lista fechada. | = | Dormente paralela à do passo 2 — uma gramática só. |
| TAB:1154 | Guardar como modelo | = | A porta discreta, mesmo rótulo do balanço. |

## Ecrã 6 — A mensagem (MensagemEditor)

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| ME:163 | A mensagem do comunicado (aria) | = | Lida por leitor de ecrã. |
| ME:208 | COMUNICADO · {título} | = | Contexto no cabeçalho. |
| ME:218 | A mensagem | = | Título curto do ecrã. |
| ME:223 | Fechar sem guardar (aria) | = | Nomeia a consequência. |
| ME:251 | O TEXTO QUE ACOMPANHA O ENDEREÇO | = | Mais longo que o ideal, mas é o que distingue a mensagem da folha — encurtar criava ambiguidade. |
| ★ ME:253-257 | Escreve-se uma vez; em cada conversa sai com o nome da pessoa. Uma palavra a mudar para alguém em particular ajusta-se na própria linha do envio. | Escreve-se uma vez; em cada conversa sai com o nome da pessoa. | Máx. UMA frase (princípio 2); a segunda ensina um ecrã que ainda não está à frente dela — aprende-se lá. |
| ★ ME:268 | Olá, {NOME}! Preparámos uma folha para si. Pode abri-la aqui — e partilhá-la com quem precisar de a ler: {LINK_FOLHA} (mensagem por omissão) | Olá, {NOME}! Temos uma folha para si — pode ler e partilhar: {LINK_FOLHA} | Metade das palavras, o mesmo convite; neutra ao propósito (serve aviso e oferta) e os dois tokens continuam exemplificados. |
| ME:301 | + nome | = | Insere {NOME} em português humano. |
| ME:313 | + endereço | = | Insere {LINK_FOLHA}; «endereço», não «link/token». |
| ME:316-318 | Na lista de difusão a mensagem sai igual para todos — o nome é retirado. | = | Dúvida do lote resolvida: a difusão existe (E:1592-1709) — a linha fica; avisa uma diferença que a pré não mostra. |
| ME:157 | COMO CHEGA À MARTA / COMO CHEGA A {NOME} | = | A pré «como chega» é o coração do ecrã — mostra em vez de explicar. |
| ME:373 | Comunicado — {título} (cartão da pré) | = | Cenografia fiel ao que o WhatsApp desenha. |
| ME:384 | Uma folha da {casa}, para ler e partilhar. (cartão da pré) | = | Idem. |
| ME:407-411 | A folha ainda não tem endereço — quando for publicada, o «___» dá lugar ao endereço verdadeiro. | = | Explica um «___» visível que de outro modo parecia avaria; uma frase. |
| ME:114 | A mensagem está vazia. | = | Curto. |
| ME:116 | A mensagem tem de levar o endereço da folha — o botão «+ endereço» volta a pô-lo. | = | Erro que diz exactamente o gesto que repara. |
| ME:139 | Não foi possível guardar a mensagem. Tente outra vez. | = | Padrão da casa. |
| ME:441 | Cancelar | = | Padrão. |
| ME:474 | Guardar / Guardada | = | Padrão. |

## Ecrã 7 — Enviar (ComunicadoExpedicao, vista principal)

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| E:1187 | ← O comunicado | = | — |
| E:1190 | ENVIAR | = | O nome do glossário. |
| E:1201 | Sem título, por enquanto | = | Vazio honesto. |
| E:1204 | Lista fechada a {data} · {n} nomes · A mensagem | = | Três factos, zero prosa. |
| E:1234 | Falta a mensagem que acompanha o endereço. | = | Diz o que falta — e é a mesma frase do passo 4 (TAB:1112): uma voz. |
| ★ E:1236-1239 | Escreve-se uma vez e sai em todas as conversas, com o nome de cada pessoa. Sem ela, a folha chegava como um endereço sozinho. | Escreve-se uma vez e sai em todas as conversas, com o nome de cada pessoa. | Máx. uma frase de explicação; a 2.ª repõe o que E:1234 já disse. |
| E:1245 | Escrever a mensagem | = | Botão nomeia a acção. |
| E:1007-1010 | Faltam {n} de {t} — a seguir, a {nome}. / — uma resposta à espera, acima. | = | A retoma diz por onde pegar, não só quanto falta. |
| E:1272 | Todos enviados. | = | — |
| E:1274 | A última mensagem saiu {quando}. | = | — |
| E:1282 | Ver o fecho → | = | — |
| E:1308-1309 | A conversa da {nome} abriu-se. A mensagem saiu? | = | A pergunta da volta, uma frase, no tempo certo. |
| E:1318 | Saiu — enviei | = | Resposta na 1.ª pessoa, sem ambiguidade. |
| E:1326 | Não saiu | = | — |
| E:140 | No portal desta cliente / Mostrar também no portal desta cliente | = | A caixa diz o estado e a consequência em meia linha. |
| E:1351 | São {n} conversas com a mesma mensagem. Há um caminho mais curto. | = | Curto, e o botão ao lado nomeia o caminho. |
| E:1365 | Lista de difusão | = | — |
| E:1372 | POR ENVIAR · {n} | = | Secção com contagem. |
| E:1395 | com mensagem própria | = | Etiqueta que mostra em vez de explicar. |
| E:1428 | Enviar | = | — |
| E:1437 | Tocar no nome ajusta a mensagem dessa pessoa antes de sair. | = | A única pista de descoberta do ecrã; uma linha. |
| E:1447 | SEM NÚMERO UTILIZÁVEL · {n} | = | — |
| E:1467 | {âncora} — sem número na ficha nem nas respostas | = | O porquê na própria linha. |
| E:1482 / E:1620 | Copiada / Copiar a mensagem | = | Botão vira confirmação no próprio sítio. |
| ★ E:1493 | Ficam na lista, contados — a mensagem copia-se e segue por onde houver caminho. | CORTA | A secção já os mostra na lista e o botão «Copiar a mensagem» já mostra o caminho. |
| E:1500 | ENVIADOS · {n} | = | — |
| E:1558 | Muitas pessoas de uma vez? Há a lista de difusão | Todos de uma vez? Lista de difusão | Cabe em metade das palavras. |
| ★ E:1573-1575 | «Enviado» quer dizer: a conversa abriu-se e a mensagem saiu. Não diz que foi recebida, nem que foi lida. E as leituras da folha contam-se no total, nunca por pessoa — a folha é pública e reencaminhável. | «Enviado» quer dizer: a conversa abriu-se e a mensagem saiu — não que foi recebida ou lida. As leituras contam-se no total, nunca por pessoa. | A honestidade fica inteira em metade das palavras; «pública e reencaminhável» explica o que o fecho já diz. |
| E:179 | ACRESCENTADA | = | Etiqueta da Fase C, mostra em vez de explicar. |
| E:951 | Não foi possível carregar a lista. Tente outra vez. | = | — |
| E:1042 | Não foi possível abrir a conversa. Tente outra vez. | = | — |
| E:1057 | Não foi possível registar a resposta. Tente outra vez. | = | — |
| E:1084 | Não foi possível guardar a escolha do portal. Tente outra vez. | = | — |
| E:1118 | Não foi possível guardar a mensagem desta pessoa. | Não foi possível guardar a mensagem desta pessoa. Tente outra vez. | O único erro do ecrã sem «o que fazer» — alinha com os irmãos. |
| E:1139 | Não foi possível marcar a lista. Tente outra vez. | = | — |

## Ecrã 7a — A lista de difusão

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| E:1592 | ← Uma a uma | = | Nomeia o caminho de volta. |
| E:1595 | LISTA DE DIFUSÃO | = | — |
| E:1597 | Uma mensagem, todos de uma vez. | = | O resumo em seis palavras. |
| E:1607 | Copie a mensagem — sai sem nome, igual para todos. | = | Passo + a única diferença que importa. |
| E:1629 | No WhatsApp, crie — ou abra — uma lista de difusão com estas pessoas. | = | Passo concreto. |
| E:1637 | Cole, envie, e volte aqui para deixar a lista em dia. | = | O passo fecha o ciclo com a app. |
| E:1652-1654 | A difusão só entrega a quem tem o número da casa guardado nos contactos. Quem não tiver, não recebe — e não há aviso: na dúvida, essa pessoa vai melhor uma a uma. | A difusão só entrega a quem tem o número da casa guardado nos contactos — e não avisa quem ficou de fora. Na dúvida, envie uma a uma. | A mesma verdade em metade das palavras. |
| E:1657 | QUEM ENTRA · {n} | = | — |
| E:1670 | Ninguém por enviar. | = | — |
| E:1692 | Confirmar? Marca os {n} de uma vez. | = | A 2.ª fase diz a consequência. |
| E:1709 | Marcar os {n} como enviados | = | Botão nomeia a consequência com o número. |

## Ecrã 7b — A ficha de uma pessoa

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| E:1744 | Mensagem para {nome} / Mensagem (aria) | = | Frase lida por leitor de ecrã, certa. |
| E:1786 | A conversa abre com esta mensagem já escrita — falta só, lá, o toque de enviar. | A conversa abre com esta mensagem já escrita. | Metade das palavras; o botão logo abaixo já diz o resto. |
| E:1810 | Abrir a conversa e enviar | = | Nomeia as duas consequências, pela ordem. |
| E:1828 | Fechar | = | — |

## Ecrã 8 — O fecho (ComunicadoExpedicao, OFim)

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| E:469 | ← O envio | = | — |
| E:473 | ENVIAR · {título} | = | — |
| E:420 | Todos enviados. | = | — |
| E:421 | Não saiu nenhuma mensagem por aqui. | = | Honesto quando o envio foi todo por fora. |
| E:425-432 | A mensagem saiu {quando}(, para a linha que entrou depois). / As {n} mensagens saíram — a primeira {dia}, a última {quando}. | = | Números e datas com significado, sem prosa. |
| E:435 | Falta uma. / Faltam {n}. | = | O título não finge que acabou. |
| E:439-450 | {N} saíram — a última {quando}. Uma linha ainda não saiu. (etc.) | = | Derivado do estado real, frase a frase. |
| E:492 | A lista fica guardada tal como acabou. | = | Uma frase, e é a promessa do fecho. |
| E:504 | A LISTA, FECHADA | = | — |
| E:572 | à espera de resposta | = | Estado em três palavras. |
| E:596 | sem número | = | — |
| E:592 | Enviar | = | — |
| E:618-619 | A conversa da {nome} abriu-se. A mensagem saiu? | = | Igual ao ecrã principal — a mesma pergunta, as mesmas palavras. |
| E:661 | A lista fica como acabou. Não se volta a perguntar por {este casamento / esta pessoa}. | = | A consequência que se grava tem de ser dita. |
| E:674 | Desfazer | = | — |
| E:684 | Entrou um/uma {tipo} depois de esta lista ter sido fechada: {nome}, {quando}. | Entrou um/uma {tipo} depois de a lista fechar: {nome}, {quando}. | As mesmas palavras em menos sílabas. |
| E:692 | Entrou um contacto depois de esta lista ter sido fechada: {nome}. | Entrou um contacto depois de a lista fechar: {nome}. | Idem. |
| E:704-707 | Pela regra deste comunicado — {regra} — teria recebido. | = | É o porquê de o cartão existir. |
| ★ E:709 | A lista está fechada e assim fica, a não ser que decida o contrário. | CORTA | Os dois botões logo abaixo mostram exactamente esta escolha; e E:661 repete-a ao dispensar. |
| E:730 | Confirmar? A lista reabre para uma linha. | = | A 2.ª fase diz a consequência. |
| E:730 | Acrescentar à lista | = | — |
| E:746 | Deixar como está | = | — |
| E:760-767 | Entra uma linha só, e o envio continua a ser seu: a lista passa a ter {n} nomes, {k} deles já enviados. | A lista passa a ter {n} nomes, {k} já enviados. | O botão armado já disse «reabre para uma linha»; fica só o número novo. |
| E:784-787 | A folha foi aberta {n} vez(es) até agora. | = | Número com significado. |
| ★ E:798-801 | No total, sem nomes: a folha é pública e reencaminhável, e «enviado» diz que a mensagem saiu — não que foi recebida ou lida. Mais leituras do que envios é bom sinal: alguém partilhou. | Contam-se no total, nunca por pessoa. Mais leituras do que envios: alguém partilhou. | A doutrina do «enviado» já vive no rodapé do ecrã de envio — aqui repetia; ficam as duas frases que este cartão precisa. |
| ★ E:809 | Isto vai repetir-se em cada casamento novo. Quer guardar como modelo de comunicado? | Este envio vai repetir-se? Guarde como modelo de comunicado. | «Cada casamento novo» assume um propósito — a mesma interface serve o Dia do Pai (princípio 9). |
| E:817 | Guardar como modelo | = | O contexto da frase ao lado já qualifica. |
| E:833 | Agora não | = | — |
| E:839-840 | Fica como está. Pode guardar como modelo a partir do próprio comunicado, quando quiser. | Pode guardar como modelo mais tarde, a partir do comunicado. | Metade das palavras, o mesmo caminho. |
| E:853 | Guardar agora | = | — |
| E:871-872 | Modelo guardado: {nome} · Fica em Envios · Modelos. | = | Confirmação que diz onde ficou. |
| E:892 | Ver a folha | = | — |
| E:900 | O comunicado e as leituras | = | Nomeia o destino. |
| E:355 | Não foi possível acrescentar a linha. Tente outra vez. | = | — |
| E:379 | Não foi possível registar a decisão. Tente outra vez. | = | — |
| E:397 | Não foi possível desfazer. Tente outra vez. | = | — |

## Ecrã 9 — Guardar como modelo (a gaveta)

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| GM:257 | Guardar como modelo (aria) | = | Glossário 09/08 («modelo», não «molde») em dia. |
| GM:280 | GUARDAR COMO MODELO | = | Idem. |
| GM:282 | O que fica guardado | = | O título anuncia a promessa da gaveta. |
| GM:206 | A folha — Título, linha de apresentação, {os N blocos} e o aspecto. | = | Inventário concreto, com o número real. |
| GM:208 | A mensagem — O texto que acompanha o endereço na conversa. | = | Uma linha, ecoa o ecrã da mensagem — a palavra «acompanha», a mesma em todos os ecrãs. |
| GM:210-214 | Quem recebe — «{regra}» — a regra, não os nomes. / Ainda sem regra escolhida — fica por dizer em cada comunicado novo. | = | A distinção regra/nomes é O contrato do modelo — merece as palavras. |
| GM:218 | {Os N nomes desta lista} — Contam-se de novo, de cada vez que usar o modelo. | = | Número real torna a promessa concreta (princípio 6). |
| GM:219 | O endereço da folha — Cada comunicado nasce sem endereço e ganha o seu ao publicar. | = | Idem. |
| GM:221-223 | {As N leituras} — Ficam com este comunicado, que continua no ar. / Ficam com este comunicado. | = | Idem; a variante «no ar» só quando é verdade. |
| GM:41-44 | O nome desta lista / Os {dois…dez} nomes desta lista / Os nomes desta lista | = | Por extenso até dez — a voz da casa. |
| GM:47-51 | A leitura / As {N} leituras / As leituras | = | Idem. |
| GM:62 | (bloco em branco) | = | Falta honesta. |
| ★ GM:371-373 | Cada comunicado que nascer daqui é novo: conta os nomes outra vez e ganha endereço próprio. Alterações só valem para envios novos. | Alterações só valem para envios novos. | A 1.ª frase repete, palavra a palavra, o que a lista NÃO FICA acabou de mostrar; a 2.ª é a linha-contrato do glossário (cópia, não ligação viva) — fica só ela. |
| GM:376 | NOME DO MODELO | = | 3 palavras. |
| GM:382 | Como quer chamar-lhe (placeholder) | = | Convida sem instruir. |
| GM:398 | Só o vê a casa. As clientes vêem o título da folha. | Só a casa o vê — as clientes vêem o título da folha. | Uma frase em vez de duas (princípio 2), mesma regra nome/título do glossário. |
| GM:404 | O QUE ENVELHECE | = | A pergunta da Fase B, 3 palavras. |
| GM:415 | Datas e prazos ficam marcados; ao usar o modelo, a folha pede para os rever. | = | Uma frase que explica a heurística E a consequência. |
| GM:416 | Nada aqui parece envelhecer — mas pode marcar qualquer linha. | = | Estado vazio que diz o que ainda se pode fazer (princípio 7). |
| GM:488 | A pergunta que a folha faz sobre «{bloco}» (aria) | = | Lida por leitor de ecrã, dá contexto ao campo. |
| GM:201 | O modelo precisa de um nome. | = | Erro curto que aponta o campo. |
| GM:191 | Não foi possível guardar o modelo. Tente outra vez. | = | Padrão da casa. |
| GM:528 | Guardar o modelo | = | Nomeia a consequência (princípio 3). |
| GM:546 | Cancelar | = | Padrão. |

## Ecrã 10 — Modelos de comunicado (a tab Modelos)

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| M:206 | Modelos de comunicado | = | O nome do glossário. |
| M:218-221 | O que se guarda de um comunicado para voltar a usar: a folha, a mensagem e a regra de quem recebe. Como os modelos de evento, mas para o que se diz a muita gente ao mesmo tempo. | A folha, a mensagem e a regra de quem recebe — guardadas para voltar a usar. | Metade das palavras; a comparação com os modelos de evento é explicação que a linha dispensa. |
| M:120 | Não foi possível carregar os modelos. | = | Tem o «Tentar de novo» ao lado. |
| M:231 | Tentar de novo | = | — |
| M:256 | AINDA NÃO HÁ MODELOS | = | — |
| M:266 | O primeiro modelo nasce de um comunicado que já saiu. | = | O estado vazio diz de onde vem o primeiro. |
| M:277-278 | No fim de um envio, «Guardar como modelo» fica com três coisas — e é o que verá aqui em cada linha: | No fim de um envio, «Guardar como modelo» fica com três coisas: | A lista logo abaixo mostra o que se veria — não precisa de o anunciar. |
| M:43 | A folha — O título, os blocos e o aspecto — sóbrio ou convidativo. | = | Vocabulário da Fase A («aspecto»), uma linha. |
| M:44 | A mensagem — O texto que acompanha o endereço na conversa. | = | — |
| M:46-49 | Quem recebe — Não os nomes: a regra. «Casamentos por vir» conta-se de novo de cada vez. | = | A distinção que evita o susto mais provável. |
| M:334-335 | Não guarda os nomes, nem o endereço, nem as leituras: cada comunicado que nasce de um modelo é novo, e ganha endereço próprio. | Cada comunicado que nasce de um modelo é novo, com endereço próprio. | A linha III já disse «não os nomes»; fica só o que é novo. |
| M:348 | Ir ao comunicado que já saiu | = | Estado vazio com acção. |
| M:392 | CONVIDATIVO / SÓBRIO | = | Etiquetas do aspecto, mostram em vez de explicar. |
| M:398 | Ainda sem regra de quem recebe | = | Vazio honesto. |
| M:402 (LIB:863-868) | Guardado, ainda não usado / Usado uma vez · {abril de 2026} / Usado {n} vezes · o último em {quando} | = | A história do cartão — números com significado; «guardado», não «nunca usado», sem culpa. Escapou aos lotes; acrescentado no varrimento. |
| M:428 | Usar este modelo | = | — |
| M:442 | Ver o que guarda | = | Nomeia o que abre. |
| M:463 | Confirmar? Os comunicados feitos ficam. | = | A verdade dita antes de confirmar, em seis palavras. |
| M:469-470 | Apagar o modelo (aria + title) | = | Lido por leitor de ecrã, certo. |
| M:516/520/534 | A FOLHA / A MENSAGEM / QUEM RECEBE | = | — |
| M:67 | {título ou Sem título} · {n} bloco(s), com fotografia e chamada. | = | Resumo que mostra. |
| M:530 | — ainda sem mensagem — | = | — |
| M:537 | {rótulo} — os nomes contam-se de novo de cada vez. | = | Repete-se de propósito onde a decisão se toma. |
| M:538 | Ainda sem regra — escolhe-se em cada comunicado que nascer daqui. | = | Vazio que diz o que acontece. |
| M:551 | Alterações só valem para envios novos. | = | A linha de doutrina (cópia, não ligação viva) — sempre visível, é lei. |
| M:150 | Não foi possível criar um comunicado deste modelo. Tente outra vez. | = | — |
| M:170 | Não foi possível apagar o modelo. Tente outra vez. | = | — |
| ★ M:568-569 | Um modelo de comunicado guarda o que se diz e a quem — nunca os nomes, o endereço ou as leituras. Esses nascem com cada comunicado. | CORTA | Terceira repetição da mesma doutrina no mesmo ecrã (cabeçalho + «Ver o que guarda» já a mostram); com cartões à vista, o rodapé é peso morto. |

## As datas (comunicadoTempo.js e quandoGuardada)

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| T:40-43 | {3 de agosto} (dataDita) | = | O dia por extenso, sem relógio. |
| T:46-52 | hoje / ontem / a {3 de agosto} (diaDito) | = | Tempo dito como a casa fala. |
| T:56-62 | hoje, {18:04} / ontem, {17:40} / {3 de agosto}, {17:40} (quandoDita) | = | Coluna compacta dos carimbos. |
| T:66-72 | hoje às {18:12} / ontem às {17:40} / a {3 de agosto} às {17:40} (quandoAs) | = | Quando a frase pede o «às». |
| TAB:61-75 | hoje às {15:42} / ontem às {15:42} / a {3/8/2026} às {15:42} (quandoGuardada) | = | Mesma gramática; a data numérica serve a linha densa da lista. |

## A biblioteca (lib/comunicados.js) — o que chega ao ecrã

| ficheiro:linha | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| LIB:99 | Esta folha tem história — leituras ou uma lista de envios. Retira-se; não se apaga. | = | Diz a razão E o gesto certo — princípio 8, sem gordura. |
| LIB:489 | Esta folha já tem uma lista fechada — desfaz o fecho antes de fechar de novo. | = | Razão + saída, uma frase. |
| ★ LIB:558 | O recorte não apanha ninguém — não há lista para fechar. | A escolha não apanha ninguém — não há lista para fechar. | «Recorte» está na lista negra e este erro aparece MESMO no ecrã, ao fechar a lista; «escolha» é a palavra de R:566 — uma voz (crítica: uniformizado entre lotes). |
| LIB:600 | O envio já começou — há conversas abertas ou envios marcados. O fecho da lista já não se desfaz. | O envio já começou — o fecho da lista já não se desfaz. | A enumeração do meio explica a máquina, não ajuda o gesto; metade das palavras chega. |
| LIB:754 | Nenhum ficheiro seleccionado. | = | Curto e claro. |
| LIB:756 | O ficheiro tem de ser uma imagem. | = | Diz o que fazer — escolher uma imagem. |
| LIB:908 | O modelo de comunicado precisa de um nome. | O modelo precisa de um nome. | Aparece dentro da gaveta «Guardar como modelo» — o contexto qualifica; alinha com GM:201, que já diz assim. |
| LIB:437 | o número registado não tem dígitos utilizáveis (porquê do FICA DE FORA) | o número registado não é utilizável | «Dígitos» é detalhe de máquina; «utilizável» é a palavra que o ecrã já usa (R:89, E:1447). Escapou aos lotes; acrescentado no varrimento. |
| LIB:439 | sem número na ficha nem nas respostas do evento (porquê do FICA DE FORA) | = | Igual, palavra a palavra, ao porquê de E:1467 — uma voz. Acrescentado no varrimento. |
| LIB:440 | sem número na ficha nem em nenhum evento (porquê do FICA DE FORA) | = | Idem, variante por contactos. Acrescentado no varrimento. |
| LIB:249 | (sem nome) | = | Falta honesta na lista, entre parêntesis — o padrão dos fantasmas do editor. Acrescentado no varrimento. |
| LIB:508/1023 | {tipo} · sem data marcada (âncora da linha) | = | Honesto onde a data falta. Acrescentado no varrimento. |
| LIB:984 | Vem de {março} de {2026}. A data ainda serve? (pergunta-padrão do «a rever») | = | Datada de quando o modelo se guarda, e editável — a pergunta certa no tom certo. Acrescentado no varrimento. |
| LIB:1143-1152 | Só clientes / Só interessados / Todos os contactos / {Casamentos} por vir / {Casamentos} passados / {Casamentos} — todos (rotuloDaRegra) | = | O rótulo da regra em todos os cartões — coincide, palavra a palavra, com os chips do Quem recebe. Acrescentado no varrimento. |
| LIB:113,879 | Nada para actualizar. | = | Guarda interna (whitelist vazia) — não chega ao ecrã em uso normal; fora da fronteira. |
| LIB:320,338,421,527,1041 | Janela inválida: … / Origem de recorte inválida: … | = | Guardas de programação, nunca mostradas à Nádia — fora da fronteira (o «recorte» aqui é nome de máquina, que fica quieto). |
| E:152-153 | A coluna no_portal ainda não existe (migração 085 por correr)… (console.warn) | = | Fala com o Hélio na consola, não com a Nádia — fora da fronteira. |

---

## O registo da crítica adversarial (o que mudou dos lotes para aqui)

1. **TAB:1112-1113 e TAB:518-521 — «leva» → «acompanha».** O lote 1 propunha «a mensagem que leva o endereço» para dizer o papel da mensagem; mas ME:251, GM:208, M:44 e E:1234 dizem todos «acompanha o endereço». Duas palavras para o mesmo objecto é o erro que o glossário proíbe. TAB:1112 volta a «=»; TAB:518 mantém o corte da repetição mas com «acompanha».
2. **LIB:558 + R:566 — «recorte»/«filtros» → «escolha».** O lote 1 dizia «esta escolha» e o lote 3 «os filtros» para a mesma coisa; «filtros» é também jargão de interface. Uniformizado: «escolha» nos dois sítios.
3. **CE:1578 — «Apagar?» → «Confirmar? O bloco sai.»** A proposta do lote 2 quebrava o padrão armado da casa («Confirmar? + consequência»: TAB:1690, TAB:630, E:730, E:1692, M:463). A correcção dá a consequência sem desalinhar a família — e dispensa o passe nos outros editores que o lote temia.
4. **ME:316 — dúvida resolvida.** O lote 2 condicionava a linha da difusão à existência do ecrã; o lote 3 confirma-o (E:1592-1709). A linha fica.
5. **CE:1252-1254 — afinada.** «A ordem faz o papel de cada bloco — a etiqueta de cada cartão di-lo» → «A ordem dá o papel a cada bloco — a etiqueta de cada cartão mostra-o» (mostrar, não dizer — princípio 5 até na palavra).
6. **TAB:1862-1863 — corte confirmado contra o glossário.** «Modelo» deve dizer-se qualificado, mas a regra serve a ambiguidade — e dentro do modal «Novo comunicado» não há nenhuma. O contexto qualifica; o corte fica.
7. **Varrimento de completude — 10 entradas novas** que os lotes deixaram escapar: R:383, R:401, LIB:437, LIB:439, LIB:440, LIB:249, LIB:508/1023, LIB:863-868 (a história do cartão do modelo, visível em M:402), LIB:984 (a pergunta-padrão do «a rever») e LIB:1143-1152 (o rótulo da regra que aparece em GM, M, E e TAB). Uma delas (LIB:437) pedia reescrita.
8. **pt-PT pré-acordo conferido** em todas as propostas: «aspecto», «actualizar», «seleccionado», «direcção» intactos nos originais; nenhuma proposta nova introduz grafia do acordo.

### Dúvidas que ficam para o dono (herdadas dos lotes, ainda de pé)

- **CE:1166 «Queridas clientes,»** — assume o feminino (como GM:398); a alternativa neutra é «Caros clientes,». Palavra final da Nádia.
- **Cortes apoiados na pré-visualização (CE:1244/1245, CE:1731, CE:1148, CE:1178)** — abaixo de 1240px a folha só se vê abrindo a gaveta; confirmar que a Nádia trabalha sobretudo em ecrã largo.
