# Portal do Cliente — roteiro de teste

Um evento de teste, percorrido de cima a baixo. Cada paragem diz **quando o
ecrã aparece**, **como o produzir** e **o que confirmar**.

Lê-se por ordem: o evento vai avançando, e cada passo desbloqueia o seguinte.
Não é uma lista de ficheiros — é um caminho.

**Antes de começares:** as migrações **049 a 060** têm de estar corridas no
ambiente que vais testar. O portal abre em `/acompanhar/:token`; o token
obtém-se no evento, no botão **Acompanhamento**, ao lado do WhatsApp.

> **Legenda**
> 🔧 produz-se no backoffice · 🗄 precisa de SQL · 📱 vê-se no telefone
> ⛔ **não tem caminho** — está explicado na secção final

---

## 0 · O evento de teste

Cria um de raiz, com tudo a zero. 🗄

```sql
-- Contacto + evento de teste. Devolve o ID do evento — guarda-o.
with tipo as (
  select id from public.event_types where nome ilike '%casamento%' limit 1
), pessoa as (
  insert into public.clientes (nome, contacto, email)
  values ('ZZ TESTE — Roteiro', '910000000', 'roteiro@exemplo.pt')
  returning id
)
insert into public.submissions
  (cliente_id, event_type_id, fase, status, data_evento, numero_convidados, respostas)
select pessoa.id, tipo.id, 'interessado', 'Recebido',
       (current_date + interval '120 days')::date, 40, '{}'::jsonb
  from pessoa, tipo
returning id as evento_id;
```

O nome começa por **ZZ TESTE** de propósito: fica no fim das listas e
reconhece-se de longe. No fim do roteiro há SQL para o apagar.

**Abre o acompanhamento:** vai a `/evento/<evento_id>`, carrega em
**Acompanhamento**, e depois em **Abrir o acompanhamento**. Copia a ligação —
é com ela que fazes tudo o que se segue. 🔧

---

## 1 · O portal no princípio

### 1.1 · Jornada — o caso mais comum de todos

**Quando aparece:** sempre que a ligação está viva. É a página inicial.

**Como o produzir:** já está — o evento acabou de nascer.

**O que confirmar:** 📱
- O logo com halo, e por baixo **O SEU EVENTO** + o nome do contacto.
- A âncora: **O GRANDE DIA**, a data por extenso, o dia da semana, e a
  contagem em dourado («Faltam 120 dias»).
- A frase de cerimónia: *«Já começou. Daqui até ao dia, o caminho é
  connosco.»*
- **Onde estamos agora: O seu pedido** — cartão branco com o medalhão e o
  visto assente na borda de cima.
- **A seguir: O orçamento**, com engaste **vazio** (sem visto).
- A linha «e depois — A data reservada · O projecto · …».
- **O local · ainda por definir** (pastilha).
- **NÃO** deve aparecer: a divisão das novidades (é a primeira visita), nem
  nenhuma das divisões do questionário, nem a ligação «Os seus documentos».

> **É este o ecrã que 8 em 13 eventos mostram.** Se parecer pobre, é porque o
> evento é novo — mas não pode parecer *partido*.

### 1.2 · «O que falta de si» — o estado vazio

**Quando aparece:** logo abaixo, sempre.

**O que confirmar:** com o evento acabado de criar, não há pendências: cartão
com medalhão, **«Nada. Está tudo entregue.»** e a lista **O QUE ESTÁ
CONNOSCO** com «O orçamento — estamos a prepará-lo com o que nos contou.»

### 1.3 · A carregar — os esqueletos

**Como o produzir:** 📱 no telefone, DevTools → Rede → *Slow 3G*, e
recarrega. Ou desliga a wi-fi durante um instante ao carregar.

**O que confirmar:** blocos cinzentos com a forma do que vem — **nunca um
spinner**, nunca uma frase a fingir de conteúdo.

---

## 2 · A jornada avança

### 2.1 · O orçamento gerado, mas NÃO publicado

