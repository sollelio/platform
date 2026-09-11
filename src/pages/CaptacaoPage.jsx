import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import CaptacaoForm from "../components/captacao/CaptacaoForm";
import LogoDourado from "../components/LogoDourado";
import { assinaturaTitular, haCasa } from "../lib/casa";
import CasaProvider, { useCasa } from "../components/CasaProvider";
import { casaPorSlug } from "../lib/identidadeCasa";

// ============================================================
// CaptacaoPage — a página pública /interesse: a porta do funil.
// Sem código de acesso, fricção zero: a Nádia cola o link na bio do
// Instagram ou envia-o na conversa; a pessoa preenche em 2 minutos.
// Ao submeter, nasce a pessoa (clientes) + o evento (fase interessado)
// e o interessado aparece no funil do admin.
//
// Redesign «capítulos» (v10, 11/09/2026): a experiência guiada por
// revelação progressiva vive no CaptacaoForm (porCapitulos) — um
// capítulo aberto de cada vez, os feitos recolhem para linhas-resumo.
// Esta página dá-lhe o palco: hero mais leve (logo 116, era 200 — só
// AQUI, o resto da app não muda), rail de capítulos no desktop, e a
// barra dourada passa a dizer a PRÓXIMA AÇÃO («Continuar: o evento →»
// … «Enviar pedido») em vez de «Faltam X detalhes». A pílula dos
// opcionais e o fio de scroll saíram — os capítulos tornam ambos
// redundantes (a revisão mostra tudo antes de enviar).
//
// (v9, para memória:)
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
    capitulo: 0,
    rotuloAcao: null,
  });
  // O CaptacaoForm regista aqui a sua AÇÃO (continuar/enviar), para a
  // barra externa a disparar (uma verdade, dois botões não)
  const submeterRef = useRef(null);

  const pct = Math.round((progresso.feitos / progresso.total) * 100);
  const barraCheia = progresso.completo;
  // O envio só acontece na revisão — é aí que a barra pulsa.
  const naRevisao = progresso.capitulo === 3;

  const aoTocarNaBarra = () => {
    // Mesmo com campos em falta, deixa tocar: a validação do capítulo
    // acende os erros inline e guia a pessoa até ao que falta
    if (submeterRef.current) submeterRef.current();
  };

  // Mudar de capítulo repõe o olhar no topo do formulário — sem
  // animação para quem pediu menos movimento.
  useEffect(() => {
    if (progresso.capitulo === 0) return;
    const suave = !window.matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches;
    window.scrollTo({ top: 0, behavior: suave ? "smooth" : "auto" });
  }, [progresso.capitulo]);

  // ---------- O endereço que não é de ninguém (100) ----------
  // Aqui a moldura nua não chega: esta página não INFORMA, RECOLHE. Um
  // /interesse/<slug-inventado> sem casa deixaria um formulário de
  // angariação a pedir nome, telefone e data de casamento para lado
  // nenhum — e a pessoa a acreditar que os entregou a alguém. O
  // formulário não abre.
  //
  // Sem saída, pela regra da 100: não se sabe de que casa a pessoa
  // andava à procura, e mandá-la à primeira era o erro que esta
  // migração existe para travar.
  if (!haCasa(casa)) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "var(--cream)",
          fontFamily: "Inter, sans-serif",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "48px 26px",
        }}
      >
        <p
          style={{
            fontSize: "10px",
            fontWeight: "700",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--gold-dark)",
            margin: 0,
          }}
        >
          Pedido de orçamento
        </p>
        <h1
          style={{
            margin: "14px 0 0",
            maxWidth: "340px",
            fontFamily: "'Playfair Display', serif",
            fontSize: "22px",
            lineHeight: 1.42,
            fontWeight: "400",
            textWrap: "balance",
            color: "var(--charcoal)",
          }}
        >
          Este endereço não corresponde a nenhuma empresa.
        </h1>
        <p
          style={{
            margin: "16px 0 0",
            maxWidth: "320px",
            fontSize: "13px",
            lineHeight: 1.7,
            color: "var(--gray-mid)",
            textWrap: "pretty",
          }}
        >
          Confirme a ligação com quem lha enviou.
        </p>
      </div>
    );
  }

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
      {/* Grelha: no desktop, um rail de capítulos acompanha o cartão */}
      <style>{`
        .cap-rail{display:none}
        @media (min-width: 980px){
          .cap-grelha{display:grid;grid-template-columns:190px minmax(0,560px);gap:40px;align-items:start}
          .cap-rail{display:block;position:sticky;top:48px;padding-top:150px}
          /* no desktop o rail já lista o que vem — repetir no cartão era eco */
          .cap-futuro{display:none}
        }
      `}</style>
      <div className="cap-grelha" style={{ width: "100%", maxWidth: "820px", justifyContent: "center" }}>
        {/* O índice dos capítulos (desktop): orientação sem cliques —
            a navegação faz-se no próprio formulário */}
        {!enviado && (
          <nav className="cap-rail" aria-label="Capítulos do pedido">
            {["Sobre ti", "O evento", "Espaço e inspiração", "Rever e enviar"].map(
              (t, i) => {
                const feito = i < progresso.capitulo;
                const atual = i === progresso.capitulo;
                return (
                  <div
                    key={t}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: "10px",
                      padding: "9px 0",
                      opacity: atual ? 1 : feito ? 0.85 : 0.45,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'Playfair Display', serif",
                        fontSize: "15px",
                        color: feito || atual ? "var(--gold-dark)" : "var(--gray-mid)",
                        width: "14px",
                      }}
                    >
                      {feito ? "✓" : i + 1}
                    </span>
                    <span
                      style={{
                        fontSize: "11.5px",
                        fontWeight: atual ? "700" : "500",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: atual ? "var(--charcoal)" : "var(--gray-mid)",
                      }}
                    >
                      {t}
                    </span>
                  </div>
                );
              },
            )}
          </nav>
        )}
        {enviado && <div className="cap-rail" aria-hidden="true" />}

      <div style={{ width: "100%", maxWidth: "560px", margin: "0 auto", minWidth: 0 }}>
        {/* Hero: halo de champanhe — não é forma, é luz. O tom mais
            profundo atrás do logo dá corpo ao ouro e às pérolas. */}
        <div
          style={{
            textAlign: "center",
            padding: "6px 0 0",
            marginBottom: "16px",
          }}
        >
          {/* O halo vive ancorado ao logo (inline-block relativo):
              o pico de champanhe fica exatamente atrás das pérolas e
              do "by luxury events", e centra-se via x/y do framer —
              nunca por transform manual, que o motion sobrescreve */}
          {/* 116 (era 200) SÓ nesta experiência: a marca continua a
              abrir a página, mas quem chega vê logo o primeiro passo
              — decisão local, o resto da app não muda. */}
          <LogoDourado size={116} />
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
                margin: "12px auto 0",
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
              porCapitulos
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
      </div>

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
                barraCheia && naRevisao && !progresso.enviando
                  ? { scale: [1, 1.015, 1] }
                  : { scale: 1 }
              }
              transition={
                barraCheia && naRevisao && !progresso.enviando
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
                boxShadow:
                  barraCheia && naRevisao
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
                  : progresso.rotuloAcao ||
                    (barraCheia ? "Enviar pedido" : "Continuar →")}
              </span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}