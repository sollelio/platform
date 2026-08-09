# FASE E — A folha pública (briefing próprio)

**O que isto é.** O briefing da última fase dos comunicados: o passe de Content UX
sobre a ComunicadoPage — a folha que as clientes abrem em `/comunicado/:token`.
**A régua foi aprovada pelo Hélio a 09/08/2026**; depois da aprovação passou por
um painel de três críticos (fidelidade · completude · leitora) e as emendas que
sobreviveram estão integradas — e listadas em «O que a crítica mudou», no fim,
para que nada tenha mudado às escondidas. A tabela linha a linha vive em
**docs/comunicados-fase-e-strings.md** e é ela que se aprova antes de qualquer
código.

**Porquê um briefing próprio (a decisão de 09/08/2026).** A Fase D julgou 368
strings com uma régua afinada para a Nádia: operadora, ecrã largo, treinada pelo
percurso, a trabalhar. A folha pública tem outro leitor — e por isso precisa de
outra régua. Este briefing é essa régua.

---

## O leitor

Quem abre a folha não é a Nádia — é a cliente dela, e a cadeia de quem ela
reencaminha: os noivos, o espaço, a wedding planner, os fornecedores. Lê UMA
vez, no telefone, sem contexto nenhum: recebeu um endereço numa conversa e
tocou-lhe. Não conhece a app, não conhece o vocabulário da casa, não volta para
aprender. E — o registo da vitrina — está emocionalmente investida: a folha é a
cara da Do Luxo à Mesa no telefone dela.

Três consequências:

- **Carga cognitiva zero não chega: é preciso dignidade.** O critério da
  vitrina é deslumbre por atmosfera, nunca ruído (identidade-visual, «Os dois
  registos»).
- **Nenhuma palavra de bastidor sobrevive.** A lista do que «quem chega» nunca
  lê é do glossário: aspecto, Sóbrio/Convidativo, quem recebe, fechar a lista,
  Envios, retirar, dispensar, modelo — e todo o vocabulário abandonado e de
  máquina.
- **Os estados difíceis são os mais importantes.** Quem cai numa cortina (erro
  de rede, endereço morto) é quem pior conhece a casa — e é o momento em que a
  casa mais se mostra.

## O papel

Content Designer de vitrina: as palavras servem a folha, não competem com ela.
O conteúdo é da Nádia (título, subtítulo, saudação, blocos) — a Fase E só toca
na **moldura**: a marca, as cortinas, o esqueleto, a cápsula de imprimir, a
assinatura, o rodapé, os textos pré-escritos do WhatsApp, os títulos do
separador e do PDF. Cortar continua a ser a régua — mas na vitrina a cerimónia
tem direito ao seu espaço: «Com carinho,» não é gordura, é assinatura.

## A fronteira

**Entram:**

- as strings dos quatro estados da página: esqueleto, cortina de erro, cortina
  de endereço morto, folha activa (moldura: marca, cápsula de imprimir,
  overline, assinatura, rodapé de contacto). Duas notas de precisão: a
  **overline da folha** julga-se só no fallback «COMUNICADO» — na oferta com
  subtítulo, a overline é o subtítulo da Nádia (conteúdo, não moldura); e a
  linha «E se procura a Do Luxo à Mesa…» existe **só na cortina de endereço
  morto** — as duas cortinas não são simétricas, e a tabela julga essa
  assimetria;
- os dois textos pré-escritos do WhatsApp (o da cortina e o do rodapé);
- o título do separador nos três contextos: folha activa, impressão/nome do
  PDF (incluindo o fallback «Comunicado» quando a folha não tem título), e os
  restantes estados — onde o título é `EMPRESA.designacao`, constante
  partilhada;
- os `alt` e `aria` que um leitor de ecrã lê — são texto. O esqueleto não tem
  voz nenhuma (blocos `aria-hidden`, sem anúncio de carregamento): a tabela
  regista essa decisão por escrito, em vez de a deixar omissa.

**Não entram:**

- o conteúdo dos comunicados — é da Nádia;
- o backoffice — Fase D fechada ✓;
- o desenho da folha — a identidade visual é lei estabelecida; mudança visual
  só se uma string aprovada o exigir, e com mockup antes (regra da casa);
- as constantes de `casa.js` **que alastram de facto**: a designação
  (`EMPRESA.designacao`, usada em ~20 superfícies — exports, contratos,
  portal) e o domínio (`DOMINIO_CASA`/`SITE_URL`, usados no portal e no
  MensagemEditor) — a fase julga-as na tabela mas não as muda sem portão
  próprio. Já `ASSINATURA_FOLHA` e `LINHA_ACTIVIDADE` só têm um outro
  consumidor: a pré-visualização do ComunicadoEditor, que existe para espelhar
  a folha e acompanha por definição — essas entram na tabela normalmente;
