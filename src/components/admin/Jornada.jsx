import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { STATUS_OPTIONS, STATUS_COLORS } from "./faseConfig";
import { construirEtapas, construirEvidencia } from "./jornadaEtapas";

// ============================================================
// A JORNADA — a linha de vida do evento, do primeiro "olá" ao
// grande dia. Sete paragens CRONOLÓGICAS (cada visto significa
// "aconteceu depois do anterior") + o SELO do formulário no
// cabeçalho do cartão — a única coisa que acende fora de ordem
// saiu da linha e ganhou desenho de exceção (Direção B, 27/07).
//
// As marcas são SVG desenhadas à mão, num só vocabulário de
// traço (pontas redondas), parentes do visto do percurso de
// documentos. Morreram os glifos de texto e o emoji. O bloco
// dos medalhões tem ALTURA FIXA: o passo atual nunca empurra a
// linha ao crescer. A respiração perpétua do anel saiu — o
// movimento marca acontecimentos; a presença do atual vem do
// halo assentado, estático.
//
// Vive nos três contextos: drawer (cheia, 512px), página do
// evento (cheia, larga) e a régua compacta da moldura sticky
// (42px) — onde o selo é o ponto quadrado de cantos redondos no
// fim da linha (forma diferente diz "isto não é uma paragem").
//
// Props:
//   submissao      — a submissão (obrigatória)
//   invites        — todos os convites (para o selo)
//   previstos      — pagamentos_previstos deste evento (opcional)
//   pagamentos     — pagamentos reais deste evento (opcional)
//   onEtapa(id)    — clique numa etapa que não seja de estado; o
//     selo chama onEtapa("formulario") — o contrato de sempre
//   onStatusChange(id, status, fase) — mudar o estado do evento
//   onProximoGesto(id) — quando dado, a frase "A seguir" vira
//     PÍLULA accionável (a página passa-o; o drawer não — lá o
//     gesto já tem o seu botão grande). Nunca no "grande dia".
//   compacta       — régua sem rótulos, para a moldura sticky
// ============================================================

// ---------- as marcas, desenhadas à mão ----------

