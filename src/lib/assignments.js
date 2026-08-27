import { supabase } from "./supabase";
import { codigoErroRpc } from "./rpc";

// ============================================================
// A ESCALA DE UM EVENTO — camada de dados.
//
// Lê-se SEMPRE um evento de cada vez. Uma consulta pode cobrir vários
// eventos, mas montar a escala é trabalho de um dia só, e uma grelha
// que juntasse eventos obrigaria a Nádia a fazer a separação de cabeça.
//
// Nada aqui escolhe, ordena por aptidão, pontua ou recomenda ninguém.
// A ordem é a ordem normal da casa — o nome. Quem entra na tarefa entra
// porque a Nádia o disse.
//
// A disponibilidade INFORMA a decisão, não a decide: pode atribuir-se
// quem disse que não podia. O ecrã avisa e grava na mesma.
// ============================================================

const RECUSAS = {
  PERMISSION_DENIED: "Não tens permissão para montar escalas nesta casa.",
  MEMBER_NOT_FOUND: "Essa pessoa não é da equipa desta casa.",
  MEMBER_INACTIVE: "Essa pessoa está inactiva e não recebe trabalho novo.",
  MEMBER_LACKS_FUNCTION:
    "Essa pessoa não tem a função que esta tarefa exige.",
};

export const mensagemDaRecusaDeEscala = (erro) =>
  RECUSAS[codigoErroRpc(erro)] ||
  "Não foi possível guardar a atribuição. Tenta outra vez.";

// ---------- Leitura ----------

export const listEventAssignments = async (organizationId, submissionId) => {
  const { data, error } = await supabase
    .from("event_task_assignments")
    .select("id, event_task_id, staff_member_id, assigned_at, event_tasks!inner ( submission_id )")
    .eq("organization_id", organizationId)
    .eq("event_tasks.submission_id", submissionId);
  if (error) throw error;
  return data ?? [];
};

// As consultas que cobrem ESTE evento, da mais recente para a mais
// antiga. Podem ser várias: nada no modelo o impede, e juntá-las seria
// misturar respostas dadas a perguntas diferentes.
export const listConsultationsForEvent = async (
  organizationId,
  submissionId,
) => {
  const { data, error } = await supabase
    .from("staff_consultation_events")
    .select(
      "consultation_id, staff_consultations!inner ( id, title, created_at, closed_at )",
    )
    .eq("organization_id", organizationId)
    .eq("submission_id", submissionId);
  if (error) throw error;
  return (data ?? [])
    .map((r) => r.staff_consultations)
    .filter(Boolean)
    .sort((a, b) => {
      // determinista: mais recente primeiro, e o id desempata para que
      // duas consultas criadas no mesmo instante não troquem de lugar
      const t = new Date(b.created_at) - new Date(a.created_at);
      return t !== 0 ? t : b.id.localeCompare(a.id);
    });
};

// Quem foi perguntado nesta consulta, e o que respondeu sobre as tarefas
// deste evento. Uma consulta de cada vez, sempre.
export const listConsultationAnswers = async (
  organizationId,
  consultationId,
) => {
  const [{ data: destinatarios, error: eD }, { data: respostas, error: eR }] =
    await Promise.all([
      supabase
        .from("staff_consultation_recipients")
        .select("id, staff_member_id, revoked_at")
        .eq("organization_id", organizationId)
        .eq("consultation_id", consultationId),
      supabase
        .from("staff_availability_responses")
        .select(
          "event_task_id, state, available_from, available_until, note, " +
            "staff_consultation_recipients!inner ( staff_member_id, consultation_id )",
        )
        .eq("organization_id", organizationId)
        .eq("staff_consultation_recipients.consultation_id", consultationId),
    ]);
  if (eD) throw eD;
  if (eR) throw eR;

  const consultadas = new Set(
    (destinatarios ?? []).map((d) => d.staff_member_id),
  );
  const porTarefaEPessoa = new Map();
  for (const r of respostas ?? []) {
    const pessoa = r.staff_consultation_recipients?.staff_member_id;
    if (!pessoa) continue;
    porTarefaEPessoa.set(`${r.event_task_id}:${pessoa}`, {
      state: r.state,
      de: r.available_from,
      ate: r.available_until,
      nota: r.note,
    });
  }
  return { consultadas, respostas: porTarefaEPessoa };
};

// ---------- Escrita ----------

// A casa NÃO vai daqui: a RPC deriva-a da tarefa e é contra essa que
// verifica a permissão. Mandar a casa daqui seria mandar uma opinião.
export const assignStaffToTask = async ({ eventTaskId, staffMemberId }) => {
  const { data, error } = await supabase.rpc("assign_staff_to_task", {
    p_event_task_id: eventTaskId,
    p_staff_member_id: staffMemberId,
  });
  if (error) throw error;
  return data;
};

export const unassignStaffFromTask = async (assignmentId) => {
  const { error } = await supabase
    .from("event_task_assignments")
    .delete()
    .eq("id", assignmentId);
  if (error) throw error;
};

// A lógica pura vive em staffingLogic.js — sem importações e testável
// sozinha. Reexporta-se daqui para quem lê a escala ter uma porta só.
export {
  ESTADO_RESPOSTA,
  coberturaDaJanela,
  estadoDaPessoa,
  posicaoDaTarefa,
} from "./staffingLogic.js";
