import { useEffect, useMemo, useState } from "react";
import {
  TIPOS_NOTA,
  tipoNota,
  getNotas,
  criarNota,
  apagarNota,
  getDocumentosDoEvento,
  construirHistorico,
  contarHistorico,
} from "../../lib/notas";

// ============================================================
// NotasEvento — o separador Notas: o histórico de interação por ordem
// inversa.
//
// Uma coluna: o que ela escreveu em cartão, o que o sistema registou
// em linha fina com bolinha. Escrever é a primeira coisa que se vê;
// ler é o resto.
//
// As entradas com bolinha escrevem-se sozinhas — vêm do que já
// acontece na app (formulário, sinal, documentos). Ver construirHistorico
// em lib/notas.js.
// ============================================================

const FILTROS = [
  { id: "tudo", label: "Tudo" },
  { id: "chamada", label: "Chamadas" },
  { id: "mensagem", label: "Mensagens" },
  { id: "alteracao", label: "Alterações" },
  { id: "interna", label: "Notas internas" },
  { id: "percurso", label: "Só o percurso" },
];

const dataCurta = (iso) =>
  new Date(iso).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "short",
  });

const hora = (iso) =>
  new Date(iso).toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });

function Quando({ iso, esbatido }) {
  return (
    <div style={{ textAlign: "right" }}>
      <p
        style={{
          fontSize: "12px",
          color: esbatido ? "var(--gray-mid)" : "var(--charcoal)",
          margin: 0,
        }}
      >
        {dataCurta(iso)}
      </p>
      <p
        style={{
          fontSize: "11px",
          color: esbatido ? "#B0A88F" : "#9B9B9B",
          margin: "1px 0 0",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {hora(iso)}
      </p>
    </div>
  );
}

// O que o sistema registou: uma linha fina com bolinha, sem cartão.
function LinhaSistema({ entrada }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "92px 1fr",
        gap: "16px",
        alignItems: "center",
      }}
    >
      <Quando iso={entrada.quando} esbatido />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "4px 0",
        }}
      >
        <span
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            backgroundColor: entrada.inicio ? "var(--gold-light)" : "var(--gold)",
            display: "block",
            flexShrink: 0,
          }}
        />
        <p
          style={{
            fontSize: "12.5px",
            color: entrada.inicio ? "#9B9B9B" : "var(--gray-mid)",
            margin: 0,
          }}
        >
          {entrada.texto}
          {entrada.valor && (
            <>
              {" · "}
              <span style={{ color: "#166534", fontWeight: "600" }}>
                {entrada.valor}
              </span>
            </>
          )}
          {entrada.detalhe && ` · ${entrada.detalhe}`}
        </p>
      </div>
    </div>
  );
}

// O que ela escreveu: cartão, com o tipo e o autor.
function CartaoNota({ entrada, aApagar, onPedirApagar, onCancelar, onApagar }) {
  const t = tipoNota(entrada.tipo);
  const interna = entrada.tipo === "interna";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "92px 1fr", gap: "16px" }}>
      <div style={{ paddingTop: "14px" }}>
        <Quando iso={entrada.quando} />
      </div>
      <div
        style={{
          backgroundColor: interna ? "#FBF7EF" : "white",
          border: "1px solid #F0E6D0",
          borderRadius: "14px",
          padding: "14px 18px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "9px",
            marginBottom: "7px",
          }}
        >
          <span
            style={{
              fontSize: "9.5px",
              fontWeight: "700",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: t.cor,
              backgroundColor: t.fundo,
              border: `1px solid ${t.borda}`,
              borderRadius: "999px",
              padding: "3px 9px",
            }}
          >
            {t.label}
          </span>
          <span style={{ fontSize: "11.5px", color: "#9B9B9B" }}>
            {interna ? "só eu vejo" : entrada.autor || "Nádia"}
          </span>
          <div style={{ flex: 1 }} />
          {aApagar ? (
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "11.5px", color: "var(--gray-mid)" }}>
                Apagar esta nota?
              </span>
              <button onClick={onCancelar} style={ligacao("var(--gray-mid)")}>
                Cancelar
              </button>
              <button onClick={onApagar} style={ligacao("#B91C1C")}>
                Apagar
              </button>
            </span>
          ) : (
            <button
              onClick={onPedirApagar}
              title="Apagar esta nota"
              style={ligacao("#C4C4C4")}
            >
              ✕
            </button>
          )}
        </div>
        <p
          style={{
            fontSize: "13.5px",
            lineHeight: 1.6,
            margin: 0,
            textWrap: "pretty",
            whiteSpace: "pre-wrap",
          }}
        >
          {entrada.corpo}
        </p>
      </div>
    </div>
  );
}

