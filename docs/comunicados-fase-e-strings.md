# FASE E — A folha pública (tabela única)

**O papel.** Content Designer de vitrina: as palavras servem a folha, não
competem com ela. O conteúdo é da Nádia; julga-se só a **moldura**.
**A régua.** Os 10 princípios + a regra dos pré-escritos de
`docs/comunicados-fase-e-briefing.md` (régua aprovada 09/08/2026), com as
quatro decisões do Hélio embutidas.
**A fronteira.** ComunicadoPage.jsx, os quatro estados. Fora: o conteúdo dos
comunicados, o backoffice, o desenho (salvo onde uma linha ACRESCENTA o exigir,
com mockup antes), o cartão OG, a mecânica das leituras.

**Estatísticas.** 25 linhas · **18 «=»** · **5 reescritas** · **2 ACRESCENTA**
(autorizados pelos princípios 4 e 7 — os únicos da fase, marcados) · 0 cortes.
Ao contrário da Fase D, esta fase acrescenta duas coisas — porque dois
princípios o exigem, e só por isso.

**A voz.** «comunicado» fora da folha aberta · «esta folha» dentro dela ·
«endereço» nunca sem âncora («que recebeu» / «enviado numa conversa») ·
terceira pessoa · pt-PT lusófono (sem «telemóvel»/«ecrã») · pré-escritos com a
voz da leitora (soar a pessoa, identificar a folha, descrever o que viu).

---

## ★ As mudanças que importam

1. **P:889** — «Não foi possível abrir o comunicado.» — a decisão 2 chega à
   cortina de erro (fora da folha aberta diz-se «comunicado»).
2. **P:890** — o corpo do erro corta a repetição do botão (decisão 3) **e a
   promessa que a página não pode cumprir** — esta segunda parte revê a frase
   que o Hélio aprovou na decisão 3: palavra dele nesta linha.
3. **ACRESCENTA A** — a cortina de erro ganha a MESMA saída da cortina de
   endereço morto (cápsula WhatsApp com pré-escrito próprio + linha do
   domínio), autorizada pelos princípios 4 e 10. O desenho copia a cortina
   morta peça por peça; mockup antes do código, se o Hélio o pedir.
4. **P:306** — o pré-escrito da cortina morta passa a contar o que a leitora
   VIU, com a voz dela — e deixa de induzir a Nádia em despiste técnico («não
   abre» descrevia sempre o estado errado: a página abriu e mostrou a cortina).
5. **P:775** — o pré-escrito do rodapé identifica a folha pelo título — com
   várias folhas no ar, a Nádia deixa de ter de perguntar «qual?».
6. **P:423** — `alt=""` na imagem com legenda visível (decisão 4).
7. **ACRESCENTA B** — no papel, o rodapé ganha o número da casa à vista
   (princípio 7: a frase impressa tem de funcionar sem toque). Só na
   impressão; no ecrã nada muda. Mockup antes do código.

Legenda: **=** fica como está · **ACRESCENTA** novo, autorizado por princípio,
aprovação expressa · ★ mudança das mais importantes. Caminho: P
`src/pages/ComunicadoPage.jsx` (linhas de hoje; a aplicação localiza pelo texto
exato, nunca pelo número).

---

## A — Todos os estados (marca, esqueleto, separador)

| onde | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| P:192 | Do Luxo à Mesa (alt do logo = `EMPRESA.designacao`) | = | A prova de casa (princípio 10); constante partilhada — portão próprio. |
| P:208 | Decoração e aluguer para eventos (`LINHA_ACTIVIDADE`) | = | Situa em cinco palavras; só o espelho do editor a acompanha. |
| P:791-833 | (o esqueleto não tem texto — blocos `aria-hidden`; falam só o logo e a linha de actividade) | = | **Decisão registada:** silêncio de propósito — a carga é curta, a marca já diz onde se está, e nunca acrescentar (princípio 9). |
| P:880 | Do Luxo à Mesa (título do separador nos estados sem folha = `EMPRESA.designacao`) | = | Neutro e verdadeiro em qualquer estado; constante partilhada — portão próprio. |

## B — As cortinas (peça comum)

| onde | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| P:264 | COMUNICADO | = | Overline de cerimónia; nomeia o que a leitora procurava (decisão 2: fora da folha, «comunicado»). |

## C — A cortina de erro

| onde | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| ★ P:889 | Não foi possível abrir a folha. | Não foi possível abrir o comunicado. | Decisão 2: fora da folha aberta diz-se «comunicado». |
| ★ P:890 | Verifique a ligação à internet e tente novamente. O endereço que recebeu continua válido. | Verifique a ligação à internet. | Decisão 3 corta a repetição do botão; e «continua válido» jura o que a página não sabe — se a folha entretanto terminou, a cortina seguinte desmentia-a (princípio 6). **Revê a 2.ª frase aprovada — palavra do Hélio.** |
| P:295 | Tentar novamente | = | Diz o que fazer; o padrão da casa. |
| ★ ACRESCENTA A | (a cortina de erro termina hoje no botão — sem WhatsApp, sem domínio) | A mesma saída da cortina de endereço morto, por baixo do botão: cápsula «Falar pelo WhatsApp» com pré-escrito próprio — «Olá! Tentei abrir um comunicado da Do Luxo à Mesa e não consegui.» — e a linha «E se procura a Do Luxo à Mesa, está em doluxoamesa.pt.» | Princípios 4 e 10: a saída e a prova de casa sempre à vista — se o erro for do lado da casa, o WhatsApp é o único caminho; hoje a leitora fica num beco. Desenho copiado da cortina morta; mockup antes, se o Hélio o pedir. |