- o cartão OG do WhatsApp — decisão registada: estático e igual para todas as
  folhas, até fazer falta;
- a mecânica da contagem de leituras — produto, não texto (ver «Fora da fase,
  anotado»).

## A régua (os princípios da Fase E)

1. **A leitora não conhece a casa.** Nenhuma palavra de bastidor chega ao ecrã
   — a lista negra pública do glossário é lei. (Herda o princípio 4 da Fase D,
   com a lista da vitrina.)
2. **Uma palavra, um trabalho — dentro do mesmo ecrã.** Hoje a página diz
   «comunicado» na overline e «folha» no rodapé, no erro e nos pré-escritos. O
   glossário dá as DUAS a quem chega; o que não pode é a mesma peça alternar
   sem regra. (→ decisão 2, decidida)
3. **Terceira pessoa, pt-PT lusófono, calma.** «Receberá», «se precisar»;
   nunca «você» explícito, nunca pt-BR — e grafia portuguesa com vocabulário
   que todo o espaço lusófono entende: sem «telemóvel», sem «ecrã»
   (identidade-visual §6 · Escrita — a lei que nasceu para a vitrina). Aspas
   angulares; frases completas e serenas.
4. **Os estados difíceis têm a dignidade da casa.** Frase serena — overline +
   título + linha de ajuda — sem culpar a leitora nem quem lhe enviou; e a
   saída (o WhatsApp da casa, o domínio) sempre à vista. Hoje a cortina de
   erro não a tem: este princípio **autoriza expressamente essa única adição**
   — a mesma saída da cortina de endereço morto, com o desenho copiado dela.
5. **Não confirmar nem desmentir.** A cortina de endereço morto não distingue
   «nunca existiu» de «foi retirada» de «expirou» — está certo assim, e as
   palavras têm de continuar a proteger essa indistinção (nunca dizer «já»).
6. **Mostrar em vez de dizer — e prometer só o que a página sabe.** O corpo
   não repete o botão; a instrução não descreve o que o gesto já diz; e
   nenhuma frase jura o que o estado seguinte pode desmentir. (→ decisões 3 e
   1, decididas)
7. **O que se imprime também fala — e no papel ninguém toca.** O nome do PDF e
   o título do separador são strings de ecrã e julgam-se como as outras; e
   toda a frase que sobrevive à impressão tem de funcionar sem toque — um
   «Fale connosco pelo WhatsApp» impresso é um convite morto sem o número à
   vista.
8. **A voz que se ouve também conta.** `alt` e `aria` são texto: a legenda não
   se lê duas vezes; o decorativo cala-se. (→ decisão 4, decidida)
9. **Nem uma palavra de ornamento a mais.** O passe corta e uniformiza; só se
   acrescenta o que outro princípio exigir (a saída do 4, a prova do 10, o
   número do 7) — e cada acrescento vem marcado na tabela como ACRESCENTA,
   para aprovação expressa.
10. **A folha prova quem é e nunca pede nada.** A marca e o domínio da casa
    visíveis em todos os estados; nenhuma frase pede dados, cria urgência ou
    promete o que a casa não controla. É o princípio que responde à primeira
    pergunta de quem abre um endereço desconhecido — «isto é mesmo da Do Luxo
    à Mesa, e é seguro tocar?»

**A regra dos pré-escritos.** As duas mensagens pré-escritas do WhatsApp são a
única peça onde a página fala com a voz da **leitora** — a mensagem sai como se
fosse ela a escrevê-la. Três leis: soa a pessoa, não a guião; identifica a
folha quando a página a conhece (o título); e descreve o que ela **viu**, nunca
o que o sistema fez — sempre dentro do princípio 5 (descrever a cortina está
bem; «expirou»/«foi retirada», nunca).

## As quatro decisões reservadas — decididas ✓ (09/08/2026, palavra do Hélio)

1. **«endereço» mantém-se.** Uma palavra, um trabalho: «endereço» é o da
   folha, «ligação» é a da internet. (É a palavra da casa desde a fase 1 dos
   comunicados, 04/08, e faz parte da voz única fixada na Fase D.) Regra de
   aplicação da tabela: «endereço» nunca aparece sem a âncora de contexto
   («que recebeu», «enviado numa conversa») — sem ela, pode ler-se como
   morada. Nos pré-escritos, a palavra contorna-se: a leitora descreve o que
   lhe aconteceu, como o diria.
