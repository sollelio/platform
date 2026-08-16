import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Modal de partilha (bottom-sheet) — extraído do AdminPage sem mudar
// comportamento. Mostra WhatsApp / Instagram / Copiar para o convite
// seleccionado.
//
// Props:
//   shareTarget    — o convite a partilhar (null = fechado)
//   onClose        — fecha o modal
//   getShareMessage(invite) — compõe a mensagem (fica no pai, é partilhada
//                    com os cartões da Tab Convites)
//   getTitulo(invite) — título legível do convite ("André & Andreia")
export default function ShareSheet({
  shareTarget,
  onClose,
  getShareMessage,
  getTitulo,
}) {
  // Feedback do botão Copiar — estado local, só usado aqui dentro
  const [copiedId, setCopiedId] = useState(null);

  const copyWithFeedback = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <AnimatePresence>
      {shareTarget && (
        <motion.div
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            // O véu 0.5 não é a cortina da casa (0.35) — véu divergente
            // fora do padrão registado: fica literal e segue no
            // relatório.
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
            style={{
              backgroundColor: "var(--superficie)",
              borderRadius: "20px 20px 0 0",
              padding: "24px 24px 40px",
              width: "100%",
              maxWidth: "480px",
              boxShadow: "0 -4px 32px rgba(0,0,0,0.15)",
            }}
          >
            {/* Handle */}
            <div
              style={{
                width: "40px",
                height: "4px",
                borderRadius: "999px",
                // #E5E7EB é o valor de --neutro-borda, mas o papel do
                // token é a borda dos estados neutros — a pega da folha
                // fica literal e segue no relatório
                backgroundColor: "#E5E7EB",
                margin: "0 auto 20px",
              }}
            />

            <p
              style={{
                fontSize: "14px",
                fontWeight: "600",
                color: "var(--charcoal)",
                textAlign: "center",
                margin: "0 0 24px 0",
              }}
            >
              Partilhar com {getTitulo(shareTarget)}
            </p>

            {/* Ícones */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "32px",
                marginBottom: "24px",
              }}
            >
              {/* WhatsApp — o verde #25D366 e o degradê do Instagram
                  (abaixo) são MARCAS de terceiros, não tema: ficam
                  literais, com o branco dos glifos também literal
                  (regra do par; fill/stroke são atributos SVG). */}
              <button
                onClick={() => {
                  const msg = encodeURIComponent(getShareMessage(shareTarget));
                  window.open(`https://wa.me/?text=${msg}`, "_blank");
                  onClose();
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: "60px",
                    height: "60px",
                    borderRadius: "16px",
                    backgroundColor: "#25D366",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="white">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                  </svg>
                </div>
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--charcoal)",
                    fontWeight: "500",
                  }}
                >
                  WhatsApp
                </span>
              </button>

              {/* Instagram */}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(getShareMessage(shareTarget));
                  window.open(
                    "https://www.instagram.com/direct/inbox/",
                    "_blank",
                  );
                  onClose();
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: "60px",
                    height: "60px",
                    borderRadius: "16px",
                    background:
                      "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="white">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                  </svg>
                </div>
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--charcoal)",
                    fontWeight: "500",
                  }}
                >
                  Instagram
                </span>
              </button>

              {/* Copiar */}
              <button
                onClick={() => {
                  copyWithFeedback(
                    getShareMessage(shareTarget),
                    `msg-${shareTarget.id}`,
                  );
                  setTimeout(() => onClose(), 1500);
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: "60px",
                    height: "60px",
                    borderRadius: "16px",
                    // O par do mosaico fica literal: o repouso #F3F4F6
                    // está fora da paleta (--neutro-fundo é #F9FAFB) e
                    // o verde é preenchimento — a família sucesso não
                    // tem «cheio» (no escuro --sucesso é verde de
                    // texto e o ✓ branco perdia-se). Vai na lista.
                    backgroundColor:
                      copiedId === `msg-${shareTarget.id}`
                        ? "#22C55E"
                        : "#F3F4F6",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.3s ease",
                  }}
                >
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={
                      copiedId === `msg-${shareTarget.id}` ? "white" : "#6B7280"
                    }
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {copiedId === `msg-${shareTarget.id}` ? (
                      <path d="M20 6L9 17l-5-5" />
                    ) : (
                      <>
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                      </>
                    )}
                  </svg>
                </div>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: "500",
                    transition: "all 0.3s",
                    color:
                      copiedId === `msg-${shareTarget.id}`
                        ? "var(--sucesso)"
                        : "var(--charcoal)",
                  }}
                >
                  {copiedId === `msg-${shareTarget.id}` ? "Copiado!" : "Copiar"}
                </span>
              </button>
            </div>

            {/* Nota Instagram */}
            <p
              style={{
                fontSize: "11px",
                color: "var(--gray-mid)",
                textAlign: "center",
                margin: 0,
              }}
            >
              Para o Instagram, a mensagem é copiada automaticamente — basta
              colar no Direct.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
