import { supabase } from "./supabase";
import { ehFuncaoRpcEmFalta } from "./rpc";
import {
  getValorAtual,
  getResumoSubmissao,
  normalizeSubmission,
  FIELD_MAP_INVERSO,
} from "./submissionFields";
import { sincronizarPrevistos } from "./pagamentos";

// ============================================================
// Clientes — a pessoa (separada do evento desde a migração 010).
// Um cliente tem vários eventos (submissions com cliente_id).
// ============================================================

// Lista os clientes com um resumo dos seus eventos (contagem + primeiro ano).
// Uma query só: clientes + eventos ligados, agregados no cliente.
export const getClientes = async () => {
  const { data, error } = await supabase
    .from("clientes")
    .select(
      "id, nome, contacto, email, nif, morada, notas, created_at, submissions(id, data_evento, fase, event_type_id, tipoEventoOutro:respostas->>tipoEventoOutro)",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data || []).map((c) => {
    const eventos = c.submissions || [];
    const anos = eventos
      .map((e) => (e.data_evento ? Number(e.data_evento.slice(0, 4)) : null))
      .filter(Boolean);
    return {
      ...c,
      totalEventos: eventos.length,
      desdeAno: anos.length ? Math.min(...anos) : null,
    };
  });
};

// Obtém um cliente com os seus eventos completos, ordenados por data.
// maybeSingle e não single: com o cliente a viver num URL
// (/admin/contactos/:clienteId), um id que já não existe — link antigo,
// endereço mal colado, cliente entretanto apagado — deixou de ser um
// caso impossível. O single ATIRAVA (PGRST116) e, numa rota dedicada,
// não há lista por trás para amparar: dava ecrã em branco. Assim
// devolve null e quem chama mostra o seu próprio «não encontrado».
// (Mesma escolha que o getEventoCompleto já fazia, logo abaixo.)
export const getClienteComEventos = async (clienteId) => {
  const { data, error } = await supabase
    .from("clientes")
    .select("*, submissions(*)")
    .eq("id", clienteId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const eventos = (data.submissions || []).sort((a, b) =>
    (a.data_evento || "9999").localeCompare(b.data_evento || "9999"),
  );
  return { ...data, eventos };
};

// UM evento pelo seu id, com o cliente ligado — a porta de entrada da
// página /evento/:id, que ao contrário de todos os outros ecrãs não
// recebe o evento de uma lista já carregada: chega-lhe só o id do URL.
// Passa pelo normalizeSubmission como o resto da app, para as colunas
// antigas e o respostas ficarem alinhados.
export const getEventoCompleto = async (id) => {
  const { data, error } = await supabase
    .from("submissions")
    .select("*, clientes(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { clientes: cliente, ...submissao } = data;
  return { ...normalizeSubmission(submissao), cliente: cliente || null };
};

// Atualiza os dados da pessoa (nome, contacto, email, nif, morada, notas).
export const updateCliente = async (id, dados) => {
  const permitidos = ["nome", "contacto", "email", "nif", "morada", "notas"];
  const limpos = {};
  for (const k of permitidos) {
    if (k in dados) limpos[k] = dados[k];
  }
  const { data, error } = await supabase
    .from("clientes")
    .update(limpos)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// O que este evento arrasta consigo ao ser removido — para a Nádia
// decidir com informação, ANTES de confirmar. Confirmado nas FKs reais
// da BD (submissions):
//   documentos.submission_id      → CASCADE   (apagam-se para sempre)
//   evento_materiais.submission_id→ CASCADE   (reservas de stock só, sem dados a perder)
//   notificacoes.submission_id    → CASCADE   (notificações antigas, sem interesse)
//   reservas.submission_id        → SET NULL  (a reserva fica na Agenda, mas desliga-se)
//   invites.submission_alvo_id    → SET NULL  (convite por preencher perde o alvo
//     e, se depois for preenchido, cria cliente + evento NOVOS em vez de
//     atualizar este — por isso os convites pendentes apontados entram
//     no aviso da remoção)
//   invites.submission_id         → NO ACTION (BLOQUEIA: convite já preenchido aponta cá)
export const getVinculosEvento = async (submissionId) => {
  const [
    { data: documentos, error: erroDocs },
    { data: reservas, error: erroRes },
    { data: pagamentos, error: erroPag },
    { data: convitesPendentes, error: erroConv },
  ] = await Promise.all([
    supabase.from("documentos").select("tipo").eq("submission_id", submissionId),
    supabase
      .from("reservas")
      .select("id, estado")
      .eq("submission_id", submissionId),
    supabase
      .from("pagamentos")
      .select("id, valor, data, reconstituido")
      .eq("submission_id", submissionId),
    supabase
      .from("invites")
      .select("id, code, created_at")
      .eq("submission_alvo_id", submissionId)
      .is("submission_id", null),
  ]);
  if (erroDocs) throw erroDocs;
  if (erroRes) throw erroRes;
  if (erroPag) throw erroPag;
  if (erroConv) throw erroConv;
  return {
    documentos: documentos || [],
    reservas: reservas || [],
    pagamentos: pagamentos || [],
    convitesPendentes: convitesPendentes || [],
  };
};

// Remove um evento (submission) — para os casos criados por engano.
// Bloqueado pela BD (FK NO ACTION/RESTRICT) em dois casos, cada um com
// a sua constraint nomeada (para o código distinguir qual foi, ver
// handleConfirmarRemocaoEvento em ClientesLista.jsx):
//   invites.submission_id      → convite já preenchido ligado ao evento
//   pagamentos_submission_fk   → há dinheiro registado (RESTRICT
//     deliberado — ver docs/migracoes/025_pagamentos.sql)
// Documentos, reservas e pagamentos_previstos NÃO bloqueiam (CASCADE/
// SET NULL) — ver getVinculosEvento para avisar do que se perde antes
// de apagar, e do que impede a remoção (pagamentos reais).
export const deleteEvento = async (submissionId) => {
  const { error } = await supabase
    .from("submissions")
    .delete()
    .eq("id", submissionId);
  if (error) throw error;
};

// Cria um evento novo (submission) JÁ LIGADO a um cliente existente —
// o caminho da recorrência (Opção 3): nunca cria cliente, só evento.
// O evento nasce na fase inicial do funil.
export const createEventoParaCliente = async (clienteId, dados = {}) => {
  const { data, error } = await supabase
    .from("submissions")
    .insert({
      cliente_id: clienteId,
      fase: "interessado",
      ...dados,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
};

// ============================================================
// Submissão do questionário público (Cenário A: cliente novo).
// Cria o CLIENTE (extraindo os dados de pessoa das respostas) e a
// SUBMISSÃO (o evento) já ligada — nasce tudo junto, como decidido.
//
// A extração do nome segue a prioridade da migração 011:
//   1. nomeNoivo & nomeNoiva   (casamentos)
//   2. nomeDoCliente           (outros eventos)
//   3. nomeResponsavel         (fallback; nomeDoBebe fica de fora — o
//      bebé é o homenageado, não quem contrata)
// ============================================================

const limpar = (v) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};

// Extrai os dados de pessoa das respostas do formulário (JSONB).
export const extrairDadosCliente = (respostas = {}) => {
  const noivo = limpar(respostas.nomeNoivo);
  const noiva = limpar(respostas.nomeNoiva);
  const casal = [noivo, noiva].filter(Boolean).join(" & ") || null;

  const nome =
    casal ||
    limpar(respostas.nomeDoCliente) ||
    limpar(respostas.nomeResponsavel) ||
    "Cliente sem nome";

  return {
    nome,
    contacto: limpar(respostas.contactoPrincipal),
    email: limpar(respostas.email),
    morada: limpar(respostas.morada),
  };
};

// Submete o questionário: cria cliente + submissão ligados.
// payload = o objeto que o FormPage montava (event_type_id, data_evento,
// numero_convidados, respostas). Devolve a submissão criada.
export const submeterQuestionario = async (payload) => {
  // 1. Criar o cliente com os dados de pessoa extraídos das respostas
  const dadosCliente = extrairDadosCliente(payload.respostas);
  const { data: cliente, error: erroCliente } = await supabase
    .from("clientes")
    .insert(dadosCliente)
    .select()
    .single();
  if (erroCliente) throw erroCliente;

  // 2. Criar a submissão (o evento) já ligada ao cliente.
  //    O questionário só se preenche DEPOIS de a venda fechar (é
  //    onboarding, não captação) — por isso o evento nasce na fase
  //    "cliente" (funil comercial concluído; o operacional começa no
  //    status "Recebido" que o sistema já atribui).
  const { data: submission, error: erroSub } = await supabase
    .from("submissions")
    .insert([{ ...payload, cliente_id: cliente.id, fase: "cliente" }])
    .select()
    .single();
  if (erroSub) {
    // Não deixar um cliente órfão se a submissão falhar
    await supabase.from("clientes").delete().eq("id", cliente.id);
    throw erroSub;
  }

  return submission;
};

// ============================================================
// atualizarEventoComQuestionario — o caminho do ONBOARDING: o convite
// do formulário grande foi apontado a um evento existente
// (submission_alvo_id, migração 013). Em vez de criar cliente + evento
// novos, as respostas ATUALIZAM esse evento:
//   • merge no respostas (o que já lá vive — imagensReferencia da
//     captação, pretende, mensagemInicial — NUNCA se perde)
//   • escrita também nas colunas antigas equivalentes (dupla fonte,
//     via FIELD_MAP_INVERSO — o mesmo padrão do drawer ao guardar)
//   • a fase NÃO é tocada (é a Nádia que a gere no funil)
// ============================================================
export const atualizarEventoComQuestionario = async (
  submissionId,
  payload,
) => {
  if (!submissionId) throw new Error("submissionId em falta.");

  // 1) respostas atuais do evento (para o merge não apagar nada)
  const { data: atual, error: erroAtual } = await supabase
    .from("submissions")
    .select("respostas")
    .eq("id", submissionId)
    .single();
  if (erroAtual) throw erroAtual;

  const respostas = {
    ...(atual?.respostas || {}),
    ...(payload.respostas || {}),
  };

  // 2) montar o update: respostas + colunas fixas + colunas antigas
  const update = { respostas };
  if (payload.event_type_id) update.event_type_id = payload.event_type_id;
  if (payload.data_evento) update.data_evento = payload.data_evento;
  if (
    payload.numero_convidados !== null &&
    payload.numero_convidados !== undefined
  ) {
    update.numero_convidados = payload.numero_convidados;
  }
  for (const [campoId, valor] of Object.entries(payload.respostas || {})) {
    const coluna = FIELD_MAP_INVERSO[campoId];
    if (!coluna) continue;
    // numero_convidados é integer e já foi definido acima com o valor
    // parseado — não o sobrepor com a string crua das respostas.
    if (coluna === "numero_convidados") continue;
    // "" rebenta nas colunas tipadas (time, integer): um campo opcional
    // deixado vazio pelo cliente falhava a submissão inteira com um
    // erro genérico. Vazio grava null.
    update[coluna] = valor === "" ? null : valor;
  }

  const { data, error } = await supabase
    .from("submissions")
    .update(update)
    .eq("id", submissionId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// ============================================================
// submeterFormulario — o ponto ÚNICO de submissão do questionário
// público. Caminho novo: RPC formulario_submeter (migração 020), que
// faz TUDO numa transação no Postgres (validar o convite, gravar as
// respostas, marcar o convite, converter a reserva) — sem estados
// intermédios possíveis. Enquanto a função não existir na BD, usa o
// caminho antigo em passos separados.
//
// Devolve { submission, conviteMarcado }: no caminho novo o convite
// já fica marcado; no antigo, quem chama trata do markInviteUsed.
// ============================================================
export const submeterFormulario = async (invite, payload) => {
  const { data, error } = await supabase.rpc("formulario_submeter", {
    p_codigo: invite.code,
    p_payload: payload,
  });
  if (!error) {
    return { submission: data, conviteMarcado: true };
  }
  if (!ehFuncaoRpcEmFalta(error)) throw error;

  // Caminho antigo (BD ainda sem a migração 020)
  let submission;
  if (invite.submission_alvo_id) {
    submission = await atualizarEventoComQuestionario(
      invite.submission_alvo_id,
      payload,
    );
  } else {
    submission = await submeterQuestionario(payload);
  }
  return { submission, conviteMarcado: false };
};

// Guarda o TOTAL do orçamento como valor acordado do evento — é
// este campo que alimenta o "sinal (50%)" do funil e o {VALOR}/
// {SINAL} das mensagens-tipo. Chamado pelo botão no gerador de
// orçamento (quando o documento vem de um evento).
//
// Também mantém o plano de pagamento em dia — sincronizarPrevistos
// gera-o quando não existe e, quando existe, ajusta os previstos SEM
// pagamentos ligados ao valor novo (o insert-once antigo deixava o
// plano preso ao primeiro valor: a Nádia confirmava metade do acordado
// no ecrã e a BD registava o valor velho). Uma falha aqui não deve
// impedir o valor de ficar guardado (é a acção que a Nádia estava
// mesmo a fazer); o painel de pagamentos sabe recuperar (botão
// "Gerar plano") se isto falhar silenciosamente.
export const guardarValorAcordado = async (submissionId, valor) => {
  const v = Number(valor);
  if (!submissionId || !Number.isFinite(v)) {
    throw new Error("Valor ou evento em falta.");
  }
  // Um valor ≤ 0 gravado deixaria o plano velho órfão (a sincronização
  // só corre com v > 0) e esconderia o separador de pagamentos atrás
  // do convite "ainda não há valor" — com dinheiro na BD invisível.
  if (v <= 0) {
    throw new Error("O valor acordado tem de ser maior que zero.");
  }
  const { data, error } = await supabase
    .from("submissions")
    .update({ valor_acordado: v })
    .eq("id", submissionId)
    .select()
    .single();
  if (error) throw error;
  if (v > 0) {
    try {
      await sincronizarPrevistos(submissionId, v, data.data_evento);
    } catch (e) {
      console.error(
        "sincronizarPrevistos falhou após guardarValorAcordado:",
        e,
      );
    }
  }
  return data;
};

// Marca (ou desmarca) o pagamento final de um evento — a Nádia
// recebe 50% de sinal e o resto até 48h ANTES do evento; o Início
// alerta enquanto isto estiver a false com o evento próximo.
export const marcarPagamentoFinal = async (submissionId, pago) => {
  const { data, error } = await supabase
    .from("submissions")
    .update({ pagamento_final: !!pago })
    .eq("id", submissionId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// ============================================================
// Funil comercial — leitura e avanço de fases.
// ============================================================

// Todos os eventos com o nome do cliente ligado — a matéria-prima do
// funil. Traz a linha completa da submission para o card poder abrir
// o SubmissionDrawer diretamente.
export const getEventosFunil = async () => {
  const { data, error } = await supabase
    .from("submissions")
    .select("*, clientes(nome)")
    .order("data_evento", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
};

// Muda a fase de um evento — com whitelist (lição 3): só as fases da
// CHECK constraint passam; qualquer outra rebenta aqui e não na BD.
const FASES_VALIDAS = [
  "interessado",
  "orcamento",
  "sinal",
  "cliente",
  "projecto",
  "contrato",
  "perdido",
];

// O CHECK da migração 040 (status pós-sinal ⇒ fase pós-sinal ou
// perdido) responde com 23514 quando uma escrita violaria o par — a
// última rede, depois das guardas do código. A mensagem é da casa,
// nunca o erro cru do Postgres.
const mensagemCheckFaseStatus = (error) => {
  if (error?.code !== "23514") return null;
  if ((error.message || "").includes("submissions_status_pos_sinal")) {
    return "Este estado só é possível depois do sinal — a fase do evento já não o permite. Recarrega a página.";
  }
  if ((error.message || "").includes("submissions_status_valido")) {
    return "Estado inválido para um evento — recarrega a página e tenta de novo.";
  }
  return "Esta mudança entra em conflito com o estado do evento — recarrega a página.";
};

// `opcoes.status` permite escrever fase e status NUM SÓ update — o par
// atómico de que a recuperação de um perdido precisa (voltar a
// Interessados limpando o estado, sem janela onde o CHECK da 040
// visse um par inválido).
export const updateFase = async (submissionId, fase, opcoes = {}) => {
  if (!FASES_VALIDAS.includes(fase)) {
    throw new Error(`Fase inválida: ${fase}`);
  }
  const update = { fase };
  if (opcoes.status) update.status = opcoes.status;
  const { data, error } = await supabase
    .from("submissions")
    .update(update)
    .eq("id", submissionId)
    .select()
    .single();
  if (error?.code === "PGRST116") {
    throw new Error(
      "Este evento já não existe ou mudou noutra sessão — recarrega a página.",
    );
  }
  if (error) {
    const mensagem = mensagemCheckFaseStatus(error);
    if (mensagem) throw new Error(mensagem);
    throw error;
  }
  return data;
};

// Estados operacionais (Em Preparação/Confirmado/Concluído) só fazem
// sentido DEPOIS do sinal — a Jornada já assume isso (Jornada.jsx: os
// passos "Preparação"/"Grande dia" só ficam clicáveis depois do
// sinal), mas nada impedia a coluna `status` de os ter antes disso.
// "Recebido" é o estado neutro de partida e continua livre em
// qualquer fase.
//
// FASES_POS_SINAL espelha components/admin/faseConfig.js — lib/ não
// importa de components/ (mesma razão da FASES_VALIDAS acima: evitar
// a dependência ao contrário).
const FASES_POS_SINAL = ["cliente", "projecto", "contrato"];
const STATUS_POS_SINAL = ["Em Preparação", "Confirmado", "Concluído"];
const FASE_LABEL_PRE_SINAL = {
  interessado: "Interessada",
  orcamento: "Orçamento enviado",
  sinal: "A aguardar sinal",
};

export const updateStatus = async (submissionId, novoStatus, faseAtual) => {
  // A pré-validação local dá a mensagem imediata e explicada, com a
  // fase que o ecrã mostra. A AUTORIDADE na direção que corrompe
  // (gravar estado pós-sinal num evento pré-sinal) é o WHERE abaixo,
  // contra a fase REAL — o drawer aberto sobre dados velhos deixava
  // passar. (No sentido inverso — snapshot pré-sinal, fase real já
  // avançada — o bloqueio local pode recusar a mais; a Jornada nem
  // torna o gesto clicável nesse estado, e recarregar resolve.)
  const comGuardaDeFase = STATUS_POS_SINAL.includes(novoStatus);
  if (comGuardaDeFase && !FASES_POS_SINAL.includes(faseAtual)) {
    throw new Error(
      `Não é possível marcar "${novoStatus}" antes do sinal — este evento está em "${FASE_LABEL_PRE_SINAL[faseAtual] || faseAtual || "sem fase definida"}".`,
    );
  }
  let query = supabase
    .from("submissions")
    .update({ status: novoStatus })
    .eq("id", submissionId);
  if (comGuardaDeFase) {
    query = query.in("fase", FASES_POS_SINAL);
  }
  const { data, error } = await query.select().single();
  if (error?.code === "PGRST116") {
    // 0 linhas — repetir sem recarregar nunca vai funcionar. Com a
    // guarda de fase aplicada, o mais provável é a fase ter mudado
    // noutra sessão; sem ela, só pode ser o evento a já não existir.
    throw new Error(
      comGuardaDeFase
        ? "A fase deste evento mudou entretanto (ou o evento já não existe) — o estado não foi alterado. Recarrega a página."
        : "Este evento já não existe ou mudou noutra sessão — recarrega a página.",
    );
  }
  if (error) {
    const mensagem = mensagemCheckFaseStatus(error);
    if (mensagem) throw new Error(mensagem);
    throw error;
  }
  return data;
};

// ============================================================
// Documentos pré-preenchidos — junta os dados do CLIENTE (pessoa) e
// do EVENTO (submission) num objeto pronto a alimentar os formulários
// de Orçamento e Contrato.
//
// Regras respeitadas:
//   • Leitura SEMPRE das duas fontes (colunas antigas OU respostas
//     JSONB), via getValorAtual.
//   • O NIF vive em clientes.nif (a submissions não tem coluna nif).
//   • Contraentes: só há 2 quando existem nomeNoivo E nomeNoiva
//     (casamentos). Batizados, aniversários, dia da mãe/pai, etc.
//     têm 1 contraente — o cliente. Nos casais, o NIF do cliente
//     pré-preenche o 1.º contraente; o 2.º fica para a Nádia.
// ============================================================
export const getDadosParaDocumento = async (submission, eventTypes) => {
  // 1. Buscar a pessoa (pode não existir em eventos antigos sem cliente_id)
  let cliente = null;
  if (submission.cliente_id) {
    const { data, error } = await supabase
      .from("clientes")
      .select("id, nome, contacto, email, nif, morada")
      .eq("id", submission.cliente_id)
      .single();
    if (!error) cliente = data;
  }

  // Leitura dupla fonte, já limpa (null quando vazio)
  const ler = (campoId) => limpar(getValorAtual(submission, campoId));

  const tipo = eventTypes?.find((et) => et.id === submission.event_type_id);
  const resumo = getResumoSubmissao(submission, eventTypes);

  // ── Contraentes do contrato ────────────────────────────────────────────
  //
  // REDE DE TRÊS CAMADAS, como a morada já tinha. Antes lia-se só
  // `nomeNoivo`/`nomeNoiva` — as chaves canónicas do FIELD_MAP — e essas
  // NÃO APARECEM UMA ÚNICA VEZ em `submissions.respostas`. Os ids dos
  // modelos são gerados a partir das etiquetas (`toCamelId` no
  // EventTypeEditor), por isso «Nome do Noivo» dá `nomeDoNoivo` e nunca
  // `nomeNoivo`. Resultado: os três contratos de casal já emitidos saíram
  // com UM contraente só, na redacção do singular, sem nada no papel a
  // assinalar que faltava uma parte.
  //
  // ⚠ A LISTA DA NOIVA CONTÉM `nomeDaNoivo`, E ISSO NÃO É ENGANO.
  // No modelo Casamento as etiquetas saíram trocadas («Nome do Noiva»,
  // «Nome da Noivo») e os ids nasceram delas. A ordem dos campos e os
  // exemplos («Ex: João Silva» primeiro) provam a intenção, e o modelo
  // Noivado — correcto — confirma-a. A migração 053 corrige as etiquetas;
  // os ids ficam trocados para sempre, porque já têm respostas guardadas
  // debaixo deles. Não «arrumes» esta lista a olhar só para os nomes.
  //
  // O caminho limpo para o futuro é marcar `papel` nos campos do modelo —
  // hoje nenhum dos 192 campos tem papel nenhum.
  const CHAVES_NOIVO = ["nomeNoivo", "nomeDoNoivo", "nomeDoNoiva"];
  const CHAVES_NOIVA = ["nomeNoiva", "nomeDaNoiva", "nomeDaNoivo"];
  const lerPrimeiro = (chaves) => {
    for (const c of chaves) {
      const v = ler(c);
      if (v) return v;
    }
    return null;
  };

  const noivo = lerPrimeiro(CHAVES_NOIVO);
  const noiva = lerPrimeiro(CHAVES_NOIVA);
  let contraentes;
  if (noivo && noiva) {
    contraentes = [
      { nome: noivo, nif: cliente?.nif || "" },
      { nome: noiva, nif: "" },
    ];
  } else {
    contraentes = [
      {
        nome:
          cliente?.nome ||
          ler("nomeDoCliente") ||
          ler("nomeResponsavel") ||
          "",
        nif: cliente?.nif || "",
      },
    ];
  }

  // Um modelo é DE CASAL quando tem os dois campos de nome. Não se adivinha
  // pelo nome do modelo (há casamentos chamados de tudo): pergunta-se ao
  // próprio modelo que campos tem.
  //
  // Serve só para AVISAR, nunca para bloquear: um baptizado com um
  // contraente está certo, e um aviso que aparece sempre é um aviso que se
  // aprende a ignorar.
  const idsDoModelo = (tipo?.steps || []).flatMap((p) =>
    (p.fields || []).map((f) => f.id),
  );
  const modeloDeCasal =
    idsDoModelo.some((id) => CHAVES_NOIVO.includes(id)) &&
    idsDoModelo.some((id) => CHAVES_NOIVA.includes(id));

  return {
    submissionId: submission.id,
    titulo: resumo.titulo,
    cliente,
    // O contrato pergunta isto antes de deixar imprimir em silêncio.
    modeloDeCasal,

    // ---- Orçamento ----
    nomeCliente: cliente?.nome || resumo.titulo || "",
    tipoEvento: tipo?.nome || "",
    dataEvento: submission.data_evento || ler("dataEvento") || "",
    local: ler("localEvento") || "",
    // Imagens de referência DO CLIENTE (vêm da captação) — entram no
    // PDF do orçamento como páginas de referências.
    imagensReferencia: Array.isArray(submission.respostas?.imagensReferencia)
      ? submission.respostas.imagensReferencia
      : [],

    // ---- Contrato ----
    contraentes,
    morada: cliente?.morada || ler("morada") || "",
    contacto: cliente?.contacto || ler("contactoPrincipal") || "",
    horaInicio: ler("horaInicio") || "",
    horaFim: ler("horaTermino") || "",
    // O contrato (e o painel de deslocação do orçamento) querem a morada
    // completa do espaço — o papel "morada" marcado no modelo é a fonte
    // mais fiável; sem isso, cai nos campos ad-hoc de sempre.
    localCompleto: resumo.morada || ler("moradaExacta") || ler("localEvento") || "",
    lugares: ler("numeroConvidados") || "",
    valor: submission.valor_acordado ?? "",
  };
};