**Como o produzir:** 🔧 no evento → **Documentos** → gera o Orçamento com
duas ou três linhas de serviço. **Não publiques ainda.**

**O que confirmar:** recarrega o portal — **tem de estar exactamente igual**.
Gerar não é enviar; a etapa só acende quando ela puder ver.

> Esta é a regra da 051 a funcionar. Vale a pena vê-la falhar de propósito
> uma vez para perceber o que ela protege.

### 2.2 · Publicar — o gesto que muda tudo

**Como o produzir:** 🔧 evento → **Acompanhamento** → secção **Documentos no
acompanhamento** → **Publicar no acompanhamento** na linha do Orçamento.

**O que confirmar:**
- Na folha: passa a dizer «Publicado a … · versão 1».
- No portal (recarrega): **Onde estamos agora: O orçamento**, com a data de
  hoje. A pendência muda para «O orçamento — está consigo desde …, à espera
  de uma resposta», **com a ligação «Ver o orçamento»**.
- Aparece a ligação discreta **«Os seus documentos»** no fim da página.

### 2.3 · A data reservada

**Como o produzir:** 🔧 evento → **Pagamentos** → regista o sinal.

**O que confirmar:** o portal passa a **Onde estamos agora: A data reservada**,
com a data do pagamento. A frase: *«A data ficou sua. Ninguém mais a leva.»*

---

## 3 · Os documentos

### 3.1 · Lista de documentos

**Quando aparece:** em `/acompanhar/<token>/documentos`, ou pela ligação «Os
seus documentos».

**O que confirmar:**
- **«Um deles espera por si.»** (a frase conta os que não têm resposta).
- O Orçamento em cartão de borda dourada com a pastilha **à sua espera** e a
  cápsula «Abrir o orçamento».
- O Projecto e o Contrato **sem cartão**, com engaste vazio: «Ainda não
  existe. Desenhamo-lo depois de o orçamento estar aceite.»
- O selo **«Versão 1 · de <data>»** em cada documento publicado.

### 3.2 · Orçamento com os valores VELADOS

**Quando aparece:** ao abrir o orçamento sem sessão verificada.

**O que confirmar:** 📱
- **O documento abre-se inteiro** — timbre, título, os serviços todos com
  nome e nota.
- Onde deviam estar a conta e o valor, **rectângulos de hachura**. O Total
  também.
- Por baixo, o cartão **OS VALORES** — *«Os valores mostram-se a quem é da
  casa.»* — com **A Nádia** e a cápsula **Pedir o código**.
- 🔴 **A prova que interessa:** DevTools → Rede → o pedido
  `dlm_portal_ver_documento` → Resposta. **Não pode existir lá dentro
  nenhum valor, nem NIF, nem morada, nem contacto.** O véu corta no
  servidor; se os números estiverem na resposta e só escondidos no ecrã, é
  bug grave.

---

## 4 · O código, com uma pessoa no meio

### 4.1 · O pedido → a espera

**Como o produzir:** 📱 carrega em **Pedir o código**.

**O que confirmar:**
- Ecrã da **espera**: a tira de contexto em cima («Orçamento · versão 1 ·
  valores velados»), o medalhão vazio com o **sopro** (halo a respirar
  devagar), e *«A Nádia já sabe que precisa dele.»*
- «Pediu-o às HH:MM» com a hora certa.
- 🔧 **No backoffice:** abre a folha do Acompanhamento — tem de aparecer a
  caixa âmbar **Pedido de código** com o botão «Emitir código».

### 4.2 · Emitir e entrar

**Como o produzir:** 🔧 **Emitir código** → o botão passa a mostrar os seis
dígitos (carrega para copiar). 📱 No portal: **Já tenho o código**.

**O que confirmar:**
- Seis células de 48×56, a activa com aro dourado. Teclado **numérico** no
  telefone.
- «O código vale um dia inteiro, a contar do envio.»
- Com o código certo → **Abrir os valores** → o documento reabre **com os
  números todos**, e o Total em Playfair grande.
