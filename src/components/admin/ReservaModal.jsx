import { useState } from "react";
import { motion } from "framer-motion";
import {
  createReserva,
  updateReserva,
  deleteReserva,
  cancelarReserva,
} from "../../lib/reservas";

// ============================================================
// ReservaModal — criar ou editar uma reserva provisória.
// Usado pelo CalendarioTab: abre ao clicar no "+" de um dia
// (modo criar) ou ao clicar numa reserva existente (modo editar).
//
// Props:
//   dataInicial   — 'YYYY-MM-DD' pré-preenchida (modo criar)
//   reserva       — objeto da reserva a editar (modo editar); null = criar
//   eventTypes    — lista de tipos para o seletor
//   onGuardar(r)  — chamado após criar/atualizar, com a reserva resultante
//   onRemover(id) — chamado após apagar/cancelar
//   onConverter(r)— pedido de conversão em cliente (tratado no pai)
//   onFechar()
// ============================================================
export default function ReservaModal({
  dataInicial,
  reserva,
  eventTypes = [],
  onGuardar,
  onRemover,
  onConverter,
  onFechar,
}) {
  const edicao = !!reserva;

  const [nomeCliente, setNomeCliente] = useState(reserva?.nome_cliente || "");
  const [dataEvento, setDataEvento] = useState(
    reserva?.data_evento || dataInicial || "",
  );
  const [eventTypeId, setEventTypeId] = useState(reserva?.event_type_id || "");
  const [contacto, setContacto] = useState(reserva?.contacto || "");
  const [nota, setNota] = useState(reserva?.nota || "");
  const [guardando, setGuardando] = useState(false);
  const [erro, setErro] = useState(null);
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);

  const guardar = async () => {
    if (!nomeCliente.trim()) {
      setErro("O nome da cliente é obrigatório.");
      return;
    }
    setGuardando(true);
    setErro(null);
    try {
      const payload = {
        nomeCliente,
        dataEvento: dataEvento || null,
        eventTypeId: eventTypeId || null,
        contacto,
        nota,
      };
      const resultado = edicao
        ? await updateReserva(reserva.id, payload)
        : await createReserva(payload);
      onGuardar(resultado);
    } catch (e) {
      console.error(e);
      // As mensagens da casa (ex.: "já tem um evento vivo nesta data")
      // chegam inteiras; erros crus caem na genérica.
      setErro(
        e instanceof Error && e.message
          ? e.message
          : "Não foi possível guardar. Tenta novamente.",
      );
      setGuardando(false);
    }
  };

  const remover = async () => {
    setGuardando(true);
    try {
      await deleteReserva(reserva.id);
      onRemover(reserva.id);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível remover. Tenta novamente.");
      setGuardando(false);
    }
  };

  return (
    <div
      onClick={onFechar}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 320,
        backgroundColor: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          backgroundColor: "white",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "400px",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 16px 48px rgba(0,0,0,0.18)",
        }}
      >
        {/* Cabeçalho */}
        <div
          style={{
            backgroundColor: "var(--gold)",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <p
              style={{
                fontFamily: "Playfair Display, serif",
                fontSize: "16px",
                color: "white",
                margin: 0,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {edicao ? "Reserva" : "Nova Reserva"}
            </p>
            <p
              style={{
                fontSize: "10px",
                color: "white",
                opacity: 0.85,
                margin: "2px 0 0 0",
                letterSpacing: "0.04em",
              }}
            >
              {edicao
                ? "Provisória · em conversa"
                : "Marcar um dia rapidamente"}
            </p>
          </div>
          <button
            onClick={onFechar}
            style={{
              background: "none",
              border: "none",
              color: "white",
              fontSize: "18px",
              cursor: "pointer",
              lineHeight: 1,
              opacity: 0.85,
            }}
          >
            ✕
          </button>
        </div>

        {/* Corpo */}
        <div style={{ padding: "20px" }}>
          {/* Nome */}
          <div style={{ marginBottom: "14px" }}>
            <label style={labelStyle}>Nome da cliente *</label>
            <input
              type="text"
              value={nomeCliente}
              onChange={(e) => setNomeCliente(e.target.value)}
              autoFocus={!edicao}
              placeholder="ex: Mónica Silva"
              style={inputStyle}
            />
          </div>

          {/* Data + Tipo lado a lado */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Data</label>
              <input
                type="date"
                value={dataEvento}
                onChange={(e) => setDataEvento(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Tipo</label>
              <select
                value={eventTypeId}
                onChange={(e) => setEventTypeId(e.target.value)}
                style={inputStyle}
              >
                <option value="">—</option>
                {eventTypes.map((et) => (
                  <option key={et.id} value={et.id}>
                    {et.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Contacto */}
          <div style={{ marginBottom: "14px" }}>
            <label style={labelStyle}>Contacto</label>
            <input
              type="text"
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
              placeholder="Telefone, Instagram..."
              style={inputStyle}
            />
          </div>

          {/* Nota */}
          <div style={{ marginBottom: "18px" }}>
            <label style={labelStyle}>Nota</label>
            <textarea
              rows={2}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="ex: orçamento ~5k, vem ver o espaço dia 20"
              style={{ ...inputStyle, resize: "none" }}
            />
          </div>

          {erro && (
            <p
              style={{
                fontSize: "12px",
                color: "#EF4444",
                backgroundColor: "#FEF2F2",
                border: "1px solid #FECACA",
                borderRadius: "8px",
                padding: "10px 14px",
                margin: "0 0 16px 0",
              }}
            >
              ⚠ {erro}
            </p>
          )}

          {/* Ações de conversão/remoção (só em edição) */}
          {edicao && (
            <div
              style={{
                display: "flex",
                gap: "8px",
                marginBottom: "16px",
                paddingBottom: "16px",
                borderBottom: "1px solid var(--gold-light)",
              }}
            >
              <button
                onClick={() => onConverter(reserva)}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: "600",
                  border: "1.5px solid #22C55E",
                  backgroundColor: "#F0FDF4",
                  color: "#15803D",
                  cursor: "pointer",
                }}
              >
                ✓ Tornar cliente
              </button>
              {!confirmarRemocao ? (
                <button
                  onClick={() => setConfirmarRemocao(true)}
                  style={{
                    flex: 1,
                    padding: "10px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: "600",
                    border: "1.5px solid #FECACA",
                    backgroundColor: "#FEF2F2",
                    color: "#DC2626",
                    cursor: "pointer",
                  }}
                >
                  🗑 Remover
                </button>
              ) : (
                <button
                  onClick={remover}
                  disabled={guardando}
                  style={{
                    flex: 1,
                    padding: "10px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: "700",
                    border: "none",
                    backgroundColor: "#DC2626",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  Confirmar?
                </button>
              )}
            </div>
          )}

          {/* Guardar / Cancelar */}
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={onFechar}
              style={{
                flex: 1,
                padding: "11px",
                borderRadius: "10px",
                fontSize: "13px",
                border: "1.5px solid var(--gold-light)",
                color: "var(--gray-mid)",
                backgroundColor: "white",
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={guardando}
              style={{
                flex: 2,
                padding: "11px",
                borderRadius: "10px",
                fontSize: "13px",
                fontWeight: "600",
                border: "none",
                backgroundColor: guardando
                  ? "var(--gold-light)"
                  : "var(--gold)",
                color: "white",
                cursor: guardando ? "not-allowed" : "pointer",
                boxShadow: "0 4px 12px rgba(201,168,76,0.3)",
              }}
            >
              {guardando
                ? "A guardar..."
                : edicao
                  ? "Guardar alterações"
                  : "Criar reserva"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

const labelStyle = {
  fontSize: "11px",
  fontWeight: "600",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  color: "var(--charcoal)",
  display: "block",
  marginBottom: "6px",
};

const inputStyle = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: "8px",
  border: "1.5px solid var(--gold-light)",
  fontSize: "13px",
  outline: "none",
  fontFamily: "Inter, sans-serif",
  boxSizing: "border-box",
  backgroundColor: "white",
};
