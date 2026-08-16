import { useState } from "react";

// Campo de busca que lista os campos ainda não adicionados ao painel,
// e permite clicar para os adicionar. Usado dentro do Painel de Novo
// Convite — não depende de mais nada, só recebe a lista do que falta
// e avisa quando algo é escolhido.
export default function CampoSeletor({ camposDisponiveis, onAdd }) {
  const [query, setQuery] = useState("");
  const [aberto, setAberto] = useState(false);

  const filtrados = camposDisponiveis.filter((f) =>
    f.label.toLowerCase().includes(query.toLowerCase()),
  );

  const rotulo = (
    <label
      style={{
        fontSize: "11px",
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: "0.07em",
        color: "var(--charcoal)",
        display: "block",
        marginBottom: "6px",
      }}
    >
      + Adicionar Campo
    </label>
  );

  if (camposDisponiveis.length === 0) {
    return (
      <div>
        {rotulo}
        <p style={{ fontSize: "12px", color: "var(--gray-mid)", margin: 0 }}>
          Já adicionaste todos os campos disponíveis para este tipo de evento.
        </p>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {rotulo}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setAberto(true)}
        placeholder="Escreve para encontrar um campo (ex: Morada, Estilo)..."
        style={{
          width: "100%",
          padding: "11px 14px",
          borderRadius: "8px",
          border: "1.5px solid var(--gold)",
          fontSize: "13px",
          outline: "none",
          fontFamily: "Inter, sans-serif",
          boxSizing: "border-box",
          backgroundColor: "var(--superficie)",
          boxShadow: "0 0 0 3px rgba(var(--ouro-rgb), 0.08)",
        }}
      />

      {aberto && (
        <>
          {/* Fundo invisível — clicar fora fecha a lista */}
          <div
            onClick={() => setAberto(false)}
            style={{ position: "fixed", inset: 0, zIndex: 10 }}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              right: 0,
              zIndex: 11,
              backgroundColor: "var(--superficie)",
              borderRadius: "10px",
              border: "1px solid var(--gold-light)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
              maxHeight: "220px",
              overflowY: "auto",
            }}
          >
            {filtrados.length === 0 ? (
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--gray-mid)",
                  padding: "12px 14px",
                  margin: 0,
                }}
              >
                Nenhum campo encontrado.
              </p>
            ) : (
              filtrados.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    onAdd(f.id);
                    setQuery("");
                    setAberto(false);
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    width: "100%",
                    padding: "10px 14px",
                    border: "none",
                    borderBottom: "1px solid var(--borda-leve)",
                    backgroundColor: "var(--superficie)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor =
                      "var(--superficie-quente)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor =
                      "var(--superficie)")
                  }
                >
                  <span style={{ fontSize: "13px", color: "var(--charcoal)" }}>
                    {f.label}
                  </span>
                  <span style={{ fontSize: "10px", color: "var(--gray-mid)" }}>
                    {f.stepTitle}
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