const ligacao = (cor) => ({
  border: "none",
  background: "none",
  padding: 0,
  fontSize: "11.5px",
  color: cor,
  cursor: "pointer",
});

// A caixa de escrita — a primeira coisa que se vê.
function Escrever({ onGuardar, aGuardar }) {
  const [tipo, setTipo] = useState("chamada");
  const [corpo, setCorpo] = useState("");

  const guardar = async () => {
    if (!corpo.trim() || aGuardar) return;
    const ok = await onGuardar({ tipo, corpo });
    if (ok) setCorpo("");
  };

  return (
    <div
      style={{
        backgroundColor: "white",
        border: "1.5px solid var(--gold-light)",
        borderRadius: "14px",
        padding: "14px 16px",
        marginBottom: "22px",
      }}
    >
      <textarea
        value={corpo}
        onChange={(e) => setCorpo(e.target.value)}
        placeholder="O que foi combinado? Chamada, alteração, mensagem…"
        rows={2}
        style={{
          width: "100%",
          border: "none",
          outline: "none",
          resize: "vertical",
          fontFamily: "Inter, sans-serif",
          fontSize: "13px",
          color: "var(--charcoal)",
          background: "transparent",
          marginBottom: "12px",
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap",
          borderTop: "1px solid #F5ECD7",
          paddingTop: "12px",
        }}
      >
        {TIPOS_NOTA.map((t) => {
          const ativo = t.id === tipo;
          return (
            <button
              key={t.id}
              onClick={() => setTipo(t.id)}
              style={{
                padding: "5px 12px",
                borderRadius: "999px",
                fontSize: "11.5px",
                fontWeight: ativo ? "500" : "400",
                border: ativo ? "1px solid var(--gold)" : "1px solid var(--gold-light)",
                backgroundColor: ativo ? "var(--gold)" : "white",
                color: ativo ? "white" : "var(--gray-mid)",
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <button
          onClick={guardar}
          disabled={!corpo.trim() || aGuardar}
          style={{
            padding: "8px 16px",
            borderRadius: "10px",
            border: "none",
            backgroundColor: corpo.trim() ? "var(--gold)" : "#E8DFC9",
            color: "white",
            fontSize: "12.5px",
            fontWeight: "600",
            cursor: corpo.trim() ? "pointer" : "default",
            boxShadow: corpo.trim() ? "0 4px 12px rgba(201,168,76,0.30)" : "none",
          }}
        >
          {aGuardar ? "A guardar…" : "Guardar nota"}
        </button>
      </div>
    </div>
  );
}

export default function NotasEvento({
  submissao,
  pagamentos = [],
  previstos = [],
  invites = [],
}) {
  const [notas, setNotas] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [carregado, setCarregado] = useState(false);
  const [aGuardar, setAGuardar] = useState(false);
  const [porApagar, setPorApagar] = useState(null);
  const [filtro, setFiltro] = useState("tudo");
  const [erro, setErro] = useState(null);

  const submissionId = submissao?.id;

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [ns, ds] = await Promise.all([
          getNotas(submissionId),
          getDocumentosDoEvento(submissionId),
        ]);
        if (cancelado) return;
        setNotas(ns);
        setDocumentos(ds);
        setCarregado(true);
      } catch (e) {
        if (cancelado) return;
        console.error(e);
        // A tabela pode ainda não existir (migração 029 por correr) —
        // o percurso derivado continua a valer, por isso mostra-se o
        // que há em vez de um ecrã vazio.
        setErro(e.message || "Não foi possível carregar as notas.");
        setCarregado(true);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [submissionId]);

  const historico = useMemo(
    () =>
      construirHistorico({
        submissao,
        notas,
        pagamentos,
        previstos,
        documentos,
        invites,
      }),
    [submissao, notas, pagamentos, previstos, documentos, invites],
  );

  const contagens = useMemo(() => contarHistorico(historico), [historico]);

  const visiveis = useMemo(() => {
    if (filtro === "tudo") return historico;
    if (filtro === "percurso")
      return historico.filter((e) => e.origem === "sistema");
    return historico.filter((e) => e.origem === "nota" && e.tipo === filtro);
  }, [historico, filtro]);

  const guardar = async ({ tipo, corpo }) => {
    setAGuardar(true);
    setErro(null);
    try {
      const nova = await criarNota(submissionId, { tipo, corpo });
      setNotas((atuais) => [nova, ...atuais]);
      return true;
    } catch (e) {
      console.error(e);
      setErro(e.message || "Não foi possível guardar a nota.");
      return false;
    } finally {
      setAGuardar(false);
    }
  };

  const remover = async (notaId) => {
    try {
      await apagarNota(notaId);
      setNotas((atuais) => atuais.filter((n) => n.id !== notaId));
    } catch (e) {
      console.error(e);
      setErro(e.message || "Não foi possível apagar a nota.");
    } finally {
      setPorApagar(null);
    }
  };

  if (!carregado) {
    return (
      <p style={{ fontSize: "13px", color: "var(--gray-mid)" }}>
        A carregar o histórico…
      </p>
    );
  }

  return (
    <div style={{ display: "flex", gap: "32px", alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0, maxWidth: "780px" }}>
        <Escrever onGuardar={guardar} aGuardar={aGuardar} />

        {erro && (
          <p
            style={{
              fontSize: "12.5px",
              color: "#B91C1C",
              backgroundColor: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: "10px",
              padding: "10px 14px",
              margin: "0 0 16px",
            }}
          >
            {erro}
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {visiveis.map((entrada) =>
            entrada.origem === "nota" ? (
              <CartaoNota
                key={entrada.id}
                entrada={entrada}
                aApagar={porApagar === entrada.notaId}
                onPedirApagar={() => setPorApagar(entrada.notaId)}
                onCancelar={() => setPorApagar(null)}
                onApagar={() => remover(entrada.notaId)}
              />
            ) : (
              <LinhaSistema key={entrada.id} entrada={entrada} />
            ),
          )}
          {visiveis.length === 0 && (
            <p
              style={{
                fontSize: "13px",
                color: "var(--gray-mid)",
                fontStyle: "italic",
                padding: "12px 0",
              }}
            >
              Nada para mostrar com este filtro.
            </p>
          )}
        </div>
      </div>

      <div style={{ width: "220px", flexShrink: 0, position: "sticky", top: "180px" }}>
        <p
          style={{
            fontSize: "9px",
            fontWeight: "700",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--gold)",
            margin: "0 0 10px",
          }}
        >
          Mostrar
        </p>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1px",
            marginBottom: "20px",
          }}
        >
          {FILTROS.map((f) => {
            const ativo = filtro === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFiltro(f.id)}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: "8px",
                  padding: "6px 9px",
                  borderRadius: "7px",
                  border: "none",
                  backgroundColor: ativo ? "#FBF7EF" : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    color: ativo ? "var(--gold-dark)" : "var(--gray-mid)",
                    fontWeight: ativo ? "500" : "400",
                  }}
                >
                  {f.label}
                </span>
                <span
                  style={{ fontSize: "10px", color: ativo ? "#C0B79F" : "#C4C4C4" }}
                >
                  {contagens[f.id === "tudo" ? "tudo" : f.id]}
                </span>
              </button>
            );
          })}
        </div>
        <p
          style={{
            fontSize: "10.5px",
            color: "#9B9B9B",
            lineHeight: 1.5,
            margin: 0,
            borderTop: "1px solid #F0E6D0",
            paddingTop: "12px",
          }}
        >
          As entradas com bolinha escrevem-se sozinhas — vêm do que já
          acontece na app (formulário, sinal, documentos). As tuas notas são
          as que têm cartão.
        </p>
      </div>
    </div>
  );
}
