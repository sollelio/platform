# 099 · A identidade da casa deixa de ser constante

## O contexto

Este projeto acabou de passar a multi-tenant (migrações 090-098). A base
de dados já tem tudo: a tabela `tenants` guarda a identidade de cada casa
(nome, titular, morada, NIF, IBAN, MB Way, foro, domínio, WhatsApp,
logo_url, linha_actividade, linha_by, slogan), e três RPCs públicas
devolvem-na conforme a porta de entrada.

Falta o frontend. O `src/lib/casa.js` ainda exporta a identidade da Do
Luxo à Mesa como constantes, e vinte ficheiros importam de lá. Com uma
segunda casa, o portal dela mostraria o IBAN da primeira — falha
silenciosa, e o dinheiro já foi.

**Ler primeiro:** `docs/decisoes-de-produto.md`, secção «Multi-tenant»
(15/08/2026). As decisões desta migração estão lá.

## O que já está feito (não mexer)

- `src/lib/casa.js` — reescrito. Exporta `CASA_OMISSAO`, `comOmissao()`,
  `logoDe()`, `siteDe()`, `linkWhatsAppCasa(casa, texto)`,
  `numeroLegivel(casa)`, `assinaturaFolha(casa)`, `assinaturaPublica(casa)`,
  `assinaturaTitular(casa)`, `rodapeMarcaOrcamento(casa)`,
  `TITULO_BACKOFFICE(casa)`. As exportações antigas continuam lá,
  marcadas `@deprecated` — são a ponte a derrubar.
- `src/lib/identidadeCasa.js` — as portas: `casaPorSlug`,
  `casaPorTokenDePortal`, `casaPorTokenDeComunicado`,
  `casaPorTokenDeCampanha`, `casaPorCodigo`, `casaDaSessao`.
- `src/components/CasaProvider.jsx` — Provider + `useCasa()`.
- `src/pages/ContribuirPage.jsx` — já migrado. **Usa-o como modelo.**

## A tarefa

Migrar os restantes importadores de `lib/casa` para o Provider + hook,
e no fim remover as exportações `@deprecated` do `casa.js`.

### Padrão

Cada página pública embrulha-se no seu Provider e diz de onde vem a
casa. O componente atual passa a `XConteudo` e deixa de ser default:

```jsx
export default function XPage() {
  const { token } = useParams();
  return (
    <CasaProvider chave={token} carregar={() => casaPorTokenDeX(token)}>
      <XConteudo />
    </CasaProvider>
  );
}

function XConteudo() {
  const { token } = useParams();
  const casa = useCasa();
  // ...
}
```

Componentes-filhos no mesmo ficheiro que usem a identidade chamam
`useCasa()` diretamente — **não passar por props**.

### A porta de cada página

| ficheiro | porta |
|---|---|
| `ComunicadoPage.jsx` | `casaPorTokenDeComunicado(token)` |
| `PortalPage.jsx` | `casaPorTokenDePortal(token)` |
| `CaptacaoPage.jsx` | `casaPorSlug(slug)` — do `useParams` |
| `FormPage.jsx`, `FormEntryPage.jsx` | `casaPorCodigo(codigo)` |
| `BriefingPage.jsx` | `casaDaSessao()` — rota privada desde a 094 |
| tudo em `components/admin/`, `LoginPage`, `AdminPage`, `EventoPage` | `casaDaSessao()` |

Para o admin, monta **um** Provider no ponto mais alto que sirva todas
as páginas autenticadas (provavelmente à volta do `ProtectedRoute` no
`App.jsx`), com `chave="sessao"`. Não montar um por página.

### A tabela de substituição

⚠ **`nome` e `designacao` estão INVERTIDOS** entre o antigo e o novo. O
`EMPRESA.nome` era a pessoa; o `casa.nome` é o negócio. Verificar cada
ocorrência, não substituir por padrão.