2. **Coabitação comunicado/folha.** Fora da folha aberta (cortinas e o
   pré-escrito da cortina) diz-se «comunicado» — é o que a leitora procurava;
   dentro da folha aberta (rodapé e o seu pré-escrito) pode dizer-se «esta
   folha» — ela está a vê-la. Regra escrita, aplicada sempre. (A cortina de
   erro diz hoje «abrir a folha» e o pré-escrito «uma folha» — a tabela
   corrige ambos.)
3. **O corpo do erro corta a repetição do botão.** Decidido. Nota da crítica,
   depois da decisão: a segunda frase aprovada («O endereço que recebeu
   continua válido.») jura o que a página não pode saber — se a folha
   entretanto terminou, a cortina seguinte desmente-a. A tabela propõe cortar
   também essa promessa (princípio 6); **palavra do Hélio na linha.**
4. **O `alt` da legenda entra no passe.** `alt=""` quando a legenda visível
   existe — ouvir o mesmo texto duas vezes no leitor de ecrã é ruído, não
   dignidade.

## O método (o mesmo pré-acordo da Fase D)

1. Levantamento completo das strings da moldura numa tabela única — ANTES
   (texto exato) / DEPOIS / porquê em UMA linha — com as quatro decisões
   embutidas. O levantamento fechou em **25 linhas**
   (docs/comunicados-fase-e-strings.md).
2. Aprovação da tabela linha a linha. Só depois o código.
3. Aplicação por localização do texto exato (nunca por número de linha);
   verificação palavra a palavra; varrimento final da lista negra pública **e
   da lei lusófona** (identidade-visual §6).
4. Portão da casa: esbuild + eslint + build, sempre os três. Sem commit — o
   git é do Hélio.

## O sequenciamento com a 085

A página já lê a saudação com guarda — compõe sem ela se a coluna ainda não
chegou, nunca crasha — e a Fase E não toca nesse contrato. A ordem registada
mantém-se: 084 → 085 perto do deploy do código da Fase C (janela curta em que a
folha compõe sem saudação, de propósito). A Fase E embarca no mesmo deploy ou
vem depois; nunca obriga a migração a antecipar-se nem alarga a janela.

## Fora da fase, anotado

- **Cada «Tentar novamente» que chega a abrir a folha, e cada reabertura,
  contam +1 leitura.** A RPC conta por chamada bem-sucedida numa folha no ar
  (o estado terminado devolve antes do incremento), sem deduplicação de
  leitores, de propósito — a folha não leva dados pessoais. Não é texto; se
  algum dia doer no número que a Nádia lê, é decisão de produto própria.
- **O cartão do WhatsApp** continua estático e igual para todas as folhas
  (decisão registada); a variante por comunicado fica anotada para quando
  fizer falta.

## O que a crítica mudou (depois da aprovação da régua)

O painel correu depois do «aprovo a régua» — em rigor de método, o que mudou
fica listado, e a aprovação da tabela cobre-o linha a linha:

1. O princípio 3 ganhou a **lei lusófona** (identidade-visual §6) — lei da
   casa já registada, que faltava na régua; entrou também no varrimento final.
2. O princípio 4 **autoriza expressamente a saída na cortina de erro** — antes
   prometia-a sem dizer que a página não a tem e que o 9 proibia acrescentá-la.
3. O princípio 6 ganhou «prometer só o que a página sabe» — e daí a nota à
   decisão 3 (a promessa «continua válido»), que fica para a palavra do Hélio
   na tabela.
4. O princípio 7 alargou-se ao papel: toda a frase impressa funciona sem toque.
5. O princípio 9 deixou de ser absoluto: só se acrescenta o que outro
   princípio exigir, sempre marcado como ACRESCENTA na tabela.
6. Nasceram o **princípio 10** (a folha prova quem é e nunca pede nada) e a
   **regra dos pré-escritos** (a única voz que é da leitora: soar a pessoa,
   identificar a folha, descrever o que viu).
7. Precisões de facto: «endereço» é da fase 1 (04/08), não da Fase A; a
   contagem da moldura fechou em 25 linhas na tabela; a lista de constantes
   partilhadas ganhou o domínio e perdeu a assinatura e a linha de actividade
   (só o espelho do editor as consome); a contagem de leituras só incrementa
   em folha no ar.

---

*Régua aprovada a 09/08/2026; crítica integrada no mesmo dia. Segue-se a
aprovação da tabela (docs/comunicados-fase-e-strings.md), linha a linha — e só
depois o código.*
