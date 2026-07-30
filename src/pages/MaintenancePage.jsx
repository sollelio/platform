import { useState, useEffect, useId } from "react";
import { motion } from "framer-motion";
import flores from "../assets/flores.png";

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
      <div style={{ height: "1px", width: small ? "18px" : "40px", backgroundColor: "var(--gold-light)" }} />
      <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
        <path d="M8 1.5 C6.2 1.5 4.5 3 4.5 5 C4.5 7 6.2 8.5 8 8.5 C9.8 8.5 11.5 7 11.5 5 C11.5 3 9.8 1.5 8 1.5Z" stroke="#C9A84C" strokeWidth="0.7" fill="none" />
        <path d="M1 5 L4.5 5 M11.5 5 L15 5" stroke="#C9A84C" strokeWidth="0.7" />
        <circle cx="1" cy="5" r="0.9" fill="#C9A84C" />
        <circle cx="15" cy="5" r="0.9" fill="#C9A84C" />
      </svg>
      <div style={{ height: "1px", width: small ? "18px" : "40px", backgroundColor: "var(--gold-light)" }} />
    </div>
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

// ===== Pétala (forma delicada, a condizer com o bouquet: rosa/gypsophila) =====
// Branca-creme com leve toque dourado nas bordas, como as flores do ramo.
// O gradiente é embutido em CADA pétala com objectBoundingBox (não depende de
// referências externas, por isso funciona sempre e em qualquer browser).
function Petal({ size, rotation = 0, opacity = 0.9 }) {
  // ID único e estável por instância (useId evita colisões entre pétalas).
  // Removem-se os dois-pontos que o useId inclui, pois quebram url(#...) em SVG.
  const rawId = useId().replace(/:/g, "");
  const gradId = `petal-grad-${rawId}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ transform: `rotate(${rotation}deg)`, display: "block", opacity }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#FBF3DF" />
          <stop offset="100%" stopColor="#E3CC92" />
        </linearGradient>
      </defs>
      {/* Pétala suave e arredondada, com ponta delicada e base estreita */}
      <path
        d="M12 2
           C 16 5, 21 9, 20 15
           C 19.3 19.5, 15.5 22, 12 22
           C 8.5 22, 4.7 19.5, 4 15
           C 3 9, 8 5, 12 2 Z"
        fill={`url(#${gradId})`}
        stroke="#D9C48A"
        strokeWidth="0.6"
      />
      {/* Veiozinho central, muito subtil */}
      <path d="M12 6 C 12 11, 12 16, 12 20" stroke="#C9A84C" strokeWidth="0.4" opacity="0.5" />
    </svg>
  );
}

// ===== Pétalas a cair (com balanço suave) + camada que acumula no chão =====
function FallingPetals() {
  // Tamanhos harmoniosos (variação suave, não aleatória de mais)
  const sizeFor = (seed) => 15 + (seed % 3) * 3; // 15, 18 ou 21px

  // Pétalas que caem continuamente
  const falling = Array.from({ length: 16 }, (_, i) => ({
    id: i,
    left: 4 + Math.random() * 92,
    duration: 9 + Math.random() * 5,
    delay: Math.random() * 12,
    size: sizeFor(i),
    sway: 18 + Math.random() * 22,
    rotStart: Math.random() * 60 - 30,
  }));

  // Pétalas já pousadas no chão ao carregar (impacto imediato)
  const settledInitial = Array.from({ length: 22 }, (_, i) => ({
    id: `s${i}`,
    left: Math.random() * 100,
    bottom: Math.random() * 22,
    size: sizeFor(i),
    rotation: Math.random() * 360,
    opacity: 0.5 + Math.random() * 0.35,
  }));

  return (
    <>
      {/* Camada de pétalas pousadas no chão */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, height: "140px", pointerEvents: "none", overflow: "hidden", zIndex: 1 }}>
        {settledInitial.map((p) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: p.opacity, y: 0 }}
            transition={{ duration: 1, delay: 0.4 + Math.random() * 1, ease: "easeOut" }}
            style={{ position: "absolute", left: `${p.left}%`, bottom: `${p.bottom}px` }}
          >
            <Petal size={p.size} rotation={p.rotation} opacity={p.opacity} />
          </motion.div>
        ))}
      </div>

      {/* Pétalas a cair — descem com balanço lateral, abrandam e fundem-se no chão */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 1 }}>
        {falling.map((p) => (
          <motion.div
            key={p.id}
            initial={{ top: "-6%", opacity: 0 }}
            animate={{
              top: ["-6%", "20%", "50%", "82%", "90%"],
              opacity: [0, 0.95, 0.95, 0.7, 0],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              ease: [0.4, 0, 0.5, 1],
              times: [0, 0.2, 0.55, 0.9, 1],
            }}
            style={{ position: "absolute", left: `${p.left}%` }}
          >
            {/* Balanço lateral (como uma pétala a planar) */}
            <motion.div
              animate={{ x: [-p.sway / 2, p.sway / 2, -p.sway / 2] }}
              transition={{ duration: p.duration * 0.45, repeat: Infinity, ease: "easeInOut" }}
            >
              {/* Rotação lenta e suave de vaivém, não giro completo */}
              <motion.div
                animate={{ rotate: [p.rotStart, p.rotStart + 40, p.rotStart] }}
                transition={{ duration: p.duration * 0.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <Petal size={p.size} opacity={0.95} />
              </motion.div>
            </motion.div>
          </motion.div>
        ))}
      </div>
    </>
  );
}

