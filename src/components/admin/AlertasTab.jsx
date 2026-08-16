import { useMemo } from "react";
import { getResumoSubmissao } from "../../lib/submissionFields";

// Formata uma janela de datas de forma legível, ao dia.
// Ex: "10 – 14 de julho" (mesmo mês) ou "28 jun – 2 jul" (meses diferentes).
const formatarJanela = (janela) => {
  if (!janela || !janela.inicio || !janela.fim) return "";
  const opt = { day: "2-digit", month: "long" };
  const optCurto = { day: "2-digit", month: "short" };
  const ini = new Date(janela.inicio);
  const fim = new Date(janela.fim);
  const mesmoMes = ini.getUTCMonth() === fim.getUTCMonth();
  if (mesmoMes) {
    const dia1 = ini.getUTCDate();
    const resto = fim.toLocaleDateString("pt-PT", { ...opt, timeZone: "UTC" });
    return `${dia1} – ${resto}`;
  }
  return `${ini.toLocaleDateString("pt-PT", { ...optCurto, timeZone: "UTC" })} – ${fim.toLocaleDateString("pt-PT", { ...optCurto, timeZone: "UTC" })}`;
};

const formatarDataCurta = (data) => {
  if (!data) return "sem data";
  return new Date(data).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
};

// ============================================================
// AlertasTab — sub-tab "Alertas" da OperacionalTab (Fase C).
//
// Apresentação pura: NÃO carrega nem calcula. Recebe os alertas já
// prontos do OperacionalTab (que os calcula uma vez, partilhados com o
// badge da sub-navegação), e desenha.
//
// Distingue dois casos:
//   • Rutura real (stock > 0 mas insuficiente) → vermelho, "faltam X"
//   • Stock por definir (stock = 0)            → âmbar, "sem stock definido"
//
// Props:
//   alertas      — lista já calculada (calcularAlertas)
//   loading      — se os dados ainda estão a carregar
//   submissions  — eventos (para títulos legíveis)
//   eventTypes   — tipos de evento (para getResumoSubmissao)
// ============================================================
export default function AlertasTab({
  alertas = [],
  alertasReposicao = [],
  loading = false,
  submissions = [],
  eventTypes = [],
}) {
  // Título legível de um evento (genérico, funciona para qualquer tipo)
  const tituloEvento = useMemo(() => {
    const cache = new Map();
    return (submissionId) => {
      if (cache.has(submissionId)) return cache.get(submissionId);
      const sub = submissions.find((s) => s.id === submissionId);
      const titulo = sub
        ? getResumoSubmissao(sub, eventTypes).titulo
        : "Evento";
      cache.set(submissionId, titulo);
      return titulo;
    };
  }, [submissions, eventTypes]);

  if (loading) {
    return (
      <p
        style={{
          textAlign: "center",
          padding: "60px",
          color: "var(--gray-mid)",
          fontSize: "14px",
        }}
      >
        A analisar o stock...
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* ===== SECÇÃO 1: CONFLITOS DE EVENTOS (urgente) ===== */}
      <section>
        <SeccaoTitulo
          titulo="Conflitos de eventos"
          subtitulo="Materiais pedidos por eventos próximos em maior quantidade do que tens. Cada aviso junta os eventos que partilham o mesmo período."
        />
        {alertas.length === 0 ? (
          <EstadoBom
            titulo="Sem conflitos de stock"
            texto="Tudo o que os teus eventos pedem cabe no que tens."
          />
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            {alertas.map((alerta, idx) => (
              <AlertaCard
                key={`${alerta.materialId}-${idx}`}
                alerta={alerta}
                tituloEvento={tituloEvento}
              />
            ))}
          </div>
        )}
      </section>

      {/* ===== SECÇÃO 2: ABAIXO DO STOCK IDEAL (planeamento) ===== */}
      <section>
        <SeccaoTitulo
          titulo="Abaixo do stock ideal"
          subtitulo="Materiais em que tens menos do que gostarias de ter. Para planeares reposições — não são urgentes."
          contagem={alertasReposicao.length}
        />
        {alertasReposicao.length === 0 ? (
          <EstadoBom
            titulo="Stock nos níveis ideais"
            texto="Todos os materiais com meta definida estão no nível que querias, ou acima."
          />
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            {alertasReposicao.map((a) => (
              <ReposicaoCard key={a.materialId} alerta={a} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// Cabeçalho de secção, com contagem opcional
function SeccaoTitulo({ titulo, subtitulo, contagem }) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "6px",
        }}
      >
        <h3
          style={{
            fontSize: "15px",
            fontWeight: "600",
            color: "var(--charcoal)",
            margin: 0,
            fontFamily: "Playfair Display, serif",
          }}
        >
          {titulo}
        </h3>
        {contagem > 0 && (
          <span
            style={{
              fontSize: "11px",
              fontWeight: "700",
              color: "var(--gold-dark)",
              backgroundColor: "var(--superficie-selo)",
              border: "1px solid var(--gold-light)",
              borderRadius: "999px",
              padding: "1px 9px",
            }}
          >
            {contagem}
          </span>
        )}
      </div>
      <p
        style={{
          fontSize: "13px",
          color: "var(--gray-mid)",
          margin: 0,
          maxWidth: "560px",
          lineHeight: 1.5,
        }}
      >
        {subtitulo}
      </p>
    </div>
  );
}

// Estado "tudo bem" de uma secção (acolhedor, não parece erro)
function EstadoBom({ titulo, texto }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "32px 24px",
        backgroundColor: "var(--sucesso-fundo)",
        borderRadius: "16px",
        border: "1px solid var(--sucesso-borda)",
      }}
    >
      <p style={{ fontSize: "28px", margin: "0 0 8px 0" }}>✓</p>
      <p
        style={{
          fontSize: "14px",
          fontWeight: "600",
          color: "var(--sucesso-texto)",
          margin: "0 0 4px 0",
          fontFamily: "Playfair Display, serif",
        }}
      >
        {titulo}
      </p>
      <p
        style={{
          fontSize: "13px",
          color: "var(--sucesso-texto)",
          margin: 0,
          maxWidth: "360px",
          marginInline: "auto",
          lineHeight: 1.5,
        }}
      >
        {texto}
      </p>
    </div>
  );
}