- Recarrega a página: **os valores continuam lá** (a sessão dura 60 minutos e
  sobrevive ao recarregar).

### 4.3 · O código recusado

**Como o produzir:** 📱 escreve seis dígitos errados.

**O que confirmar:** o **bloco de recusa** — losango cor de tijolo, «Este
código não abriu», o facto e a saída, e a cápsula **Pedir outro código**. E o
remate: «O orçamento fica onde está. Só os valores esperam pelo código.»

### 4.4 · 🔴 O código morre à quinta (058)

**Como o produzir:** 📱 erra **cinco vezes seguidas**. Depois escreve o
código **certo**.

**O que confirmar:** o código certo **também tem de ser recusado**. Confirma
na base: 🗄

```sql
select tentativas, usado_em, expira_em
  from public.portal_verificacoes
 order by pedido_em desc limit 1;
```

`tentativas` = 5. Se o código certo entrar à sexta, a força bruta está aberta
— avisa-me.

---

## 5 · Os actos

### 5.1 · O pé do orçamento — a dupla

**O que confirmar:** no fim do documento, sobre fundo creme: **A SUA
RESPOSTA**, «Está de acordo com este orçamento?», o campo **O seu nome**, e a
dupla **Aceitar** (dourado cheio) / **Pedir alteração** (vazada) — mesma
altura, mesmo raio, mesma tipografia. E a linha por baixo: *«Pedir alteração
é tão comum como aceitar.»*

Carrega em **Aceitar** sem escrever o nome: tem de recusar com «Escreva o seu
nome — é ele que fica no registo.»

### 5.2 · Pedir alteração

**O que confirmar:** tira de contexto com «voltar ao documento», a lista de
serviços com **engaste de tirar** (toca num — o nome fica riscado e o engaste
ganha traço cor de tijolo), o campo **Por palavras suas** em Playfair
itálico, e o nome.

🔧 **No backoffice:** a folha do Acompanhamento tem de mostrar «Pediu uma
alteração a …» **e o texto dela, em itálico, por baixo**.

### 5.3 · Aceitar — a confirmação

**O que confirmar:** medalhão + **«O orçamento está aceite.»** + o bloco **O
QUE FICOU REGISTADO** (nome, versão, data e hora, verificação) e **O QUE VEM
A SEGUIR: o projecto**.

Volta à lista: o Orçamento passa a cartão normal com visto e «Aceitou-o a …».

### 5.4 · O projecto — APROVA-SE, não se aceita

**Como o produzir:** 🔧 gera o Projecto (Documentos) e publica-o.

**O que confirmar:** 📱 o projecto **abre sem código** (não tem valores). O
pé diz «É esta a mesa que imaginou?» e o botão é **Aprovar**. Depois de
aprovar, a lista tem de dizer **«Aprovou-o a …»** — nunca «Aceitou-o».

### 5.5 · O contrato — assinar

**Como o produzir:** 🔧 gera o Contrato e publica.

**O que confirmar:** 📱
- Abre **velado** (tem valores) → pede código.
- Com sessão: o resumo **EM RESUMO**, o filete «Por inteiro», e as cláusulas
  numeradas em dourado.
- No pé: **O QUE FICA ASSINADO** (quatro linhas com losango), a linha de
  verificação com o visto, e a **pauta** para escrever o nome.
- ⏱ **Escreve o nome completo** (dois nomes) e **não faças mais nada**: um
  filete dourado atravessa a pauta em **2,5 segundos** e só então o botão
  **Assinar o contrato** acende. Antes disso está inerte e não responde.

### 5.6 · 🔴 O tranco

**Como o produzir:** assina. 🔧 Depois volta ao backoffice → Documentos →
Contrato.

**O que confirmar:**
- Banner verde: **«Este contrato foi assinado no acompanhamento e está
  trancado.»** Escreve num campo: **não guarda**.
- Na folha do Acompanhamento, a linha do Contrato diz «Assinado e trancado a
  …» e **o botão de publicar desapareceu**.
