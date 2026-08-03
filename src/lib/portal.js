import { supabase } from "./supabase";

// ============================================================
// portal.js — a camada de dados do Portal do Cliente (migrações 049–052).
//
// Três chamadas, dois públicos:
//   · getPortal(token)         — ANÓNIMA. A leitura da vitrina.
//   · abrirPortal(eventoId)    — só autenticada. Abre (ou devolve) a porta.
//   · revogarPortal(eventoId)  — só autenticada. Fecha a porta.
//
// 🔴 O RPC devolve uma PROJECÇÃO EXPLÍCITA e o id do evento NUNCA sai.
// Não acrescentes campos do lado de cá: acrescentam-se na migração, onde
// cada campo que sai é uma decisão consciente e revisível. Se precisares
// de mais um dado no portal, é SQL, não JavaScript.
// ============================================================

// ---------- Os rótulos ----------
//
// Vivem AQUI, e não na base, por decisão da migração 050: com o rótulo no
// servidor era preciso uma migração para mudar uma palavra que uma pessoa
// lê. É a regra de ouro do glossário — «os nomes que as pessoas leem podem
// mudar; os nomes que a máquina usa ficam quietos».
//
// ⚠ ESTA TABELA ESTÁ TAMBÉM NO `docs/glossario.md`, que é a fonte única.
// Se mudares um rótulo aqui, muda lá primeiro.
//
// Nota sobre a etapa 1: a chave da base é 'interessada', no feminino. O
// rótulo descreve o GESTO de quem chega — «O seu pedido», o nome que o
// glossário dá a esse gesto — e resolve de caminho a exclusão que o
// glossário assinala na pendência #2, sem esperar pela decisão de
// renomear a chave.
// (Pela ordem final da jornada — 077: o sinal reserva a data antes de
// o contrato se assinar. A ordem visual vem sempre da RPC; aqui é só
// verdade cosmética.)
export const ROTULO_ETAPA = {
  interessada: "O seu pedido",
  orcamento: "O orçamento",
  sinal: "A data reservada",
  contrato: "O contrato",
  projecto: "O projecto",
  preparacao: "A preparação",
  grande_dia: "O grande dia",
};

// ---------- O que se diz de cada etapa ----------
//
// Duas vozes por etapa, porque o ecrã mostra sempre duas:
//   AGORA  — quando é a etapa em que o evento está («Onde estamos agora»)
//   SEGUIR — quando é a etapa que se avizinha («A seguir»)
//
// A mesma etapa lê-se ao contrário conforme o lado do tempo em que está:
// «A sua mesa já está desenhada» vs. «Vamos desenhar a sua mesa consigo».
export const TEXTO_AGORA = {
  interessada: "O seu pedido chegou até nós e já tem um evento com o seu nome.",
  orcamento: "Já tem em mãos os valores da sua mesa. Sem pressa para decidir.",
  sinal: "A data ficou sua. Ninguém mais a leva.",
  contrato: "Está tudo escrito e assinado, do seu lado e do nosso.",
  projecto: "A sua mesa já está desenhada — cores, louça, flores, o cenário todo.",
  preparacao: "A casa já está em marcha: compras feitas, listas fechadas, tudo a caminho.",
  grande_dia: "É hoje.",
};

export const TEXTO_SEGUIR = {
  orcamento: "Estamos a prepará-lo. Assim que estiver pronto, aparece aqui e receberá um aviso.",
  sinal: "Está tudo pronto do nosso lado. É o passo que guarda a data.",
  contrato: "Com a data reservada, passamos a escrito o que ficou combinado — chega-lhe aqui para assinar.",
  projecto: "Vamos desenhar a sua mesa consigo: cores, louça, flores, o cenário todo.",
  preparacao: "A casa põe-se em marcha: compras, listas e a montagem ao detalhe.",
  grande_dia: "Chegamos cedo, pomos a mesa e só saímos quando estiver tudo no lugar.",
};

// O desenho previu a véspera e o próprio dia, não o dia seguinte. Sem esta
// linha, um evento já passado ficava a dizer «É hoje.» para sempre.
export const TEXTO_GRANDE_DIA_PASSADO = "Foi um gosto pôr a sua mesa.";

// A frase de cerimónia da casa: Playfair REDONDO, sem aspas — o itálico e
// as «» ficam reservados, juntos, para a fala de uma pessoa com nome.
export const FRASE_DE_CERIMONIA = "Já começou. Daqui até ao dia, o caminho é connosco.";

