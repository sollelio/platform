import { useState } from "react";
import { playfair, estiloPautaEdicao } from "./base";
import { CapsulaVazada, LigacaoDiscreta } from "./documentos-pecas";

// ============================================================
// EditorDeCampo — a resposta aberta no lugar (ecrã 4).
//
// NÃO É MODAL E NÃO É PÁGINA. A caixa abre-se onde a resposta está, e as
// vizinhas ficam à vista: mudar uma coisa não é sair do sítio.
//
// O botão de guardar é a CÁPSULA VAZADA, nunca a dourada cheia. A cheia é
// dos actos que vinculam — aceitar, aprovar, assinar. Guardar uma resposta
// não vincula ninguém a nada, e o botão tem de o dizer antes de se lhe
// tocar.
//
// Cada tipo de campo tem o seu editor. Os que não têm — a paleta e a
// morada — não chegam aqui: mudam-se pelo pedido, que é o que o próprio
// desenho faz no ecrã do pedido de alteração.
// ============================================================

const rotuloStyle = (centrado) => ({
  fontSize: "11px",
  lineHeight: 1.5,
  color: "#9B9B9B",
  margin: 0,
  textAlign: centrado ? "center" : "left",
});

const campoStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 0",
  fontSize: "15px",
  fontFamily: "Inter, sans-serif",
  color: "var(--charcoal)",
  background: "transparent",
  border: "none",
  borderBottom: "1.5px solid var(--gold)",
  outline: "none",
};

export default function EditorDeCampo({
  campo, valor, aoMudar, aoGuardar, aoDesistir, aTrabalhar, consequencia,
}) {
  const ehNumero = campo.tipo === "number";

  return (
    <div>
      <p style={rotuloStyle(ehNumero)}>{campo.label}</p>

      <div style={{ marginTop: ehNumero ? "14px" : "9px" }}>
        {ehNumero ? (
          <TecladoDeNumero valor={valor} aoMudar={aoMudar} />
        ) : campo.tipo === "textarea" ? (
          <textarea
            value={valor ?? ""}
            onChange={(e) => aoMudar(e.target.value)}
            rows={4}
            autoFocus
            style={{
              ...campoStyle,
              ...estiloPautaEdicao,
              ...playfair,
              fontStyle: "italic",
              fontSize: "15.5px",
              lineHeight: 1.7,
              resize: "vertical",
            }}
          />
        ) : campo.tipo === "radio" || campo.tipo === "checkbox" ? (
          <Pastilhas
            opcoes={campo.opcoes || []}
            valor={valor}
            multipla={campo.tipo === "checkbox"}
            aoMudar={aoMudar}
          />
        ) : (
          <input
            type={
              campo.tipo === "time" ? "time"
                : campo.tipo === "date" ? "date"
                  : campo.tipo === "email" ? "email"
                    : campo.tipo === "tel" ? "tel" : "text"
            }
            value={valor ?? ""}
            onChange={(e) => aoMudar(e.target.value)}
            placeholder={campo.ajuda || ""}
            autoFocus
            style={campoStyle}
          />
        )}
      </div>

      {/* O valor anterior e a consequência numa frase só — porque mudar um
          número aqui não é editar um formulário, é mexer numa encomenda. */}
      {consequencia && (
        <p style={{ fontSize: "11px", lineHeight: 1.7, color: "#9B9B9B", margin: "16px 0 0", textAlign: ehNumero ? "center" : "left", textWrap: "pretty" }}>
          {consequencia}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "13px", marginTop: "18px" }}>
        <CapsulaVazada
          onClick={aoGuardar}
          aTrabalhar={aTrabalhar}
          style={{ width: "auto", padding: "13px 30px" }}
        >
          {aTrabalhar ? "A guardar…" : "Guardar"}
        </CapsulaVazada>
        <LigacaoDiscreta onClick={aoDesistir} apagada>
          Deixar como estava
        </LigacaoDiscreta>
      </div>
    </div>
  );
}

// ---------- O teclado de número ----------
//
// Botões desenhados à mão — barras, não ícones de biblioteca. O de somar
// leva aro dourado e o de subtrair não: é o gesto que se convida.
function TecladoDeNumero({ valor, aoMudar }) {
  const n = Number(valor) || 0;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "20px" }}>
      <BotaoRedondo
        rotulo="Menos um"
        realce={false}
        onClick={() => aoMudar(Math.max(0, n - 1))}
      >
        <span style={{ display: "block", width: "13px", height: "1.5px", backgroundColor: "#A07830" }} />
      </BotaoRedondo>

      <div style={{ minWidth: "92px", textAlign: "center" }}>
        <span style={{ ...playfair, fontSize: "36px", lineHeight: 1, fontVariantNumeric: "tabular-nums", display: "block" }}>
          {n}
        </span>
        <span style={{ display: "block", height: "1.5px", backgroundColor: "var(--gold)", marginTop: "10px" }} />
      </div>

      <BotaoRedondo rotulo="Mais um" realce onClick={() => aoMudar(n + 1)}>
        <span style={{ position: "relative", display: "block", width: "13px", height: "13px" }}>
          <span style={{ position: "absolute", top: "5.75px", left: 0, width: "13px", height: "1.5px", backgroundColor: "#A07830" }} />
          <span style={{ position: "absolute", left: "5.75px", top: 0, width: "1.5px", height: "13px", backgroundColor: "#A07830" }} />
        </span>
      </BotaoRedondo>
    </div>
  );
}

function BotaoRedondo({ children, onClick, realce, rotulo }) {
  return (
    <button
      onClick={onClick}
      aria-label={rotulo}
      style={{
        width: "44px", height: "44px", borderRadius: "50%",
        backgroundColor: "white",
        border: `1px solid ${realce ? "var(--gold)" : "#E8DCC0"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", flexShrink: 0, padding: 0,
      }}
    >
      {children}
    </button>
  );
}

// ---------- As pastilhas de escolha ----------
function Pastilhas({ opcoes, valor, multipla, aoMudar }) {
  const [escolhidas] = useState(() =>
    Array.isArray(valor) ? valor : valor ? [valor] : [],
  );
  const actuais = Array.isArray(valor) ? valor : valor ? [valor] : escolhidas;

  const alternar = (o) => {
    if (!multipla) return aoMudar(o);
    return aoMudar(actuais.includes(o) ? actuais.filter((x) => x !== o) : [...actuais, o]);
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
      {opcoes.map((o) => {
        const activa = actuais.includes(o);
        return (
          <button
            key={o}
            onClick={() => alternar(o)}
            style={{
              fontSize: "11px", fontFamily: "Inter, sans-serif",
              borderRadius: "999px", padding: "7px 13px", cursor: "pointer",
              color: activa ? "#A07830" : "var(--gray-mid)",
              backgroundColor: activa ? "#FEF9EC" : "white",
              border: `1px solid ${activa ? "var(--gold)" : "#E8DCC0"}`,
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