// Ícone de documento/guia
function GuideIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2h9l5 5v13a1 1 0 01-1 1H6a1 1 0 01-1-1V3a1 1 0 011-1z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h6M9 9h2" />
    </svg>
  );
}

// Ícone do casal (caminho "ver como um casal")
function CoupleMiniIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
      <circle cx="11" cy="8" r="3.2" stroke="#C9A84C" strokeWidth="1.2" fill="none" />
      <path d="M6 24 Q6 16 11 16 Q16 16 16 24" stroke="#C9A84C" strokeWidth="1.2" fill="none" />
      <circle cx="21" cy="8" r="3.2" stroke="#C9A84C" strokeWidth="1.2" fill="none" />
      <path d="M16 24 Q16 16 21 16 Q26 16 26 24" stroke="#C9A84C" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

// Ícone de painel/gestão (caminho "administradora")
function DashboardMiniIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

function ArrowSmall() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

// Cartão de "caminho" — componente estável (fora do principal, para não re-animar)
function PathCard({ href, icon, label, desc, delay }) {
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      whileHover={{ y: -3, scale: 1.015 }}
      whileTap={{ scale: 0.98 }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        textDecoration: "none",
        backgroundColor: "white",
        border: "1.5px solid var(--gold-light)",
        borderRadius: "14px",
        padding: "16px 18px",
        textAlign: "left",
        boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          width: "46px",
          height: "46px",
          borderRadius: "50%",
          backgroundColor: "#FBF7EF",
          border: "1.5px solid var(--gold-light)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "14px", color: "var(--charcoal)", margin: "0 0 2px 0", fontWeight: "600", fontFamily: "Playfair Display, serif" }}>
          {label}
        </p>
        <p style={{ fontSize: "12px", color: "var(--gray-mid)", margin: 0, lineHeight: 1.4 }}>
          {desc}
        </p>
      </div>
      <ArrowSmall />
    </motion.a>
  );
}

const TEST_URL = "https://celebra-doluxoamesa-teste.netlify.app";