// Sem data marcada, a frase de cima prometia «daqui até ao dia» duas
// linhas abaixo de a âncora dizer «ainda por marcar» — falava de um dia
// que não existe. Esta mantém os dois tempos do original (já começou · nós
// tratamos) e nomeia o que falta sem repetir as palavras da âncora.
//
// Não explica que a página se actualiza, de propósito: isso é trabalho do
// cartão «a seguir», não de uma linha de cerimónia.
export const FRASE_DE_CERIMONIA_SEM_DATA =
  "Já começou. Falta marcar o dia — e a partir daí, o caminho é connosco.";

// Os três estados que o RPC devolve por etapa. `feito_sem_data` existe
// porque metade dos carimbos é marcada à mão pela Nádia, e a ausência de
// uma marcação nunca prova a ausência do facto.
export const ETAPA_POR_ACONTECER = "por_acontecer";
export const ETAPA_FEITA_SEM_DATA = "feito_sem_data";
export const ETAPA_FEITA_DATADA = "feito_datado";

// ---------- A leitura pública ----------

// Devolve o objecto da RPC:
//   { estado: 'terminado' }                       → link morto/revogado/expirado
//   { estado: 'activo', evento: {…}, jornada: […] }
//
// Inexistente, revogado e expirado devolvem TODOS 'terminado', de
// propósito: não se confirma nem se desmente a existência de um token.
export const getPortal = async (token) => {
  const { data, error } = await supabase.rpc("dlm_portal_ver", {
    p_token: token,
  });
  if (error) throw error;
  return data || null;
};

// ---------- A porta, do lado da Nádia ----------

