import { getValorAtual, seccoesPreenchidas } from "../../lib/submissionFields";
import { AmostraPaleta } from "./SeletorPaleta";

// ============================================================
// VisaoGeralEvento — o briefing no ecrã: as secções do modelo do
// evento com os campos preenchidos, e só esses.
//
// Vive em dois sítios com a mesma fonte (os steps do modelo, nunca
// campos fixos — ver seccoesDoModelo em lib/submissionFields.js):
//   • no drawer, uma coluna estreita, como sempre foi;
//   • no separador Visão geral da página, em mosaico — num ecrã de
//     1600 px, uma coluna de 400 px seria uma tira magra no meio do
//     vazio.
//
// A folha impressa continua a ser a BriefingPage: aqui é o ecrã, lá é
// o papel, e o papel é que anda com a equipa.
// ============================================================

function Campo({ submissao, campo, valor }) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <p
        style={{
          fontSize: "11px",
          color: "var(--gray-mid)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          margin: "0 0 2px 0",
        }}
      >
        {campo.label}
      </p>
      {campo.type === "paleta" ? (
        <AmostraPaleta value={getValorAtual(submissao, campo.id)} />
      ) : (
        <p
          style={{
            fontSize: "14px",
            color: "var(--charcoal)",
            margin: 0,
            textWrap: "pretty",
          }}
        >
          {valor}
        </p>
      )}
    </div>
  );
}

export default function VisaoGeralEvento({
  submissao,
  seccoes,
  mosaico = false,
}) {
  const preenchidas = seccoesPreenchidas(submissao, seccoes);

  if (preenchidas.length === 0) {
    return (
      <p
        style={{
          fontSize: "13px",
          color: "var(--gray-mid)",
          fontStyle: "italic",
          textAlign: "center",
          padding: "20px",
        }}
      >
        Este evento ainda não tem detalhes preenchidos.
      </p>
    );
  }

  return (
    <div
      style={
        mosaico
          ? {
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: "16px",
              alignItems: "start",
            }
          : undefined
      }
    >
      {preenchidas.map((sec) => (
        <div
          key={sec.titulo}
          style={
            mosaico
              ? {
                  backgroundColor: "white",
                  border: "1px solid #F0E6D0",
                  borderRadius: "14px",
                  padding: "16px 20px 8px",
                }
              : { marginBottom: "24px" }
          }
        >
          <p
            style={{
              fontSize: "11px",
              fontWeight: "600",
              color: "var(--gold)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              borderBottom: "1px solid var(--gold-light)",
              paddingBottom: "6px",
              margin: "0 0 12px 0",
            }}
          >
            {sec.titulo}
          </p>
          {sec.campos.map(({ campo, valor }) => (
            <Campo
              key={campo.id}
              submissao={submissao}
              campo={campo}
              valor={valor}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