export default function MaintenancePage() {
  const [sparkle, setSparkle] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setSparkle((s) => !s), 2600);
    return () => clearInterval(interval);
  }, []);

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
        fontFamily: "Inter, sans-serif",
      }}
    >
      <FlowerDecoration />
      <FallingPetals />

      <div style={{ width: "100%", maxWidth: "480px", position: "relative", zIndex: 2 }}>
        {/* Cabeçalho da marca */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ textAlign: "center", marginBottom: "28px" }}
        >
          <h1
            style={{
              fontSize: "clamp(26px, 6vw, 40px)",
              color: "var(--gold)",
              fontFamily: "Playfair Display, serif",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              margin: "0 0 6px 0",
              lineHeight: 1.1,
            }}
          >
            Do Luxo à Mesa
          </h1>
          <p style={{ fontSize: "11px", color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.28em", margin: 0 }}>
            by Luxury Events
          </p>
        </motion.div>

        {/* Card principal */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.12 }}
          style={{
            backgroundColor: "white",
            borderRadius: "24px",
            overflow: "hidden",
            boxShadow: "0 12px 56px rgba(0,0,0,0.10)",
          }}
        >
          <div style={{ height: "5px", background: "linear-gradient(to right, var(--gold-light), var(--gold), var(--gold-dark))" }} />

          <div style={{ padding: "44px 36px 36px", textAlign: "center" }}>
            {/* Símbolo central — flor a oscilar */}
            <motion.div
              initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ duration: 0.7, ease: "easeOut", delay: 0.3 }}
              style={{
                width: "84px",
                height: "84px",
                borderRadius: "50%",
                backgroundColor: "#FBF7EF",
                border: "1.5px solid var(--gold-light)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 22px",
              }}
            >
              <motion.svg
                width="44" height="44" viewBox="0 0 44 44" fill="none"
                animate={{ rotate: [0, 5, 0, -5, 0] }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              >
                <g stroke="#C9A84C" strokeWidth="1.2" fill="none">
                  <ellipse cx="22" cy="12" rx="4" ry="7" />
                  <ellipse cx="22" cy="32" rx="4" ry="7" />
                  <ellipse cx="12" cy="22" rx="7" ry="4" />
                  <ellipse cx="32" cy="22" rx="7" ry="4" />
                  <ellipse cx="14.5" cy="14.5" rx="6" ry="4" transform="rotate(45 14.5 14.5)" />
                  <ellipse cx="29.5" cy="14.5" rx="4" ry="6" transform="rotate(45 29.5 14.5)" />
                  <ellipse cx="14.5" cy="29.5" rx="4" ry="6" transform="rotate(45 14.5 29.5)" />
                  <ellipse cx="29.5" cy="29.5" rx="6" ry="4" transform="rotate(45 29.5 29.5)" />
                </g>
                <circle cx="22" cy="22" r="4" fill="#E8D5A3" />
                <circle cx="22" cy="22" r="2" fill="#C9A84C" />
              </motion.svg>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              style={{
                fontSize: "20px",
                color: "var(--charcoal)",
                margin: "0 0 4px 0",
                fontFamily: "Playfair Display, serif",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Estamos quase prontos
            </motion.h2>

            <Ornament small />

            {/* Frase inspiradora */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.6 }}
              style={{
                fontSize: "15px",
                color: "var(--gold-dark)",
                fontFamily: "Playfair Display, serif",
                fontStyle: "italic",
                margin: "12px auto 0",
                maxWidth: "340px",
                lineHeight: 1.6,
              }}
            >
              Algo especial está a nascer — e cada detalhe está a ser pensado para o vosso dia.
            </motion.p>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.5 }}
              style={{ fontSize: "13px", color: "var(--gray-mid)", lineHeight: "1.7", margin: "14px auto 0", maxWidth: "360px" }}
            >
              A aplicação está a ser afinada com todo o cuidado.
              Enquanto isso, ajuda-nos a deixá-la perfeita.
            </motion.p>

            {/* O guia — herói */}
            <motion.a
              href="/guia.pdf"
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.85, duration: 0.5 }}
              whileHover={{ y: -3, scale: 1.015 }}
              whileTap={{ scale: 0.98 }}
              style={{
                display: "block",
                textDecoration: "none",
                marginTop: "28px",
                borderRadius: "18px",
                padding: "2px",
                background: "linear-gradient(135deg, var(--gold-light), var(--gold), var(--gold-dark))",
                boxShadow: sparkle
                  ? "0 6px 18px rgba(201,168,76,0.22)"
                  : "0 4px 12px rgba(201,168,76,0.14)",
                transition: "box-shadow 1.4s ease",
              }}
            >
              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: "16px",
                  padding: "20px 22px",
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    width: "52px",
                    height: "52px",
                    borderRadius: "50%",
                    backgroundColor: "#FBF7EF",
                    border: "1.5px solid var(--gold-light)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <GuideIcon />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "10px", color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 3px 0", fontWeight: "600" }}>
                    Passo 1 · Antes de começar
                  </p>
                  <p style={{ fontSize: "15px", color: "var(--charcoal)", margin: "0 0 2px 0", fontWeight: "600", fontFamily: "Playfair Display, serif" }}>
                    Descobre o guia de testes
                  </p>
                  <p style={{ fontSize: "12px", color: "var(--gray-mid)", margin: 0, lineHeight: 1.4 }}>
                    Aprende a pôr a aplicação à prova como uma profissional.
                  </p>
                </div>
                <motion.div
                  animate={{ x: [0, 4, 0] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    backgroundColor: "var(--gold)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    boxShadow: "0 4px 12px rgba(201,168,76,0.4)",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </motion.div>
              </div>
            </motion.a>

            {/* Separador "Passo 2" */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.95, duration: 0.5 }}
              style={{ display: "flex", alignItems: "center", gap: "10px", margin: "24px 0 16px" }}
            >
              <div style={{ height: "1px", flex: 1, backgroundColor: "var(--gold-light)" }} />
              <span style={{ fontSize: "10px", color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: "600" }}>
                Passo 2 · Experimenta
              </span>
              <div style={{ height: "1px", flex: 1, backgroundColor: "var(--gold-light)" }} />
            </motion.div>

            {/* Os dois caminhos — empilhados (perfeito para mobile) */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <PathCard
                href={TEST_URL}
                icon={<CoupleMiniIcon />}
                label="Ver como o organizador"
                desc="Experimenta o questionário tal como o organizador o vê."
                delay={1.0}
              />
              <PathCard
                href={`${TEST_URL}/admin`}
                icon={<DashboardMiniIcon />}
                label="Entrar como administradora"
                desc="Acede ao painel de gestão e às tuas ferramentas."
                delay={1.1}
              />
            </div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.25, duration: 0.5 }}
              style={{ fontSize: "11px", color: "var(--gold-light)", margin: "18px 0 0", fontStyle: "italic", lineHeight: 1.6 }}
            >
              Tudo abre no teu telemóvel ou computador, num instante.
            </motion.p>
          </div>
        </motion.div>

        {/* Rodapé */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.6 }}
          style={{ marginTop: "24px" }}
        >
          <Ornament />
          <p style={{ textAlign: "center", fontSize: "10px", color: "var(--gold-light)", textTransform: "uppercase", letterSpacing: "0.18em", margin: "4px 0 0" }}>
            Planeamos cada detalhe. Criamos memórias inesquecíveis.
          </p>
        </motion.div>
      </div>
    </div>
  );
}