import { motion } from "framer-motion";
import { logoDe } from "../lib/casa";
import { useCasa } from "./CasaProvider";

// ============================================================
// LogoDourado — o tratamento de luxo do logo (halo de champanhe +
// raio de relógio + poeira de ouro + brilho de joalharia nas letras),
// extraído do hero da CaptacaoPage (v9) para ser reutilizado onde
// quer que o logo apareça — ex: a coroar a sidebar do admin — sem
// duplicar a animação. Todas as dimensões escalam com `size` (a
// largura do logo em px), mantendo as mesmas proporções e ritmos do
// desenho original (200px).
// ============================================================

const EASE_LUXO = [0.22, 1, 0.36, 1];

// Poeira de ouro à volta do halo: posições em % do contentor do logo.
// Tempos primos entre si — os ciclos nunca sincronizam, o brilho
// parece vivo em vez de coreografado.
const POEIRA = [
  { left: "6%", top: "22%", size: 11, delay: 0.8, dur: 5.2, drift: -22 },
  { left: "93%", top: "30%", size: 9, delay: 2.1, dur: 6.1, drift: -18 },
  { left: "-4%", top: "62%", size: 8, delay: 3.4, dur: 5.7, drift: -20 },
  { left: "101%", top: "68%", size: 12, delay: 1.5, dur: 6.7, drift: -26 },
  { left: "14%", top: "88%", size: 7, delay: 4.6, dur: 5.3, drift: -16 },
  { left: "84%", top: "94%", size: 9, delay: 0.2, dur: 7.1, drift: -24 },
  { left: "50%", top: "-6%", size: 8, delay: 2.9, dur: 6.3, drift: -14 },
];

