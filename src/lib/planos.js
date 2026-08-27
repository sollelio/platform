import { supabase } from "./supabase";

// ============================================================
// OS PLANOS INDIVIDUAIS — camada de dados.
//
// Não há tabela de planos. Um plano é uma leitura do que está agora:
// as atribuições do Bloco 5, as tarefas do evento, a ficha do evento e
// as indicações fixas da casa. Guardá-lo era criar uma segunda verdade
// a envelhecer sozinha — a tarefa muda de hora e o plano gravado fica
// a mentir.
//
// A projecção e o texto vivem em planoFormato.js, que é puro.
// ============================================================

// As indicações da casa. Uma linha por casa, e a casa é a chave —
// `maybeSingle` porque uma casa que ainda não escreveu nada não é erro.
export const getTeamInstructions = async (organizationId) => {
  const { data, error } = await supabase
    .from("staff_team_instructions")
    .select("organization_id, standard_instructions, hot_weather_instructions")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
};

// Vazio guarda-se como NULL e não como texto vazio: «ainda não escrito»
// e «escrito, e vazio» têm de continuar a ser coisas diferentes.
//
// Não é um upsert. O upsert do PostgREST escreve a coluna do conflito
// também no ramo de UPDATE, e `organization_id` está de propósito fora
// da concessão de UPDATE — um conjunto de indicações não muda de casa.
// Insere-se, e se a linha já existir (23505, ou uma corrida entre dois
// primeiros gravares) actualiza-se.
export const saveTeamInstructions = async ({
  organizationId,
  standard,
  hotWeather,
}) => {
  const valores = {
    standard_instructions: standard?.trim() || null,
    hot_weather_instructions: hotWeather?.trim() || null,
  };
  const COLUNAS =
    "organization_id, standard_instructions, hot_weather_instructions";

  const actualizar = async () => {
    const { data, error } = await supabase
      .from("staff_team_instructions")
      .update({ ...valores, updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId)
      .select(COLUNAS)
      .single();
    if (error) throw error;
    return data;
  };

  const existente = await getTeamInstructions(organizationId);
  if (existente) return actualizar();

  const { data, error } = await supabase
    .from("staff_team_instructions")
    .insert([{ organization_id: organizationId, ...valores }])
    .select(COLUNAS)
    .single();
  if (error) {
    if (error.code === "23505") return actualizar();
    throw error;
  }
  return data;
};