// A porta VIVA de um evento, ou null se não houver nenhuma. Vai à tabela
// directamente porque a RLS já a fecha ao público (só `authenticated`
// lê), e porque a RPC de leitura precisa de um token que aqui ainda não
// existe.
//
// ⚠ NÃO usar `dlm_portal_ver` para pré-visualizar do lado do backoffice:
// essa função INCREMENTA `n_acessos` e carimba `ultimo_acesso_em`. Uma
// espreitadela da Nádia passaria a contar como visita da cliente, e o
// sinal de vida — a única coisa que lhe diz se vale a pena insistir —
// deixava de valer nada.
export const getAcessoDoEvento = async (eventoId) => {
  const { data, error } = await supabase
    .from("portal_acessos")
    .select("token, criado_em, expira_em, ultimo_acesso_em, n_acessos")
    .eq("submission_id", eventoId)
    .is("revogado_em", null)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

// Devolve o token. Se já houver acesso vivo, devolve esse — nunca cria
// dois (há um índice único parcial na base a garanti-lo).
export const abrirPortal = async (eventoId) => {
  const { data, error } = await supabase.rpc("dlm_portal_abrir", {
    p_submission_id: eventoId,
  });
  if (error) throw error;
  return data || null;
};

// Motivos aceites pela base: 'avaliado' | 'prazo' | 'manual'.
export const revogarPortal = async (eventoId, motivo = "manual") => {
  const { error } = await supabase.rpc("dlm_portal_revogar", {
    p_submission_id: eventoId,
    p_motivo: motivo,
  });
  if (error) throw error;
};

// ---------- Fase 3 · documentos, do lado da Nádia ----------

// Publica (congela + mostra + carimba enviado_em). Erros de negócio vêm
// no message: SEM_DOCUMENTO, CONTRATO_TRANCADO.
// `extra` congela o texto fixo que rodeia os dados (cláusulas, condições):
// sem ele, mudar uma cláusula no código mudava um contrato já publicado.
export const publicarDocumento = async (eventoId, tipo, extra = null) => {
  const { data, error } = await supabase.rpc("dlm_portal_publicar", {
    p_submission_id: eventoId,
    p_tipo: tipo,
    p_extra: extra,
  });
  if (error) throw error;
  return data;
};

// As publicações do evento, com os actos de cada uma embutidos — chega
// para a folha dizer «publicado v2 · aceite a 31/07» sem segunda ida.
// `ficheiro` distingue a assinatura em papel da digital (059/060): o
// acto do papel leva o caminho da fotografia, o digital leva null.
export const getPublicacoes = async (eventoId) => {
  const { data, error } = await supabase
    .from("portal_publicacoes")
    .select("id, tipo, versao, publicado_em, portal_actos(acto, nome_escrito, mensagem, criado_em, ficheiro)")
    .eq("submission_id", eventoId)
    .order("versao", { ascending: false });
  if (error) throw error;
  return data || [];
};

// Os pedidos de código deste evento, mais recentes primeiro. O !inner é o
// filtro: verificações cujo acesso pertence a este evento.
export const getPedidosCodigo = async (eventoId) => {
  const { data, error } = await supabase
    .from("portal_verificacoes")
    .select(
      "id, contexto, pedido_em, codigo, emitido_em, expira_em, usado_em, tentativas, portal_acessos!inner(submission_id)",
    )
    .eq("portal_acessos.submission_id", eventoId)
    .order("pedido_em", { ascending: false });
  if (error) throw error;
  return data || [];
};

// Emite (ou re-devolve) o código de um pedido, para ela enviar pelo
// WhatsApp. A emissão fica no trilho: emitido_por, emitido_em.
export const emitirCodigo = async (verificacaoId) => {
  const { data, error } = await supabase.rpc("dlm_portal_emitir_codigo", {
    p_verificacao_id: verificacaoId,
  });
  if (error) throw error;
  return data;
};

// ---------- Fase 3 · documentos, do lado da cliente ----------
//
// Todos devolvem objectos com `estado` — a página decide o ecrã. Nenhum
// destes lança por erro de negócio; só por falha de rede.

export const pedirCodigo = async (token, contexto) => {
  const { data, error } = await supabase.rpc("dlm_portal_pedir_codigo", {
    p_token: token,
    p_contexto: contexto || null,
  });
  if (error) throw error;
  return data;
};

export const verificarCodigo = async (token, codigo) => {
  const { data, error } = await supabase.rpc("dlm_portal_verificar", {
    p_token: token,
    p_codigo: codigo,
  });
  if (error) throw error;
  return data;
};

export const getDocumentosPortal = async (token) => {
  const { data, error } = await supabase.rpc("dlm_portal_documentos", {
    p_token: token,
  });
  if (error) throw error;
  return data;
};

export const verDocumentoPortal = async (token, tipo, verificacaoId = null, versao = null) => {
  const { data, error } = await supabase.rpc("dlm_portal_ver_documento", {
    p_token: token,
    p_tipo: tipo,
    p_verificacao: verificacaoId,
    p_versao: versao,
  });
  if (error) throw error;
  return data;
};

// O pórtico das condições: confirma que as condições do orçamento foram
// lidas — ANTES do código, antes dos valores. Uma vez por EVENTO, nunca
// por versão: as condições são da casa, não da folha. A prova (token, ip,
// user_agent, carimbo) fica toda no servidor; daqui só se leva o gesto.
// Devolve { estado: 'ok'|'ja_feito', quando } — ou 'nada'/'terminado',
// que a página trata como os vizinhos: sem drama, sem beco.
export const confirmarCondicoes = async (token) => {
  const { data, error } = await supabase.rpc("dlm_portal_condicoes_lidas", {
    p_token: token,
  });
  if (error) throw error;
  return data;
};

// O caminho do papel: sobe a fotografia do contrato assinado para o balde
// PRIVADO e regista o carregamento (que avisa a Caixa de Entrada). O nome
// do ficheiro é aleatório, como o das referências — nunca um id.
export const enviarContratoAssinado = async (token, ficheiro) => {
  const extensao = (ficheiro.name.split(".").pop() || "jpg").toLowerCase();
  const caminho = `papel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extensao}`;
  const { error: errUp } = await supabase.storage
    .from("contratos-assinados")
    .upload(caminho, ficheiro, { upsert: false });
  if (errUp) throw errUp;
  const { data, error } = await supabase.rpc("dlm_portal_registar_assinado_papel", {
    p_token: token,
    p_caminho: caminho,
  });
  if (error) throw error;
  return data;
};

// acto: 'aceitou' | 'pediu_alteracao' | 'assinou' (assinar só o contrato).
// `versao` é a que ela LEU: se saiu outra entretanto, a base recusa com
// `versao_mudou` e ela relê antes de responder (058).
export const registarActo = async (token, tipo, verificacaoId, acto, nome, mensagem, versao = null) => {
  const { data, error } = await supabase.rpc("dlm_portal_acto", {
    p_token: token,
    p_tipo: tipo,
    p_verificacao: verificacaoId,
    p_acto: acto,
    p_nome: nome,
    p_mensagem: mensagem || null,
    p_versao: versao,
  });
  if (error) throw error;
  return data;
};

// ---------- Fase 3 · a assinatura em papel (059) ----------

// Os contratos carregados em papel. A notificação é o único fio entre a
// fotografia e o evento — o nome do ficheiro é aleatório de propósito, para
// não levar o id do evento lá dentro.
//
// NÃO se filtra por `lida_em`. Foi o primeiro instinto e estava errado:
// «aviso por ler» e «assinatura por confirmar» são dois estados sem nada em
// comum, e abrir o aviso na Caixa de Entrada marca-o lido no servidor. A
// Nádia lia o aviso que a mandava à folha do evento e, ao chegar lá, a
// secção de confirmar já não existia — sem mensagem nenhuma a dizer porquê.
// Quem manda a secção embora é a assinatura existir, e isso lê-se noutro
// sítio (os actos da publicação).
export const getPapelPorConfirmar = async (eventoId) => {
  const { data, error } = await supabase
    .from("notificacoes")
    .select("id, created_at, dados, lida_em")
    .eq("tipo", "contrato_papel")
    .eq("submission_id", eventoId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

// O balde é PRIVADO: a fotografia só se vê por URL assinado, e de curta
// duração — quem a vê é a Nádia, autenticada, no momento em que confirma.
export const urlDoContratoPapel = async (caminho) => {
  const { data, error } = await supabase.storage
    .from("contratos-assinados")
    .createSignedUrl(caminho, 300);
  if (error) throw error;
  return data?.signedUrl || null;
};

// Confirma: grava o acto com o nome que está no papel, carimba e TRANCA.
//
// Vai pelo ID DO AVISO, não pelo caminho do ficheiro (060). O servidor tira
// de lá tudo — o ficheiro, o evento, e o MOMENTO em que ela carregou. É o
// momento que decide a versão: se saiu contrato novo entretanto, o acto fica
// preso ao que ela teve mesmo na mão.
export const confirmarContratoPapel = async (notificacaoId, nome) => {
  const { data, error } = await supabase.rpc("dlm_portal_confirmar_papel", {
    p_notificacao_id: notificacaoId,
    p_nome: nome,
  });
  if (error) throw error;
  return data;
};

// ---------- Fase 5 · os pedidos de alteração ao questionário ----------
//
// A lição do contrato em papel, aplicada antes de doer: um aviso que chega
// à Caixa de Entrada tem de ter um ecrã que o atenda. Sem isto,
// `dlm_portal_pedir_alteracao_campo` recusaria para sempre um segundo
// pedido ao mesmo campo — `ja_pedido` —, e a cliente ficava sem caminho.
export const getPedidosDoQuestionario = async (eventoId) => {
  const { data, error } = await supabase
    .from("questionario_pedidos")
    // `dados` (074): o pedido estruturado — hoje, a morada nova nas cinco
    // partes — que a folha do Acompanhamento aplica num toque.
    .select("id, campo_id, campo_label, pedido, pedido_em, dados")
    .eq("submission_id", eventoId)
    .is("respondido_em", null)
    .order("pedido_em", { ascending: false });
  if (error) throw error;
  return data || [];
};

// «Tratado» quer dizer que ela falou com a cliente e resolveu — no valor,
// ou na conversa. Não muda a resposta: mudar a resposta é o briefing, e é
// outro gesto. Isto só reabre a porta a um pedido novo ao mesmo campo.
export const marcarPedidoTratado = async (pedidoId) => {
  const { error } = await supabase
    .from("questionario_pedidos")
    .update({ respondido_em: new Date().toISOString() })
    .eq("id", pedidoId)
    .is("respondido_em", null);
  if (error) throw error;
};

// Os rótulos dos documentos, com a armadilha de sempre à vista:
// `proposta` É o Projecto. Nunca foi o orçamento.
export const ROTULO_DOCUMENTO = {
  orcamento: "Orçamento",
  proposta: "Projecto",
  contrato: "Contrato",
};

// O endereço a partilhar. Único sítio onde o caminho se escreve — se o
// slug mudar, muda aqui (e o antigo passa a redirecionar, regra da casa
// para slugs já circulados).
//
// «acompanhar» e não «portal»: portal é a palavra que usamos entre nós, e
// a cortina fala à cliente em «o acompanhamento». Nenhuma ligação tinha
// sido partilhada quando isto mudou, por isso não ficou slug antigo a
// redirecionar.
export const enderecoDoPortal = (token) =>
  `${window.location.origin}/acompanhar/${token}`;
