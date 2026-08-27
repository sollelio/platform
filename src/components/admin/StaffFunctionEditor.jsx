import { useState } from "react";

// Uma função operacional: o nome e a área a que pertence. A área é
// texto livre com sugestão das que já existem — obrigar a um catálogo
// de áreas seria um terceiro catálogo para gerir três palavras.

const campo = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid var(--linha)",
  backgroundColor: "var(--superficie)",
  color: "var(--charcoal)",
  fontSize: "13px",
  boxSizing: "border-box",
};

const rotulo = {
  display: "block",
  fontSize: "11px",
  color: "var(--gray-mid)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: "5px",
};

export default function StaffFunctionEditor({
  funcao,
  areasConhecidas = [],
  onGuardar,
  onFechar,
}) {
  const [name, setName] = useState(funcao?.name ?? "");
  const [area, setArea] = useState(funcao?.area ?? "");
  const [sortOrder, setSortOrder] = useState(funcao?.sort_order ?? 0);
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState(null);

  const submeter = async (e) => {
    e.preventDefault();
    if (!name.trim() || !area.trim()) {
      setErro("O nome e a área são obrigatórios.");
      return;
    }
    setAGuardar(true);
    setErro(null);
    try {
      await onGuardar({ name, area, sortOrder: Number(sortOrder) || 0 });
    } catch (err) {
      console.error(err);
      setErro(
        err?.code === "23505"
          ? "Já existe uma função com esse nome."
          : "Não foi possível guardar. Tenta novamente.",
      );
      setAGuardar(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={funcao ? "Editar função" : "Nova função"}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        zIndex: 60,
      }}
      onClick={onFechar}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submeter}
        style={{
          backgroundColor: "var(--fundo)",
          borderRadius: "16px",
          padding: "22px",
          width: "100%",
          maxWidth: "420px",
          boxShadow: "var(--sombra-cartao)",
        }}
      >
        <h2
          style={{
            fontFamily: "Playfair Display, serif",
            fontSize: "17px",
            color: "var(--charcoal)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            margin: "0 0 18px 0",
          }}
        >
          {funcao ? "Editar função" : "Nova função"}
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={rotulo} htmlFor="func-nome">
              Nome *
            </label>
            <input
              id="func-nome"
              style={campo}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Serviço de mesa, empratamento…"
              autoFocus
            />
          </div>
          <div>
            <label style={rotulo} htmlFor="func-area">
              Área *
            </label>
            <input
              id="func-area"
              style={campo}
              list="areas-conhecidas"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Sala, Cozinha, Montagem…"
            />
            <datalist id="areas-conhecidas">
              {areasConhecidas.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>
          <div>
            <label style={rotulo} htmlFor="func-ordem">
              Ordem
            </label>
            <input
              id="func-ordem"
              style={campo}
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>
        </div>

        {erro && (
          <p
            role="alert"
            style={{
              fontSize: "12px",
              color: "var(--erro, #b3261e)",
              marginTop: "14px",
            }}
          >
            {erro}
          </p>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            marginTop: "20px",
          }}
        >
          <button
            type="button"
            onClick={onFechar}
            style={{
              padding: "9px 18px",
              borderRadius: "999px",
              fontSize: "12px",
              backgroundColor: "transparent",
              border: "1px solid var(--linha)",
              color: "var(--gray-mid)",
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={aGuardar}
            style={{
              padding: "9px 20px",
              borderRadius: "999px",
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              backgroundColor: "var(--gold)",
              color: "var(--texto-sobre-ouro)",
              border: "none",
              cursor: aGuardar ? "default" : "pointer",
              opacity: aGuardar ? 0.6 : 1,
            }}
          >
            {aGuardar ? "A guardar…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
