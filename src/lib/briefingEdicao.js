import { supabase } from "./supabase";
import { getValorAtual, FIELD_MAP_INVERSO } from "./submissionFields";

// ============================================================
// briefingEdicao — o lado de ESCRITA do briefing.
//
// O submissionFields lê e formata; aqui compara-se o que está no ecrã
// com o que está guardado, e escreve-se. Vive fora dos componentes
// porque duas pessoas precisam das mesmas contas: a Visão geral, que
// desenha os campos, e a EventoPage, que só quer saber quantas
// alterações estão à espera para pôr o ponto dourado no separador e
// perguntar antes de deixar sair.
// ============================================================

export const vazio = (v) =>
  v === undefined ||
  v === null ||
  v === "" ||
  (Array.isArray(v) && v.length === 0);

// O que vai para a base de dados: o vazio é NULL e não "". As colunas
// antigas equivalentes são `time`, `date` e `integer` — uma string vazia
// rebenta com elas, e no respostas um null lê-se igual a ausente.
export const paraGuardar = (v) => (v === "" || v === undefined ? null : v);

// O valor guardado de um campo, tal como o rascunho o recebe.
export const valorGuardado = (submissao, campo) => {
  const v = getValorAtual(submissao, campo.id);
  return v === undefined || v === null ? "" : v;
};

// Duas leituras do mesmo valor dão a mesma chave. Serve para saber o que
// MUDOU mesmo: sem isto, tocar num campo e voltar atrás contava como
// alteração, e uma morada com as partes por preencher ({rua: ""})
// contava como diferente de vazia. Nulo, "", [] e {} são todos "por
// preencher".
const chaveDeComparacao = (v) => {
  if (Array.isArray(v)) return v.length ? JSON.stringify(v) : "null";
  if (v && typeof v === "object") {
    const partes = Object.entries(v)
      .filter(([, x]) => !vazio(x))
      .sort(([a], [b]) => a.localeCompare(b));
    return partes.length ? JSON.stringify(partes) : "null";
  }
  return vazio(v) ? "null" : JSON.stringify(v);
};

export const mudou = (antes, agora) =>
  chaveDeComparacao(antes) !== chaveDeComparacao(agora);

// O que está por guardar: os campos cujo rascunho difere do que está na
// base de dados. Um rascunho a `null` é "ainda ninguém escreveu nada" —
// e não um mapa de vazios, senão o briefing inteiro contava como
// alterado antes sequer de lhe tocarem.
export function camposAlterados(submissao, seccoes, rascunhos) {
  if (!submissao || !rascunhos) return [];
  const lista = [];
  for (const sec of seccoes || [])
    for (const campo of sec.campos || []) {
      const agora = rascunhos[campo.id];
      if (mudou(valorGuardado(submissao, campo), agora))
        lista.push({ campo, valor: agora });
    }
  return lista;
}

// A mesma conta, para quem só precisa do número.
export const contarAlteracoes = (submissao, seccoes, rascunhos) =>
  camposAlterados(submissao, seccoes, rascunhos).length;

// A escrita do briefing, uma alteração ou vinte: sempre nas DUAS fontes
// (respostas + coluna antiga equivalente, quando existe) e sempre numa
// ida só à base de dados. O campo marcado com papel "data" É a data do
// evento, seja qual for o seu id.
export async function guardarAlteracoes(submissao, alteracoes) {
  const update = { respostas: { ...(submissao.respostas || {}) } };
  for (const { campo, valor } of alteracoes) {
    const v = paraGuardar(valor);
    update.respostas[campo.id] = v;
    const coluna = FIELD_MAP_INVERSO[campo.id];
    if (coluna) update[coluna] = v;
    if (campo.papel === "data") update.data_evento = v;
  }
  return supabase
    .from("submissions")
    .update(update)
    .eq("id", submissao.id)
    .select()
    .single();
}
