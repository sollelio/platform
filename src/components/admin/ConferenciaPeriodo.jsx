import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { calcularConferencia, periodosPredefinidos } from "../../lib/stock";
import { Esqueleto } from "./acabamento";
import { imprimirConferencia } from "../../lib/imprimirConferencia";
import { getResumoSubmissao } from "../../lib/submissionFields";
import { FASES_POS_SINAL, FASE_LABEL } from "./faseConfig";

// ============================================================
// ConferenciaPeriodo — "O que sai", em Logística.
//
// Uma pergunta, uma vista: «tenho material para tudo o que sai este
// fim de semana?». O período escolhe-se, a soma faz-se, o saldo
// responde. Imprime-se para conferir no armazém.
//
// Não é um índice de fichas — as fichas passaram para dentro do
// evento. É a conferência do período: uma coluna por evento, a soma, o
// que existe e o saldo.
//
// A linguagem e as cores são as dos Alertas que já existem: rutura a
// vermelho, «sem stock definido» em dourado, «Precisas de N · tens S».
// ============================================================

const CORES = {
  rutura: { fundo: "#FFF8F8", forte: "#DC2626" },
  "sem-stock": { fundo: "#FFFDF6", forte: "var(--gold-dark)" },
  "no-limite": { fundo: "#FFFDF6", forte: "var(--gold-dark)" },
  ok: { fundo: "transparent", forte: "#166534" },
};

const iso = (d) => d.toISOString().slice(0, 10);

// Datas de dia puro ("2026-07-31") formatam-se em UTC — parse local
// ("T00:00:00") + mês em fuso local podia fugir um dia na fronteira do
// mês noutro fuso. Em Portugal era inofensivo; agora é correto em todos.
const diaCurto = (isoData) =>
  new Date(`${String(isoData).slice(0, 10)}T00:00:00Z`).toLocaleDateString(
    "pt-PT",
    { weekday: "short", day: "numeric", timeZone: "UTC" },
  );

const intervaloLegivel = (inicio, fim) => {
  const a = new Date(inicio);
  const b = new Date(fim);
  const mesA = a.toLocaleDateString("pt-PT", { month: "long", timeZone: "UTC" });
  const mesB = b.toLocaleDateString("pt-PT", { month: "long", timeZone: "UTC" });
  const diaA = a.getUTCDate();
  const diaB = b.getUTCDate();
  return mesA === mesB
    ? `${diaA} – ${diaB} de ${mesA}`
    : `${diaA} de ${mesA} – ${diaB} de ${mesB}`;
};

// A grelha: material · categoria · uma coluna por evento · precisas ·
// tens · saldo. Com muitos eventos a grelha alarga e ganha scroll
// horizontal dentro do próprio cartão.
const colunas = (nEventos) =>
  `minmax(200px, 1fr) 130px ${"84px ".repeat(nEventos)}74px 64px 90px`;

function Saldo({ linha }) {
  if (linha.estado === "sem-stock") {
    return (
      <span
        style={{
          fontSize: "10.5px",
          textAlign: "right",
          color: "var(--gold-dark)",
          fontWeight: "700",
        }}
      >
        sem stock definido
      </span>
    );
  }
  if (linha.estado === "no-limite") {
    return (
      <span
        style={{
          fontSize: "11.5px",
          textAlign: "right",
          color: "var(--gold-dark)",
          fontWeight: "600",
        }}
      >
        no limite
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: "12.5px",
        textAlign: "right",
        fontVariantNumeric: "tabular-nums",
        fontWeight: linha.saldo < 0 ? "700" : "400",
        color: linha.saldo < 0 ? "#DC2626" : "#166534",
      }}
    >
      {linha.saldo > 0 ? `+${linha.saldo}` : `−${Math.abs(linha.saldo)}`}
    </span>
  );
}

