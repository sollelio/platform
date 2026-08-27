import { supabase } from "./supabase";

// ============================================================
// AS TAREFAS DE UM EVENTO — camada de dados.
//
// Uma função operacional é uma CAPACIDADE (o que a pessoa sabe fazer);
// uma tarefa é TRABALHO CONCRETO num evento: o quê, quando, que
// capacidade exige e quantas pessoas precisa no mínimo.
//
// O mínimo é um CHÃO, nunca um tecto — «pelo menos quatro» e não
// «quatro e mais nenhuma». Nada aqui recomenda nem atribui ninguém:
// escolher quem faz o quê é passo posterior.
//
// A hora da tarefa é da TAREFA e não do evento, porque a montagem pode
// ser na véspera e a recolha no dia seguinte — não se deriva da data.
//
// A casa vai sempre explícita nas escritas, como na equipa: o RLS já o
// faria, mas o pedido deve dizer o que quer.
// ============================================================

const CAMPOS =
  "id, organization_id, submission_id, staff_function_id, title, notes, " +
  "starts_at, ends_at, minimum_people, is_active";

export const listEventTasks = async (organizationId, submissionId) => {
  const { data, error } = await supabase
    .from("event_tasks")
    .select(CAMPOS)
    .eq("organization_id", organizationId)
    .eq("submission_id", submissionId)
    .order("starts_at", { ascending: true })
    .order("title", { ascending: true });
  if (error) throw error;
  return data ?? [];
};

export const createEventTask = async ({
  organizationId,
  submissionId,
  staffFunctionId,
  title,
  notes,
  startsAt,
  endsAt,
  minimumPeople,
}) => {
  const { data, error } = await supabase
    .from("event_tasks")
    .insert([
      {
        organization_id: organizationId,
        submission_id: submissionId,
        staff_function_id: staffFunctionId,
        title: title.trim(),
        notes: notes?.trim() || null,
        starts_at: startsAt,
        ends_at: endsAt || null,
        minimum_people: minimumPeople,
      },
    ])
    .select(CAMPOS)
    .single();
  if (error) throw error;
  return data;
};

// Nem a casa nem o evento entram na actualização: uma tarefa não muda de
// casa nem salta de evento — apaga-se e escreve-se outra. A concessão de
// UPDATE também não os inclui.
export const updateEventTask = async ({
  id,
  staffFunctionId,
  title,
  notes,
  startsAt,
  endsAt,
  minimumPeople,
}) => {
  const { data, error } = await supabase
    .from("event_tasks")
    .update({
      staff_function_id: staffFunctionId,
      title: title.trim(),
      notes: notes?.trim() || null,
      starts_at: startsAt,
      ends_at: endsAt || null,
      minimum_people: minimumPeople,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(CAMPOS)
    .single();
  if (error) throw error;
  return data;
};

export const setEventTaskActive = async (id, isActive) => {
  const { error } = await supabase
    .from("event_tasks")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
};

export const deleteEventTask = async (id) => {
  const { error } = await supabase.from("event_tasks").delete().eq("id", id);
  if (error) throw error;
};

// Quantas tarefas activas tem o evento — para o número no separador.
export const countEventTasks = async (organizationId, submissionId) => {
  const { count, error } = await supabase
    .from("event_tasks")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("submission_id", submissionId)
    .eq("is_active", true);
  if (error) throw error;
  return count ?? 0;
};
