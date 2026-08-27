import { supabase } from "./supabase";

// ============================================================
// AS PERMISSÕES DA CASA (Ponto 1).
//
// `has_permission(casa, chave)` é a ÚNICA pergunta — a mesma que o RLS
// faz do lado da base. Perguntar aqui não é segurança: a segurança é o
// RLS. Isto serve só para não mostrar uma entrada de menu que, ao ser
// clicada, daria um ecrã vazio.
//
// Três respostas de propósito, como na identidadeCasa: `null` é «não
// deu para perguntar», e um `false` a fazer de falha esconderia o menu
// a quem tem direito a ele sempre que a rede tossisse.
// ============================================================

export const temPermissao = async (organizationId, chave) => {
  if (!organizationId || !chave) return false;
  try {
    const { data, error } = await supabase.rpc("has_permission", {
      p_organization_id: organizationId,
      p_permission_key: chave,
    });
    if (error) throw error;
    return data === true;
  } catch (e) {
    console.error(`permissoes (${chave}):`, e);
    return null;
  }
};

// As duas chaves do módulo da Equipa, juntas: quem gere também lê.
export const permissoesDaEquipa = async (organizationId) => {
  const [ler, gerir] = await Promise.all([
    temPermissao(organizationId, "staff.read"),
    temPermissao(organizationId, "staff.manage"),
  ]);
  return {
    podeLer: ler === true || gerir === true,
    podeGerir: gerir === true,
    indisponivel: ler === null && gerir === null,
  };
};

// As tarefas operacionais de um evento. Chaves próprias: quem escreve a
// ficha do evento não é forçosamente quem monta a escala.
export const permissoesDasTarefas = async (organizationId) => {
  const [ler, gerir] = await Promise.all([
    temPermissao(organizationId, "staff.tasks.read"),
    temPermissao(organizationId, "staff.tasks.manage"),
  ]);
  return {
    podeLer: ler === true || gerir === true,
    podeGerir: gerir === true,
    indisponivel: ler === null && gerir === null,
  };
};

// As consultas de disponibilidade.
export const permissoesDasConsultas = async (organizationId) => {
  const [ler, gerir] = await Promise.all([
    temPermissao(organizationId, "staff.consultations.read"),
    temPermissao(organizationId, "staff.consultations.manage"),
  ]);
  return {
    podeLer: ler === true || gerir === true,
    podeGerir: gerir === true,
    indisponivel: ler === null && gerir === null,
  };
};

// Montar a escala. Chave própria: ver as tarefas de um evento não é o
// mesmo que decidir quem as faz.
export const permissoesDasAtribuicoes = async (organizationId) => {
  const [ler, gerir] = await Promise.all([
    temPermissao(organizationId, "staff.assignments.read"),
    temPermissao(organizationId, "staff.assignments.manage"),
  ]);
  return {
    podeLer: ler === true || gerir === true,
    podeGerir: gerir === true,
    indisponivel: ler === null && gerir === null,
  };
};