export default function ConferenciaPeriodo({
  materiais = [],
  submissions = [],
  todasFichas = [],
  eventTypes = [],
  buffer = { antes: 2, depois: 2 },
  loading = false,
  erro = null,
  onTentarNovamente,
}) {
  // O "hoje" dos períodos re-ancora quando a janela volta a estar à
  // vista: deixada aberta de domingo para segunda, "Fim de semana"
  // apontava para o fim de semana PASSADO sem nenhum indício.
  const [hoje, setHoje] = useState(() => new Date());
  useEffect(() => {
    const atualiza = () =>
      setHoje((h) => (iso(new Date()) === iso(h) ? h : new Date()));
    window.addEventListener("focus", atualiza);
    document.addEventListener("visibilitychange", atualiza);
    return () => {
      window.removeEventListener("focus", atualiza);
      document.removeEventListener("visibilitychange", atualiza);
    };
  }, []);
  const predefinidos = useMemo(() => periodosPredefinidos(hoje), [hoje]);
  const [escolhido, setEscolhido] = useState("fimDeSemana");
  const [datas, setDatas] = useState({ inicio: "", fim: "" });
  const [erroImpressao, setErroImpressao] = useState(false);
  const reduzirMovimento = useReducedMotion();

  const periodo = useMemo(() => {
    if (escolhido === "datas") {
      if (!datas.inicio || !datas.fim) return null;
      return { inicio: datas.inicio, fim: datas.fim };
    }
    const p = predefinidos.find((x) => x.id === escolhido);
    return p ? { inicio: iso(p.inicio), fim: iso(p.fim) } : null;
  }, [escolhido, datas, predefinidos]);

  const conf = useMemo(
    () =>
      calcularConferencia({
        materiais,
        submissions,
        todasFichas,
        periodo,
        buffer,
        // A aritmética conta só pós-sinal; a lista vem do faseConfig,
        // não é uma cópia local (decisão de 27/07).
        fasesPosSinal: FASES_POS_SINAL,
      }),
    [materiais, submissions, todasFichas, periodo, buffer],
  );

  const nomeEvento = (submissao) =>
    getResumoSubmissao(submissao, eventTypes).titulo;

  const imprimir = () => {
    const { ok } = imprimirConferencia({
      conf,
      intervalo: periodo ? intervaloLegivel(periodo.inicio, periodo.fim) : "",
      tituloPeriodo:
        predefinidos.find((p) => p.id === escolhido)?.label ||
        "Período escolhido",
      nomeEvento,
    });
    setErroImpressao(!ok);
  };

  const gridColunas = colunas(conf.eventos.length);
  const ruturas = conf.linhas.filter((l) => l.estado === "rutura");

  return (
    <div>
      {/* Escolher o período */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "24px",
          flexWrap: "wrap",
          marginBottom: "18px",
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "24px",
              fontWeight: "400",
              margin: "0 0 6px",
            }}
          >
            {predefinidos.find((p) => p.id === escolhido)?.label ||
              "Período escolhido"}
          </h2>
          <p style={{ fontSize: "13px", color: "var(--gray-mid)", margin: 0 }}>
            {!periodo
              ? "Escolhe as datas para ver o que sai."
              : (loading || erro) && conf.linhas.length === 0
                ? // Sem dados fiáveis, o cabeçalho não jura «0 un a sair»
                  intervaloLegivel(periodo.inicio, periodo.fim)
                : `${intervaloLegivel(periodo.inicio, periodo.fim)} · ${conf.totais.eventos} ${
                    conf.totais.eventos === 1 ? "evento" : "eventos"
                  } · ${conf.totais.materiais} ${
                    conf.totais.materiais === 1 ? "material" : "materiais"
                  } · ${conf.totais.unidades} un a sair de casa${
                    conf.totais.provisorios > 0
                      ? ` · +${conf.totais.provisorios} ${
                          conf.totais.provisorios === 1
                            ? "orçamento provisório"
                            : "orçamentos provisórios"
                        }`
                      : ""
                  }`}
          </p>
        </div>
        <div
          style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}
        >
          <div
            style={{
              display: "flex",
              border: "1px solid #F0E6D0",
              borderRadius: "10px",
              overflow: "hidden",
              backgroundColor: "white",
            }}
          >
            {[...predefinidos, { id: "datas", label: "Datas…" }].map((p, i) => {
              const ativo = escolhido === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setEscolhido(p.id)}
                  className="foco"
                  style={{
                    position: "relative",
                    padding: "8px 14px",
                    fontSize: "12px",
                    border: "none",
                    borderLeft: i === 0 ? "none" : "1px solid #F0E6D0",
                    backgroundColor: "white",
                    color: ativo ? "var(--gold-dark)" : "var(--gray-mid)",
                    fontWeight: ativo ? "600" : "400",
                    cursor: "pointer",
                    transition: "color 140ms ease, font-weight 140ms ease",
                  }}
                >
                  {/* O lavado ativo é UM só, que desliza de período em
                      período (layoutId) — a troca vê-se acontecer, como
                      na pastilha dos separadores do evento. */}
                  {ativo && (
                    <motion.span
                      layoutId="conferencia-periodo-lavado"
                      transition={
                        reduzirMovimento
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 600, damping: 42 }
                      }
                      style={{
                        position: "absolute",
                        inset: 0,
                        backgroundColor: "#FBF7EF",
                      }}
                    />
                  )}
                  <span style={{ position: "relative", zIndex: 1 }}>
                    {p.label}
                  </span>
                </button>
              );
            })}
          </div>
          {conf.linhas.length > 0 && (
            <button
              onClick={imprimir}
              style={{
                padding: "8px 14px",
                borderRadius: "10px",
                border: "1.5px solid var(--gold)",
                color: "var(--gold)",
                backgroundColor: "white",
                fontSize: "12px",
                fontWeight: "500",
                cursor: "pointer",
              }}
            >
              Imprimir conferência
            </button>
          )}
        </div>
      </div>

      {escolhido === "datas" && (
        <div style={{ display: "flex", gap: "10px", marginBottom: "18px" }}>
          {["inicio", "fim"].map((k) => (
            <label key={k} style={{ fontSize: "11px", color: "var(--gray-mid)" }}>
              {k === "inicio" ? "De" : "Até"}
              <input
                type="date"
                value={datas[k]}
                onChange={(e) =>
                  setDatas((d) => ({ ...d, [k]: e.target.value }))
                }
                style={{
                  display: "block",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border: "1.5px solid var(--gold-light)",
                  fontSize: "13px",
                  fontFamily: "inherit",
                }}
              />
            </label>
          ))}
        </div>
      )}

      {erroImpressao && conf.linhas.length > 0 && (
        <p
          style={{
            fontSize: "12.5px",
            color: "#B91C1C",
            backgroundColor: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "10px",
            padding: "10px 14px",
            marginBottom: "12px",
          }}
        >
          ⚠ O browser bloqueou a janela de impressão — permite pop-ups para
          este site e volta a carregar em «Imprimir conferência».
        </p>
      )}

      {/* Um cartão por evento do período; os provisórios (sem sinal) à
          parte, tracejados — vêem-se, mas não contam (decisão de 27/07). */}
      {(conf.eventos.length > 0 || conf.provisorios.eventos.length > 0) && (
        <div
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "20px",
            flexWrap: "wrap",
          }}
        >
          {conf.eventos.map((e) => (
            <div
              key={e.submissionId}
              style={{
                flex: "1 1 200px",
                backgroundColor: "white",
                border: "1px solid #F0E6D0",
                borderRadius: "12px",
                padding: "12px 16px",
              }}
            >
              <p
                style={{
                  fontSize: "9px",
                  fontWeight: "700",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--gold)",
                  margin: "0 0 5px",
                }}
              >
                {diaCurto(e.dataEvento)}
              </p>
              <p style={{ fontSize: "13.5px", margin: "0 0 2px" }}>
                {nomeEvento(e.submissao)}
              </p>
              <p
                style={{ fontSize: "11.5px", color: "var(--gray-mid)", margin: 0 }}
              >
                {e.total} un
              </p>
            </div>
          ))}
          {conf.provisorios.eventos.map((e) => (
            <div
              key={e.submissionId}
              style={{
                flex: "1 1 200px",
                backgroundColor: "#FFFDF6",
                border: "1.5px dashed var(--gold-light)",
                borderRadius: "12px",
                padding: "12px 16px",
              }}
            >
              <p
                style={{
                  fontSize: "9px",
                  fontWeight: "700",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--gold-dark)",
                  margin: "0 0 5px",
                }}
              >
                {diaCurto(e.dataEvento)} ·{" "}
                {FASE_LABEL[e.submissao?.fase] || "sem sinal"} · provisório
              </p>
              <p style={{ fontSize: "13.5px", margin: "0 0 2px" }}>
                {nomeEvento(e.submissao)}
              </p>
              <p
                style={{ fontSize: "11.5px", color: "var(--gray-mid)", margin: 0 }}
              >
                {e.total} un · fora dos totais
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Vizinhos que descontam na disponibilidade — a razão por que o
          "Tens" pode ser menor que o stock do inventário. */}
      {conf.vizinhosInfo.length > 0 &&
        conf.linhas.some((l) => l.foraEmVizinhos > 0) && (
          <p
            style={{
              fontSize: "12px",
              color: "var(--gray-mid)",
              backgroundColor: "#FBF7EF",
              border: "1px solid #F0E6D0",
              borderRadius: "10px",
              padding: "9px 14px",
              marginBottom: "14px",
            }}
          >
            O «Tens» desconta material fora de casa em{" "}
            {conf.vizinhosInfo.length === 1
              ? "um evento vizinho"
              : `${conf.vizinhosInfo.length} eventos vizinhos`}{" "}
            (fora destas datas, mas com a janela de montagem/devolução
            sobreposta):{" "}
            {conf.vizinhosInfo
              .map((v) => `${nomeEvento(v.submissao)} (${diaCurto(v.dataEvento)})`)
              .join(", ")}
            .
          </p>
        )}

      {/* Não chega para tudo — a mesma linguagem dos Alertas */}
      {ruturas.length > 0 && (
        <div
          style={{
            backgroundColor: "white",
            border: "1px solid #FECACA",
            borderRadius: "14px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
            overflow: "hidden",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              padding: "13px 18px",
              backgroundColor: "#FEF2F2",
            }}
          >
            <div>
              <p style={{ fontSize: "14px", fontWeight: "600", margin: "0 0 2px" }}>
                Não chega para tudo
              </p>
              <p style={{ fontSize: "12px", color: "var(--gray-mid)", margin: 0 }}>
                {ruturas.length}{" "}
                {ruturas.length === 1 ? "material pedido" : "materiais pedidos"} em
                maior quantidade do que tens, no mesmo período
              </p>
            </div>
            <p
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: "22px",
                fontWeight: "700",
                color: "#DC2626",
                margin: 0,
                lineHeight: 1,
              }}
            >
              {ruturas.length}
            </p>
          </div>
          {ruturas.map((l) => (
            <div
              key={l.materialId}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                padding: "11px 18px",
                borderTop: "1px solid #FDE7E7",
              }}
            >
              <span style={{ fontSize: "13px" }}>{l.material.nome}</span>
              <span style={{ fontSize: "12px", color: "var(--gray-mid)" }}>
                Precisas de <strong style={{ color: "var(--charcoal)" }}>{l.necessario}</strong>{" "}
                · tens <strong style={{ color: "var(--charcoal)" }}>{l.disponivel}</strong>
                {l.foraEmVizinhos > 0 &&
                  ` (${l.foraEmVizinhos} fora em evento vizinho)`}
              </span>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: "700",
                  color: "#DC2626",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                −{Math.abs(l.saldo)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* A tabela: uma coluna por evento, a soma, o que existe, o saldo.
          "A carregar" e "falhou" deixaram de se disfarçar de "nada sai"
          (Lote 4B) — a mentira tranquilizadora era pior que o erro. */}
      {erro && conf.linhas.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: "12.5px",
            color: "#B91C1C",
            backgroundColor: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "10px",
            padding: "10px 14px",
            marginBottom: "12px",
          }}
        >
          <span style={{ flex: 1 }}>
            ⚠ {erro} A tabela abaixo pode estar desatualizada.
          </span>
          {onTentarNovamente && (
            <button
              onClick={onTentarNovamente}
              className="ligacao"
              style={{ fontSize: "12px", color: "#B91C1C" }}
            >
              Tentar novamente
            </button>
          )}
        </div>
      )}
      {erro && conf.linhas.length === 0 ? (
        <div
          style={{
            fontSize: "13px",
            color: "#B91C1C",
            backgroundColor: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "12px",
            padding: "20px 24px",
            textAlign: "center",
          }}
        >
          <p style={{ margin: "0 0 10px 0" }}>⚠ {erro}</p>
          {onTentarNovamente && (
            <button
              onClick={onTentarNovamente}
              className="ligacao"
              style={{ fontSize: "12.5px", color: "#B91C1C" }}
            >
              Tentar novamente
            </button>
          )}
        </div>
      ) : loading && conf.linhas.length === 0 && periodo ? (
        // A forma do que vem, não uma frase: dois cartões de evento e
        // três linhas de tabela em esqueleto (o padrão da casa).
        <div aria-label="A carregar o que sai de casa">
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
            <Esqueleto w="200px" h={64} r={12} />
            <Esqueleto w="200px" h={64} r={12} />
          </div>
          <div
            style={{
              backgroundColor: "white",
              border: "1px solid #F0E6D0",
              borderRadius: "14px",
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <Esqueleto w="40%" h={10} />
            <Esqueleto h={14} />
            <Esqueleto h={14} />
            <Esqueleto w="82%" h={14} />
          </div>
        </div>
      ) : conf.linhas.length === 0 ? (
        <p
          style={{
            fontSize: "13px",
            color: "var(--gray-mid)",
            fontStyle: "italic",
            padding: "24px",
            textAlign: "center",
            border: "1px dashed var(--gold-light)",
            borderRadius: "12px",
          }}
        >
          {!periodo
            ? "Escolhe um período para ver o que sai."
            : conf.provisorios.eventos.length > 0
              ? "Nada confirmado sai de casa neste período — só os orçamentos provisórios abaixo."
              : "Nada sai de casa neste período."}
        </p>
      ) : (
        <div
          style={{
            backgroundColor: "white",
            border: "1px solid #F0E6D0",
            borderRadius: "14px",
            overflowX: "auto",
          }}
        >
          {/* fit-content: as faixas de categoria e as bordas medem a
              largura REAL das linhas — com minWidth fixo, no scroll
              horizontal as células flutuavam para lá das faixas. */}
          <div style={{ width: "fit-content", minWidth: "100%" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: gridColunas,
                gap: "10px",
                alignItems: "end",
                padding: "10px 16px",
                borderBottom: "1px solid var(--gold-light)",
              }}
            >
              {["Material", "Categoria"].map((h) => (
                <span key={h} style={cabecalho}>
                  {h}
                </span>
              ))}
              {conf.eventos.map((e) => (
                <span
                  key={e.submissionId}
                  style={{ ...cabecalho, textAlign: "right" }}
                >
                  {diaCurto(e.dataEvento)}
                  <br />
                  <span
                    style={{
                      fontWeight: "400",
                      letterSpacing: "0.04em",
                      textTransform: "none",
                    }}
                  >
                    {nomeEvento(e.submissao).split(" ")[0]}
                  </span>
                </span>
              ))}
              <span
                style={{
                  ...cabecalho,
                  textAlign: "right",
                  color: "var(--gold-dark)",
                  fontWeight: "700",
                }}
              >
                Precisas
              </span>
              <span style={{ ...cabecalho, textAlign: "right" }}>Tens</span>
              <span style={{ ...cabecalho, textAlign: "right" }}>Saldo</span>
            </div>

            {conf.porCategoria.map((grupo) => (
              <div key={grupo.categoria}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    height: "34px",
                    padding: "0 16px",
                    backgroundColor: "#FBF7EF",
                    borderBottom: "1px solid #F0E6D0",
                    borderTop: "1px solid #F0E6D0",
                  }}
                >
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: "700",
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "var(--gold-dark)",
                    }}
                  >
                    {grupo.categoria}
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--gold-dark)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {grupo.total} un
                  </span>
                </div>
                {grupo.linhas.map((l) => (
                  <div
                    key={l.materialId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: gridColunas,
                      gap: "10px",
                      alignItems: "center",
                      minHeight: "40px",
                      padding: "6px 16px",
                      borderBottom: "1px solid #F5ECD7",
                      backgroundColor: CORES[l.estado].fundo,
                    }}
                  >
                    <span style={{ fontSize: "12.5px" }}>
                      {l.material.nome}
                      {l.inativo && (
                        <span
                          style={{
                            display: "block",
                            fontSize: "9.5px",
                            fontWeight: "700",
                            color: "#B45309",
                          }}
                        >
                          ⚠ desativado — confirma antes de carregar
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: "11.5px", color: "#9B9B9B" }}>
                      {l.categoria}
                    </span>
                    {conf.eventos.map((e) => {
                      const q = l.porEvento.get(e.submissionId);
                      return (
                        <span
                          key={e.submissionId}
                          style={{
                            fontSize: "12.5px",
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                            color: q ? "var(--charcoal)" : "#C4C4C4",
                          }}
                        >
                          {q || "—"}
                        </span>
                      );
                    })}
                    <span
                      style={{
                        fontSize: "12.5px",
                        textAlign: "right",
                        fontWeight: "600",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {l.necessario}
                    </span>
                    <span
                      style={{
                        fontSize: "12.5px",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        color:
                          l.disponivel == null ? "#C4C4C4" : "var(--gray-mid)",
                      }}
                      title={
                        l.foraEmVizinhos > 0
                          ? l.vizinhos
                              .map(
                                (v) =>
                                  `${v.quantidade} em ${nomeEvento(v.submissao)} (${diaCurto(v.dataEvento)})`,
                              )
                              .join(" · ")
                          : undefined
                      }
                    >
                      {l.disponivel == null ? "—" : l.disponivel}
                      {l.foraEmVizinhos > 0 && (
                        <span
                          style={{
                            display: "block",
                            fontSize: "9.5px",
                            color: "var(--gold-dark)",
                          }}
                        >
                          {l.foraEmVizinhos} fora
                        </span>
                      )}
                    </span>
                    <Saldo linha={l} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Linhas da ficha fora da Lista de Carga — a exclusão diz-se,
          nunca acontece em silêncio. */}
      {conf.totais.foraDaCarga > 0 && (
        <p
          style={{
            fontSize: "11.5px",
            color: "var(--gray-mid)",
            fontStyle: "italic",
            margin: "10px 2px 0",
          }}
        >
          {conf.totais.foraDaCarga}{" "}
          {conf.totais.foraDaCarga === 1
            ? "linha das fichas destes eventos não entra na Lista de Carga e fica"
            : "linhas das fichas destes eventos não entram na Lista de Carga e ficam"}{" "}
          fora desta soma.
        </p>
      )}

      {/* Carga provisória — orçamentos com ficha, fora da aritmética */}
      {conf.provisorios.eventos.length > 0 && (
        <div
          style={{
            marginTop: "20px",
            backgroundColor: "#FFFDF6",
            border: "1.5px dashed var(--gold-light)",
            borderRadius: "14px",
            padding: "14px 18px",
          }}
        >
          <p
            style={{
              fontSize: "10px",
              fontWeight: "700",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--gold-dark)",
              margin: "0 0 4px",
            }}
          >
            Carga provisória — orçamentos sem sinal
          </p>
          <p
            style={{
              fontSize: "11.5px",
              color: "var(--gray-mid)",
              fontStyle: "italic",
              margin: "0 0 10px",
            }}
          >
            Não conta nos totais nem no «Não chega para tudo» — um orçamento
            não se carrega na carrinha. Está aqui para não haver surpresas se
            algum fechar à última hora.
          </p>
          {conf.provisorios.linhas.map((l) => (
            <div
              key={l.materialId}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                padding: "7px 2px",
                borderTop: "1px solid #F5ECD7",
              }}
            >
              <span style={{ fontSize: "12.5px" }}>
                {l.material.nome}
                {l.inativo && (
                  <span
                    style={{
                      display: "block",
                      fontSize: "9.5px",
                      fontWeight: "700",
                      color: "#B45309",
                    }}
                  >
                    ⚠ desativado — confirma antes de carregar
                  </span>
                )}
              </span>
              <span
                style={{
                  fontSize: "12.5px",
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--gray-mid)",
                }}
              >
                {l.quantidade}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const cabecalho = {
  fontSize: "9px",
  fontWeight: "600",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "#9B9B9B",
};
