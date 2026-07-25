import { supabase } from "./supabase";
import { ehFuncaoRpcEmFalta } from "./rpc";
import {
  getValorAtual,
  getResumoSubmissao,
  FIELD_MAP_INVERSO,
} from "./submissionFields";
import { gerarPrevistos } from "./pagamentos";

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
export const getClienteComEventos = async (clienteId) => {
  const { data, error } = await supabase
    .from("clientes")
    .select("*, submissions(*)")
    .eq("id", clienteId)
    .single();
  if (error) throw error;
  const eventos = (data.submissions || []).sort((a, b) =>
    (a.data_evento || "9999").localeCompare(b.data_evento || "9999"),
  );
  return { ...data, eventos };
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
//   invites.submission_alvo_id    → SET NULL  (convite por preencher perde o alvo)
//   invites.submission_id         → NO ACTION (BLOQUEIA: convite já preenchido aponta cá)
export const getVinculosEvento = async (submissionId) => {
  const [
    { data: documentos, error: erroDocs },
    { data: reservas, error: erroRes },
    { data: pagamentos, error: erroPag },
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
  ]);
  if (erroDocs) throw erroDocs;
  if (erroRes) throw erroRes;
  if (erroPag) throw erroPag;
  return {
    documentos: documentos || [],
    reservas: reservas || [],
    pagamentos: pagamentos || [],
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
// Também gera o plano de pagamento (sinal + remanescente) sozinho —
// gerarPrevistos é idempotente, por isso guardar o valor várias vezes
// não duplica o plano. Uma falha aqui não deve impedir o valor de
// ficar guardado (é a acção que a Nádia estava mesmo a fazer); o
// painel de pagamentos sabe recuperar (botão "Gerar plano") se isto
// falhar silenciosamente.
export const guardarValorAcordado = async (submissionId, valor) => {
  const v = Number(valor);
  if (!submissionId || !Number.isFinite(v)) {
    throw new Error("Valor ou evento em falta.");
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
      await gerarPrevistos(submissionId, v, data.data_evento);
    } catch (e) {
      console.error("gerarPrevistos falhou após guardarValorAcordado:", e);
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

export const updateFase = async (submissionId, fase) => {
  if (!FASES_VALIDAS.includes(fase)) {
    throw new Error(`Fase inválida: ${fase}`);
  }
  const { data, error } = await supabase
    .from("submissions")
    .update({ fase })
    .eq("id", submissionId)
    .select()
    .single();
  if (error) throw error;
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

  // Contraentes do contrato
  const noivo = ler("nomeNoivo");
  const noiva = ler("nomeNoiva");
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

  return {
    submissionId: submission.id,
    titulo: resumo.titulo,
    cliente,

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