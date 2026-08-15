import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { motion, useScroll, AnimatePresence } from "framer-motion";
import CaptacaoForm from "../components/captacao/CaptacaoForm";
import LogoDourado from "../components/LogoDourado";
import { assinaturaTitular } from "../lib/casa";
import CasaProvider, { useCasa } from "../components/CasaProvider";
import { casaPorSlug } from "../lib/identidadeCasa";

// ============================================================
// CaptacaoPage — a página pública /interesse: a porta do funil.
// Sem código de acesso, fricção zero: a Nádia cola o link na bio do
// Instagram ou envia-o na conversa; a pessoa preenche em 2 minutos.
// Ao submeter, nasce a pessoa (clientes) + o evento (fase interessado)
// e o interessado aparece no funil do admin.
//
// Redesign "hero + barra dourada" (v9):
//   • Halo de champanhe: só a área atrás do logo ganha um tom mais
//     profundo da paleta (#E8D5A3 translúcido, ancorado ao logo) que
//     se dissolve no cream sem borda — luz de vela sobre linho, não
//     é uma forma. Um raio cónico gira sobre o halo como ponteiro
//     de relógio (24s/volta, luz difusa). O logo ganha um drop-shadow suave que
//     levanta as letras do fundo.
//   • Brilho de joalharia: um feixe de luz varre as LETRAS do logo
//     (máscara com o próprio PNG — o brilho só existe onde há ouro),
//     como o reflexo num anel dentro da vitrina. Passa, descansa,
//     volta a passar.
//   • Poeira de ouro: partículas ✦ sobem devagar à volta do halo,
//     acendem e apagam em tempos desencontrados — champanhe vivo.
//   • Tagline em serifa (Playfair) emoldurada por hairlines douradas
//     que crescem do centro.
//   • Fio de progresso dourado no topo acompanha o scroll.
//   • Barra fixa no fundo que se enche de ouro com os obrigatórios.
//   • Guarda dos opcionais: pílula sobre a barra quando falta ver o
//     fundo da página (toque = scroll suave; some ao chegar lá).
// ============================================================

// Easing da casa: começa decidido, assenta devagar. O luxo move-se devagar.
const EASE_LUXO = [0.22, 1, 0.36, 1];

// A casa vem do endereço (/interesse/:slug) — o slug é público por
// desenho, está na barra e sozinho não abre nada. O Provider fica por
// fora para o hero já pintar com o logo certo: é a PRIMEIRA coisa que
// um interessado vê da casa, e não pode ser a de outra.
export default function CaptacaoPage() {
  const { slug } = useParams();
  return (
    <CasaProvider chave={slug} carregar={() => casaPorSlug(slug)}>
      <CaptacaoConteudo />
    </CasaProvider>
  );
}

