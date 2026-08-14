import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { validateCode } from "../lib/invites";
import { motion, AnimatePresence } from "framer-motion";
import flores from "../assets/flores.webp";
import { EMPRESA, LINHA_BY_LUXURY, SLOGAN_CASA } from "../lib/casa";

function Ornament({ small = false }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        justifyContent: "center",
        margin: small ? "4px 0" : "8px 0",
      }}
    >
      <div
        style={{
          height: "1px",
          width: small ? "18px" : "40px",
          backgroundColor: "var(--gold-light)",
        }}
      />
      <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
        <path
          d="M8 1.5 C6.2 1.5 4.5 3 4.5 5 C4.5 7 6.2 8.5 8 8.5 C9.8 8.5 11.5 7 11.5 5 C11.5 3 9.8 1.5 8 1.5Z"
          stroke="#C9A84C"
          strokeWidth="0.7"
          fill="none"
        />
        <path
          d="M1 5 L4.5 5 M11.5 5 L15 5"
          stroke="#C9A84C"
          strokeWidth="0.7"
        />
        <circle cx="1" cy="5" r="0.9" fill="#C9A84C" />
        <circle cx="15" cy="5" r="0.9" fill="#C9A84C" />
      </svg>
      <div
        style={{
          height: "1px",
          width: small ? "18px" : "40px",
          backgroundColor: "var(--gold-light)",
        }}
      />
    </div>
  );
}

// Ícone neutro — serve para qualquer tipo de evento, já que nesta
// página ainda não sabemos qual é (o código só é validado a seguir)
function EventIcon() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M20 4 C20 4 21 14 26 17 C31 20 36 20 36 20 C36 20 26 21 22 26 C18 31 20 36 20 36 C20 36 19 26 14 23 C9 20 4 20 4 20 C4 20 14 19 18 14 C22 9 20 4 20 4Z"
        stroke="#C9A84C"
        strokeWidth="1.2"
        fill="#FBF7EF"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Chave — ícone de linha dourado, substitui o emoji 🔑
function KeyIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#C9A84C"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="15" r="4.5" />
      <path d="M11.5 11.5L21 2M16 7l3 3" />
    </svg>
  );
}

function FlowerDecoration() {
  return (
    <img
      src={flores}
      alt=""
      aria-hidden="true"
      className="flower-deco"
      style={{
        position: "fixed",
        top: "-30px",
        left: "-40px",
        width: "min(380px, 45vw)",
        height: "auto",
        pointerEvents: "none",
        zIndex: 0,
        opacity: 0.9,
      }}
    />
  );
}

