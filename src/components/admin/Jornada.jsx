import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { STATUS_OPTIONS, STATUS_COLORS } from "./faseConfig";
import { construirEtapas } from "./jornadaEtapas";

// ============================================================
// A JORNADA — a linha de vida do evento, do primeiro "olá" ao
// grande dia. Oito etapas derivadas da fase comercial, do estado
// operacional e dos formulários.
// Três estados: feito (dourado, ✓) · atual (anel dourado) ·
// futuro (cinza). O Formulário é independente da ordem (acende
// quando o cliente responde, seja quando for): ✓ preenchido,
// ◐ criado por preencher, ○ nem criado.
//
// Vive fora do SubmissionDrawer desde o redesenho: é a melhor peça
// do drawer e a resposta literal a «em que fase está isto», por isso
// aparece nos DOIS níveis — no drawer e no cabeçalho da página do
// evento. A variante `compacta` é a régua sem rótulos do cabeçalho
// encolhido (92 px), com o passo actual escrito ao lado.
//
// Props:
//   submissao      — a submissão (obrigatória)
//   invites        — todos os convites (para o passo Formulário)
//   previstos      — pagamentos_previstos deste evento (opcional)
//   pagamentos     — pagamentos reais deste evento (opcional)
//   onEtapa(id)    — clique numa etapa que não seja de estado
//   onStatusChange(id, status, fase) — mudar o estado do evento
//   onProximoGesto(id) — quando dado, a frase "A seguir" vira PÍLULA
//     accionável (a página passa-o; o drawer não — lá o gesto já tem
//     o seu botão grande, e duas chamadas iguais eram uma a mais).
//     Nunca no "grande dia": frase celebratória não é botão.
//   compacta       — régua sem rótulos, para o cabeçalho condensado
// ============================================================

// A régua sem rótulos do cabeçalho encolhido: bolinhas e fios, com o
// passo actual escrito ao lado. Sem cliques — encolhido, o cabeçalho
// só informa; para agir volta-se a subir.
function JornadaCompacta({ etapas, atual }) {
  const legenda = atual
    ? [atual.rotulo, atual.sub].filter(Boolean).join(" · ")
    : "percurso completo";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
      {etapas.map((e, i) => {
        const ehAtual = atual && atual.id === e.id;
        return (
          <div
            key={e.id}
            style={{ display: "flex", alignItems: "center", gap: "5px" }}
          >
            <span
              title={[e.rotulo, e.sub].filter(Boolean).join(" · ")}
              style={{
                display: "block",
                width: ehAtual ? "10px" : "8px",
                height: ehAtual ? "10px" : "8px",
                borderRadius: "50%",
                boxSizing: "border-box",
                backgroundColor: ehAtual
                  ? "white"
                  : e.feito
                    ? "var(--gold)"
                    : e.aMeio
                      ? "#EAD9AC"
                      : "#F1EBDD",
                border: ehAtual ? "2px solid var(--gold)" : "none",
              }}
            />
            {i < etapas.length - 1 && (
              <span
                style={{
                  display: "block",
                  width: "14px",
                  height: "2px",
                  backgroundColor: e.feito ? "var(--gold)" : "#F1EBDD",
                }}
              />
            )}
          </div>
        );
      })}
      <span
        style={{
          fontSize: "11px",
          color: "var(--gold-dark)",
          marginLeft: "8px",
          whiteSpace: "nowrap",
        }}
      >
        {legenda}
      </span>
    </div>
  );
}

