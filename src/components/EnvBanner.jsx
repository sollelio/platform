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

      {/* Banner no topo, ao centro */}
      <motion.div
        className="no-print"
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        style={{
          position: "fixed",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
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
    </>
  );
}