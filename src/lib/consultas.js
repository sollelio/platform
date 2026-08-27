import { supabase } from "./supabase";
import { codigoErroRpc } from "./rpc";

// ============================================================
// AS CONSULTAS DE DISPONIBILIDADE — camada de dados.
//
// Uma consulta pergunta a um conjunto de pessoas se estão disponíveis
// para um ou mais eventos existentes. Três de cada vez é o lote em que a
// casa trabalha hoje — é um hábito, não um limite: a base aceita um,
// quatro ou dez. Cada pessoa escolhida recebe uma porta própria: um
// token opaco gerado na base.
//
// A criação NÃO passa por um insert. As três tabelas não têm concessão
// de INSERT nem política de INSERT: a única porta é a RPC
// `create_staff_consultation`, e é ela que garante os três invariantes
// que um CHECK não sabe dizer — pelo menos um evento e sem repetidos,
// pessoa consultável, pessoa com pelo menos uma tarefa compatível.
//
// As respostas chegam por `responderTarefa`, uma pergunta de cada vez.
// Guardar cedo e guardar sempre: ninguém tem de chegar ao fim para a
// primeira resposta contar, e a mesma resposta enviada duas vezes cai
// na mesma linha em vez de duplicar.
// ============================================================

// O que a Nádia lê quando a base recusa. O código vem em maiúsculas
// dentro da mensagem, como em toda a casa (ver rpc.js).
const RECUSAS = {
  PERMISSION_DENIED: "Não tens permissão para criar consultas nesta casa.",
  TITLE_REQUIRED: "Dá um nome à consulta.",
  NEEDS_AT_LEAST_ONE_EVENT: "Escolhe pelo menos um evento.",
  DUPLICATE_EVENTS: "O mesmo evento aparece duas vezes na escolha.",
  EVENT_NOT_FOUND: "Um dos eventos escolhidos não é desta casa.",
  MEMBER_NOT_CONSULTABLE:
    "Uma das pessoas escolhidas não recebe consultas de disponibilidade.",
  MEMBER_WITHOUT_MATCHING_TASKS:
    "Uma das pessoas não tem nenhuma tarefa compatível nos eventos escolhidos.",
  NO_RECIPIENTS: "Escolhe pelo menos uma pessoa.",
  // As da porta pública, que a própria pessoa lê no telemóvel.
  INVALID_STATE: "Essa resposta não é uma das três possíveis.",
  TASK_NOT_AVAILABLE: "Essa tarefa já não faz parte desta consulta.",
  PARTIAL_NEEDS_BOUNDARY:
    "Diz a partir de que horas podes, até que horas, ou as duas coisas.",
  WINDOW_INVERTED: "A hora de fim é anterior à de início.",
  NOTE_TOO_LONG: "A nota é demasiado longa.",
};

export const mensagemDaRecusa = (erro) =>
  RECUSAS[codigoErroRpc(erro)] ||
  "Não foi possível criar a consulta. Tenta outra vez.";

// ---------- Leitura ----------

export const listConsultations = async (organizationId) => {
  const { data, error } = await supabase
    .from("staff_consultations")
    .select(
      "id, organization_id, title, notes, created_at, closed_at, closed_reason, " +
        "staff_consultation_events ( slot, submission_id ), " +
        "staff_consultation_recipients ( id, staff_member_id, token, revoked_at )",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((c) => ({
    ...c,
    eventos: [...(c.staff_consultation_events ?? [])].sort(
      (a, b) => a.slot - b.slot,
    ),
    destinatarios: c.staff_consultation_recipients ?? [],
  }));
};

// ---------- Criação ----------

// Os ids vão como o utilizador os escolheu; a RPC volta a resolvê-los
// contra a casa e recusa o que não for dela. Não se confia neles aqui.
export const createConsultation = async ({
  organizationId,
  title,
  notes,
  submissionIds,
  staffMemberIds,
}) => {
  const { data, error } = await supabase.rpc("create_staff_consultation", {
    p_organization_id: organizationId,
    p_title: title,
    p_notes: notes || null,
    p_submission_ids: submissionIds,
    p_staff_member_ids: staffMemberIds,
  });
  if (error) throw error;
  return data;
};

// ---------- Fecho e revogação ----------

export const closeConsultation = async (id, reason) => {
  const { error } = await supabase
    .from("staff_consultations")
    .update({ closed_at: new Date().toISOString(), closed_reason: reason })
    .eq("id", id);
  if (error) throw error;
};

export const revokeRecipient = async (id, reason) => {
  const { error } = await supabase
    .from("staff_consultation_recipients")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq("id", id);
  if (error) throw error;
};

// ---------- Quem pode ser consultado sobre estes eventos ----------

// Elegível = pessoa activa, consultável, e com pelo menos uma tarefa
// activa compatível com as suas funções nos eventos escolhidos. É a
// mesma regra que a RPC aplica; aqui serve só para a lista não oferecer
// à Nádia gente que a base ia recusar. Vale para um evento escolhido ou
// para dez: a pergunta é a mesma, muda só o conjunto.
export const listEligibleStaff = async (organizationId, submissionIds) => {
  if (!organizationId || !submissionIds?.length) return [];

  const [{ data: tarefas, error: eT }, { data: pessoas, error: eP }] =
    await Promise.all([
      supabase
        .from("event_tasks")
        .select("staff_function_id")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .in("submission_id", submissionIds),
      supabase
        .from("staff_members")
        .select(
          "id, display_name, engagement, is_active, may_be_consulted, " +
            "staff_member_functions ( staff_function_id )",
        )
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .eq("may_be_consulted", true)
        .order("display_name", { ascending: true }),
    ]);
  if (eT) throw eT;
  if (eP) throw eP;

  const exigidas = new Set((tarefas ?? []).map((t) => t.staff_function_id));
  return (pessoas ?? [])
    .map((p) => ({
      ...p,
      functionIds: (p.staff_member_functions ?? []).map(
        (a) => a.staff_function_id,
      ),
    }))
    .filter((p) => p.functionIds.some((f) => exigidas.has(f)));
};

// ---------- A porta pública ----------

export const enderecoDaConsulta = (token) =>
  `${window.location.origin}/disponibilidade/${token}`;

// Os três estados possíveis, e o que a pessoa lê em cada um.
export const ESTADOS_RESPOSTA = [
  { id: "available", label: "Posso" },
  { id: "partial", label: "Só parte do tempo" },
  { id: "unavailable", label: "Não posso" },
];

// Uma pergunta de cada vez. O token é a única credencial, e é a RPC que
// resolve quem é a pessoa, de que casa, de que consulta e se esta tarefa
// alguma vez foi dela — nada disso vai daqui, nem valia de nada ir.
export const responderTarefa = async ({
  token,
  eventTaskId,
  estado,
  de,
  ate,
  nota,
}) => {
  const { data, error } = await supabase.rpc("answer_consultation_task", {
    p_token: token,
    p_event_task_id: eventTaskId,
    p_state: estado,
    p_available_from: de || null,
    p_available_until: ate || null,
    p_note: nota || null,
  });
  if (error) throw error;
  return data || null;
};

export const verConsultaPublica = async (token) => {
  const { data, error } = await supabase.rpc("staff_consultation_view", {
    p_token: token,
  });
  if (error) throw error;
  return data || null;
};
