import { supabase } from "./supabase";
import { ehFuncaoRpcEmFalta } from "./rpc";

// Gera um código legível e único — ex: DLM-X7K9-2025
export const generateCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part1 = Array.from(
    { length: 4 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
  const part2 = Array.from(
    { length: 4 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
  return `DLM-${part1}-${part2}`;
};

// Cria um novo convite no Supabase
// "respostas" é um objecto genérico (ex: { nomeNoivo: "...", email: "..." })
// com os campos que a irmã escolheu preencher no Painel de Novo Convite —
// pode ter campos diferentes, dependendo do tipo de evento e do que ela
// decidiu mostrar nesse momento.
// "submissionAlvoId" (opcional) aponta o formulário a um EVENTO existente:
// ao submeter, as respostas ATUALIZAM esse evento em vez de criar
// cliente + evento novos (o caminho do onboarding pós-sinal).
export const createInvite = async ({
  dataEvento,
  eventTypeId,
  respostas,
  reservaId,
  submissionAlvoId,
}) => {
  let code, exists;
  do {
    code = generateCode();
    const { data } = await supabase
      .from("invites")
      .select("id")
      .eq("code", code)
      .single();
    exists = !!data;
  } while (exists);

  const { data, error } = await supabase
    .from("invites")
    .insert([
      {
        code,
        data_evento: dataEvento || null,
        event_type_id: eventTypeId,
        respostas: respostas || {},
        status: "Pendente",
        reserva_id: reservaId || null,
        submission_alvo_id: submissionAlvoId || null,
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Vai buscar todos os tipos de evento disponíveis
// (para preencher o seletor ao criar um convite, e a lista no Admin)
export const getEventTypes = async () => {
  const { data, error } = await supabase
    .from("event_types")
    .select("id, nome, predefinido, steps, icone")
    // ⚠ CORRECÇÃO DE BUG 3/3 — o `icone` faltava no select, e dois
    // consumidores dependiam dele em silêncio: a mensagem de partilha
    // nunca usava o 💍 do casamento (caía sempre no ✨), e o objecto
    // que vai para o formulário levava `icone: undefined`.
    .order("nome");
  if (error) throw error;
  return data;
};

// Valida um código e devolve o convite se válido
// Inclui também o tipo de evento associado (nome + steps), para o
// formulário saber que perguntas mostrar.
// Caminho novo: RPC formulario_validar_convite (migração 020), que
// traz também os dados do evento-alvo (alvo_dados) para o
// pré-preenchimento do onboarding — o formulário deixa de precisar de
// ler a tabela submissions directamente. Enquanto a função não existir
// na BD, usa o caminho antigo.
export const validateCode = async (code) => {
  let data = null;
  let error = null;

  const rpc = await supabase.rpc("formulario_validar_convite", {
    p_codigo: code,
  });
  if (!rpc.error) {
    data = rpc.data; // null quando o código não existe
  } else if (ehFuncaoRpcEmFalta(rpc.error)) {
    // Caminho antigo (BD ainda sem a migração 020)
    const antigo = await supabase
      .from("invites")
      .select("*, event_types(nome, steps, icone)")
      .eq("code", code.toUpperCase().trim())
      .single();
    data = antigo.data;
    error = antigo.error;
  } else {
    error = rpc.error;
  }

  if (error || !data) {
    return {
      valid: false,
      reason:
        "Código inválido. Verifica o código que recebeste e tenta novamente.",
    };
  }
  if (!data.event_types) {
    return {
      valid: false,
      reason:
        "Este convite não tem um tipo de evento associado. Contacta Do Luxo à Mesa.",
    };
  }
  if (data.status === "Preenchido") {
    return {
      valid: false,
      reason:
        "Este formulário já foi submetido. Se precisares de alterar alguma resposta, contacta Do Luxo à Mesa.",
    };
  }
  return { valid: true, invite: data };
};

// ------------------------------------------------------------
// A FONTE ÚNICA da pergunta "qual é o convite deste evento e em que
// estado está o formulário?". Antes havia quatro contas diferentes
// (drawer, Jornada, separador Documentos, AdminPage) que divergiam
// quando o evento tinha mais de um convite — e um convite que tinha
// duplicado (respostas gravadas noutro evento) acendia "Formulário ✓"
// no evento original, escondendo o próprio estrago.
//
// Estados devolvidos:
//   "nenhum"            → não há convite deste evento (criar)
//   "pendente"          → convite por preencher (preencher/partilhar)
//   "preenchido"        → respostas gravadas NESTE evento (ver)
//   "preenchido-noutro" → convite apontado cá, mas as respostas foram
//                         parar a OUTRO evento — o rasto da duplicação;
//                         conta como "sem respostas" em todos os ✓.
// Desempate determinístico: o mais recente primeiro (created_at; id
// como critério final, para listas que chegam sem ordenação da BD).
export const estadoFormularioDoEvento = (invites, eventoId) => {
  if (!eventoId) return { convite: null, estado: "nenhum" };
  const doEvento = (invites || []).filter(
    (i) => i.submission_id === eventoId || i.submission_alvo_id === eventoId,
  );
  const maisRecente = (lista) =>
    [...lista].sort(
      (a, b) =>
        new Date(b.created_at || 0) - new Date(a.created_at || 0) ||
        String(b.id).localeCompare(String(a.id)),
    )[0] || null;

  const preenchidoAqui = maisRecente(
    doEvento.filter((i) => i.submission_id === eventoId),
  );
  if (preenchidoAqui) return { convite: preenchidoAqui, estado: "preenchido" };

  // "Pendente" exige as duas coisas: sem submissão E status por
  // preencher. Um convite marcado "Preenchido" sem submission_id (o
  // rasto de um markInviteUsed que falhou a meio) não pode voltar a
  // ser oferecido para preencher.
  const pendente = maisRecente(
    doEvento.filter((i) => !i.submission_id && i.status !== "Preenchido"),
  );
  if (pendente) return { convite: pendente, estado: "pendente" };

  const desviado = maisRecente(doEvento);
  if (desviado) return { convite: desviado, estado: "preenchido-noutro" };

  return { convite: null, estado: "nenhum" };
};

// Aponta um convite PENDENTE a um evento existente — a reparação manual
// de um convite órfão (criado sem alvo, o caminho que duplicava). A
// guarda .is("submission_id", null) vive no servidor: um convite já
// preenchido nunca é re-apontado, mesmo com dois separadores abertos.
export const apontarConviteAoEvento = async (inviteId, submissionId) => {
  const { data, error } = await supabase
    .from("invites")
    .update({ submission_alvo_id: submissionId })
    .eq("id", inviteId)
    .is("submission_id", null)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Marca o convite como preenchido e liga à submissão.
// Se o convite nasceu de uma reserva (reserva_id), converte também
// essa reserva: liga-a à submissão e marca-a como "Convertida".
// Assim, quando o cliente submete o formulário, a reserva provisória
// deixa de aparecer na agenda e passa a evento real automaticamente.
export const markInviteUsed = async (inviteId, submissionId) => {
  // buscar o convite para saber se tem reserva associada
  const { data: invite } = await supabase
    .from("invites")
    .select("reserva_id")
    .eq("id", inviteId)
    .single();

  // Estes updates falhavam em silêncio (sem verificação do erro): o
  // convite ficava "Pendente" apesar da submissão gravada, e a reserva
  // nunca convertia. Agora propagam — quem chama decide o que fazer
  // (o FormPage regista e não incomoda o cliente).
  const { error: erroInvite } = await supabase
    .from("invites")
    .update({ status: "Preenchido", submission_id: submissionId })
    .eq("id", inviteId);
  if (erroInvite) throw erroInvite;

  // converter a reserva de origem, se existir
  if (invite?.reserva_id) {
    const { error: erroReserva } = await supabase
      .from("reservas")
      .update({ estado: "Convertida", submission_id: submissionId })
      .eq("id", invite.reserva_id);
    if (erroReserva) throw erroReserva;
  }
};

// ============================================================
// OS FORMULÁRIOS ÓRFÃOS — a definição num sítio só.
//
// Um órfão é um formulário por preencher que não está ligado a evento
// nenhum. Cada um é uma porta para o duplicado: se for de alguém que já
// existe, o preenchimento cria cliente E evento novos.
//
// Havia duas formas de chegar a eles — a lista global (Formulários) e
// uma leitura própria (a página do evento, que só lê os convites DESTE
// evento). Duas formas com a regra escrita duas vezes divergiriam; a
// regra fica aqui, as formas de acesso é que são duas.
// ============================================================

export const ehFormularioOrfao = (i) =>
  i.status !== "Preenchido" && !i.submission_id && !i.submission_alvo_id;

// As TRÊS condições da adopção. Governavam o selector do painel antigo;
// agora que o aviso dentro do evento também as precisa, saem de lá.
//   1. um convite nascido de uma RESERVA não se adopta — pertence à
//      conversão dessa reserva;
//   2. o tipo tem de coincidir: apontar um Aniversário a um Casamento
//      reescreveria o tipo e fundiria respostas de outro modelo;
//   3. um órfão SEM tipo aceita qualquer evento.
export const podeSerAdoptadoPor = (orfao, evento) =>
  !!evento &&
  !orfao.reserva_id &&
  (!orfao.event_type_id || orfao.event_type_id === evento.event_type_id);

// A leitura própria, para quem não tem a lista global em mão.
export const getFormulariosOrfaos = async () => {
  const { data, error } = await supabase
    .from("invites")
    .select("*")
    .is("submission_id", null)
    .is("submission_alvo_id", null)
    .neq("status", "Preenchido")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};
