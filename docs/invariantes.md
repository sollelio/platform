# Invariantes — ler antes de mexer no código

Regras que o código inteiro assume. Sem datas e sem história — isso
vive no `decisoes-de-produto.md` (secção «A varredura dos comentários
de função») e nos comentários de origem. Se uma regra daqui te
atrapalhar, o caminho é decisão registada, nunca excepção calada.

## Portas públicas e tokens

- **O id de um evento nunca sai do servidor por porta pública — nem
  num nome de ficheiro.** Um id que escape expõe o registo completo
  por qualquer outra RPC anónima; as projecções públicas são sempre
  `jsonb_build_object` com chaves nomeadas uma a uma.
- **Superfície pública é sempre RPC SECURITY DEFINER com projecção
  explícita — nunca grant de tabela ou vista ao anon.** Um SELECT
  directo novo reabre a base inteira.
- **Nenhuma função nova responde ao anon por omissão.** Os default
  privileges do schema estão revogados; cada RPC pública exige
  `grant execute … to anon` em letra própria, e o fecho de uma
  migração que toque em funções corre a consulta das portas públicas.
- **Acesso público é um token opaco, aleatório e revogável — nunca
  derivado de um id.** Regenerar mata o link antigo; não há hash nem
  cifra que se reverta.
- **No conteúdo, um token morto responde como um inexistente.**
  Distinguir confirmaria a existência de acessos. (A identidade é a
  excepção registada: o token morto veste a marca do dono; a casa
  desconhecida não veste nada.)
- **As portas públicas de leitura contam acessos — o backoffice nunca
  as chama para pré-visualizar.** Uma espreitadela interna contaria
  como visita da cliente; pré-visualiza-se pela tabela.
- **Se o portal precisa de mais um dado, é SQL, não JavaScript.** Mais
  um campo numa página por token nasce na projecção da RPC, nunca
  composto no cliente.
- **A lógica do portal edita-se em `dlm_portal_ver_interno`;
  `dlm_portal_ver` é só o invólucro que verifica a casa activa.**
  Reescrever o invólucro por inteiro (o padrão antigo) apaga a guarda
  da suspensão sem nenhum erro a avisar.
- **Storage: GET público por nome inadivinhável + listagem fechada.**
  Reabrir o `.list()` ao anon ou organizar caminhos «por evento»
  desfaz as duas metades do modelo.

## Dinheiro

- **«Está pago» e saldos nunca se guardam — derivam-se sempre da soma
  das linhas de `pagamentos`.** Um valor guardado diverge à primeira
  correcção e vira segunda verdade.
- **Vocabulário de negócio aberto é texto livre, nunca enum nem CHECK
  fechado.** Um método de pagamento novo (ou forma de receber) nunca
  deve exigir uma migração; CHECK é para eixos de máquina.
- **Os nomes das constraints são API.** O ecrã traduz 23503/23514 pelo
  nome (`pagamentos_submission_fk`, `submissions_status_pos_sinal`) —
  renomear uma constraint parte mensagens à Nádia.

## Dados, escritas e migrações

- **Dado ausente é melhor que dado inventado.** Nenhum backfill
  preenche um valor plausível: a falta assinala-se (`reconstituido`,
  data NULL, `feito_sem_data`) e só se reconstitui o que um facto
  implica.
- **Nenhum backfill ressuscita valores do `respostas` para colunas
  NULL.** Coluna a NULL com a chave ainda no `respostas` pode ser
  apagamento deliberado — repor é decisão manual.
- **Escritas no `respostas` são merge-patch no servidor, só com as
  chaves alteradas — nunca o objecto inteiro da memória do browser.**
  E no `respostas`, `null` e chave ausente valem o mesmo.
- **Campos de evento leem-se pelas DUAS fontes (coluna antiga OU
  `respostas`) via `getValorAtual`, e escrevem-se nas duas no mesmo
  update.** Uma leitura directa à coluna só vê submissões antigas.
