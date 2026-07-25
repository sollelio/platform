import { useMemo, useState } from "react";
import { calcularConferencia, periodosPredefinidos } from "../../lib/stock";
import { getResumoSubmissao } from "../../lib/submissionFields";

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

const diaCurto = (isoData) =>
  new Date(`${isoData}T00:00:00`).toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "numeric",
  });

const intervaloLegivel = (inicio, fim) => {
  const a = new Date(inicio);
  const b = new Date(fim);
  const mesA = a.toLocaleDateString("pt-PT", { month: "long" });
  const mesB = b.toLocaleDateString("pt-PT", { month: "long" });
  const diaA = a.getUTCDate();
  const diaB = b.getUTCDate();
  return mesA === mesB
    ? `${diaA} – ${diaB} de ${mesA}`
    : `${diaA} de ${mesA} – ${diaB} de ${mesB}`;
};

// A grelha: material · categoria · uma coluna por evento · precisas ·
// tens · saldo. Mais de três eventos e as colunas por evento saem — a
// soma continua a responder à pergunta.
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
}) {
  const predefinidos = useMemo(() => periodosPredefinidos(), []);
  const [escolhido, setEscolhido] = useState("fimDeSemana");
  const [datas, setDatas] = useState({ inicio: "", fim: "" });

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
      calcularConferencia({ materiais, submissions, todasFichas, periodo }),
    [materiais, submissions, todasFichas, periodo],
  );

  const nomeEvento = (submissao) =>
    getResumoSubmissao(submissao, eventTypes).titulo;

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
            {periodo
              ? `${intervaloLegivel(periodo.inicio, periodo.fim)} · ${conf.totais.eventos} ${
                  conf.totais.eventos === 1 ? "evento" : "eventos"
                } · ${conf.totais.materiais} ${
                  conf.totais.materiais === 1 ? "material" : "materiais"
                } · ${conf.totais.unidades} un a sair de casa`
              : "Escolhe as datas para ver o que sai."}
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
                  style={{
                    padding: "8px 14px",
                    fontSize: "12px",
                    border: "none",
                    borderLeft: i === 0 ? "none" : "1px solid #F0E6D0",
                    backgroundColor: ativo ? "#FBF7EF" : "white",
                    color: ativo ? "var(--gold-dark)" : "var(--gray-mid)",
                    fontWeight: ativo ? "600" : "400",
                    cursor: "pointer",
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          {conf.linhas.length > 0 && (
            <button
              onClick={() => window.print()}
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

      {/* Um cartão por evento do período */}
      {conf.eventos.length > 0 && (
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
        </div>
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
                · tens <strong style={{ color: "var(--charcoal)" }}>{l.stock}</strong>
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

      {/* A tabela: uma coluna por evento, a soma, o que existe, o saldo */}
      {conf.linhas.length === 0 ? (
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
          {periodo
            ? "Nada sai de casa neste período."
            : "Escolhe um período para ver o que sai."}
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
          <div style={{ minWidth: "760px" }}>
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
                    <span style={{ fontSize: "12.5px" }}>{l.material.nome}</span>
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
                        color: l.stock == null ? "#C4C4C4" : "var(--gray-mid)",
                      }}
                    >
                      {l.stock == null ? "—" : l.stock}
                    </span>
                    <Saldo linha={l} />
                  </div>
                ))}
              </div>
            ))}
          </div>
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
