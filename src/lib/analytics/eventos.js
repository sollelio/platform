// ============================================================
// eventos.js — o CATÁLOGO dos eventos de produto, em código.
//
// É a gémea executável de docs/analytics/event-catalog.md: cada evento
// declara as propriedades que ACEITA, e com que forma. O que não está
// declarado não sai — é uma lista de permissão, não uma lista negra,
// porque uma lista negra de PII esquece sempre o campo de amanhã.
//
// Formas (sem PII por construção):
//   enum:[…]   — um valor de um vocabulário fechado
//   bool       — verdadeiro/falso
//   int        — inteiro ≥ 0 (contagens)
//   uuid       — um id opaco interno
//   slug       — [a-z0-9-], curto (a casa, nunca uma pessoa)
//   lista:[…]  — array de valores de um vocabulário fechado
// ============================================================

// A versão do formulário público. Muda quando o FORMULÁRIO muda
// (campos, ordem, fluxo) — nunca por deploy. É o que deixa comparar
// variantes sem adivinhar por datas. (flat = o formulário plano
// restaurado a 24/09/2026.)
export const FORM_VERSION = "flat_2026_09";

// As chaves de erro que o formulário conhece (calcularErros/validar do
// CaptacaoForm). São NOMES de campos, nunca valores.
export const CAMPOS_DO_FORMULARIO = [
  "nome",
  "contacto",
  "whatsapp",
  "tipo",
  "data",
  "convidados",
  "espaco",
  "localOutro",
  "servicos",
  "buffet",
  "balcao",
];

const SUPERFICIES = ["public_form", "admin_form", "import", "other"];
const AUTORES = ["prospect", "internal_user", "unknown"];
const METODOS = ["authenticated_session", "internal_entry_point", "admin_form", "unidentified"];

const formularioPublico = {
  form_version: { enum: [FORM_VERSION] },
  tenant_slug: "slug",
};

export const EVENTOS = {
  public_quote_form_viewed: { ...formularioPublico },
  public_quote_form_started: { ...formularioPublico },
  public_quote_form_required_completed: { ...formularioPublico, required_total: "int" },
  public_quote_form_submit_attempted: { ...formularioPublico },
  public_quote_form_validation_failed: {
    ...formularioPublico,
    invalid_fields: { lista: CAMPOS_DO_FORMULARIO },
    invalid_field_count: "int",
  },
  public_quote_form_submitted: { ...formularioPublico, deduplicated: "bool" },
  // O espelho do facto de negócio gravado na base (110). As três
  // dimensões vêm da RESPOSTA do servidor, não do que o browser pediu.
  request_created: {
    request_id: "uuid",
    submission_surface: { enum: SUPERFICIES },
    submitted_by_type: { enum: AUTORES },
    attribution_method: { enum: METODOS },
    returning_contact: "bool",
    tenant_slug: "slug",
  },
};

// Propriedades comuns, acrescentadas pelo núcleo a todos os eventos.
export const COMUNS = {
  environment: { enum: ["production", "test", "development", "unknown"] },
  surface: { enum: ["public_form", "admin", "other"] },
  route: "rota",
  authenticated: "bool",
  actor_type: { enum: ["internal", "anonymous"] },
};