export default function Jornada({
  submissao,
  invites = [],
  previstos = null,
  pagamentos = null,
  onEtapa,
  onStatusChange,
  onProximoGesto,
  compacta = false,
}) {
  // O estado (Recebido/Em Preparação/Confirmado/Concluído) edita-se
  // aqui dentro — nos passos "Preparação" e "Grande dia" — em vez de
  // num bloco à parte sem ligação visual à Jornada. Hooks antes de
  // qualquer return condicional (fase "perdido" também usa isto).
  const [popoverEtapa, setPopoverEtapa] = useState(null);

  // O ✓ salta com mola quando uma etapa SE CONCLUI à frente dos olhos
  // — mas nunca ao abrir a página, senão o passado inteiro "acontecia"
  // a cada visita. O ref distingue a primeira pintura das seguintes.
  const primeiraPintura = useRef(true);
  useEffect(() => {
    primeiraPintura.current = false;
  }, []);
  const reduzirMovimento = useReducedMotion();

  const s = submissao;
  if (!s) return null;

  // Percurso terminado — sem jornada, só a lápide discreta
  if (s.fase === "perdido") {
    if (compacta) {
      return (
        <span style={{ fontSize: "11px", color: "var(--gray-mid)" }}>
          Percurso terminado (perdido)
        </span>
      );
    }
    return (
      <div
        style={{
          backgroundColor: "#F9FAFB",
          border: "1px solid #E5E7EB",
          borderRadius: "12px",
          padding: "10px 14px",
          marginBottom: "14px",
          fontSize: "12px",
          color: "var(--gray-mid)",
        }}
      >
        Percurso terminado (perdido) — pode ser recuperado no funil.
      </div>
    );
  }

  const { etapas, atual, proximoGesto } = construirEtapas({
    s,
    invites,
    previstos,
    pagamentos,
  });

  if (compacta) return <JornadaCompacta etapas={etapas} atual={atual} />;

  // Preparação/Grande dia abrem o escolhedor de estado ali mesmo; os
  // restantes continuam a delegar no onEtapa do pai (gerar documento,
  // preencher formulário).
  const aoClicarEtapa = (id) => {
    if (id === "preparacao" || id === "grandeDia") {
      setPopoverEtapa((atualAberto) => (atualAberto === id ? null : id));
    } else if (onEtapa) {
      onEtapa(id);
    }
  };

  return (
    <div
      style={{
        backgroundColor: "#FBF7EF",
        border: "1px solid var(--gold-light)",
        borderRadius: "12px",
        padding: "14px 10px 10px",
        marginBottom: "14px",
      }}
    >
      <p
        style={{
          fontSize: "9px",
          fontWeight: "700",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--gold-dark)",
          margin: "0 4px 12px",
        }}
      >
        A Jornada
      </p>
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        {etapas.map((e, i) => {
          const ehAtual = atual && atual.id === e.id;
          const corBola = e.feito
            ? "var(--gold)"
            : e.aMeio
              ? "#EAD9AC"
              : "#F1EBDD";
          return (
            // Botão a sério: responde ao rato, ao Tab e ao Enter — uma
            // div com onClick não respondia a nada disto.
            <button
              key={e.id}
              type="button"
              disabled={!e.clicavel}
              onClick={e.clicavel ? () => aoClicarEtapa(e.id) : undefined}
              title={e.clicavel ? "Abrir" : e.tituloBloqueado}
              className="etapa-jornada"
              style={{
                flex: 1,
                textAlign: "center",
                position: "relative",
                minWidth: 0,
              }}
            >
              {i < etapas.length - 1 && (
                <div
                  style={{
                    position: "absolute",
                    top: "10px",
                    left: "50%",
                    right: "-50%",
                    height: "2px",
                    backgroundColor: "#E5DCC3",
                    overflow: "hidden",
                  }}
                >
                  {/* O fio ENCHE-SE da esquerda para a direita quando a
                      etapa se conclui — o avanço vê-se a acontecer. */}
                  <motion.div
                    initial={false}
                    animate={{ scaleX: e.feito ? 1 : 0 }}
                    transition={{ duration: 0.45, ease: "easeOut" }}
                    style={{
                      width: "100%",
                      height: "100%",
                      transformOrigin: "left center",
                      backgroundColor: "var(--gold)",
                    }}
                  />
                </div>
              )}
              <div
                className="jornada-bola"
                style={{
                  position: "relative",
                  width: ehAtual ? "24px" : "21px",
                  height: ehAtual ? "24px" : "21px",
                  borderRadius: "50%",
                  backgroundColor: ehAtual ? "white" : corBola,
                  border: ehAtual ? "2.5px solid var(--gold)" : "none",
                  margin: `${ehAtual ? "-1px" : "0"} auto 5px`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: e.emoji ? "11px" : "10px",
                  color: e.feito ? "white" : "var(--gray-mid)",
                  fontWeight: "700",
                }}
              >
                {/* O anel do passo actual respira — lentíssimo, só
                    opacidade; parado de todo para quem pediu movimento
                    reduzido. */}
                {ehAtual && (
                  <motion.span
                    aria-hidden
                    initial={false}
                    animate={
                      reduzirMovimento
                        ? { opacity: 1 }
                        : { opacity: [1, 0.45, 1] }
                    }
                    transition={
                      reduzirMovimento
                        ? { duration: 0 }
                        : { duration: 3.6, repeat: Infinity, ease: "easeInOut" }
                    }
                    style={{
                      position: "absolute",
                      inset: "-2.5px",
                      borderRadius: "50%",
                      boxShadow: "0 0 0 4px rgba(201,168,76,0.22)",
                      pointerEvents: "none",
                    }}
                  />
                )}
                {e.emoji ? (
                  e.emoji
                ) : e.feito ? (
                  <motion.span
                    initial={
                      primeiraPintura.current || reduzirMovimento
                        ? false
                        : { scale: 0 }
                    }
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 28 }}
                    style={{ display: "inline-flex" }}
                  >
                    ✓
                  </motion.span>
                ) : ehAtual ? (
                  "●"
                ) : (
                  "○"
                )}
              </div>
              <p
                style={{
                  fontSize: ehAtual ? "10px" : "9.5px",
                  fontWeight: e.feito || ehAtual ? "600" : "400",
                  color: ehAtual
                    ? "var(--gold-dark)"
                    : e.feito
                      ? "var(--charcoal)"
                      : "var(--gray-mid)",
                  margin: "0 2px",
                  lineHeight: 1.25,
                  overflowWrap: "break-word",
                }}
              >
                {e.rotulo}
              </p>
              {e.sub && (
                <p
                  style={{
                    fontSize: "9px",
                    color: ehAtual ? "#B45309" : "var(--gray-mid)",
                    fontWeight: ehAtual ? "600" : "400",
                    margin: 0,
                    lineHeight: 1.3,
                  }}
                >
                  {e.sub}
                </p>
              )}
            </button>
          );
        })}
      </div>
      {popoverEtapa && (
        <motion.div
          initial={reduzirMovimento ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.14, ease: [0.32, 0.72, 0, 1] }}
          style={{
            marginTop: "10px",
            backgroundColor: "white",
            border: "1px solid var(--gold-light)",
            borderRadius: "10px",
            padding: "10px 12px",
          }}
        >
          <p
            style={{
              fontSize: "10px",
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--gold-dark)",
              margin: "0 0 8px",
            }}
          >
            Estado do evento
          </p>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {STATUS_OPTIONS.map((status) => {
              const colors = STATUS_COLORS[status];
              const isActive = s.status === status;
              return (
                <button
                  key={status}
                  onClick={() => {
                    onStatusChange && onStatusChange(s.id, status, s.fase);
                    setPopoverEtapa(null);
                  }}
                  className="toca foco"
                  style={{
                    padding: "5px 12px",
                    borderRadius: "999px",
                    fontSize: "11.5px",
                    fontWeight: "600",
                    border: `1px solid ${colors.border}`,
                    backgroundColor: isActive ? colors.color : colors.bg,
                    color: isActive ? "white" : colors.color,
                  }}
                >
                  {status}
                </button>
              );
            })}
          </div>
          {/* Preparar o evento é mexer na ficha de materiais DELE — e é
              para lá que os dois sítios que usam a Jornada mandam. Dizia
              "Abrir Logística" desde que a ficha vivia lá dentro, num
              sub-separador "Fichas" que deixou de existir quando ela
              passou para o evento; o rótulo ficou a apontar para uma
              casa que já não guarda o que prometia. Se algum dia um
              destes sítios mandar para outro lado, é este texto que tem
              de mudar com ele. */}
          {popoverEtapa === "preparacao" && onEtapa && (
            <button
              onClick={() => {
                onEtapa("preparacao");
                setPopoverEtapa(null);
              }}
              className="ligacao"
              style={{
                marginTop: "8px",
                fontSize: "11px",
                color: "var(--gold-dark)",
                textDecoration: "underline",
              }}
            >
              Abrir a ficha de materiais →
            </button>
          )}
        </motion.div>
      )}
      {/* O próximo gesto. Na página é uma PÍLULA que age — clica e
          aterra no separador com a parcela/linha em evidência; no
          drawer (sem onProximoGesto) fica a frase, porque o botão
          grande ali ao lado já faz o gesto. No "grande dia" é sempre
          frase: celebração não é botão. */}
      {proximoGesto &&
        (onProximoGesto && atual && atual.id !== "grandeDia" ? (
          <button
            onClick={() => onProximoGesto(atual.id)}
            className="acao acao--ouro pilula-gesto"
            style={{
              marginTop: "10px",
              padding: "7px 14px",
              borderRadius: "999px",
              fontSize: "12.5px",
              fontWeight: "500",
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
            }}
          >
            <span>A seguir: {proximoGesto}</span>
            <span className="pilula-seta" aria-hidden>
              →
            </span>
          </button>
        ) : (
          <p
            style={{
              fontSize: "11px",
              fontStyle: "italic",
              color: "var(--gold-dark)",
              margin: "10px 4px 0",
            }}
          >
            → A seguir: {proximoGesto}
          </p>
        ))}
    </div>
  );
}
