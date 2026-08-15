# 100 · A casa desconhecida

## O contexto

A 099 pôs a identidade a viajar da base até ao ecrã. Funciona quando há
casa. Falta o outro caso: quando não há.

Quando a identidade não chegava, a página desenhava-se com a identidade
da **primeira** casa — o `CASA_OMISSAO` do `casa.js`, que é a Do Luxo à
Mesa. Com uma casa é invisível, porque a omissão e a verdade são a mesma
coisa. Com duas deixa de ser.

**Ler primeiro:** `docs/migracoes/100_a_desconhecida_nao_empresta_marca.sql`
(já corrida em test e em produção) e a secção da 099 em
`docs/decisoes-de-produto.md`.

> **O SQL está feito.** A migração 100 já correu. Este documento
> descreve o que sobra, que é tudo do lado do frontend.

---

## 1 · Quatro perguntas diferentes, uma única resposta

`identidade_por_token` devolvia SQL NULL em quatro situações sem relação
nenhuma umas com as outras. A 100 separou-as, e **não do modo que
parecia óbvio**:

| situação | antes (098) | depois (100) |
|---|---|---|
| **nunca existiu** — endereço mal escrito ou inventado | `null` | `{"estado":"desconhecida"}` |
| **existiu e morreu** — revogado, expirado, retirado, campanha fechada | `null` | **`{"estado":"conhecida", "casa":{…}}`** |
| **a casa está fechada** — `suspenso` ou `encerrado` (090) | `null` | `{"estado":"desconhecida"}` |
| **não deu para perguntar** — rede em baixo, RPC rebentada | `null` | sem resposta — distinta das outras |

A segunda linha é o delta que importa e é contra-intuitivo: a 100
**tirou** os filtros de validade de dentro do `identidade_por_token`.
Um token morto continua a estar na base, e sabe-se de quem é — logo a
casa é conhecida e a marca fica. O raciocínio está escrito no SQL: um
prazo terminado é o acesso que acabou, não a casa que desapareceu, e a
página que diz «isto terminou» é mais humana com o nome deles do que
sem.

Isso arruma o caso que deu origem a esta pendência. Um link morto da
casa B deixa de mostrar a casa A — passa a mostrar a **casa B**, que é
de quem ele é. Não foi preciso apagar marca nenhuma para o resolver.

### O que sobra a doer

Sobram a primeira e a terceira linha, e a terceira é a menos óbvia das
quatro: uma casa que passe a `suspenso` não fica às escuras — ficava
**com a cara de outra**. Todos os tokens dela continuam a abrir e todos
mostravam a Do Luxo à Mesa. É o modo de falhar que ninguém testa, porque
só acontece no dia em que alguém deixa de pagar.

O custo, em concreto: nas duas cortinas com saída — a do comunicado e a
do portal — a única coisa clicável é o WhatsApp da casa, e por baixo «E
se procura a X, está em X.pt». Mandar uma pessoa falar com a casa errada
não é marca errada num rodapé; é o produto a encaminhá-la para outro
sítio.

---

## 2 · A porta diz o que sabe. O lado de cá tem de a ouvir ✅ FEITO

A pendência ficou escrita como «pede que a porta distinga *não sei* de
*não existe*». A porta já distingue — as funções da 100 devolvem
`{estado, casa}`:

```
identidade_da_casa_por_slug('doluxoamesa')  → {"casa":{…},"estado":"conhecida"}
identidade_por_token('nada-disto-existe')   → {"estado":"desconhecida"}
```

**Confirmado contra o ambiente `test`** (`VITE_APP_ENV=test`) pelas
quatro portas: slug, token, código e a da sessão.

O que faltava era do lado de cá, e eram dois defeitos:

1. **O envelope não estava a ser desembrulhado.** O `pedir()` devolvia o
   `data` inteiro e o `comOmissao()` espalhava-o — `{...CASA_OMISSAO,
   casa, estado}` — portanto *todos* os campos caíam na omissão e a
   aplicação ignorava a identidade da base por completo. Invisível com
   uma casa, e por isso capaz de ir para produção assim.
