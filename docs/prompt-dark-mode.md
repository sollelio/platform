# Modo escuro no backoffice

## O projecto

`noivos-form` — React + Vite + Supabase. Um gestor de eventos (produto:
**Celebra**; empresa: **Sollelio**) usado hoje por uma empresa de eventos
portuguesa. O código está dividido em duas metades com regras diferentes:

- **`src/pages/AdminPage.jsx`, `EventoPage.jsx`, `LoginPage.jsx` e todo o
  `src/components/admin/`** — o backoffice. É aqui que se trabalha oito
  horas por dia, e é isto que escurece.
- **Portal, comunicado, formulário, pedido, contribuir** — as páginas
  públicas, que as clientes do negócio veem. **Não se tocam.**

O estilo é quase todo inline (`style={{ … }}`), não há folha de estilos
central além do `src/index.css`. Já existe um `:root` com seis variáveis e
~1350 usos de `var(--…)` no admin — mais de metade do trabalho está feito
sem ninguém ter planeado.

## Ler primeiro, por esta ordem

1. `docs/identidade-visual.md` — a identidade da casa. Manda sobre
   qualquer escolha de cor. Presta atenção à §2 (formatos), §4 (respiro) e
   à regra do `#9B9B9B` (nunca em coisas que se clicam).
2. `docs/decisoes-de-produto.md` — as decisões tomadas, com as razões.
   Longo; lê pelo menos as secções de **UI — regras da casa** e
   **Design — os dois critérios**.
3. `docs/glossario.md` — o vocabulário. A autoridade sobre nomes.

O tom dos comentários no código é português europeu e explica **porquê**,
nunca o quê. Segue-o.

## A propriedade que torna isto verificável

**O modo claro não pode mudar um pixel.** Antes e depois, idêntico.

É a única forma de saber que a tradução está certa: se algum ecrã claro
ficar diferente, houve um valor mal traduzido, e vê-se de imediato em vez
de se descobrir daqui a três semanas. Nada de aproveitar a viagem para
melhorar espaçamentos, harmonizar tons ou corrigir contrastes.

Excepção única: se encontrares uma cor que já viola a identidade visual,
**não a corrijas — lista-a no fim**. Corrigir é decisão do Hélio.

## Os tokens

~128 cores distintas no admin, mas concentradas: as 28 mais usadas cobrem
~800 das 1029 ocorrências. Isso são ~22 tokens semânticos, não 128.

**A regra que decide se isto funciona ou falha:** os tokens nomeiam-se
pelo **papel**, nunca pela cor. `--superficie`, `--texto-suave`,
`--borda`, `--perigo-fundo`. Nunca `--creme`, `--dourado`, `--cinza-claro`
— um «creme» que no escuro é castanho-escuro é um nome a mentir, e a
partir daí ninguém sabe o que escolher.

Deriva os tokens do que está lá: agrupa as 128 por família (fundo,
superfície elevada, texto, texto secundário, borda, ouro/marca, perigo,
sucesso, aviso), e vê quantos degraus cada família precisa mesmo.

**O ouro é o caso difícil.** O ouro da casa sobre creme não é o mesmo ouro
que funciona sobre escuro — o mesmo valor fica sujo e perde contraste.
Precisa de um par próprio no bloco escuro, e essa é a única escolha de cor
com juízo nesta tarefa. Justifica-a.

## O que não escurece, e porquê

**As páginas públicas.** São a cara da casa para as clientes dela e não
mudam por preferência de quem trabalha no backoffice.

**As superfícies de papel, mesmo dentro do admin:**

```
GerarOrcamento · GerarContrato · GerarProposta · BriefingPage
ComunicadoEditor (pré-visualização) · MensagemEditor (pré-visualização)
```

Estes ecrãs existem para sair em papel branco. Uma folha escura ou imprime
escura (ilegível, e gasta tinta) ou imprime clara — e então a
pré-visualização mente sobre o que vai sair.

**A metáfora: a moldura escurece, o documento nunca.** O gerador fica
escuro à volta e a folha continua branca ao centro, como papel em cima da
mesa. Faz isto com uma classe que reancora os tokens aos valores claros
dentro dela — não com excepções espalhadas.

O `imprimirFicha.js` e o `imprimirConferencia.js` estão a salvo sozinhos:
geram HTML em janela própria.

