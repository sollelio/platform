import { FASE_COR, FASE_LABEL } from "./faseConfig";
import { getResumoSubmissao } from "../../lib/submissionFields";
import { estadoFormularioDoEvento } from "../../lib/invites";

// ============================================================
// LacunasFormulario — os eventos que ainda NÃO têm formulário.
//
// A lista de supervisão mostrava os formulários QUE EXISTEM. Mas a
// pergunta útil de quem supervisiona é a inversa: «que eventos ainda não
// têm?» — a lacuna é o que custa, não o que já está feito.
//
// O CRITÉRIO reutiliza FASES_POS_SINAL (cliente · projecto), a
// mesma lista canónica que a conferência da Logística usa. O registo de
// decisões é explícito para este caso: «não uma lista nova». E faz
// sentido de negócio — o questionário existe para preparar a montagem de
// um evento CONFIRMADO; um interessado precisa de orçamento, não de
// questionário. Sem este filtro, esta secção passaria a ser a lista de
// leads, porque cada pedido e cada reserva nascem como evento em fase
// «interessado».
//
// Eventos cuja data JÁ PASSOU ficam de fora: não têm lacuna, têm
// história. Um evento SEM data entra — não se pode afirmar que passou, e
// entre esconder e mostrar a mais, mostra-se.
//
// A ACÇÃO É ABRIR O EVENTO, e não criar. Um botão de criar aqui devolvia
// a página a balcão de criação, que é exactamente o que este trabalho
// desfez. A criação vive no evento; aqui vê-se a falta e vai-se lá.
// ============================================================

export default function LacunasFormulario({
  lacunas = [],
  eventTypes = [],
  invites = [],
  aCarregar = false,
  onAbrirEvento,
}) {
  // Enquanto os dados não chegaram, cala-se. Afirmar «nenhuma lacuna»
  // com as listas por carregar seria a mentira tranquilizadora que este
  // projecto já corrigiu noutros cinco ecrãs.
  if (aCarregar || lacunas.length === 0) return null;

  return (
    <div style={{ marginBottom: "22px" }}>
      <p
        style={{
          fontSize: "10px",
          fontWeight: "700",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--gold-dark)",
          margin: "0 0 10px",
        }}
      >
        Sem formulário · {lacunas.length}
      </p>

      {lacunas.map((ev) => {
        const resumo = getResumoSubmissao(ev, eventTypes);
        const tipo = eventTypes.find((et) => et.id === ev.event_type_id);
        const f = FASE_COR[ev.fase] || FASE_COR.cliente;
        const { estado } = estadoFormularioDoEvento(invites, ev.id);
        const noutro = estado === "preenchido-noutro";

        return (
          <div
            key={ev.id}
            onClick={() => onAbrirEvento && onAbrirEvento(ev)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              backgroundColor: "var(--branco-quente, #FDFBF5)",
              border: "1px solid #F5ECD7",
              borderRadius: "12px",
              padding: "13px 16px",
              marginBottom: "8px",
              cursor: "pointer",
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <p
                style={{
                  fontSize: "13.5px",
                  fontWeight: "600",
                  color: "var(--charcoal)",
                  margin: 0,
                }}
              >
                {resumo.titulo}
              </p>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--gray-mid)",
                  margin: "2px 0 0",
                }}
              >
                {/* A data é a do EVENTO, sempre. A do convite só serve os
                    órfãos (que têm secção própria) — assim as duas fontes
                    deixam de poder divergir. */}
                {[
                  tipo?.nome || (ev.respostas?.tipoEventoOutro || "").trim(),
                  resumo.data
                    ? new Date(`${resumo.data}T00:00:00`).toLocaleDateString(
                        "pt-PT",
                        { day: "2-digit", month: "2-digit", year: "numeric" },
                      )
                    : "sem data",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>

            {noutro && (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: "600",
                  padding: "3px 10px",
                  borderRadius: "999px",
                  backgroundColor: "#FEF2F2",
                  color: "#B91C1C",
                  border: "1px solid #FECACA",
                  whiteSpace: "nowrap",
                }}
              >
                Respostas noutro evento
              </span>
            )}
            <span
              style={{
                fontSize: "11px",
                fontWeight: "600",
                padding: "3px 10px",
                borderRadius: "999px",
                backgroundColor: f.bg,
                color: f.cor,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {FASE_LABEL[ev.fase] || ev.fase}
            </span>
            <span
              style={{
                fontSize: "12px",
                fontWeight: "600",
                color: "var(--gold-dark)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              Abrir evento →
            </span>
          </div>
        );
      })}
    </div>
  );
}
