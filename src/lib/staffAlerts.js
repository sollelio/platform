import { supabase } from "./supabase";
import { permissoesDasAtribuicoes, permissoesDasConsultas } from "./permissoes";

// ============================================================
// OS ALERTAS DA EQUIPA — o que é preciso ler para os calcular.
//
// 🔴 Nada aqui toca em `submissions`. Os eventos chegam de quem já os
// tem — o Início e a página do evento leem-nos pelo caminho legado de
// sempre, com a autorização legada de sempre. As tabelas da Equipa
// guardam `submission_id` como uma coluna qualquer, por isso cruzam-se
// por igualdade de id, sem junção e sem uma segunda porta para o modelo
// legado. Foi o limite que o Bloco 6 encontrou e este respeita.
//
// A permissão decide o que se pergunta: quem não pode ver consultas não
// pode receber «ainda não consultaste» — seria um alarme inventado a
// partir de uma leitura vazia.
// ============================================================

export const dadosDosAlertas = async (organizationId) => {
  if (!organizationId)
    return {
      tarefas: [],
      coberturas: [],
      atribuicoes: [],
      podeVerConsultas: false,
      podeVerAtribuicoes: false,
    };

  const [permConsultas, permAtribuicoes] = await Promise.all([
    permissoesDasConsultas(organizationId),
    permissoesDasAtribuicoes(organizationId),
  ]);

  const [tarefas, coberturas, atribuicoes] = await Promise.all([
    supabase
      .from("event_tasks")
      .select("id, submission_id, minimum_people, is_active")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    permConsultas.podeLer
      ? supabase
          .from("staff_consultation_events")
          .select("submission_id")
          .eq("organization_id", organizationId)
      : Promise.resolve({ data: [], error: null }),
    permAtribuicoes.podeLer
      ? supabase
          .from("event_task_assignments")
          .select("event_task_id")
          .eq("organization_id", organizationId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const r of [tarefas, coberturas, atribuicoes])
    if (r.error) throw r.error;

  return {
    tarefas: tarefas.data ?? [],
    coberturas: coberturas.data ?? [],
    atribuicoes: atribuicoes.data ?? [],
    podeVerConsultas: permConsultas.podeLer === true,
    podeVerAtribuicoes: permAtribuicoes.podeLer === true,
  };
};