function CaptacaoConteudo() {
  // O slug também serve o formulário: sem ele não se sabe de quem são
  // os tipos de evento nem onde criar o pedido.
  const { slug } = useParams();
  const casa = useCasa();
  const [enviado, setEnviado] = useState(false);
  // Progresso dos campos obrigatórios, reportado pelo CaptacaoForm
  // (6 = os 5 base + o nº de convidados, obrigatório na porta pública)
  const [progresso, setProgresso] = useState({
    feitos: 0,
    total: 6,
    completo: false,
    enviando: false,
  });
  // Perto do fundo da página? (controla a pílula dos opcionais)
  const [pertoDoFundo, setPertoDoFundo] = useState(false);
  // O CaptacaoForm regista aqui a sua função de envio, para a barra
  // externa poder disparar a submissão (uma verdade, dois botões não)
  const submeterRef = useRef(null);
  // Fio de progresso do scroll (topo do ecrã)
  const { scrollYProgress } = useScroll();

  useEffect(() => {
    const verificar = () => {
      const distancia =
        document.documentElement.scrollHeight -
        window.innerHeight -
        window.scrollY;
      setPertoDoFundo(distancia < 140);
    };
    verificar();
    window.addEventListener("scroll", verificar, { passive: true });
    window.addEventListener("resize", verificar);
    return () => {
      window.removeEventListener("scroll", verificar);
      window.removeEventListener("resize", verificar);
    };
  }, []);

  const faltam = progresso.total - progresso.feitos;
  const pct = Math.round((progresso.feitos / progresso.total) * 100);
  const barraCheia = progresso.completo;

  const aoTocarNaBarra = () => {
    // Mesmo incompleto, deixa submeter: o validar() do formulário
    // acende os erros inline e guia a pessoa até ao que falta
    if (submeterRef.current) submeterRef.current();
  };

  const irParaOsOpcionais = () => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth",
    });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--cream)",
        fontFamily: "Inter, sans-serif",
        display: "flex",
        justifyContent: "center",
        padding: "30px 16px 130px",
      }}
    >
      {/* Fio condutor: linha dourada finíssima que acompanha o scroll */}
      {!enviado && (
        <motion.div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: "2.5px",
            backgroundColor: "var(--gold)",
            transformOrigin: "0 0",
            scaleX: scrollYProgress,
            zIndex: 60,
          }}
        />
      )}

      <div style={{ width: "100%", maxWidth: "440px" }}>
        {/* Hero: halo de champanhe — não é forma, é luz. O tom mais
            profundo atrás do logo dá corpo ao ouro e às pérolas. */}
        <div
          style={{
            textAlign: "center",
            padding: "16px 0 4px",
            marginBottom: "20px",
          }}
        >
          {/* O halo vive ancorado ao logo (inline-block relativo):
              o pico de champanhe fica exatamente atrás das pérolas e
              do "by luxury events", e centra-se via x/y do framer —
              nunca por transform manual, que o motion sobrescreve */}
          <LogoDourado size={200} />
          {!enviado && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35, duration: 0.8, ease: "easeOut" }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                maxWidth: "360px",
                margin: "20px auto 0",
                position: "relative",
              }}
            >
              <motion.span
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.55, duration: 0.9, ease: EASE_LUXO }}
                style={{
                  flex: 1,
                  height: "1px",
                  transformOrigin: "100% 50%",
                  background:
                    "linear-gradient(to left, var(--gold), rgba(232,213,163,0))",
                }}
              />
              <p
                style={{
                  fontSize: "15px",
                  fontFamily: "Playfair Display, serif",
                  fontStyle: "italic",
                  color: "var(--charcoal)",
                  letterSpacing: "0.02em",
                  margin: 0,
                  lineHeight: 1.6,
                  whiteSpace: "nowrap",
                }}
              >
                Conta-nos sobre o teu evento 🤍
              </p>
              <motion.span
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.55, duration: 0.9, ease: EASE_LUXO }}
                style={{
                  flex: 1,
                  height: "1px",
                  transformOrigin: "0% 50%",
                  background:
                    "linear-gradient(to right, var(--gold), rgba(232,213,163,0))",
                }}
              />
            </motion.div>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6, ease: EASE_LUXO }}
          style={{
            backgroundColor: "white",
            borderRadius: "16px",
            padding: "24px 20px",
            border: "1px solid var(--gold-light)",
            boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
          }}
        >
          {enviado ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              style={{ textAlign: "center", padding: "24px 8px" }}
            >
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, duration: 0.5, ease: EASE_LUXO }}
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  backgroundColor: "#FBF7EF",
                  border: "1.5px solid var(--gold-light)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "26px",
                  margin: "0 auto 14px",
                  color: "var(--gold-dark)",
                }}
              >
                ✓
              </motion.div>
              <h2
                style={{
                  fontSize: "18px",
                  fontFamily: "Playfair Display, serif",
                  color: "var(--charcoal)",
                  margin: "0 0 8px 0",
                }}
              >
                Pedido recebido 🤍
              </h2>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--gray-mid)",
                  margin: 0,
                  lineHeight: 1.7,
                }}
              >
                Obrigada! Vamos analisar o teu pedido e entramos em contacto
                muito em breve.
              </p>
            </motion.div>
          ) : (
            <CaptacaoForm
              tenantSlug={slug}
              onSubmetido={() => setEnviado(true)}
              ocultarBotao
              onProgresso={setProgresso}
              registarSubmeter={(fn) => {
                submeterRef.current = fn;
              }}
            />
          )}
        </motion.div>

        <p
          style={{
            textAlign: "center",
            fontSize: "10px",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "var(--gray-mid)",
            margin: "18px 0 0 0",
          }}
        >
          {assinaturaTitular(casa)}
        </p>
      </div>

      {/* Guarda dos opcionais: com tudo obrigatório preenchido mas o
          fundo ainda por ver, uma pílula convida a descer antes de
          enviar — desaparece sozinha ao chegar lá */}
      <AnimatePresence>
        {!enviado &&
          barraCheia &&
          !pertoDoFundo &&
          !progresso.enviando && (
            <motion.button
              key="guarda-opcionais"
              onClick={irParaOsOpcionais}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.45, ease: EASE_LUXO }}
              style={{
                position: "fixed",
                bottom: "calc(88px + env(safe-area-inset-bottom))",
                left: "50%",
                transform: "translateX(-50%)",
                padding: "8px 16px",
                borderRadius: "999px",
                border: "1px solid var(--gold-light)",
                backgroundColor: "white",
                color: "var(--gold-dark)",
                fontSize: "12px",
                fontWeight: "600",
                letterSpacing: "0.02em",
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(201,168,76,0.25)",
                zIndex: 55,
                whiteSpace: "nowrap",
              }}
            >
              Ainda há detalhes opcionais em baixo ↓
            </motion.button>
          )}
      </AnimatePresence>

      {/* Barra dourada: o envio nunca se esconde — enche-se de ouro
          à medida que os detalhes obrigatórios ficam completos */}
      <AnimatePresence>
        {!enviado && (
          <motion.div
            initial={{ y: 90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 90, opacity: 0, transition: { duration: 0.4 } }}
            transition={{ delay: 0.55, duration: 0.6, ease: EASE_LUXO }}
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              padding: "12px 16px calc(14px + env(safe-area-inset-bottom))",
              backgroundColor: "rgba(250,247,240,0.9)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              borderTop: "1px solid #F0E6D0",
              display: "flex",
              justifyContent: "center",
              zIndex: 50,
            }}
          >
            <motion.button
              onClick={aoTocarNaBarra}
              disabled={progresso.enviando}
              animate={
                barraCheia && !progresso.enviando
                  ? { scale: [1, 1.015, 1] }
                  : { scale: 1 }
              }
              transition={
                barraCheia && !progresso.enviando
                  ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0.3 }
              }
              style={{
                position: "relative",
                width: "100%",
                maxWidth: "440px",
                padding: "15px",
                borderRadius: "999px",
                border: "none",
                overflow: "hidden",
                backgroundColor: "#EFE7D3",
                cursor: progresso.enviando ? "wait" : "pointer",
                boxShadow: barraCheia
                  ? "0 6px 22px rgba(201,168,76,0.45)"
                  : "0 2px 10px rgba(201,168,76,0.18)",
                transition: "box-shadow 0.6s ease",
              }}
            >
              {/* O copo a encher-se de ouro */}
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${pct}%`,
                  backgroundColor: "var(--gold)",
                  transition: "width 0.7s cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              />
              <span
                style={{
                  position: "relative",
                  fontSize: "14px",
                  fontWeight: "600",
                  letterSpacing: "0.03em",
                  color:
                    barraCheia || pct > 55 ? "white" : "var(--gold-dark)",
                  transition: "color 0.5s ease",
                }}
              >
                {progresso.enviando
                  ? "A enviar..."
                  : barraCheia
                    ? "Enviar pedido"
                    : `Faltam ${faltam} ${faltam === 1 ? "detalhe" : "detalhes"} ✧`}
              </span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}