⚠ **Verifica as regras `@media print` existentes.** Se alguma superfície
imprimível herdar os tokens escuros, imprime escura. As classes `.so-print`
e `.acomp-nao-imprime` já existem — vê o que fazem antes de acrescentar.

## Armadilhas conhecidas

**O relâmpago branco.** É uma SPA Vite: se o tema só se aplicar quando o
React monta, há um flash claro em cada carregamento. Precisa de um script
inline no `index.html` que leia a preferência e ponha o atributo no
`<html>` antes de tudo. Poucas linhas, e sem elas o modo escuro parece
avariado.

**As sobreposições.** Há escuros translúcidos usados como cortina sobre
fundo claro — o pórtico das condições, o do sinal (`rgba(26,24,20,0.94)`).
Uma cortina escura sobre fundo escuro desaparece. Estes são do portal, que
não escurece; mas verifica se algum existe no admin.

**As sombras.** `boxShadow` com preto translúcido é invisível no escuro. O
equivalente escuro é normalmente uma borda, não uma sombra mais forte.

**Os SVG.** Ícones com `fill` cravado não seguem o tema. Vê o
`src/components/Icons.jsx` — se usarem `currentColor`, resolvem-se
sozinhos; se não, é aí que se muda.

**Imagens.** O logótipo e o `flores.webp` são ficheiros. Se o logótipo for
ouro sobre transparente, provavelmente aguenta; confirma em vez de
presumir.

**O contraste.** Há uma falha de contraste já registada nas decisões (o
ouro das pastilhas sobre creme, ≈3.8:1, abaixo do AA). Não a corrijas — mas
não a repitas no escuro. Cada par texto/fundo que criares deve passar AA
(4.5:1 para texto normal).

## A decisão que é tua

**Onde vive o interruptor.** O Hélio disse: no sítio que fizer mais
sentido. Decide olhando para o que a casa já faz — como estão arrumadas as
outras preferências, onde é que a Nádia já procura definições — e escreve
a razão. Não construas ecrã de definições novo se não houver um.

**Onde vive a preferência:** `localStorage`, com omissão a seguir o
`prefers-color-scheme`. Há precedente escrito nas decisões (10/08, a ordem
dos cartões de Documentos): preferência pessoal de visualização vive no
navegador, sem migração. E é preferência de **pessoa**, não de casa — não
entra no `app_config`, que desde a migração 093 é por cliente.

## O portão — regra da casa, sem excepções

`esbuild` + `eslint` + `build`, os três, sempre. O build sozinho não chega:
já duas vezes passou com um erro que o eslint apanhou e que teria rebentado
no ecrã.

O eslint tem **70 erros pré-existentes** do plugin react-hooks. A regra é
**zero erros novos**, não zero erros. Conta antes e depois, por ficheiro.

## Como trabalhar

1. **Os tokens e o bloco escuro** no `index.css`. Sem tocar em componentes.
2. **O interruptor** e o script anti-relâmpago. Aqui já se vê metade do
   painel a escurecer, porque metade já usa `var(--…)`.
3. **PARA E MOSTRA.** Migra **um** ficheiro representativo — sugestão: o
   `FunilBoard.jsx` ou o `CentroNotificacoes.jsx`, que têm de tudo — e
   mostra o resultado antes de seguir. Se o padrão estiver errado, é uma
   vez em vez de trinta e cinco.
4. **Os restantes**, em lotes de 4 ou 5, com o portão entre lotes.
5. **As superfícies de papel**, no fim.

## O que não fazes

- **Não commitas e não fazes push.** O git é do Hélio. Lê e altera
  ficheiros à vontade; deixa a árvore suja.
- Não instalas dependências novas (Tailwind, bibliotecas de tema).
  Variáveis CSS chegam e o projecto não tem nem uma nem outra.
- Não usas `window.confirm` / `alert` / `prompt`.
- Não mudas texto de interface. Se o interruptor precisar de rótulo,
  propõe e espera.

## No fim

Regista em `docs/decisoes-de-produto.md`: a lista dos tokens com o papel de
cada um, a escolha do ouro escuro, o sítio do interruptor com a razão, e a
regra do documento branco dentro da moldura escura.

E dá-me três listas à parte:
- cores que não coube traduzir e porquê;
- violações de identidade visual que encontraste e não corrigiste;
- ficheiros onde o claro mudou, se algum mudou (deve ser zero).