2. **O `CasaProvider` chamava um `SEM_CASA` que não existia** —
   `no-undef`, um `ReferenceError` à espera da primeira resposta
   `desconhecida`.

Ambos corrigidos. O `pedir()` passa a devolver **três** respostas
explícitas, e nenhuma se infere de `null`:

| resposta | quando |
|---|---|
| `{estado:"conhecida", casa}` | a porta respondeu e há casa |
| `{estado:"desconhecida"}` | a porta respondeu e não há |
| `{estado:"sem-resposta"}` | rede, RPC rebentada, envelope irreconhecível, ou nem se chegou a perguntar |

A quarta linha junta de propósito «falhou» com «não perguntei» (o
formulário aberto sem `?codigo=`): as duas querem a mesma coisa —
manter o que já lá está. E um envelope de forma inesperada cai aí, e
nunca em `desconhecida`: apagar a marca por causa de uma porta que ficou
por migrar seria destruir exactamente o que se quer proteger.

**Nota para o varrimento:** a `formulario_validar_convite` é a excepção.
A 100 embutiu-lhe a identidade na chave `casa`, mas **crua, sem
envelope** (chama a `identidade_da_casa`, não a `identidade_conhecida`).
Quem a consumir não pode esperar `{estado, casa}`.

---

## 3 · Quando não há casa, não se veste a de outra — nem a nossa

O `casa.js` já tinha isto escrito, e a 100 é o dia de o cumprir:

> A DO LUXO À MESA CONTINUA AQUI, como omissão. (…) Quando entrar a
> segunda casa, estes valores mudam para os da Sollelio e deixam de
> nomear ninguém — mas isso é o dia da segunda casa, não hoje.

A correcção óbvia seria trocar os valores da omissão pelos da Sollelio.
**Não chega, e para as páginas públicas está errada.** Quem abre uma
ligação de um endereço que não existe não tem nada que aprender sobre a
Sollelio, e pôr-lhe a marca do produto à frente é usar o desapontamento
dela como montra. A Sollelio é o nome que se vê por dentro (o
`TITULO_BACKOFFICE`), não o que se veste à porta.

**A regra são três estados e não dois:**

| estado | o que se desenha |
|---|---|
| conhecida | a casa — mesmo que o acesso tenha terminado |
| sem resposta | a de antes — o cabeçalho de ontem, e está certo |
| **desconhecida** | **nenhuma.** A moldura despe-se |

«Despe-se» é literal, e tem de ser dito ecrã a ecrã: sem logótipo, sem
nome, sem linha de actividade, sem slogan, sem domínio, sem WhatsApp,
sem assinatura. A cortina diz o que tem a dizer — que ali não há nada —
e **não oferece saída nenhuma**, porque não sabe para onde havia de
mandar a pessoa. Uma saída para o sítio errado é pior do que nenhuma.

⚠ **A quem isto se aplica, depois da 100:** a `desconhecida` são só dois
casos — o **endereço que nunca existiu** e a **casa suspensa ou
encerrada**. O token morto de uma casa viva **não** entra aqui: tem
casa, fica com ela, e a cortina dele mantém o WhatsApp. A moldura nua é
o caso raro, não o comum.

O que **não** muda: dentro do admin há sempre sessão e sempre casa; se a
`identidade_da_minha_casa` devolver `desconhecida` ali, isso é uma
sessão sem casa — um erro a tratar, não um estado a desenhar. E as
folhas impressas continuam a cair na omissão, porque quem as imprime
está autenticado e é da casa.

---

## O estado de hoje, e porque é que ainda não está ligado

O `CasaProvider` já distingue as três respostas, mas a `desconhecida`
**ainda mantém a identidade anterior** — o comportamento errado. Está
assim de propósito, e o comentário no ficheiro di-lo: ligar a marca
vazia sem preparar os ecrãs troca «marca errada» por «página partida».
As funções derivadas do `casa.js` pressupõem todas que há casa —