| era | passa a |
|---|---|
| `EMPRESA.designacao` | `casa.nome` |
| `EMPRESA.nome` | `casa.titular` |
| `EMPRESA.morada` / `.nif` / `.iban` / `.mbway` / `.foro` | `casa.morada` / `.nif` / `.iban` / `.mbway` / `.foro` |
| `DOMINIO_CASA` | `casa.dominio` |
| `SITE_URL` | `siteDe(casa)` |
| `NUMERO_WHATSAPP_CASA` | `casa.whatsapp` |
| `LINHA_ACTIVIDADE` | `casa.linha_actividade` |
| `LINHA_BY_LUXURY` | `casa.linha_by` |
| `SLOGAN_CASA` | `casa.slogan` |
| `LOGO_CASA` | `logoDe(casa)` |
| `linkWhatsAppCasa(texto)` | `linkWhatsAppCasa(casa, texto)` |
| `ASSINATURA_FOLHA.x` | `assinaturaFolha(casa).x` |
| `ASSINATURA_PUBLICA` | `assinaturaPublica(casa)` |
| `ASSINATURA_TITULAR` | `assinaturaTitular(casa)` |
| `RODAPE_MARCA_ORCAMENTO` | `rodapeMarcaOrcamento(casa)` |
| `TITULO_BACKOFFICE` | `TITULO_BACKOFFICE(casa)` |

### As armadilhas conhecidas

1. **Constantes calculadas no topo do módulo.** `ComunicadoPage.jsx:76`
   calcula `NUMERO_LEGIVEL` fora de qualquer componente, onde não há
   hook. Já existe `numeroLegivel(casa)` no `casa.js` — apagar a
   constante e chamar a função dentro do componente. Procurar o mesmo
   padrão nos outros ficheiros.

2. **`src/lib/*.js` que não são componentes.** `imprimirFicha.js`,
   `imprimirConferencia.js` e `notificacoes.js` importam de `casa` mas
   não podem usar hooks. Passar a **receber a casa como argumento** e os
   chamadores (que são componentes) passam o `useCasa()`. Não inventar
   estado global.

3. **`orcamentoConfig.js` re-exporta `EMPRESA`.** Ver quem importa de lá
   e redirecionar para o hook.

4. **`FONTE_ASSINATURA_CASA` não muda.** É sistema de desenho da
   Sollelio, não identidade do cliente — fica constante.

## O portão (regra da casa)

`esbuild` + `eslint` + `build`, os três, sempre. O `build` sozinho não
chega — está registado em `decisoes-de-produto.md` porque já falhou duas
vezes assim.

O eslint tem **88 erros pré-existentes** do plugin react-hooks. A regra
é **zero erros NOVOS**, não zero erros. Contar antes e depois por
ficheiro tocado.

## Como saber que acabou

```bash
grep -rn "EMPRESA\|LINHA_BY_LUXURY\|SLOGAN_CASA\|ASSINATURA_\|LOGO_CASA\|DOMINIO_CASA\|SITE_URL\|NUMERO_WHATSAPP_CASA\|LINHA_ACTIVIDADE" src/
```

Zero resultados fora do próprio `casa.js`. Aí as exportações
`@deprecated` podem sair.

## Convenções deste projeto

- Comentários em português europeu, a explicar o **porquê**, nunca o
  quê. Ver qualquer ficheiro em `docs/migracoes/` para o tom.
- Nada de `window.confirm` / `alert` / `prompt`.
- Não mexer em `src/assets/logo.png` — continua a ser a omissão de quem
  não tiver logo no Storage.

## Como trabalhar

Um ficheiro de cada vez, do mais pequeno para o maior, com o portão a
correr entre cada um. Parar e perguntar se: a inversão `nome`/`designacao`
for ambígua nalgum sítio; um ficheiro precisar de mudar de forma para lá
do padrão acima; ou o eslint acusar erro novo que não seja óbvio.