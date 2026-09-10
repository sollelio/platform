import { motion } from "framer-motion";

// Faixa visível apenas no ambiente de teste/desenvolvimento.
// Mostra um banner no topo e uma moldura subtil à volta da página,
// para nunca haver dúvida sobre em que ambiente se está.
//
// `no-print` nas duas peças: os documentos da casa imprimem-se do
// próprio browser, e quem testa imprime DESTE ambiente — sem isto, a
// faixa vermelha e a moldura saíam no papel das provas.
export default function EnvBanner() {
  return (
    <>
      {/* Moldura à volta de toda a página */}
      <div
        className="no-print"
        style={{
          position: "fixed",
          inset: 0,
          // O alarme fica literal por inteiro (moldura, faixa e o
          // branco por cima): #DC2626 é o valor de --perigo, mas o
          // papel aqui é preenchimento/traço de alarme — no escuro
          // esse token é salmão de texto e a faixa deixava de gritar
          // em uníssono com a moldura. Segue no relatório.
          border: "3px solid #DC2626",
          borderRadius: "2px",
          pointerEvents: "none",
          zIndex: 9998,
        }}
      />

      {/* Banner no topo, ao centro. O centro vem do invólucro flex de
          largura total, NUNCA de translateX(-50%) no próprio motion.div:
          o framer-motion compõe o transform inteiro a partir do y da
          animação e APAGA o translate do CSS ao terminar — o selo
          ficava empurrado para a direita e cortado no bordo (sonda de
          09/09/2026: left 212 num ecrã de 390). */}
      <div
        className="no-print"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 9999,
        }}
      >
      <motion.div
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        style={{
          backgroundColor: "#DC2626",
          color: "white",
          padding: "5px 18px",
          borderRadius: "0 0 10px 10px",
          fontSize: "11px",
          fontWeight: "700",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontFamily: "Inter, sans-serif",
          boxShadow: "0 4px 14px rgba(220,38,38,0.35)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            backgroundColor: "white",
            display: "inline-block",
          }}
        />
        Ambiente de Teste
      </motion.div>
      </div>
    </>
  );
}