- `siteDe(casa)` → `https://null`
- `linkWhatsAppCasa(casa)` → `https://wa.me/null`
- `numeroLegivel(casa)` → **rebenta** (`.slice` de null)
- `logoDe(casa)` → cai no logótipo do repositório, que é o da 1.ª casa
- `assinaturaFolha/Publica/Titular`, `rodapeMarcaOrcamento` → texto com
  buracos

— e `<img src={null}>` faz o browser pedir a própria página.

---

## 4 · O varrimento

Três degraus, por esta ordem. Cada um deixa a aplicação inteira e
verde; nenhum depende de o seguinte estar feito.

### 4.1 · As funções derivadas ficam honestas ✅ FEITO

Antes dos ecrãs, porque são elas que os ecrãs vão consultar. Todas
devolvem `null` quando lhes falta o campo de que precisam, em vez de
compor à mesma:

| função | sem o campo, antes | agora |
|---|---|---|
| `logoDe` | logótipo do repositório — o da 1.ª casa | `null` |
| `siteDe` | `https://null` | `null` |
| `linkWhatsAppCasa` | `https://wa.me/null` | `null` |
| `numeroLegivel` | **rebentava** (`.slice` de null) | `null` |
| `assinaturaFolha` | `{despedida, nome: null}` | `null` |
| `assinaturaPublica` / `assinaturaTitular` | `"null"` no ecrã | `null` |
| `rodapeMarcaOrcamento` | `X | By undefined` | `null` |
| `TITULO_BACKOFFICE` | `Celebra — null` | `Celebra` |

Duas decisões dentro deste degrau:

- **A guarda é sobre o CAMPO, não sobre «há casa».** Uma regra só serve
  os dois casos: o endereço que não é de ninguém e a casa real a que
  falta o MB Way ou o foro — que a 097 sempre admitiu e que até aqui
  imprimia `undefined` no papel.
- **`SEM_CASA` deriva das chaves da omissão**, em vez de ser escrita à
  mão. Um campo novo na omissão, esquecido lá, voltaria a cair na casa
  errada em silêncio.

O `logoDe` é o único que não pode guardar pelo campo — `logo_url: null`
diz «esta casa não carregou logótipo», não «não há casa». Guarda pelo
`haCasa()`, que pergunta pelo nome.

**Este degrau é neutro no comportamento de hoje.** Enquanto o `SEM_CASA`
não estiver ligado, a casa é sempre a omissão ou uma casa real, e ambas
têm nome, domínio e WhatsApp: nenhuma das funções muda de resposta.
Verificado campo a campo.

### 4.2 · Os ecrãs ✅ FEITO

Onde a regra é clara, aplica-se: **o nulo apaga o ELEMENTO, não só o
valor**. Um `href={null}` ainda navega para a própria página e um
`<img src={null}>` faz o browser pedi-la — não basta passar o nulo
adiante.

| ecrã | superfície | o que fazer |
|---|---|---|
| `ComunicadoPage` · `Marca` | `<img>` do logo, `alt`, overline da linha de actividade | sem logo, o `<img>` não se desenha; a overline sai com ela |
| `ComunicadoPage` · `Cortina` | cápsula do WhatsApp | não se desenha sem link |
| `ComunicadoPage` · `Cortina` | «E se procura a X, está em X.pt» | a frase inteira sai sem domínio |
| `ComunicadoPage` · `Folha` | assinatura, domínio em versaletes, nº no papel | cada bloco sai com o seu nulo |
| `PortalPage` · `Cortina` | WhatsApp, `siteDe`, domínio | já tem ramo alternativo escrito para quando não há WhatsApp — usa-se |
| `PortalPage` | `LogoDourado` | não se desenha |
| `ContribuirPage` | rodapé com o nome | sai |
| `pecas.jsx` · `Assinatura` | `assinaturaPublica` | o `<p>` inteiro sai |
| `documentos-pecas.jsx` · `Timbre` | `<img>` do logo | não se desenha |
| `DocumentosVista` | logo do rodapé, cápsulas de WhatsApp | saem |
| `SinalVista` | `linkWhatsAppCasa`, MB Way e IBAN da casa | a conversa sai; os dados de pagamento **já** têm ramo para «não configurado» |
| `LogoDourado` | o componente inteiro | devolve `null` quando não há logótipo |
| admin (`Gerar*`, editores, `Navegacao`) | logos e rodapés | mesma regra, por segurança — mas ali há sempre casa |

