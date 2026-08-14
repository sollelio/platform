// ============================================================
// importacao/schema.js — o contrato do ficheiro de importação.
// Versões suportadas, chaves conhecidas de cada entidade e helpers
// partilhados pelo motor (adaptadores → normalizar → validar →
// executar). A especificação completa para o chat de IA vive em
// docs/prompt-migracao.md.
// ============================================================

import { FIELD_MAP_INVERSO } from "../submissionFields";

export const VERSOES_SUPORTADAS = [1];

export const ESTADOS_VALIDOS = [
  "Recebido",
  "Em Preparação",
  "Confirmado",
  "Concluído",
];

export const FASES_VALIDAS = [
  "interessado",
  "orcamento",
  "sinal",
  "cliente",
  "projecto",
  "contrato",
  "perdido",
];

export const CHAVES_CLIENTE = [
  "nome",
  "contacto",
  "email",
  "nif",
  "morada",
  "notas",
];

export const CHAVES_EVENTO = [
  "tipoEvento",
  "dataEvento",
  "estado",
  "fase",
  "valorAcordado",
  "pagamentoFinal",
  "numeroConvidados",
  "respostas",
  "formularioPreenchido",
  "documentos",
];

// Chaves canónicas das respostas: as do FIELD_MAP (colunas legadas)
// + as da captação. Chaves fora desta lista são importadas na mesma
// (o respostas é jsonb — genericidade por passthrough), mas geram um
// aviso informativo na validação.
export const CHAVES_RESPOSTAS_CANONICAS = [
  ...Object.keys(FIELD_MAP_INVERSO),
  "nomeDoCliente",
  "numeroWhatsapp",
  "tipoLocal",
  "servicos",
  "servicosBuffet",
  "servicosBalcao",
  "pretende",
  "mensagemInicial",
  "imagensReferencia",
  "tipoEventoOutro",
];

// ---------- helpers partilhados ----------

export const limpar = (v) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};

// Telefone comparável: só dígitos, últimos 9 (a mesma regra do
// captacao_dedupe do Postgres).
export const normalizarTelefone = (v) => {
  const d = (v ?? "").toString().replace(/\D/g, "").slice(-9);
  return d.length >= 9 ? d : null;
};

export const ehDataISO = (s) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s || "") &&
  !Number.isNaN(new Date(`${s}T00:00:00`).getTime());

// uid determinístico-suficiente para as linhas/secções dos documentos
let seqImp = 0;
export const uidImportacao = (prefixo) =>
  `imp_${prefixo}_${Date.now().toString(36)}_${seqImp++}`;