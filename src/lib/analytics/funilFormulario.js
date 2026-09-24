// ============================================================
// funilFormulario.js — o funil do /interesse, com as guardas contra
// o re-render.
//
// UMA instância por sessão de formulário (a página guarda-a num
// useRef). As etapas que só podem acontecer uma vez (ver, começar,
// completar os obrigatórios, enviar com sucesso) têm guarda própria:
// o StrictMode monta os efeitos duas vezes e um re-render chama tudo
// de novo — o evento sai uma vez na mesma. Tentar enviar e falhar a
// validação podem repetir-se (cada tentativa é uma tentativa), mas só
// saem de GESTOS, nunca do render.
//
//   VIEW               — o formulário foi mesmo desenhado
//   START              — a primeira interacção a sério com um campo
//   REQUIRED_COMPLETED — os obrigatórios ficaram completos pela 1.ª vez
//   SUBMIT_ATTEMPTED   — carregou-se em enviar
//   VALIDATION_FAILED  — o envio parou na validação (quais campos)
//   SUBMITTED          — o SERVIDOR confirmou (nunca só o clique)
// ============================================================

import { FORM_VERSION } from "./eventos.js";

export const criarFunilFormulario = (track, { tenantSlug = null } = {}) => {
  const feito = new Set();
  const base = () => ({ form_version: FORM_VERSION, tenant_slug: tenantSlug || undefined });
  const umaVez = (etapa, evento, extra = {}) => {
    if (feito.has(etapa)) return false;
    feito.add(etapa);
    track(evento, { ...base(), ...extra });
    return true;
  };

  return {
    visto: () => umaVez("visto", "public_quote_form_viewed"),
    iniciado: () => umaVez("iniciado", "public_quote_form_started"),
    obrigatoriosCompletos: (total) =>
      umaVez("obrigatorios", "public_quote_form_required_completed", {
        required_total: Number.isInteger(total) ? total : undefined,
      }),
    tentativaDeEnvio: () => {
      // Tentar enviar é também começar — quem carrega logo em enviar
      // interagiu com o formulário.
      umaVez("iniciado", "public_quote_form_started");
      track("public_quote_form_submit_attempted", base());
    },
    validacaoFalhou: (campos = []) => {
      const unicos = [...new Set(campos)];
      track("public_quote_form_validation_failed", {
        ...base(),
        invalid_fields: unicos,
        invalid_field_count: unicos.length,
      });
    },
    enviado: ({ deduplicado = false } = {}) =>
      umaVez("enviado", "public_quote_form_submitted", { deduplicated: !!deduplicado }),
  };
};