**O `document.title`** aparece em cinco sítios com a forma
`«… — {casa.nome}»`. Sem nome, fica só a primeira metade. Não é texto
novo, é a mesma frase sem o sufixo.

### 4.3 · Ligar o `SEM_CASA` ✅ FEITO

Uma linha no `CasaProvider`: a resposta `desconhecida` passa a
`setCasa(SEM_CASA)` em vez de manter a anterior. Só depois de 4.2, e é
o degrau que torna tudo o resto visível.

Testa-se sem base de dados: um endereço inventado
(`/comunicado/nada-disto-existe`) devolve `desconhecida` de verdade — é
o caminho real, não uma simulação.

---

## As decisões de voz — respondidas (15/08/2026)

A voz da casa está fixada em `docs/comunicados-fase-e-strings.md` e não
se inventa a meio de uma migração técnica. Quatro sítios precisavam de
decisão; as respostas estão aqui, e o código já as cumpre:

1. **A `LoginPage` veste o PRODUTO no título**, e nada mais. O nome vem
   de `VITE_NOME_PRODUTO` (hoje «Celebra») — variável de ambiente e não
   constante cravada, porque o nome ainda não está decidido: a marca já
   está registada por outros em Portugal e no Brasil. A linha de marca e
   o slogan são da CASA e caem: emprestá-los ao produto seria a mesma
   mentira em sentido contrário.
2. **`FormEntryPage` e `FormPage` não desenham o `<h1>`** sem casa. O
   que a página é diz-se logo abaixo — «Formulário do Evento», ou o tipo
   de evento — e um título vazio só abriria um buraco no desenho.
3. **A `CaptacaoPage` com slug inventado não abre o formulário.** Aqui a
   moldura nua não chegava: esta página não informa, RECOLHE — deixá-la
   aberta era pedir nome, telefone e data de casamento para lado nenhum,
   com a pessoa a acreditar que os entregou a alguém. Cortina a dizer
   que o endereço não corresponde a nenhuma empresa, sem saída.
4. **As cortinas ficam como estão.** A do comunicado e a do portal
   funcionam sem saída tal como já estavam escritas — o portal até já
   tinha o ramo alternativo para quando não há WhatsApp.

### A regra do nome dentro de uma frase

Um `<h1>` sem nome desaparece com o elemento. Uma FRASE não pode: levava
a frase inteira com ela, e numa template string o `null` imprime-se por
extenso («Avisar a null»). Por isso o `nomeDaCasa(casa)` cai em
**«casa»** — que não é palavra nova, é a que o portal já usa quando não
a nomeia: «pela casa», «as condições da casa», «quem é da casa».

Dois sítios não aceitaram a substituição:

- `«Entre X e Maria»`, no contrato — ali o nome é uma das PARTES, e não
  há palavra neutra que o substitua. Sem nome, a linha sai inteira.
- `«Se ainda quiser a X no seu evento»`, na SinalVista — reescrita para
  **«Se ainda quiser contar connosco no seu evento»**. O «connosco»
  dispensa o nome, e é o padrão a preferir daqui em diante para as
  frases que se referem à casa dentro do texto corrido: a voz em vez da
  etiqueta.

---

## O portão (regra da casa)

`esbuild` + `eslint` + `build`, os três, sempre. Zero erros NOVOS, não
zero erros — contar antes e depois por ficheiro tocado. O baseline
depois da 099 é **70**.

## Como saber que acabou

```bash
# nenhum ecrã desenha identidade sem a guardar
grep -rn "logoDe(\|siteDe(\|linkWhatsAppCasa(\|numeroLegivel(\|assinatura" src/
```

E, com o 4.3 ligado, `/comunicado/nada-disto-existe` abre uma cortina
sem logótipo, sem nome, sem domínio e sem um único sítio para clicar.