- 🗄 A prova dura:

```sql
update public.documentos set dados = dados || '{"x":1}'::jsonb
 where tipo = 'contrato' and submission_id = '<EVENTO_ID>';
-- Esperado: ERRO «DOCUMENTO_TRANCADO».
```

- 📱 No portal, o contrato passa a **repouso**: faixa de selo com «Assinado
  por …», a folha com borda escurecida e sombra baixa, o corpo recolhido ao
  resumo e ao índice das cláusulas, e **nem uma única cápsula**.

---

## 6 · Os estados feios

### 6.1 · Modelo sem paleta

**Como o produzir:** 🗄 cria um segundo evento com o modelo **Brunch
Elegante** ou **Inauguração de Espaço** (troca o `ilike` no SQL do passo 0).

**O que confirmar:** depois do questionário respondido, a divisão **As suas
cores** **não aparece de todo** — não é um espaço vazio, é ausência. Depois da
053 estes modelos não têm campo de paleta nenhum.

### 6.2 · As divisões do questionário

**Como o produzir:** 🗄 em vez de preencheres o questionário todo à mão, esta
consulta injecta respostas resolvendo os ids **pelo modelo do evento** (é
assim que a RPC os lê):

```sql
-- Preenche mensagem, paleta, horas, placa e descrições no evento de teste.
with campos as (
  select f.val->>'id' as id, f.val->>'type' as tipo
    from public.submissions s
    join public.event_types et on et.id = s.event_type_id
   cross join lateral jsonb_array_elements(et.steps) p(val)
   cross join lateral jsonb_array_elements(p.val->'fields') f(val)
   where s.id = '<EVENTO_ID>'::uuid
), novo as (
  select jsonb_object_agg(id, valor) as j from (
    select id, to_jsonb('16:00'::text) as valor from campos where tipo = 'time'
    union all
    select id, to_jsonb(array['Branco','Dourado','Verde sage']) from campos where tipo = 'paleta'
    union all
    select id, to_jsonb('Bem-vindos ao nosso dia'::text) from campos
     where id ilike '%placa%' and id ilike '%principal%'
    union all
    select id, to_jsonb('Uma mesa comprida, toalha de linho cru a cair até ao chão.'::text)
      from campos where id ilike 'descricao%'
  ) t
)
update public.submissions s
   set respostas = coalesce(s.respostas, '{}'::jsonb)
                 || (select j from novo)
                 || jsonb_build_object(
                      'mensagemInicial',
                      'Queria uma tarde bonita, com a mesa posta em tons claros e muita luz de vela.')
 where s.id = '<EVENTO_ID>'::uuid;
```

**O que confirmar:** aparecem, por esta ordem — **Como começou** (a citação
dela em itálico, sem aspas, assinada), **As suas cores** (círculos com
hachura, porque são nomes e não códigos), **Hora a hora**, **A placa**
(moldura dupla, **cantos vivos**), **A sua visão**.

> As **imagens** só aparecem se o pedido tiver vindo de `/interesse` com
> fotografias. Para as veres, submete um pedido real nessa página.

### 6.3 · As novidades

**Como o produzir:** 📱 abre o portal uma vez. 🗄 Depois recua a visita:

```sql
update public.portal_acessos
   set ultimo_acesso_em = now() - interval '2 hours',
       visita_anterior_em = null
 where submission_id = '<EVENTO_ID>'::uuid and revogado_em is null;
```

🔧 Publica um documento novo. 📱 Reabre o portal.

**O que confirmar:** a divisão **O que mudou desde a última vez**, com o
ponto dourado e o cartão a **entrar com a mola** (uma vez só). Por baixo, **O
que já cá estava**, apagado.

**Recarrega logo a seguir:** a novidade **tem de continuar lá** — é a janela
dos 30 minutos a proteger o ponto de comparação. Se desaparecer, é bug.

### 6.4 · Sem novidades

**Como o produzir:** recua a visita outra vez, mas **não publiques nada**.