## D — A cortina de endereço morto

| onde | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| P:902 | Não há nenhum comunicado neste endereço. | = | Nunca diz «já» — não confirma nem desmente (princípio 5); e já diz «comunicado» (decisão 2). |
| P:903 | Se este endereço lhe foi enviado numa conversa, peça um novo a quem o enviou. | = | A âncora do «endereço» está lá; funciona a três reencaminhamentos de distância — aponta sempre ao remetente imediato. |
| ★ P:306 | Olá! Recebi um endereço de uma folha da Do Luxo à Mesa, mas não abre. | Olá! Abri o endereço que me enviaram e diz que não há nenhum comunicado da Do Luxo à Mesa. | Regra dos pré-escritos: a voz da leitora a contar o que VIU (as palavras da própria cortina) — «não abre» descrevia o estado errado e mandava a Nádia despistar um problema técnico que não existe; «endereço» com âncora («que me enviaram»), «comunicado» pela decisão 2. |
| P:312 | Falar pelo WhatsApp | = | Nomeia o gesto e o sítio; três palavras. |
| P:316-317 | E se procura a Do Luxo à Mesa, está em doluxoamesa.pt. | = | A prova de casa e a porta para o resto (princípio 10); o domínio é constante partilhada. |

## E — A folha activa

| onde | ANTES (texto exacto) | DEPOIS | porquê (UMA linha) |
|---|---|---|---|
| P:604 | Imprimir / Guardar PDF | = | Honesto quanto ao mecanismo; diz os dois nomes do mesmo gesto. |
| P:635 | COMUNICADO (fallback da overline do cartão) | = | Na oferta com subtítulo, a overline é conteúdo da Nádia e não se julga; o fallback é a palavra certa. |
| P:574 + P:878 | {título} — Do Luxo à Mesa (o molde do separador e do nome do PDF na folha activa; sem título, «Comunicado — Do Luxo à Mesa») | = | O molde compõe título + travessão + casa, e o nome de reserva «Comunicado» é digno; a MESMA composição nos dois pontos — a aplicação confere ambos. |
| P:746 | Com carinho, (`ASSINATURA_FOLHA.despedida`) | = | A assinatura é cerimónia, não gordura (o papel da vitrina); o espelho do editor acompanha. |
| P:749 | Do Luxo à Mesa (`ASSINATURA_FOLHA.nome`) | = | Idem. |
| P:760 | DOLUXOAMESA.PT (`DOMINIO_CASA.toUpperCase()`) | = | A prova de casa impressa em todas as folhas (princípio 10); constante partilhada — portão próprio. |
| P:773 | Alguma questão sobre esta folha? | = | Decisão 2: dentro da folha aberta, «esta folha» — a leitora está a segurá-la. |
| ★ P:775 | Olá! Escrevo sobre uma folha da Do Luxo à Mesa. | Olá! Escrevo sobre a folha «{título}» da Do Luxo à Mesa. — e, se a folha não tiver título, fica como está | Regra dos pré-escritos: identificar a folha que a página conhece; com várias folhas no ar, poupa à Nádia o «qual?» e à leitora o repetir-se. |
| P:778 | Fale connosco pelo WhatsApp | = | Ao toque, a ligação diz o que faz; o ponto final fecha fora dela (P:780). |
| ★ ACRESCENTA B | (no papel, «Fale connosco pelo WhatsApp» imprime-se como convite morto — sem número) | Só na impressão, a mesma linha ganha o número da casa à vista (a constante do WhatsApp de `casa.js`); fora do papel nada muda. | Princípio 7: toda a frase que sobrevive à impressão funciona sem toque — o fornecedor que recebe a folha em papel tem de conseguir responder ao convite. Mockup antes do código. |
| ★ P:423 | `alt={peca.legenda \|\| ""}` (a legenda lê-se duas vezes no leitor de ecrã) | `alt=""` — a legenda visível é a única voz da imagem | Decisão 4 (princípio 8): ouvir o mesmo texto duas vezes é ruído, não dignidade. |

---

## O que a tabela NÃO toca, dito

- Os títulos, subtítulos, saudações e blocos — conteúdo da Nádia.
- A overline da oferta com subtítulo — é o subtítulo dela (conteúdo).
- Os svgs decorativos — já estão `aria-hidden`, certos.
- A numeração romana das cláusulas (`{peca.num}`, P:351) — numeração de
  máquina derivada por `comporFolha`, como os svgs: certa e fora.
- As duas constantes com portão próprio (`EMPRESA.designacao`,
  `DOMINIO_CASA`/`SITE_URL`) — julgadas «=», e ainda que um dia mudem, é
  noutra mesa.
- O comentário de código das linhas 874-875 (descreve mal o terceiro contexto
  do título) — comentário não é string de ecrã; anota-se aqui e corrige-se de
  borla quando a linha P:880 for mexida, se for.

*Tabela de 09/08/2026. **Aprovada linha a linha pelo Hélio no mesmo dia,
incluindo as três ★** (P:890, ACRESCENTA A, ACRESCENTA B) — e aplicada:
verificação palavra a palavra (7 DEPOIS presentes, ANTES retirados, fallback
do pré-escrito sem título mantido), varrimento limpo (lista negra pública +
lei lusófona), portão esbuild ✓ eslint ✓ build ✓. Antes da aplicação, um
verificador independente conferiu 23/23 ANTES ao carácter e as contagens.*