export default function FormEntryPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Lê o código do link (?codigo=XXX) e pré-preenche o campo
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codigoUrl = params.get("codigo");
    if (codigoUrl) {
      setCode(codigoUrl.toUpperCase().trim());
    }
  }, []);

  const handleSubmit = async () => {
    if (!code.trim()) {
      setError("Introduz o teu código de acesso");
      return;
    }
    setLoading(true);
    setError(null);

    const result = await validateCode(code);

    if (!result.valid) {
      setError(result.reason);
      setLoading(false);
      return;
    }

    sessionStorage.setItem("dlm_invite", JSON.stringify(result.invite));
    navigate("/formulario");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--cream)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        position: "relative",
        overflowX: "clip",
      }}
    >
      <FlowerDecoration />

      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Cabeçalho */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          style={{ textAlign: "center", marginBottom: "32px" }}
        >
          <h1
            style={{
              fontSize: "clamp(22px, 5vw, 36px)",
              color: "var(--gold)",
              fontFamily: "Playfair Display, serif",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              margin: "0 0 6px 0",
              lineHeight: 1.1,
            }}
          >
            {EMPRESA.designacao}
          </h1>
          <p
            style={{
              fontSize: "11px",
              color: "var(--gold)",
              textTransform: "uppercase",
              letterSpacing: "0.28em",
              margin: "0 0 20px 0",
            }}
          >
            {LINHA_BY_LUXURY}
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              justifyContent: "center",
              marginBottom: "6px",
            }}
          >
            <div
              style={{
                height: "1px",
                width: "clamp(28px, 8vw, 70px)",
                flexShrink: 0,
                backgroundColor: "var(--gold-light)",
              }}
            />
            <p
              style={{
                fontSize: "12px",
                color: "var(--charcoal)",
                textTransform: "uppercase",
                letterSpacing: "0.2em",
                margin: 0,
                fontWeight: "500",
                whiteSpace: "nowrap",
              }}
            >
              Questionário do Evento
            </p>
            <div
              style={{
                height: "1px",
                width: "clamp(28px, 8vw, 70px)",
                flexShrink: 0,
                backgroundColor: "var(--gold-light)",
              }}
            />
          </div>
          <Ornament small />
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
          style={{
            backgroundColor: "white",
            borderRadius: "20px",
            overflow: "hidden",
            boxShadow: "0 8px 48px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ padding: "32px 28px 28px" }}>
            <div style={{ textAlign: "center", marginBottom: "28px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginBottom: "12px",
                }}
              >
                <div
                  style={{
                    width: "64px",
                    height: "64px",
                    borderRadius: "50%",
                    backgroundColor: "#FBF7EF",
                    border: "1.5px solid var(--gold-light)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <EventIcon />
                </div>
              </div>
              <h2
                style={{
                  fontSize: "16px",
                  color: "var(--charcoal)",
                  margin: "0 0 4px 0",
                  fontFamily: "Playfair Display, serif",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Bem-vindos
              </h2>
              <Ornament small />
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--gray-mid)",
                  margin: "8px 0 0",
                  lineHeight: "1.6",
                }}
              >
                Para aceder ao vosso questionário, introduz o código de acesso
                que recebeste.
              </p>
            </div>

            <div style={{ marginBottom: "8px" }}>
              <label
                style={{
                  fontSize: "11px",
                  fontWeight: "600",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: error ? "#EF4444" : "var(--charcoal)",
                  display: "block",
                  marginBottom: "8px",
                }}
              >
                Código de Acesso
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  border: `1.5px solid ${error ? "#F87171" : "var(--gold-light)"}`,
                  borderRadius: "10px",
                  overflow: "hidden",
                  backgroundColor: "white",
                  transition: "all 0.2s",
                  boxShadow: error ? "0 0 0 3px rgba(248,113,113,0.1)" : "none",
                }}
              >
                <div
                  style={{
                    width: "44px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    alignSelf: "stretch",
                    borderRight: `1px solid ${error ? "#FECACA" : "var(--gold-light)"}`,
                    backgroundColor: "#FBF7EF",
                    flexShrink: 0,
                  }}
                >
                  <KeyIcon />
                </div>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    if (error) setError(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  placeholder="Ex: DLM-X7K9-AB23"
                  maxLength={13}
                  style={{
                    flex: 1,
                    border: "none",
                    outline: "none",
                    padding: "13px 14px",
                    fontSize: "15px",
                    fontFamily: "Inter, sans-serif",
                    letterSpacing: "0.1em",
                    color: "var(--charcoal)",
                    backgroundColor: "white",
                    fontWeight: "600",
                    minWidth: 0,
                  }}
                />
              </div>
              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: "auto", marginTop: 6 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{
                      fontSize: "12px",
                      color: "#EF4444",
                      margin: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      overflow: "hidden",
                    }}
                  >
                    ⚠ {error}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div
            style={{
              backgroundColor: "#FBF7EF",
              borderTop: "1px solid #F0E6D0",
              padding: "16px 28px",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{
                padding: "11px 36px",
                borderRadius: "999px",
                fontSize: "11px",
                fontWeight: "600",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                backgroundColor: loading ? "var(--gold-light)" : "var(--gold)",
                color: "white",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                boxShadow: loading ? "none" : "0 4px 16px rgba(201,168,76,0.4)",
              }}
            >
              {loading ? "A verificar..." : "Entrar →"}
            </button>
          </div>
        </motion.div>

        <div style={{ marginTop: "20px" }}>
          <Ornament />
          <p
            style={{
              textAlign: "center",
              fontSize: "10px",
              color: "var(--gold-light)",
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              margin: "4px 0 0",
            }}
          >
            {SLOGAN_CASA}
          </p>
        </div>
      </div>
    </div>
  );
}
