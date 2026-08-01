import { supabase } from "./supabase";

// ============================================================
// documentos.js — persistência dos documentos (Orçamento, Contrato,
// Projecto) na tabela `documentos` do Supabase.
//
// A Base de Dados é a única fonte de verdade. O localStorage
// (dlm_rascunho_*) passa a espelho/rede de segurança: continua a ser
// escrito de forma síncrona a cada alteração, mas a leitura é sempre
// BD-primeiro. NUNCA é apagado por este módulo.
//
// Um documento identifica-se por (tipo, submission_id):
//   tipo          — 'orcamento' | 'contrato' | 'proposta'
//                   ('proposta' é a chave interna; na UI chama-se
//                    "Projecto")
//   submission_id — uuid do evento, ou null para o documento manual
//                   (rid ":manual" — no máximo 1 por tipo, garantido
//                    pelo índice uq_documentos_tipo_manual)
//
// O campo `dados` (jsonb) guarda um objecto { campo: valor } com
// EXACTAMENTE os mesmos campos/formatos que o useRascunho guardava
// no localStorage — zero transformações, zero regressões nos
// formulários e na geração de PDF.
// ============================================================

const PREFIXO_RASCUNHO = "dlm_rascunho_";
const PREFIXO_MIGRADO = "dlm_doc_migrado_";

// O identificador de rascunho usado pelos geradores desde sempre.
export const ridDe = (tipo, submissionId) =>
  `${tipo}:${submissionId || "manual"}`;

// ---------- Base de Dados ----------

// Devolve o documento (linha completa) ou null se não existir.
export async function obterDocumento(tipo, submissionId) {
  let query = supabase.from("documentos").select("*").eq("tipo", tipo);
  query = submissionId
    ? query.eq("submission_id", submissionId)
    : query.is("submission_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

// Cria o documento e devolve a linha gravada (o .select() relê da BD —
// é a validação de que a gravação foi mesmo concluída).
export async function criarDocumento(tipo, submissionId, dados) {
  const { data, error } = await supabase
    .from("documentos")
    .insert({ tipo, submission_id: submissionId || null, dados })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Actualiza os dados de um documento existente e devolve a linha gravada.
export async function actualizarDocumento(id, dados) {
  const { data, error } = await supabase
    .from("documentos")
    .update({ dados })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Lista todos os documentos de eventos (só metadados — os `dados`
// completos só são carregados quando um documento é aberto). Documentos
// manuais antigos (submission_id NULL, experiências pré-refactor) ficam
// fora da lista: no domínio, todo o documento pertence a um evento.
// Ordenado por última actualização. O cruzamento com clientes/eventos
// é feito no cliente, a partir das submissions em memória.
export async function listarDocumentos() {
  const { data, error } = await supabase
    .from("documentos")
    .select("id, tipo, submission_id, created_at, updated_at")
    .not("submission_id", "is", null)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// Os documentos de UM evento, com o percurso (migração 030). O
// separador Documentos da página do evento lê daqui.
export async function documentosDoEvento(submissionId) {
  if (!submissionId) return [];
  const { data, error } = await supabase
    .from("documentos")
    .select(
      "id, tipo, created_at, updated_at, enviado_em, assinado_em, trancado_em",
    )
    .eq("submission_id", submissionId);
  if (error) throw error;
  return data || [];
}

// Marca (ou desmarca) um passo do percurso. `quando` a null desfaz —
// enganar-se a carregar num botão não devia ser irreversível.
export async function marcarPassoDocumento(id, passo, quando = new Date()) {
  const coluna = { enviado: "enviado_em", assinado: "assinado_em" }[passo];
  if (!coluna) throw new Error(`Passo desconhecido: ${passo}`);
  const { data, error } = await supabase
    .from("documentos")
    .update({ [coluna]: quando ? new Date(quando).toISOString() : null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- Rascunho local (localStorage) ----------

// Monta o objecto `dados` a partir das keys fragmentadas do useRascunho
// (uma key por campo: dlm_rascunho_{rid}:{campo}). Devolve null se não
// existir nenhum campo deste documento.
export function lerRascunhoLocal(rid) {
  const prefixo = `${PREFIXO_RASCUNHO}${rid}:`;
  const dados = {};
  let encontrou = false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefixo)) continue;
      const campo = key.slice(prefixo.length);
      try {
        dados[campo] = JSON.parse(localStorage.getItem(key));
        encontrou = true;
      } catch {
        /* valor corrompido — ignora só este campo */
      }
    }
  } catch {
    /* storage indisponível — segue sem rascunho local */
  }
  return encontrou ? dados : null;
}

// Escrita síncrona de UM campo no rascunho local (o espelho).
export function gravarCampoLocal(rid, campo, valor) {
  try {
    localStorage.setItem(
      `${PREFIXO_RASCUNHO}${rid}:${campo}`,
      JSON.stringify(valor),
    );
  } catch {
    /* quota cheia ou privado — a BD continua a ser a fonte de verdade */
  }
}

// Depois de carregar da BD, alinha o rascunho local com a BD (campo a
// campo). Nunca remove keys — só escreve por cima das equivalentes.
export function espelharRascunhoLocal(rid, dados) {
  for (const [campo, valor] of Object.entries(dados || {})) {
    gravarCampoLocal(rid, campo, valor);
  }
}

// Marca (para diagnóstico) que a migração deste documento foi concluída
// com sucesso. Os dados originais do rascunho ficam intactos.
export function marcarMigracao(rid) {
  try {
    localStorage.setItem(`${PREFIXO_MIGRADO}${rid}`, new Date().toISOString());
  } catch {
    /* sem consequências — a flag é apenas informativa */
  }
}