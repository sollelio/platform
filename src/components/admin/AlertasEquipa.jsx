import { useCallback, useEffect, useState } from "react";
import { useCasa } from "../CasaProvider";
import { dadosDosAlertas } from "../../lib/staffAlerts";
import { alertasDeEquipa, prazoEmPalavras } from "../../lib/staffAlertsLogic";

// ============================================================
// «EQUIPA A PRECISAR DE TI» — no Início, onde a Nádia passa.
//
// Secção própria e não misturada com os avisos comerciais: aqueles têm
// a sua fila e o seu corte nos seis primeiros, e um aviso de que falta
// gente a três dias do evento não pode ficar de fora por causa de um
// orçamento por enviar.
//
// Calcula-se do que está agora. Não há linha de lembrete guardada, por
// isso resolver o problema apaga o aviso — não há nada a limpar.
//
// Os eventos vêm de quem já os tem (o Início lê-os pelo caminho de
// sempre): esta peça não abre porta nenhuma ao modelo legado.
// ============================================================

const cartao = {
  backgroundColor: "var(--superficie)",
  borderRadius: "12px",
  padding: "12px 14px",
  marginBottom: "8px",
  border: "1px solid var(--borda)",
  cursor: "pointer",
  display: "block",
  width: "100%",
  textAlign: "left",
};

const tituloSeccao = {
  fontSize: "11px",
  fontWeight: "600",
  color: "var(--gray-mid)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  margin: "0 0 10px",
};

export default function AlertasEquipa({ submissions, onAbrirEvento }) {
  const casa = useCasa();
  const [dados, setDados] = useState(null);

  const buscar = useCallback(
    () => dadosDosAlertas(casa?.id),
    [casa?.id],
  );

  useEffect(() => {
    let vivo = true;
    buscar()
      .then((d) => {
        if (vivo) setDados(d);
      })
      .catch((e) => {
        console.error("alertas da equipa:", e);
        if (vivo) setDados(null);
      });
    return () => {
      vivo = false;
    };
  }, [buscar]);

  if (!dados) return null;

  const cartoes = alertasDeEquipa({
    eventos: submissions ?? [],
    tarefas: dados.tarefas,
    coberturas: dados.coberturas,
    atribuicoes: dados.atribuicoes,
    podeVerConsultas: dados.podeVerConsultas,
    podeVerAtribuicoes: dados.podeVerAtribuicoes,
  });

  if (cartoes.length === 0) return null;

  return (
    <div style={{ marginTop: "26px" }}>
      <p style={tituloSeccao}>Equipa a precisar de ti</p>
      {cartoes.map(({ evento, dias, motivos }) => (
        <button
          key={evento.id}
          className="acao"
          onClick={() => onAbrirEvento?.(evento)}
          style={cartao}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "4px",
            }}
          >
            <span
              aria-hidden
              style={{
                display: "inline-block",
                width: "5px",
                height: "5px",
                borderRadius: "50%",
                backgroundColor:
                  dias <= 4 ? "var(--perigo-texto)" : "var(--gold)",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: "13px",
                color: "var(--charcoal)",
                fontWeight: 500,
              }}
            >
              {evento.data_evento
                ? new Date(`${evento.data_evento}T00:00:00`).toLocaleDateString(
                    "pt-PT",
                    { day: "2-digit", month: "short", year: "numeric" },
                  )
                : ""}
            </span>
            <span style={{ fontSize: "12px", color: "var(--gray-mid)" }}>
              {prazoEmPalavras(dias)}
            </span>
          </span>
          {motivos.map((m) => (
            <span
              key={m.tipo}
              style={{
                display: "block",
                fontSize: "12.5px",
                color:
                  m.tipo === "equipa"
                    ? "var(--perigo-texto)"
                    : "var(--gray-mid)",
                lineHeight: 1.5,
                paddingLeft: "13px",
              }}
            >
              {m.tipo === "equipa" ? "⚠ " : "· "}
              {m.texto}
            </span>
          ))}
        </button>
      ))}
    </div>
  );
}
