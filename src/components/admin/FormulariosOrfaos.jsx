import { useState } from "react";
import { podeSerAdoptadoPor } from "../../lib/invites";
import { getResumoSubmissao } from "../../lib/submissionFields";
import { getTituloConvite } from "../../lib/camposFormulario";

// ============================================================
// FormulariosOrfaos — a secção dos formulários sem evento associado.
//
// Vivia DENTRO do painel de criação, e por isso a reparação era um
// efeito secundário: a Nádia só adoptava um órfão se por acaso estivesse
// a criar outro formulário. Aqui a reparação passa a acto de primeira
// classe.
//
// É o ÚLTIMO RECURSO da rede anti-duplicação, não o gesto principal:
// dentro de cada evento, a linha do Formulário pergunta «há um pendente
// sem evento — é deste?», que é onde a decisão se toma informada. Esta
// secção existe para o órfão que ninguém vai visitar — o de alguém que
// não tem (nem vai ter) evento aberto.
//
// A escolha do alvo é POR ÓRFÃO e a lista de cada um é filtrada pelas
// três condições da adopção (ver lib/invites): um Aniversário não pode
// ser apontado a um Casamento, e um convite vindo de reserva não se
// adopta de forma alguma — mostra-se, com a razão à vista, porque
// esconder um órfão é perder a única lista deles.
// ============================================================

export default function FormulariosOrfaos({
  orfaos = [],
  submissions = [],
  eventTypes = [],
  onAdoptar,
}) {
  // { [idDoOrfao]: idDoEvento } — a escolha de cada linha, antes de
  // confirmar. Local: não é estado de negócio, é um gesto a meio.
  const [alvos, setAlvos] = useState({});
  const [aAdoptar, setAAdoptar] = useState(null);

  if (orfaos.length === 0) return null;

  const nomeTipo = (id) => eventTypes.find((et) => et.id === id)?.nome || null;

  return (
    <div
      style={{
        backgroundColor: "var(--aviso-fundo)",
        border: "1px solid var(--aviso-borda)",
        borderRadius: "12px",
        padding: "16px 18px",
        marginBottom: "20px",
      }}
    >
      <p
        style={{
          margin: "0 0 4px",
          fontSize: "13px",
          fontWeight: "700",
          color: "var(--aviso-texto)",
        }}
      >
        ⚠{" "}
        {orfaos.length === 1
          ? "1 formulário sem evento associado"
          : `${orfaos.length} formulários sem evento associado`}
      </p>
      <p
        style={{
          margin: "0 0 12px",
          fontSize: "12.5px",
          color: "var(--aviso-texto)",
          lineHeight: 1.6,
        }}
      >
        Se algum for de uma cliente que já está no funil, aponta-o ao evento
        dela — assim ela recebe o formulário que já tem, em vez de nascer um
        cliente e um evento em duplicado quando o preencher.
      </p>

      {orfaos.map((o) => {
        // Só eventos que este órfão PODE adoptar (as três condições).
        const elegiveis = submissions.filter((s) => podeSerAdoptadoPor(o, s));
        const deReserva = !!o.reserva_id;
        const escolhido = alvos[o.id] || "";
        const tipo = nomeTipo(o.event_type_id);

        return (
          <div
            key={o.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
              backgroundColor: "var(--superficie)",
              border: "1px solid var(--aviso-borda)",
              borderRadius: "9px",
              padding: "10px 12px",
              marginBottom: "8px",
              opacity: deReserva ? 0.75 : 1,
            }}
          >
            <span style={{ fontSize: "12.5px", fontWeight: "600" }}>
              {getTituloConvite(o, submissions, eventTypes)}
            </span>
            <span
              style={{
                fontSize: "11.5px",
                color: "var(--gray-mid)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {o.code}
              {tipo ? ` · ${tipo}` : " · sem tipo"}
            </span>

            <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
              {deReserva ? (
                // Mostra-se, mas não se adopta — e diz-se porquê, em vez
                // de aparecer um botão que recusaria em silêncio.
                <span
                  style={{
                    fontSize: "11.5px",
                    color: "var(--aviso-texto)",
                    fontStyle: "italic",
                  }}
                >
                  vem de uma reserva — resolve-se na Agenda
                </span>
              ) : elegiveis.length === 0 ? (
                <span
                  style={{
                    fontSize: "11.5px",
                    color: "var(--aviso-texto)",
                    fontStyle: "italic",
                  }}
                >
                  nenhum evento {tipo ? `de ${tipo}` : ""} para apontar
                </span>
              ) : (
                <>
                  <select
                    value={escolhido}
                    onChange={(e) =>
                      setAlvos((prev) => ({ ...prev, [o.id]: e.target.value }))
                    }
                    style={{
                      border: "1px solid var(--aviso-borda)",
                      borderRadius: "999px",
                      padding: "5px 11px",
                      fontSize: "11.5px",
                      backgroundColor: "var(--superficie-selo)",
                      color: "var(--aviso-texto)",
                      fontFamily: "inherit",
                      maxWidth: "260px",
                    }}
                  >
                    <option value="">Escolher evento…</option>
                    {elegiveis.map((s) => {
                      const r = getResumoSubmissao(s, eventTypes);
                      return (
                        <option key={s.id} value={s.id}>
                          {r.titulo}
                          {s.data_evento ? ` · ${s.data_evento}` : ""}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    onClick={async () => {
                      if (!escolhido) return;
                      setAAdoptar(o.id);
                      await onAdoptar(o, escolhido);
                      setAAdoptar(null);
                    }}
                    disabled={!escolhido || aAdoptar === o.id}
                    style={{
                      // O apagado #FDF6E8 está fora da paleta da
                      // identidade — o par inteiro (fundo, letra,
                      // borda) fica literal: ilha clara com letra
                      // escura nos dois modos, nunca letra clara
                      // sobre fundo claro. Segue no relatório.
                      border: "1px solid #F0D9B5",
                      backgroundColor: escolhido ? "white" : "#FDF6E8",
                      color: "#92400E",
                      fontWeight: "600",
                      fontSize: "11px",
                      padding: "5px 12px",
                      borderRadius: "999px",
                      cursor: escolhido ? "pointer" : "not-allowed",
                      opacity: escolhido ? 1 : 0.6,
                      fontFamily: "inherit",
                    }}
                  >
                    {aAdoptar === o.id ? "A apontar…" : "É deste"}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
