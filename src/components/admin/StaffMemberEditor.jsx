import { useState } from "react";
import { ENGAGEMENT_LABELS } from "../../lib/staff";

// A ficha de uma pessoa da equipa. Modal simples, como o resto do
// backoffice: sem passos, sem assistente — são seis campos.
//
// O nome escreve-se EXACTAMENTE como a casa o usa; não há normalização
// nenhuma, de propósito.

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

export default function StaffMemberEditor({ membro, onGuardar, onFechar }) {
  const [displayName, setDisplayName] = useState(membro?.display_name ?? "");
  const [email, setEmail] = useState(membro?.email ?? "");
  const [phone, setPhone] = useState(membro?.phone ?? "");
  const [engagement, setEngagement] = useState(
    membro?.engagement ?? "occasional",
  );
  const [mayBeConsulted, setMayBeConsulted] = useState(
    membro?.may_be_consulted ?? true,
  );
  const [notes, setNotes] = useState(membro?.notes ?? "");
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState(null);

  const submeter = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setErro("O nome é obrigatório.");
      return;
    }
    setAGuardar(true);
    setErro(null);
    try {
      await onGuardar({
        displayName,
        email,
        phone,
        engagement,
        mayBeConsulted,
        notes,
      });
    } catch (err) {
      console.error(err);
      setErro(
        err?.code === "23505"
          ? "Já existe uma pessoa com estes dados."
          : "Não foi possível guardar. Tenta novamente.",
      );
      setAGuardar(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={membro ? "Editar pessoa" : "Nova pessoa"}
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
          maxWidth: "460px",
          maxHeight: "90vh",
          overflowY: "auto",
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
          {membro ? "Editar pessoa" : "Nova pessoa"}
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={rotulo} htmlFor="staff-nome">
              Nome *
            </label>
            <input
              id="staff-nome"
              style={campo}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Como a escreves no dia a dia"
              autoFocus
            />
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 180px" }}>
              <label style={rotulo} htmlFor="staff-email">
                Email
              </label>
              <input
                id="staff-email"
                style={campo}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div style={{ flex: "1 1 140px" }}>
              <label style={rotulo} htmlFor="staff-tel">
                Telefone
              </label>
              <input
                id="staff-tel"
                style={campo}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label style={rotulo} htmlFor="staff-vinculo">
              Vínculo
            </label>
            <select
              id="staff-vinculo"
              style={campo}
              value={engagement}
              onChange={(e) => setEngagement(e.target.value)}
            >
              {Object.entries(ENGAGEMENT_LABELS).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </select>
            <p
              style={{
                fontSize: "11px",
                color: "var(--gray-mid)",
                margin: "6px 0 0 0",
              }}
            >
              O vínculo é o tipo de ligação à casa. Não é o mesmo que estar
              activa ou inactiva.
            </p>
          </div>

          <div>
            <label
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "flex-start",
                fontSize: "13px",
                color: "var(--charcoal)",
              }}
            >
              <input
                type="checkbox"
                checked={mayBeConsulted}
                onChange={(e) => setMayBeConsulted(e.target.checked)}
                style={{ marginTop: "3px" }}
              />
              <span>
                Pode receber consultas de disponibilidade
                <span
                  style={{
                    display: "block",
                    fontSize: "11px",
                    color: "var(--gray-mid)",
                  }}
                >
                  Desliga para quem entra nas escalas sem nunca ser consultada.
                </span>
              </span>
            </label>
          </div>

          <div>
            <label style={rotulo} htmlFor="staff-notas">
              Notas internas
            </label>
            <textarea
              id="staff-notas"
              style={{ ...campo, minHeight: "70px", resize: "vertical" }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
            flexWrap: "wrap",
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