// O visto da casa — o mesmo traço do percurso de documentos
const Visto = ({ cor = "#fff", t = 11 }) => (
  <svg width={t} height={t} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path
      d="M3.5 8.5 L6.6 11.6 L12.5 4.8"
      stroke={cor}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// A taça do grande dia — line-art, não emoji
const Taca = ({ cor, t = 11, opacidade = 1 }) => (
  <svg
    width={t}
    height={t}
    viewBox="0 0 22 22"
    fill="none"
    aria-hidden
    opacity={opacidade}
  >
    <path
      d="M6.5 3 h9 M7 3 c0 4.5 1.6 6.5 4 6.5 s4 -2 4 -6.5 M11 9.5 v6 M7.5 18.5 h7 M11 15.5 v3"
      stroke={cor}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// A meia-lua do formulário por preencher — meio selo dado
const MeiaLua = ({ t = 13 }) => (
  <svg width={t} height={t} viewBox="0 0 13 13" aria-hidden>
    <circle
      cx="6.5"
      cy="6.5"
      r="5.75"
      fill="none"
      stroke="#CBB77E"
      strokeWidth="1.25"
    />
    <path d="M6.5 0.75 A5.75 5.75 0 0 1 6.5 12.25 Z" fill="#CBB77E" />
  </svg>
);

const dataLonga = (d) =>
  d
    ? new Date(d).toLocaleDateString("pt-PT", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

// ---------- o selo do formulário ----------

const SELO_ESTADOS = {
  nenhum: {
    texto: "Formulário por criar",
    cor: "var(--gray-mid)",
    glifo: (
      <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden>
        <circle
          cx="6.5"
          cy="6.5"
          r="5.75"
          fill="none"
          stroke="#C4C7CC"
          strokeWidth="1.25"
        />
      </svg>
    ),
  },
  pendente: {
    texto: "Formulário por preencher",
    cor: "var(--gray-mid)",
    glifo: <MeiaLua />,
  },
  preenchido: {
    texto: "Formulário respondido",
    cor: "var(--gold-dark)",
    glifo: (
      <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden>
        <circle cx="6.5" cy="6.5" r="6" fill="var(--gold)" />
        <path
          d="M3.8 6.8 L5.7 8.7 L9.4 4.6"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    ),
  },
  "preenchido-noutro": {
    texto: "Respostas noutro evento",
    cor: "#B45309",
    glifo: (
      <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden>
        <circle
          cx="6.5"
          cy="6.5"
          r="5.75"
          fill="none"
          stroke="#B45309"
          strokeWidth="1.25"
        />
        <circle cx="6.5" cy="6.5" r="1.6" fill="#B45309" />
      </svg>
    ),
  },
};

function SeloFormulario({
  estado,
  onEtapa,
  primeiraPintura = true,
  reduzirMovimento = false,
}) {
  const conf = SELO_ESTADOS[estado] || SELO_ESTADOS.nenhum;
  // Respondido é morto (não há gesto); os outros três abrem o caminho
  // de sempre — o contrato onEtapa("formulario") não mudou.
  const morto = estado === "preenchido";
  return (
    <button
      type="button"
      className="toca foco"
      disabled={morto || !onEtapa}
      onClick={onEtapa ? () => onEtapa("formulario") : undefined}
      title={
        morto
          ? "As respostas estão neste evento"
          : onEtapa
            ? "Abrir"
            : undefined
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        height: "22px",
        padding: "0 10px 0 8px",
        borderRadius: "999px",
        backgroundColor: "white",
        border: `1px solid ${estado === "preenchido-noutro" ? "#F0D9B5" : "var(--gold-light)"}`,
        fontSize: "10.5px",
        color: conf.cor,
        cursor: morto || !onEtapa ? "default" : "pointer",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {/* A troca de estado salta com a mola da casa quando acontece à
          frente dos olhos (a resposta da cliente a chegar em direto) —
          nunca ao abrir, nunca com movimento reduzido. A key remonta o
          glifo a cada estado; na primeira pintura o initial é falso. */}
      <motion.span
        key={estado}
        initial={
          primeiraPintura || reduzirMovimento ? false : { scale: 0 }
        }
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 28 }}
        style={{ display: "inline-flex" }}
      >
        {conf.glifo}
      </motion.span>
      <span>{conf.texto}</span>
    </button>
  );
}

// Cor do ponto do selo na régua compacta
const SELO_COR_COMPACTA = {
  nenhum: "#F1EBDD",
  pendente: "#EAD9AC",
  preenchido: "var(--gold)",
  "preenchido-noutro": "#B45309",
};

// ---------- a régua compacta (moldura sticky de 42px) ----------

// Bolinhas e fios, o selo como ponto quadrado no fim, e o passo actual
// escrito ao lado. Sem cliques — encolhido, o cabeçalho só informa.
function JornadaCompacta({ etapas, atual, formulario, porArrumar = false }) {
  const legenda = atual
    ? porArrumar
      ? "concluído · por arrumar no funil"
      : [atual.rotulo, atual.sub].filter(Boolean).join(" · ")
    : "percurso completo";
  const seloConf = SELO_ESTADOS[formulario.estado] || SELO_ESTADOS.nenhum;

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
      {/* O selo: quadrado de cantos redondos — não é uma paragem */}
      <span
        title={seloConf.texto}
        style={{
          display: "block",
          width: "9px",
          height: "9px",
          borderRadius: "3px",
          marginLeft: "6px",
          backgroundColor: SELO_COR_COMPACTA[formulario.estado] || "#F1EBDD",
          flexShrink: 0,
        }}
      />
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

// ---------- o medalhão de uma paragem ----------

// Bloco de ALTURA FIXA (26px): o atual (24px) nunca empurra a linha —
// o meio píxel que se nota é exatamente o que aqui morre.
function Medalhao({ etapa, ehAtual, primeiraPintura, reduzirMovimento }) {
  const ehTaca = etapa.id === "grandeDia";
  const bloqueada = !etapa.clicavel && etapa.tituloBloqueado && !etapa.feito;

  let estilo;
  let conteudo = null;

  if (etapa.saldado) {
    // O dinheiro está cá, falta o carimbo: visto dourado em campo
    // branco — nem feita nem por fazer, exatamente o que é.
    estilo = {
      width: "21px",
      height: "21px",
      backgroundColor: "white",
      border: "2px solid var(--gold)",
    };
    conteudo = <Visto cor="#A07830" />;
  } else if (etapa.feito) {
    estilo = {
      width: "21px",
      height: "21px",
      backgroundColor: "var(--gold)",
      // aro de cunhagem — o rebordo de uma moeda
      boxShadow: "inset 0 0 0 1px #b9973e",
    };
    // O visto (ou a taça, no grande dia) salta com a mola canónica da
    // casa quando a etapa SE CONCLUI à frente dos olhos — nunca ao
    // abrir (guarda de primeira pintura), nunca com movimento
    // reduzido. Sem a mola, a taça branca sobre o fundo ainda branco
    // era um clímax invisível.
    conteudo = (
      <motion.span
        initial={primeiraPintura || reduzirMovimento ? false : { scale: 0 }}
        animate={{ scale: 1 }}
        transition={{
          type: "spring",
          stiffness: 500,
          damping: 28,
          // a meio do enchimento a ouro (300ms via CSS da casa): a cor
          // chega primeiro, a marca assina em cima
          delay: 0.14,
        }}
        style={{ display: "inline-flex" }}
      >
        {ehTaca ? <Taca cor="#fff" t={12} /> : <Visto />}
      </motion.span>
    );
  } else if (ehAtual) {
    // Presença pelo halo assentado, estático — a respiração morreu:
    // um pulso perpétuo não marca acontecimento nenhum. Quando o
    // "atual" avança à frente dos olhos, o halo ASSENTA no fim da
    // cascata (fade curto, guardado); depois fica imóvel.
    estilo = {
      width: "24px",
      height: "24px",
      backgroundColor: "white",
      border: "1.5px solid var(--gold)",
    };
    conteudo = (
      <>
        <motion.span
          aria-hidden
          initial={
            primeiraPintura || reduzirMovimento ? false : { opacity: 0 }
          }
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.56 }}
          style={{
            position: "absolute",
            // -1.5px: alinha com a border box (o inset 0 ficava DENTRO
            // do aro de 1.5px e o halo media ~2.5px em vez de 4)
            inset: "-1.5px",
            borderRadius: "50%",
            boxShadow: "0 0 0 4px rgba(201,168,76,0.16)",
            pointerEvents: "none",
          }}
        />
        {ehTaca ? (
          <Taca cor="var(--gold)" t={12} />
        ) : (
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              backgroundColor: "var(--gold)",
            }}
          />
        )}
      </>
    );
  } else {
    // Futura: um engaste limpo — aro fino sobre branco-quente, sem o
    // "○" redundante lá dentro. Expectativa, não ausência.
    estilo = {
      width: "21px",
      height: "21px",
      backgroundColor: "#FDFBF5",
      border: "1px solid #E8DCC0",
      opacity: bloqueada ? 0.62 : 1,
    };
    conteudo = ehTaca ? <Taca cor="#A08B55" opacidade={0.5} /> : null;
  }

  return (
    <div
      style={{
        height: "26px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: "5px",
        position: "relative",
        zIndex: 1,
      }}
    >
      <div
        className="jornada-bola"
        style={{
          position: "relative",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
          ...estilo,
        }}
      >
        {conteudo}
      </div>
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
  onRecuperar,
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

  // Percurso terminado — a caixa que engolia a história abriu-se: a
  // mesma régua, congelada, com o que os dados ainda provam (o status
  // é a memória sobrevivente — foi preservado de propósito no 2A).
  if (s.fase === "perdido") {
    const { etapas, formulario, fraseStatus } = construirEvidencia({
      s,
      invites,
      previstos,
      pagamentos,
    });

    if (compacta) {
      const memoria = {
        "Em Preparação": "estava em preparação",
        Confirmado: "estava confirmado",
        Concluído: "estava concluído",
      }[s.status];
      return (
        <span style={{ fontSize: "11px", color: "var(--gray-mid)" }}>
          {memoria
            ? `Perdido — ${memoria}`
            : "Percurso terminado (perdido)"}
        </span>
      );
    }

    const ultimaEvidencia = etapas.reduce(
      (acc, e, i) => (e.evidencia ? i : acc),
      0,
    );

    return (
      <div
        style={{
          backgroundColor: "#F9FAFB",
          border: "1px solid #E5E7EB",
          borderRadius: "12px",
          padding: "14px 10px 10px",
          marginBottom: "14px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            margin: "0 4px 12px",
          }}
        >
          <p
            style={{
              fontSize: "9px",
              fontWeight: "700",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--gray-mid)",
              margin: 0,
            }}
          >
            Percurso terminado
          </p>
          <SeloFormulario
            estado={formulario.estado}
            onEtapa={undefined}
            primeiraPintura={primeiraPintura.current}
            reduzirMovimento={reduzirMovimento}
          />
        </div>
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          {etapas.map((e, i) => {
            const ehTaca = e.id === "grandeDia";
            const seguinteComEvidencia = etapas[i + 1]?.evidencia;
            return (
              <div
                key={e.id}
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
                      top: "12px",
                      left: "50%",
                      right: "-50%",
                      height: "2px",
                      backgroundColor: "#E5E7EB",
                    }}
                  >
                    {e.evidencia && seguinteComEvidencia && i < ultimaEvidencia && (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          backgroundColor: "#C9CBD1",
                        }}
                      />
                    )}
                    {/* o fio esvai-se UMA vez, depois da última prova
                        — buracos entre provas ficam no trilho neutro */}
                    {i === ultimaEvidencia && (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          background:
                            "repeating-linear-gradient(to right, #C9CBD1 0 6px, transparent 6px 12px)",
                          WebkitMaskImage:
                            "linear-gradient(to right, black, transparent 80%)",
                          maskImage:
                            "linear-gradient(to right, black, transparent 80%)",
                        }}
                      />
                    )}
                  </div>
                )}
                <div
                  style={{
                    height: "26px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "5px",
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  <div
                    style={{
                      width: "21px",
                      height: "21px",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxSizing: "border-box",
                      ...(e.evidencia
                        ? {
                            backgroundColor: "#B8BBC0",
                            boxShadow: "inset 0 0 0 1px #A7AAB0",
                          }
                        : {
                            backgroundColor: "#FCFCFD",
                            border: "1px solid #E5E7EB",
                          }),
                    }}
                  >
                    {e.evidencia ? (
                      ehTaca ? (
                        <Taca cor="#fff" t={12} />
                      ) : (
                        <Visto />
                      )
                    ) : ehTaca ? (
                      <Taca cor="#6B7280" opacidade={0.35} />
                    ) : null}
                  </div>
                </div>
                <p
                  style={{
                    fontSize: "10px",
                    fontWeight: e.evidencia ? "600" : "400",
                    color: e.evidencia ? "#4B5563" : "var(--gray-mid)",
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
                      fontSize: "9.5px",
                      color: "var(--gray-mid)",
                      fontVariantNumeric: "tabular-nums",
                      margin: 0,
                      lineHeight: 1.3,
                    }}
                  >
                    {e.sub}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            margin: "12px 4px 2px",
          }}
        >
          <p style={{ fontSize: "11px", color: "var(--gray-mid)", margin: 0 }}>
            {fraseStatus || "O que ficou registado mantém-se legível."}
          </p>
          {onRecuperar && (
            <button
              type="button"
              onClick={onRecuperar}
              className="toca foco pilula-gesto"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "999px",
                fontSize: "11.5px",
                fontWeight: "500",
                border: "1.5px solid var(--gold-light)",
                backgroundColor: "white",
                color: "var(--gold-dark)",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <span>Recuperar no funil</span>
              <span className="pilula-seta" aria-hidden>
                →
              </span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const { etapas, atual, proximoGesto, porArrumar, formulario } =
    construirEtapas({
    s,
    invites,
    previstos,
    pagamentos,
  });

  if (compacta)
    return (
      <JornadaCompacta
        etapas={etapas}
        atual={atual}
        formulario={formulario}
        porArrumar={porArrumar}
      />
    );

  // Preparação/Grande dia abrem o escolhedor de estado ali mesmo; os
  // restantes continuam a delegar no onEtapa do pai (gerar documento);
  // o formulário vive no selo, já não na linha.
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
          margin: "0 4px 12px",
        }}
      >
        <p
          style={{
            fontSize: "9px",
            fontWeight: "700",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--gold-dark)",
            margin: 0,
          }}
        >
          A Jornada
        </p>
        <SeloFormulario
          estado={formulario.estado}
          onEtapa={onEtapa}
          primeiraPintura={primeiraPintura.current}
          reduzirMovimento={reduzirMovimento}
        />
      </div>
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        {etapas.map((e, i) => {
          const ehAtual = atual && atual.id === e.id;
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
                    top: "12px",
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
                    // A curva-assinatura das revelações da casa, com o
                    // arranque depois do visto assinar (initial=false:
                    // ao abrir a página nada disto corre)
                    transition={{
                      duration: reduzirMovimento ? 0 : 0.48,
                      ease: [0.22, 1, 0.36, 1],
                      // o arranque espera pelo visto SÓ no enchimento;
                      // a drenagem (reversão) responde já
                      delay: reduzirMovimento ? 0 : e.feito ? 0.24 : 0,
                    }}
                    style={{
                      width: "100%",
                      height: "100%",
                      transformOrigin: "left center",
                      backgroundColor: "var(--gold)",
                    }}
                  />
                </div>
              )}
              <Medalhao
                etapa={e}
                ehAtual={ehAtual}
                primeiraPintura={primeiraPintura.current}
                reduzirMovimento={reduzirMovimento}
              />
              <p
                style={{
                  // Tamanho FIXO — o atual distingue-se por peso e
                  // cor, nunca a empurrar os vizinhos.
                  fontSize: "10px",
                  fontWeight: e.feito || ehAtual ? "600" : "400",
                  color: ehAtual
                    ? "var(--gold-dark)"
                    : e.feito
                      ? "var(--charcoal)"
                      : "var(--gray-mid)",
                  opacity:
                    !e.feito && !ehAtual && e.tituloBloqueado && !e.clicavel
                      ? 0.62
                      : 1,
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
                    fontSize: "9.5px",
                    color: e.saldado
                      ? "var(--gold-dark)"
                      : ehAtual
                        ? "#B45309"
                        : "var(--gray-mid)",
                    fontWeight: e.saldado || ehAtual ? "600" : "400",
                    fontVariantNumeric: "tabular-nums",
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
      {/* Percurso completo — o remate: a única serifa da régua, no
          único sítio onde já não há gesto, só registo. */}
      {!atual && (
        <motion.div
          initial={
            primeiraPintura.current || reduzirMovimento
              ? false
              : { opacity: 0, y: 2 }
          }
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: 0.7 }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            margin: "12px 4px 2px",
          }}
        >
          <span
            style={{
              width: "40px",
              height: "1px",
              backgroundColor: "var(--gold)",
              flexShrink: 0,
            }}
          />
          <p
            style={{
              fontFamily: "Playfair Display, serif",
              fontStyle: "italic",
              fontSize: "12.5px",
              color: "var(--gold-dark)",
              margin: 0,
            }}
          >
            Percurso completo
            {s.data_evento
              ? ` — o grande dia foi a ${dataLonga(s.data_evento)}`
              : ""}
            .
          </p>
        </motion.div>
      )}
      {proximoGesto && porArrumar && (
        <p
          style={{
            fontSize: "11px",
            fontStyle: "italic",
            color: "var(--gold-dark)",
            margin: "10px 4px 0",
          }}
        >
          → Por arrumar: {proximoGesto}
        </p>
      )}
      {proximoGesto &&
        !porArrumar &&
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