export default function LogoDourado({
  size = 200,
  // Sem valor por omissão no parâmetro: o nome da casa só se sabe com
  // o hook, e um parâmetro não pode chamar hooks. Fica indefinido e
  // resolve-se lá dentro — quem passa um `alt` próprio continua a
  // mandar nele.
  alt,
  // Dois interruptores, ambos no valor de sempre por omissão — as páginas
  // que já usavam este componente não notam nada.
  //
  // `raio`: o sector cónico que dá a volta em 24s. A cortina do
  // acompanhamento leva halo SEM raio — é um ecrã de despedida, e o
  // ponteiro a girar promete uma continuação que ali não existe.
  //
  // `animar`: com `prefers-reduced-motion` o halo fica (é luz, não
  // movimento) e tudo o que se mexe desaparece. A framer-motion não é
  // travada pelo bloco de media query do index.css, que só alcança
  // animações de CSS — por isso o corte tem de ser feito aqui.
  raio = true,
  animar = true,
}) {
  const casa = useCasa();
  const logoUrl = logoDe(casa);
  const textoAlt = alt ?? casa.nome;
  // Sem casa não há logótipo — e o que este componente desenha à volta
  // dele (halo, raio, poeira de ouro) é moldura de uma marca que ali
  // não está. Sai tudo, não só a imagem (100).
  if (!logoUrl) return null;
  const k = size / 200;
  const px = (n) => Math.round(n * k * 10) / 10;

  if (!animar) {
    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: `${px(400)}px`,
            height: `${px(340)}px`,
            maxWidth: "94vw",
            background:
              "radial-gradient(closest-side at 50% 46%, rgba(232,213,163,0.62) 0%, rgba(236,222,184,0.40) 38%, rgba(246,240,226,0.18) 60%, rgba(250,247,240,0) 78%)",
            pointerEvents: "none",
          }}
        />
        <img
          src={logoUrl}
          alt={textoAlt}
          style={{
            width: `${size}px`,
            height: "auto",
            display: "block",
            position: "relative",
            filter: `saturate(1.08) contrast(1.06) drop-shadow(0 ${px(2)}px ${px(10)}px rgba(201,168,76,0.35)) drop-shadow(0 ${px(1)}px ${px(2)}px rgba(160,120,48,0.25))`,
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {/* Halo base: centro a 46% — o pico atrás do título/pérolas, — a zona mais profunda
          e a cauda inferior mais clara dá contraste ao texto escuro
          "by luxury events" (texto escuro pede fundo claro) */}
      <motion.span
        aria-hidden="true"
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.1, ease: EASE_LUXO }}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          x: "-50%",
          y: "-50%",
          width: `${px(400)}px`,
          height: `${px(340)}px`,
          maxWidth: "94vw",
          background:
            "radial-gradient(closest-side at 50% 46%, rgba(232,213,163,0.62) 0%, rgba(236,222,184,0.40) 38%, rgba(246,240,226,0.18) 60%, rgba(250,247,240,0) 78%)",
          pointerEvents: "none",
        }}
      />
      {/* Raio de relógio: um setor de luz cónico que dá uma
          volta a cada 24s. Quadrado perfeito (rotação sem
          oscilação), centrado via x/y do framer e mascarado
          radialmente para se dissolver como o halo. */}
      {raio && (
      <motion.span
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, rotate: 360 }}
        transition={{
          opacity: { delay: 0.5, duration: 1.4, ease: "easeOut" },
          rotate: { duration: 24, repeat: Infinity, ease: "linear" },
        }}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          x: "-50%",
          y: "-50%",
          width: `${px(350)}px`,
          height: `${px(350)}px`,
          maxWidth: "94vw",
          background:
            "conic-gradient(from 0deg, rgba(255,252,242,0) 0deg, rgba(255,250,235,0.16) 30deg, rgba(255,250,235,0.26) 60deg, rgba(232,213,163,0.18) 90deg, rgba(255,252,242,0) 130deg, rgba(255,252,242,0) 360deg)",
          WebkitMaskImage:
            "radial-gradient(circle closest-side, black 38%, transparent 74%)",
          maskImage:
            "radial-gradient(circle closest-side, black 38%, transparent 74%)",
          pointerEvents: "none",
        }}
      />
      )}
      {/* Poeira de ouro: partículas que sobem e cintilam à volta
          do logo — nunca por cima das letras (posições na orla) */}
      {POEIRA.map((p, i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.85, 0], y: [6, p.drift] }}
          transition={{
            delay: p.delay,
            duration: p.dur,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{
            position: "absolute",
            left: p.left,
            top: p.top,
            fontSize: `${Math.max(4, Math.round(p.size * k))}px`,
            lineHeight: 1,
            color: "var(--gold)",
            textShadow: "0 0 6px rgba(232,213,163,0.9)",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          ✦
        </motion.span>
      ))}
      <motion.img
        src={logoUrl}
        alt={textoAlt}
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.9, ease: EASE_LUXO }}
        style={{
          width: `${size}px`,
          height: "auto",
          display: "block",
          position: "relative",
          // saturate/contrast levíssimos: dão corpo ao ouro e ao
          // "by luxury events" sem o logo parecer editado
          filter: `saturate(1.08) contrast(1.06) drop-shadow(0 ${px(2)}px ${px(10)}px rgba(201,168,76,0.35)) drop-shadow(0 ${px(1)}px ${px(2)}px rgba(160,120,48,0.25))`,
        }}
      />
      {/* Brilho de joalharia: o próprio PNG do logo serve de
          máscara, por isso o feixe de luz só acende as LETRAS —
          varre, descansa uns segundos, volta a varrer */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          WebkitMaskImage: `url(${logoUrl})`,
          maskImage: `url(${logoUrl})`,
          WebkitMaskSize: "100% 100%",
          maskSize: "100% 100%",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          pointerEvents: "none",
        }}
      >
        <motion.span
          initial={{ x: "-160%" }}
          animate={{ x: "260%" }}
          transition={{
            delay: 1.2,
            duration: 1.9,
            repeat: Infinity,
            repeatDelay: 4.2,
            ease: "easeInOut",
          }}
          style={{
            position: "absolute",
            top: "-25%",
            bottom: "-25%",
            left: 0,
            width: "55%",
            skewX: -16,
            background:
              "linear-gradient(105deg, rgba(255,253,244,0) 0%, rgba(255,252,240,0.55) 38%, rgba(255,255,250,0.95) 50%, rgba(255,252,240,0.55) 62%, rgba(255,253,244,0) 100%)",
            filter: `blur(${Math.max(1.5, px(4))}px)`,
          }}
        />
      </span>
    </div>
  );
}