**O que confirmar:** «Desde <dia>, nada mudou por aqui.» com filete — a única
ausência que se escreve.

### 6.5 · O evento caducado

**Como o produzir:** 🗄

```sql
update public.submissions
   set data_evento = current_date - interval '30 days', fase = 'interessado'
 where id = '<EVENTO_ID>'::uuid;
```

**O que confirmar:**
- 🔧 Na ficha do evento, o botão **Acompanhamento desapareceu**.
- 📱 Na ligação que já tinhas: a âncora deixa de dizer «O GRANDE DIA» e passa
  a **«A DATA QUE NOS PEDIU»**, com «Esta data já passou…». E **calam-se** o
  «a seguir», o «e depois» e o «o que falta de si».
- **Nunca** pode aparecer «Foi um gosto pôr a sua mesa» — era o bug da 055.

### 6.6 · A cortina

**Como o produzir:** 🔧 folha do Acompanhamento → **Fechar o acompanhamento**
→ lê a confirmação (tem de nomear o que fica: evento, documentos, pagamentos)
→ **Fechar mesmo**.

**O que confirmar:** 📱 a ligação antiga passa a mostrar a cortina — véu
dourado no topo, logo a 118px **sem raio a girar**, «Esta ligação não abre
nenhum evento.», e a cápsula **Falar pelo WhatsApp** (agora com o número
real). Testa também um token inventado: `/acompanhar/xxxxxxxxxxxxxxxxxxxx` —
**exactamente a mesma cortina**.

### 6.7 · A rede a falhar

**Como o produzir:** 📱 DevTools → Rede → **Offline** → recarrega.

**O que confirmar:** «Não foi possível abrir o acompanhamento.» com «A
ligação que recebeu de nós continua válida.» — nunca um ecrã em branco.

### 6.8 · 🔴 O documento que mudou depois de aceite

**Como o produzir:** com o orçamento **já aceite**, 🔧 publica **versão nova**.

**O que confirmar:** 📱 ao abrir o orçamento aparece o **interstício**: «Saiu
um orçamento novo», e o bloco com visto: *«A sua resposta de <data> fica onde
está. Vale para a versão 1 … Esta é outra — por isso pede uma resposta
nova.»* Com a cápsula «Abrir o orçamento novo» e a ligação «Ver a versão 1,
como respondeu».

### 6.9 · 🔴 Responder a uma versão que já mudou (058)

**Como o produzir:** dois separadores. No **A** (portal) abre o orçamento com
o pé à vista. No **B** (backoffice) publica versão nova. Volta ao **A** e
carrega em **Aceitar**.

**O que confirmar:** **não pode gravar**. Tem de aparecer «Entretanto saiu uma
versão nova (versão N). Recarregue a página e leia-a antes de responder — a
sua resposta não foi registada.»

### 6.10 · Movimento reduzido

**Como o produzir:** 📱 Definições → Acessibilidade → remover animações.

**O que confirmar:** o halo fica, a poeira e o raio param, a mola das
novidades não corre, o sopro da espera pára — e o filete da assinatura
aparece **cheio de imediato** (a espera de 2,5s deixa de existir; é desenho,
não portão).

---

## 7 · As cinco peças sem caminho — resolvidas (01/08/2026)

Estavam aqui cinco peças do desenho que não conseguiam aparecer. **Já não
há nenhuma pendente**: três foram construídas, duas foram riscadas do
desenho por decisão da casa. Fica o registo do que se decidiu e porquê.