// ------------------------------------------------------------
// Cartão de reposição (material abaixo do stock ideal)
// ------------------------------------------------------------
function ReposicaoCard({ alerta }) {
  const critico = alerta.severidade === "critico";
  const cor = critico
    ? {
        borda: "var(--perigo-borda)",
        fundo: "var(--perigo-fundo)",
        forte: "var(--perigo)",
      }
    : {
        borda: "var(--gold-light)",
        fundo: "var(--superficie-selo)",
        forte: "var(--gold-dark)",
      };
  const m = alerta.material;
  const nomeLegivel =
    [m.tipo, m.cor].filter(Boolean).join(" · ") || m.nome || "Material";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        padding: "14px 16px",
        backgroundColor: "var(--superficie)",
        borderRadius: "12px",
        border: `1px solid ${cor.borda}`,
        boxShadow: "var(--sombra-cartao)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            fontSize: "14px",
            fontWeight: "500",
            color: "var(--charcoal)",
            margin: "0 0 2px 0",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {m.codigo ? `${m.codigo} · ` : ""}
          {nomeLegivel}
        </p>
        <p style={{ fontSize: "12px", color: "var(--gray-mid)", margin: 0 }}>
          Tens <strong>{alerta.disponivel}</strong> · ideal{" "}
          <strong>{alerta.ideal}</strong>
        </p>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <p
          style={{
            fontSize: "18px",
            fontWeight: "700",
            color: cor.forte,
            margin: 0,
            lineHeight: 1,
            fontFamily: "Playfair Display, serif",
          }}
        >
          −{alerta.falta}
        </p>
        <p
          style={{
            fontSize: "10px",
            color: cor.forte,
            margin: "2px 0 0 0",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {critico ? "crítico" : "repor"}
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Cartão de um alerta (material × janela)
// ------------------------------------------------------------
function AlertaCard({ alerta, tituloEvento }) {
  // Sem total registado → "por definir" (âmbar). Condicional (só
  // rebenta se um orçamento sem sinal fechar) → âmbar. Rutura real →
  // vermelho. Nota: total registado mas todo "por confirmar" dá stock
  // 0 a sério — é rutura, não "por definir".
  const porDefinir = alerta.semStock ?? alerta.stock <= 0;
  const condicional = !!alerta.condicional;
  const daProvisorios = alerta.necessario - (alerta.necessarioConfirmado ?? alerta.necessario);

  const cor = porDefinir || condicional
    ? {
        borda: "var(--gold-light)",
        fundo: "var(--superficie-selo)",
        forte: "var(--gold-dark)",
        tenue: "var(--superficie-quente)",
      }
    : {
        borda: "var(--perigo-borda)",
        fundo: "var(--perigo-fundo)",
        forte: "var(--perigo)",
        // #FFF5F5 está fora da tabela (a família perigo lava em
        // #FEF2F2) — fica literal e vai na lista.
        tenue: "#FFF5F5",
      };

  return (
    <div
      style={{
        backgroundColor: "var(--superficie)",
        borderRadius: "14px",
        border: `1px solid ${cor.borda}`,
        boxShadow: "var(--sombra-cartao)",
        overflow: "hidden",
      }}
    >
      {/* Cabeçalho: material + estado */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "12px",
          padding: "16px 18px",
          backgroundColor: cor.fundo,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              fontSize: "15px",
              fontWeight: "600",
              color: "var(--charcoal)",
              margin: "0 0 2px 0",
            }}
          >
            {alerta.material?.nome || "Material"}
          </p>
          <p style={{ fontSize: "12px", color: "var(--gray-mid)", margin: 0 }}>
            {formatarJanela(alerta.janela)}
          </p>
          {condicional && (
            <p
              style={{
                fontSize: "10px",
                fontWeight: "700",
                color: cor.forte,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                margin: "4px 0 0 0",
              }}
            >
              condicional — só se o orçamento fechar
            </p>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {porDefinir ? (
            <span
              style={{
                fontSize: "11px",
                fontWeight: "700",
                color: cor.forte,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                whiteSpace: "nowrap",
              }}
            >
              sem stock definido
            </span>
          ) : (
            <>
              <p
                style={{
                  fontSize: "22px",
                  fontWeight: "700",
                  color: cor.forte,
                  margin: 0,
                  lineHeight: 1,
                  fontFamily: "Playfair Display, serif",
                }}
              >
                −{alerta.falta}
              </p>
              <p
                style={{
                  fontSize: "10px",
                  color: cor.forte,
                  margin: "2px 0 0 0",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {condicional ? "em falta se fechar" : "em falta"}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Aritmética */}
      <div
        style={{
          padding: "12px 18px",
          fontSize: "12px",
          color: "var(--gray-mid)",
          borderBottom: `1px solid ${cor.borda}`,
        }}
      >
        {porDefinir ? (
          <>
            Os eventos pedem <strong>{alerta.necessario}</strong> unidades
            {daProvisorios > 0 && (
              <> (inclui {daProvisorios} de orçamentos sem sinal)</>
            )}
            , mas este material ainda não tem stock registado. Define o stock
            no catálogo para saber se chega.
          </>
        ) : (
          <>
            Precisas de <strong>{alerta.necessario}</strong>
            {daProvisorios > 0 && (
              <> (inclui {daProvisorios} de orçamentos sem sinal)</>
            )}{" "}
            · tens <strong>{alerta.stock}</strong>
            {condicional && (
              <>
                {" "}
                {(alerta.necessarioConfirmado ?? 0) > 0
                  ? "— os confirmados, sozinhos, ainda cabem"
                  : "— não há eventos confirmados a pedi-lo"}
              </>
            )}
          </>
        )}
      </div>

      {/* Eventos envolvidos */}
      <div style={{ padding: "10px 18px 14px" }}>
        {alerta.eventos.map((ev) => (
          <div
            key={ev.submissionId}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              padding: "6px 0",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <span
                style={{
                  fontSize: "13px",
                  color: "var(--charcoal)",
                  fontWeight: "500",
                }}
              >
                {tituloEvento(ev.submissionId)}
              </span>
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--gray-mid)",
                  marginLeft: "8px",
                }}
              >
                {formatarDataCurta(ev.dataEvento)}
              </span>
              {ev.provisorio && (
                <span
                  style={{
                    fontSize: "9px",
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    padding: "2px 7px",
                    marginLeft: "8px",
                    borderRadius: "999px",
                    backgroundColor: "var(--superficie-selo)",
                    color: "var(--gold-dark)",
                    border: "1px solid var(--gold-light)",
                    whiteSpace: "nowrap",
                  }}
                >
                  sem sinal
                </span>
              )}
            </div>
            <span
              style={{
                fontSize: "12px",
                fontWeight: "600",
                color: "var(--charcoal)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {ev.quantidade}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