- **O dedupe é melhoria, nunca portão** — um erro dentro dele
  engole-se e a submissão segue (o mesmo vale para o trigger de
  notificação: warning, nunca excepção). **No empate, ganha sempre o
  registo mais antigo** — escolha instável cola pessoas à ficha
  errada de forma irreproduzível.
- **Ids de campo são chaves eternas das respostas guardadas — nunca se
  mudam.** No Casamento, `nomeDaNoivo` é a NOIVA e `nomeDoNoiva` é o
  NOIVO: ficam trocados para sempre, e nenhuma lista de chaves se
  «corrige» a olhar para os nomes — «arrumar» emite contratos de
  casal com um só contraente.
- **Conceitos do questionário resolvem-se pelo modelo (`type`/padrão
  do campo), nunca por lista fixa de ids.** Ids iguais entre modelos
  não existem por garantia nenhuma.
- **Rótulo de pedido congela-se por extenso na linha.** Editar o
  modelo nunca reescreve o que a cliente pediu na altura.
- **Unicidade e contradições travam-se na base (índice único, CHECK,
  advisory lock) — o verificar-e-inserir das funções é cortesia.**
  Entre a verificação e o insert cabe outra transacção.
- **A regra «um prazo por dia» da disputa vive na UI da ficha, não no
  servidor.** `guardarPrazoDia` grava às cegas — uma segunda porta
  para ela promete o mesmo dia a duas clientes.
- **A notificação `contrato_papel` é dado de negócio, não aviso.** A
  tabela `notificacoes` é a própria fila do papel e `dados.caminho` é
  o único fio até à fotografia — marcar lida é livre; apagar, nunca
  (nem por limpeza em massa nem por política de retenção).
- **Limpezas periódicas embutem-se na própria escrita, nunca em
  pg_cron.** No plano gratuito o agendador pausa com o projecto e
  deixa de correr sem sintoma.
- **O prazo prometido grava-se na linha** (`respostas_ate` e afins) —
  mudar a constante no código nunca encurta promessas já feitas.

## Multi-tenant e RLS

- **Nas políticas RLS, `tenants_do_utilizador()` entra sempre como
  `(select …)`.** Sem os parênteses, o planeador chama a função linha
  a linha.
- **As políticas têm duas famílias de nomes:** `tenant_isolamento`
  para o que separa casas, `publico_*` para o que o anon vê — uma
  terceira convenção à mistura já custou uma auditoria.

## Frontend

- **`lib/` nunca importa de `components/`.** Módulos sem hook recebem
  casa e contexto por argumento; a única excepção admitida é um hook
  (useNotificacoes), que pode ler contexto. É o que mantém a camada de
  dados servível a qualquer ecrã.
- **Datas de colunas DATE partem-se à mão da string `YYYY-MM-DD` —
  nunca `new Date(iso)` — e comparam-se como string com a data
  local.** O parse ISO cai em UTC e recua um dia a oeste de
  Greenwich; os meses por extenso copiam-se ficheiro a ficheiro de
  propósito (recusa consciente de um util partilhado).
- **Ficheiro com componentes só exporta componentes
  (react-refresh/only-export-components).** Constantes e funções
  puras vivem no ficheiro `.js` gémeo (base/conteudo/faseConfig/…);
  um re-export «arrumado» já rebentou em runtime com o build verde.
- **Os ids internos dos separadores do backoffice nunca mudam.** O
  URL humano traduz-se num único sítio (`lib/rotasAdmin.js`) — o
  histórico e os links dependem dos ids.
- **Nos documentos, a BD é a fonte e o localStorage é espelho.**
  Lê-se BD-primeiro; o espelho nunca é apagado pelo módulo.
- **A chave de telefone do dedupe são os últimos 9 dígitos, em TRÊS
  cópias que têm de dizer o mesmo** — a vista SQL,
  `src/lib/comunicados.js` e `src/lib/importacao/schema.js`. (A
  VALIDAÇÃO aceita qualquer país; a chave é outra coisa.)