| A peça | O que se decidiu | Onde ficou |
|---|---|---|
| **«Versão nova» — o cartão de diferenças** | ✅ **Construído.** O interstício vai buscar a versão anterior pelo mesmo RPC e compara linha a linha: o que entrou, o que saiu, o que mudou de quantidade ou de valor, e o total antes → depois. Só no **orçamento** — no projecto e no contrato mudou texto, e um comparador de texto diria pior do que a Nádia diz na conversa. **Respeita o véu**: sem sessão diz «o valor mudou» e nunca o número | `base.js` (`diferencasDeOrcamento`) e `DocumentosVista.jsx` (`AvisoVersaoNova` + `CartaoDiferencas`) |
| **Confirmação do contrato em papel** | ✅ **Construído — acto a sério, sem código.** A confirmação deixa no trilho o nome que está escrito no papel, quem confirmou, quando, e a fotografia; e **tranca** o contrato, tal como o digital. O portal mostra-lhe o mesmo repouso — «Assinado por…» — porque a projecção do acto nunca passou pela verificação | Migração **059** + `PortalDoClienteSheet.jsx` |
| **«As cores» dentro do Projecto** | ❌ **Riscado do desenho.** A paleta já vive na divisão «As suas cores», tirada do questionário. Repeti-la no documento dizia a mesma coisa duas vezes — e obrigava o gerador de Projecto a guardar uma coisa que a Nádia nunca lá escreveu | Nada a construir |
| **As linhas «Sem IVA» e «IVA 23%»** | ❌ **Riscado do desenho.** O valor que a Nádia escreve **é** o que a cliente paga: total único. Partir esse número em dois inventava um imposto que a casa não factura assim | Nada a construir |
| **A «folha cortada»** | ✅ **Apagada.** Era código morto — no telefone o documento rola inteiro e o pé aparece no fim | `documentos-pecas.jsx` |

**De caminho**, uma coisa que não estava na lista e apareceu ao puxar por
ela: as três notificações do portal (`codigo_pedido`, `pedido_alteracao`,
`contrato_papel`) caíam na Caixa de Entrada **com o molde da captação** —
subtítulo «Pedido de interesse» debaixo de um título que dizia outra coisa,
e o painel a procurar respostas de formulário que nunca existiram. Passam a
ter resumo e painel próprios, com o passo seguinte à vista.

### 7.1 · O que a revisão apanhou depois de tudo testado (migração 060)

Passei as três peças novas por quatro lentes independentes. Encontrou
defeitos que **nenhum teste manual apanharia**: todos precisam de duas
fotografias, ou de uma versão publicada a meio, ou de duas mãos ao mesmo
tempo. Os três primeiros eram graves.

| O defeito | O que acontecia | Onde |
|---|---|---|
| **O cartão de diferenças era código morto** | O efeito lia `r.doc`, e a RPC devolve o documento direito — sem embrulho. A guarda disparava sempre e o cartão nunca chegava a ser pintado. Por isso «tudo a funcionar» e o cartão nunca apareceu | `DocumentosVista.jsx` |
| **Ler o aviso apagava a fila do papel** | Usei «aviso por ler» como sinal de «assinatura por confirmar» — dois estados sem nada em comum. Abrir o cartão na Caixa de Entrada marca-o lido no servidor; ela seguia o «Abrir ficha completa» que o próprio aviso manda seguir e, ao chegar lá, a secção de confirmar já não existia. E «marcar todas como lidas» destruía as filas de todos os eventos de uma vez | `portal.js`, `PortalDoClienteSheet.jsx` |
| **Sob o véu, o cartão calava as mudanças de preço** | O servidor **tira** a chave `valor` das linhas: sem código, a comparação não vê alteração de preço nenhuma. O ramo que prometia dizer «e o valor mudou» era inalcançável, e a lista aparecia como se fosse completa | `base.js` |
| **O acto ficava preso à versão mais alta** | Se publicasses contrato novo depois de ela ter assinado o antigo em papel, ficava registado que ela assinou um texto que nunca viu — a mesma regressão que a 058 §3 corrigiu no digital | migração **060** |
| **A segunda fotografia não chegava** | A 058 suprime avisos repetidos na mesma hora. Ela carregava uma tremida, carregava logo a boa, e confirmavas contra a tremida | migração **060** |
| **`ja_assinado` deixava o cartão eterno** | e o aviso nunca saía da Caixa de Entrada | migração **060** |
| **O pedido de alteração não mostrava a frase dela** | A cliente escreve o que quer mudar, fica guardado em `dados.mensagem` — e o painel dizia só «quer mudar alguma coisa». Era mandar-te telefonar a perguntar o que já tinhas em mãos | `CentroNotificacoes.jsx` |

