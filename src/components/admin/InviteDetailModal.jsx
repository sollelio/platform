import { motion, AnimatePresence } from "framer-motion";

// Drawer do convite seleccionado — extraído do AdminPage sem mudar
// comportamento. Mostra o convite escolhido na lista: título, tipo, data e
// estado. Enquanto não estiver preenchido, mostra a mensagem pronta a
// partilhar + botão de partilha; depois de preenchido, mostra o aviso de
// que o link deixou de funcionar.
//
// Props:
//   invite          — o convite seleccionado (null = fechado)
//   eventTypes      — tipos de evento (para o badge do tipo)
//   onClose         — fecha o drawer
//   onShare         — abre o modal de partilha para este convite
//   getShareMessage(invite) — compõe a mensagem (fica no pai)
//   getTitulo(invite)       — título legível do convite
export default function InviteDetailModal({
  invite,
  eventTypes,
  onClose,
  onShare,
  getShareMessage,
  getTitulo,
}) {
  return (
    <AnimatePresence>
      {invite && (
        <motion.div
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            // Cortina unificada no token (decisão do Hélio, 16/08: um véu,
            // um valor): este era mais um 0.4 divergente.
            backgroundColor: "var(--cortina)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            style={{
              backgroundColor: "var(--sucesso-fundo)",
              borderRadius: "16px",
              padding: "20px 24px",
              width: "100%",
              maxWidth: "480px",
              // Quase --sombra-flutuante (40px ≠ 28px de desfoque) —
              // sombra preta fica literal.
              boxShadow: "0 8px 40px rgba(0,0,0,0.15)",
              border: "1px solid var(--sucesso-borda)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "16px",
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "var(--sucesso-texto)",
                    margin: "0 0 2px 0",
                  }}
                >
                  {getTitulo(invite)}
                </p>
                <span
                  style={{
                    display: "inline-block",
                    marginBottom: "4px",
                    fontSize: "10px",
                    fontWeight: "700",
                    padding: "2px 10px",
                    borderRadius: "999px",
                    backgroundColor: "var(--superficie)",
                    color: "var(--gold)",
                    border: "1px solid var(--gold-light)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {eventTypes.find((et) => et.id === invite?.event_type_id)
                    ?.nome || "—"}
                </span>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--sucesso-texto)",
                    margin: 0,
                  }}
                >
                  {invite.data_evento
                    ? new Date(invite.data_evento).toLocaleDateString("pt-PT", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })
                    : "Sem data"}{" "}
                  · {invite.status}
                </p>
              </div>
              <button
                onClick={onClose}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--sucesso-texto)",
                  fontSize: "18px",
                }}
              >
                ✕
              </button>
            </div>

            {/* Mensagem — só faz sentido enquanto o convite ainda não foi preenchido */}
            {invite.status !== "Preenchido" ? (
              <>
                <div
                  style={{
                    backgroundColor: "var(--superficie)",
                    borderRadius: "10px",
                    padding: "14px 18px",
                    marginBottom: "14px",
                    border: "1px solid var(--sucesso-borda)",
                  }}
                >
                  <p
                    style={{
                      fontSize: "10px",
                      color: "var(--neutro-texto)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      margin: "0 0 8px 0",
                    }}
                  >
                    Mensagem para partilhar
                  </p>
                  <p
                    style={{
                      fontSize: "13px",
                      color: "var(--charcoal)",
                      margin: 0,
                      lineHeight: "1.6",
                      whiteSpace: "pre-line",
                    }}
                  >
                    {getShareMessage(invite)}
                  </p>
                </div>

                <button
                  onClick={onShare}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "10px",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                    backgroundColor: "var(--gold)",
                    color: "var(--texto-sobre-ouro)",
                    border: "none",
                    boxShadow: "0 4px 12px rgba(var(--ouro-rgb), 0.35)",
                    transition: "all 0.2s",
                  }}
                >
                  ↗ Partilhar
                </button>
              </>
            ) : (
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--sucesso-texto)",
                  backgroundColor: "var(--superficie)",
                  border: "1px solid var(--sucesso-borda)",
                  borderRadius: "10px",
                  padding: "14px 18px",
                  margin: 0,
                  lineHeight: "1.6",
                }}
              >
                ✓ Este convite já foi preenchido. O link deixou de funcionar, e
                já não há nada para partilhar.
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
