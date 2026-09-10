import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { separadoresOcultosDe } from "./menu";

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

// ============================================================
// AS PERMISSÕES QUE A NAVEGAÇÃO GLOBAL PRECISA — numa fonte só.
//
// Viviam como dois useState+useEffect DENTRO da AdminPage, e a
// EventoPage (que monta a mesma sidebar) não as tinha: quem não pode
// ler a Equipa via a porta na mesma a partir de qualquer evento.
// Agora qualquer página que renderize a navegação faz UMA chamada a
// este hook e aplica exatamente as mesmas regras.
//
// Cache de módulo por casa, só de SUCESSOS (a regra da casa, como na
// obterDistancia): navegar Admin↔Evento não repete os RPCs, mas uma
// tosse de rede (indisponivel) volta a perguntar — um falso «sem
// acesso» em cache esconderia o menu a quem tem direito a ele.
// ============================================================

const PERMS_POR_OMISSAO = { podeLer: false, podeGerir: false };
const SEM_RESPOSTA = { equipa: PERMS_POR_OMISSAO, consultas: PERMS_POR_OMISSAO };
const cacheNavegacao = new Map(); // organizationId -> {equipa, consultas}

// A cache é por CASA, mas a resposta é de um UTILIZADOR: trocar de
// sessão sem reload (login/logout são SPA) não pode herdar o menu de
// outrem. O mesmo padrão da autoria: comparar o uuid ignora o
// TOKEN_REFRESHED de hora a hora, que traria o MESMO utilizador.
let utilizadorDaCache = null;
supabase.auth.onAuthStateChange((_evento, sessao) => {
  const quem = sessao?.user?.id || null;
  if (quem === utilizadorDaCache) return;
  utilizadorDaCache = quem;
  cacheNavegacao.clear();
});

export const usePermissoesDeNavegacao = (organizationId) => {
  const [perms, setPerms] = useState(
    () => cacheNavegacao.get(organizationId) || SEM_RESPOSTA,
  );
  // A casa mudou → o estado ajusta-se DURANTE o render (o padrão
  // documentado do React para estado derivado; a regra da casa desde
  // o refactor do `visitadas`): o cache responde já, sem efeito.
  const [orgAnterior, setOrgAnterior] = useState(organizationId);
  if (organizationId !== orgAnterior) {
    setOrgAnterior(organizationId);
    setPerms(cacheNavegacao.get(organizationId) || SEM_RESPOSTA);
  }
  useEffect(() => {
    if (!organizationId || cacheNavegacao.has(organizationId))
      return undefined;
    let vivo = true;
    Promise.all([
      permissoesDaEquipa(organizationId),
      permissoesDasConsultas(organizationId),
    ]).then(([equipa, consultas]) => {
      if (!vivo) return;
      const resposta = { equipa, consultas };
      if (!equipa.indisponivel && !consultas.indisponivel)
        cacheNavegacao.set(organizationId, resposta);
      setPerms(resposta);
    });
    return () => {
      vivo = false;
    };
  }, [organizationId]);

  return {
    permEquipa: perms.equipa,
    permConsultas: perms.consultas,
    separadoresOcultos: separadoresOcultosDe(perms.equipa, perms.consultas),
    // A resposta ainda vai a caminho (SEM_RESPOSTA é a constante do
    // módulo — a igualdade de referência chega): quem protege rotas
    // mostra espera, não afirma «não tens acesso» a quem tem.
    // «Sem resposta» inclui a casa AINDA sem id (deep-link/refresh:
    // a identidade chega assíncrona) — enquanto não se sabe, espera-se.
    aVerificar: perms === SEM_RESPOSTA,
    indisponivel:
      !!(perms.equipa.indisponivel || perms.consultas.indisponivel),
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