**As verificações da 060** estão no fim do ficheiro dela — a 4.1 é a que
importa, e é a única que exige a coreografia toda (publicar, carregar,
publicar outra vez, e só então confirmar).

**Ainda por decidir** (não são bugs, são escolhas tuas):
- Um código pedido para o orçamento **autoriza assinar o contrato** durante
  60 minutos, e o registo diz «verificado com o código». É verdade a meias.
- **«Pedir outro código» não anula o anterior** — quem desconfie que lho
  viram não tem como o matar.

---

## 8 · Arrumar

**Três coisas seguram um evento de propósito**, e é preciso soltá-las por
ordem antes de o apagar:

| O que segura | Porquê |
|---|---|
| `pagamentos` | `RESTRICT` da migração 025 — **dinheiro não desaparece por arrasto** |
| `portal_actos` | `RESTRICT` da 057 — **prova não se apaga por arrasto** |
| `invites.submission_id` | `NO ACTION` — um questionário preenchido aponta cá |

Tudo o resto (documentos, publicações, acessos, verificações, previstos,
materiais, notificações) cai sozinho por `CASCADE`.

**Antes de apagar, vê o que está a segurar:** 🗄

```sql
select s.id as evento,
       (select count(*) from public.pagamentos p where p.submission_id = s.id)      as pagamentos,
       (select count(*) from public.portal_actos a
          join public.portal_publicacoes pp on pp.id = a.publicacao_id
         where pp.submission_id = s.id)                                             as actos,
       (select count(*) from public.invites i where i.submission_id = s.id)         as questionarios
  from public.submissions s
  join public.clientes c on c.id = s.cliente_id
 where c.nome like 'ZZ TESTE%';
```

**A limpeza, por ordem:** 🗄

```sql
-- 1 · A prova do portal (RESTRICT). As verificações caem depois, sozinhas.
delete from public.portal_actos
 where publicacao_id in (
   select pp.id from public.portal_publicacoes pp
     join public.submissions s on s.id = pp.submission_id
     join public.clientes c    on c.id = s.cliente_id
    where c.nome like 'ZZ TESTE%');

-- 2 · O dinheiro (RESTRICT).
delete from public.pagamentos
 where submission_id in (
   select s.id from public.submissions s
     join public.clientes c on c.id = s.cliente_id
    where c.nome like 'ZZ TESTE%');

-- 3 · Os questionários preenchidos (NO ACTION): soltam-se, não se apagam —
--     um formulário respondido é matéria da cliente, não lixo de teste.
update public.invites
   set submission_id = null, submission_alvo_id = null
 where submission_id in (
   select s.id from public.submissions s
     join public.clientes c on c.id = s.cliente_id
    where c.nome like 'ZZ TESTE%')
    or submission_alvo_id in (
   select s.id from public.submissions s
     join public.clientes c on c.id = s.cliente_id
    where c.nome like 'ZZ TESTE%');

-- 4 · O evento e o contacto. O resto já caiu por CASCADE.
delete from public.submissions
 where cliente_id in (select id from public.clientes where nome like 'ZZ TESTE%');
delete from public.clientes where nome like 'ZZ TESTE%';
```

> Um **contrato assinado NÃO impede** apagar o evento: o tranco da 057 é um
> gatilho de `UPDATE`, não de `DELETE`. Trava a alteração, não a remoção.
>
> Se algum passo voltar a dar `23503`, corre a consulta de diagnóstico acima
> — a coluna que não estiver a zero diz-te qual é.

**Ficheiros de teste no Storage**, dos meus ensaios de segurança — podes
apagá-los pelo painel:
`referencias/ref_teste_056_apagar.jpg` ·
`contratos-assinados/papel_teste_057_apagar.jpg` ·
`contratos-assinados/papel_058_teste_apagar.jpg`
