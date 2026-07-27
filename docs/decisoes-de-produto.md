# Decisões de produto

Registo vivo das decisões de produto do Hélio. Cada entrada: data, decisão,
uma linha de porquê. Este ficheiro é a fonte — o chat não conta. Reler
sempre que se recupera âmbito depois de uma compactação de contexto.

As entradas até 27/07/2026 foram reconstruídas do histórico da sessão ao
criar o ficheiro; se alguma estiver mal reconstruída, corrige-se aqui.

---

## Identidade e duplicados

- **26/07/2026 — Sem ferramenta de fusão de clientes.** Há ~9 clientes no
  sistema; duplicados fundem-se à mão. Porquê: construir fusão automática
  para uma dúzia de registos é risco sem retorno.
- **27/07/2026 — Email fica fora do dedupe** (Lote 3). Dados: 0 emails em
  12 clientes. Se um dia entrar, fica pré-aprovada a opção **aviso, nunca
  funde**. Porquê: o email não é chave fiável neste negócio; fusões
  automáticas são irreversíveis.
- **27/07/2026 — Telefone é a chave canónica de dedupe**, normalizado para
  os formatos reais (ex.: `931699846`, `925 956 617`, `+351 966 413 181`,
  `+491726435834`). Porquê: é o identificador que a Nádia realmente tem.
- **27/07/2026 — A RPC do formulário NÃO recusa convite sem alvo com
  evento vivo na mesma data.** O aviso vai para a **criação do convite no
  backoffice**, ao lado do seletor de alvo (1A). Porquê: a recusa na RPC
  dispararia no ecrã da cliente, que não tem como a corrigir.
  *(Implementação: Lote 4D.)*
- **27/07/2026 — O aviso de duplicado na captação pública nunca mostra
  nomes ao anónimo** — o nome do cliente existente só aparece a sessões
  autenticadas. Porquê: a RLS é a fronteira; a porta pública não revela
  quem já é cliente.

## Funil, fases e pagamentos

- **27/07/2026 — "Sugere-se, nunca se executa":** avanços de fase são
  sempre sugeridos (banner com botão), nunca automáticos. Porquê: a Nádia
  decide; o sistema não muda o estado do negócio sozinho.
- **27/07/2026 — Recuperar um evento perdido é uma escolha informada:**
  quando há pagamentos registados, a recuperação pergunta para onde volta
  (com o saldo do sinal à vista), não adivinha. Porquê: o par fase/status
  é um invariante com CHECK na BD (migração 040).

## Atualização em direto

- **27/07/2026 — O realtime suspende-se enquanto houver edição por
  gravar** e retoma depois com **refetch fresco** (nunca aplicando o
  payload guardado em buffer). Porquê: preferível a fundir em direto —
  a edição dela nunca é clobbered, e o que se mostra no fim é a verdade
  da BD.

## UI — regras da casa

- **26/07/2026 — Nunca `window.confirm`/`alert`/`prompt`:** confirmações
  inline no próprio ecrã, erros em barras no próprio ecrã. Porquê:
  diálogos do browser são alheios à estética e bloqueiam a app.
- **26/07/2026 — Nada de ações destrutivas dentro do detalhe:** remoção em
  lote é seleção múltipla + barra de ações + confirmação inline.

## Design — os dois critérios (27/07/2026)

- **As superfícies julgam-se por dois padrões distintos e não se
  misturam.** INTERNAS (drawer, página do evento, Jornada, Logística):
  o critério é OFÍCIO — precisão "porta de Rolls-Royce", o filtro é
  «isto aguenta ser visto cinquenta vezes por semana?». PÚBLICAS
  (contribuição coletiva, futuro portal do cliente): o critério é
  DESLUMBRE — vender o sonho, com brief próprio, noutro momento.
  Porquê: um gesto que encanta à primeira e irrita à quinquagésima
  está errado numa ferramenta diária; e o deslumbre da montra não
  pertence à bancada de trabalho.
- **Mockup antes de UI nova** (convenção da casa): mudanças grandes
  mostram-se antes de se construírem; várias direções valem mais do
  que uma; os estados difíceis (vazio, concluído, perdido/recuperado)
  mostram-se sempre — é neles que a qualidade se decide.

## Logística — conferência "O que sai" (27/07/2026)

- **A aritmética da conferência conta só eventos pós-sinal**
  (`FASES_POS_SINAL` do `faseConfig.js` — não uma lista nova). Orçamentos
  com ficha preenchida aparecem **à parte, como carga provisória** —
  visíveis, mas fora dos totais e do alarme "Não chega para tudo".
  Porquê: a conferência é a folha do que se carrega na carrinha; um
  orçamento não se carrega, e um alarme que mente é um alarme que a Nádia
  deixa de ler.
- **A conferência respeita a flag `lista_carga`.** Regra mais forte que a
  decisão: **a conferência e a Lista de Carga impressa do evento dão
  sempre o mesmo número** — qualquer divergência entre as duas é bug e
  corrige-se.
- **Eventos vizinhos contam:** material fora de casa num evento cuja
  janela de buffer se sobrepõe ao período escolhido **desconta na
  disponibilidade**, mesmo que o evento caia fora das datas. Porquê: a
  conferência reflete a disponibilidade física real; Alertas e
  conferência não se podem contradizer sobre a mesma realidade.
- **Materiais desativados aparecem na conferência com marca que peça
  ação.** Porquê: o soft-delete existe para não partir fichas antigas;
  omiti-los faz a carrinha partir sem eles.
- **Os Alertas ficam radar lato — mas sem mentir.** *(Decisão delegada
  pelo Hélio a 27/07/2026 — «escolhe aquele que fizer mais sentido» —
  e escolhida pelo assistente.)* Os orçamentos sem sinal continuam a
  contar nos Alertas (o valor do radar é avisar ANTES de se aceitar o
  sinal de dois eventos incompatíveis), e as linhas fora da lista de
  carga também (a Montagem também sai de casa — a ocupação física não
  é a folha da carrinha). Em contrapartida, um alerta que só existe
  por causa de orçamentos é **condicional**: âmbar, marcado «só se o
  orçamento fechar», fora do badge vermelho — o badge conta só ruturas
  entre eventos confirmados. Porquê esta via e não o alinhamento total
  com a conferência: alinhar apagava o aviso precoce (descobrir-se-ia
  a rutura só depois de aceitar o segundo sinal, tarde demais para
  comprar ou negociar datas); manter sem marca fazia o badge gritar
  por hipóteses — e um badge que grita por hipóteses deixa de ser
  lido.
