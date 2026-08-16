import { motion } from "framer-motion";

// Lista de convites — extraída do AdminPage sem mudar comportamento.
// Mostra os convites em cards; cada card abre o drawer ao clicar, e os
// convites pendentes têm ainda os botões ✏️ Preencher e 🗑 Remover.
//
// Props:
//   invites        — lista de convites
//   loading        — se ainda está a carregar (loadingInvites no pai)
//   eventTypes     — tipos de evento (para o badge do tipo)
//   onSelect(invite)    — abre o drawer do convite
//   onPreencher(invite) — abre o formulário para preencher em nome do cliente
//   onDelete(invite)    — pede confirmação de remoção
//   getTitulo(invite)   — título legível do convite
export default function InvitesList({
  invites,
  loading,
  eventTypes,
  onSelect,
  onPreencher,
  onDelete,
  getTitulo,
}) {
  if (loading) {
    return (
      <p
        style={{
          textAlign: "center",
          padding: "40px",
          color: "var(--gray-mid)",
          fontSize: "14px",
        }}
      >
        A carregar...
      </p>
    );
  }

  if (invites.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <p style={{ fontSize: "32px", marginBottom: "12px" }}>🎟️</p>
        <p style={{ fontSize: "14px", color: "var(--gray-mid)" }}>
          Ainda não há convites criados.
        </p>
      </div>
    );
  }

  return (
    <div
      className="invites-list"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      {invites.map((invite, idx) => {
        const isPendente = invite.status === "Pendente";
        return (
          <motion.div
            key={invite.id}
            onClick={() => onSelect(invite)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.25,
              ease: "easeOut",
              delay: Math.min(idx * 0.04, 0.3),
            }}
            whileHover={{
              y: -2,
              boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
            }}
            style={{
              backgroundColor: "var(--superficie)",
              borderRadius: "14px",
              padding: "18px 22px",
              // Igual a --sombra-cartao, mas fica literal: o whileHover
              // interpola esta sombra com um alvo literal, e o token no
              // escuro muda de forma (anel, não sombra) — o regresso do
              // hover saltava. Segue no relatório.
              boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
              borderLeft: `4px solid ${isPendente ? "var(--gold-light)" : "var(--sucesso)"}`,
              cursor: "pointer",
              transition: "box-shadow 0.2s",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div>
              <p
                style={{
                  fontSize: "15px",
                  fontWeight: "500",
                  color: "var(--charcoal)",
                  margin: "0 0 4px 0",
                }}
              >
                {getTitulo(invite)}
              </p>
              <span
                style={{
                  display: "inline-block",
                  marginBottom: "6px",
                  fontSize: "10px",
                  fontWeight: "700",
                  padding: "2px 10px",
                  borderRadius: "999px",
                  backgroundColor: "var(--superficie-selo)",
                  color: "var(--gold)",
                  border: "1px solid var(--gold-light)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {eventTypes.find((et) => et.id === invite.event_type_id)
                  ?.nome || "—"}
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "var(--gold)",
                    letterSpacing: "0.08em",
                  }}
                >
                  {invite.code}
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--gray-mid)",
                  }}
                >
                  {invite.data_evento
                    ? new Date(invite.data_evento).toLocaleDateString("pt-PT", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })
                    : "Sem data"}
                </span>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: "10px",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  padding: "4px 10px",
                  borderRadius: "999px",
                  backgroundColor: isPendente
                    ? "var(--superficie-selo)"
                    : "var(--sucesso-fundo)",
                  color: isPendente ? "var(--gold)" : "var(--sucesso)",
                  border: `1px solid ${isPendente ? "var(--gold-light)" : "var(--sucesso-borda)"}`,
                  fontWeight: "500",
                  whiteSpace: "nowrap",
                }}
              >
                {invite.status}
              </span>
              {isPendente && (
                <>
                  <button
                    className="btn-compact"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPreencher(invite);
                    }}
                    title="Preencher o formulário"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--gold-light)",
                      backgroundColor: "var(--superficie-selo)",
                      color: "var(--gold)",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: "500",
                      transition: "all 0.2s",
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    ✏️ Preencher
                  </button>
                  <button
                    className="btn-compact"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(invite);
                    }}
                    title="Remover convite"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--perigo-borda)",
                      backgroundColor: "var(--perigo-fundo)",
                      color: "var(--perigo)",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: "500",
                      transition: "all 0.2s",
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {/* stroke é atributo SVG — var() não é válido em
                        atributos de apresentação; fica literal */}
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#DC2626"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                    Remover
                  </button>
                </>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
