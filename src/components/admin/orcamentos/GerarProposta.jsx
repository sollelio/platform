import { useState, useRef } from "react";
import { useCampoDocumento as useRascunho } from "./DocumentoProvider";
import logoUrl from "../../../assets/logo.png";
import { formatarDataPT } from "./orcamentoConfig";
import { uploadImagemProposta } from "../../../lib/propostas";

// ============================================================
// GerarProposta — o documento que vende o sonho (passo 5 da jornada).
// Capa (logo, PROPOSTA, cliente/tipo/data) + secções repetíveis, cada
// uma com título, UMA imagem grande (da Nádia) e descrição por linhas.
// No PDF: capa em página própria + UMA SECÇÃO POR PÁGINA, sem
// cabeçalhos do browser (mesmo tratamento do orçamento).
//
// prefill (opcional) — dados do evento (getDadosParaDocumento). As
// imagensReferencia DO CLIENTE aparecem numa faixa de CONSULTA no
// editor (não entram no PDF — a proposta é a visão da Nádia).
// Sem valor: dinheiro é assunto do orçamento.
// ============================================================

let seqSec = 0;
const novaSeccao = () => ({
  uid: `s_${Date.now()}_${seqSec++}`,
  titulo: "",
  imagem: "",
  descricao: "",
});

export default function GerarProposta({ prefill = null, ativo = true }) {
  // Rascunho persistente: cada documento (evento ou manual) tem o seu
  const rid = `proposta:${prefill?.submissionId || "manual"}`;
  const [cliente, setCliente] = useRascunho(`${rid}:cliente`, prefill?.nomeCliente || "");
  const [tipoEvento, setTipoEvento] = useRascunho(`${rid}:tipoEvento`, 
    prefill ? prefill.tipoEvento || "" : "",
  );
  const [dataEvento, setDataEvento] = useRascunho(`${rid}:dataEvento`, prefill?.dataEvento || "");
  const [subtitulo, setSubtitulo] = useRascunho(`${rid}:subtitulo`, 
    "Decoração desenvolvida dentro da estética Do Luxo à Mesa.",
  );
  const [seccoes, setSeccoes] = useRascunho(`${rid}:seccoes`, [novaSeccao()]);
  const [carregandoImg, setCarregandoImg] = useState(null); // uid da secção
  // Falhas de upload falam aqui — a regra da casa proíbe alert()
  const [erroAcao, setErroAcao] = useState(null);
  const inputImagem = useRef(null);
  const seccaoAlvo = useRef(null); // uid da secção que pediu upload

  const referencias = prefill?.imagensReferencia || [];

  const atualizarSeccao = (uid, campos) =>
    setSeccoes((prev) =>
      prev.map((s) => (s.uid === uid ? { ...s, ...campos } : s)),
    );

  const removerSeccao = (uid) =>
    setSeccoes((prev) => prev.filter((s) => s.uid !== uid));

  const pedirImagem = (uid) => {
    seccaoAlvo.current = uid;
    inputImagem.current?.click();
  };

  const carregarImagem = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const uid = seccaoAlvo.current;
    if (!file || !uid) return;
    setErroAcao(null);
    setCarregandoImg(uid);
    try {
      const url = await uploadImagemProposta(file);
      atualizarSeccao(uid, { imagem: url });
    } catch (err) {
      console.error(err);
      setErroAcao("Não foi possível carregar a imagem. Tenta novamente.");
    }
    setCarregandoImg(null);
  };

  // Secções com algum conteúdo — só essas entram no documento
  const seccoesComConteudo = seccoes.filter(
    (s) => s.titulo.trim() || s.imagem || s.descricao.trim(),
  );

  const imprimir = () => {
    const tituloAnterior = document.title;
    document.title = `Projecto — ${cliente || "Do Luxo à Mesa"}`;
    window.print();
    document.title = tituloAnterior;
  };

  return (
    <div>
      {erroAcao && (
        <p
          style={{
            fontSize: "12.5px",
            color: "#B91C1C",
            backgroundColor: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "10px",
            padding: "10px 14px",
            marginBottom: "14px",
          }}
        >
          ⚠ {erroAcao}
        </p>
      )}
      {/* ===== Estilos de impressão =====
          Mesmo tratamento do orçamento: @page margin 0 mata os
          cabeçalhos do browser; capa e secções são páginas próprias. */}
      {ativo && (
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .area-impressao-prop, .area-impressao-prop * { visibility: visible; }
          .area-impressao-prop { position: absolute; left: 0; top: 0; width: 100%; }
          .pagina-prop {
            height: 26.5cm; width: 100%;
            margin: 0 !important; max-width: none !important;
            padding: 1.5cm !important; box-sizing: border-box;
            box-shadow: none !important; border-radius: 0 !important;
          }
          .pagina-prop + .pagina-prop { page-break-before: always; }
          .pagina-prop img.img-sec { max-height: 15cm !important; }
          .no-print { display: none !important; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
      )}

      <div
        className="no-print"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "24px",
          marginBottom: "24px",
        }}
      >
        {/* ===== COLUNA ESQUERDA: EDITOR ===== */}
        <div>
          {/* Referências da cliente — só consulta, não entram no PDF */}
          {referencias.length > 0 && (
            <div
              style={{
                backgroundColor: "#FBF7EF",
                border: "1px solid var(--gold-light)",
                borderRadius: "10px",
                padding: "12px 14px",
                marginBottom: "16px",
              }}
            >
              <p
                style={{
                  fontSize: "10px",
                  color: "var(--gold-dark)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  margin: "0 0 8px 0",
                }}
              >
                Referências da cliente (consulta — não entram no PDF)
              </p>
              <div
                style={{
                  display: "flex",
                  gap: "6px",
                  overflowX: "auto",
                  WebkitOverflowScrolling: "touch",
                  paddingBottom: "4px",
                }}
              >
                {referencias.map((url, i) => (
                  <a
                    key={url + i}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    title="Abrir em tamanho grande"
                    style={{ flexShrink: 0 }}
                  >
                    <img
                      src={url}
                      alt={`Referência da cliente ${i + 1}`}
                      style={{
                        width: "56px",
                        height: "56px",
                        objectFit: "cover",
                        borderRadius: "8px",
                        border: "1px solid var(--gold-light)",
                        display: "block",
                      }}
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          <h3 style={h3Style}>Dados do projecto</h3>
          <Campo label="Cliente">
            <input
              style={inputStyle}
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="ex: Ana Cruz"
            />
          </Campo>
          <div style={{ display: "flex", gap: "12px" }}>
            <Campo label="Tipo de evento" flex={1}>
              <input
                style={inputStyle}
                value={tipoEvento}
                onChange={(e) => setTipoEvento(e.target.value)}
                placeholder="ex: Pedido de noivado"
              />
            </Campo>
            <Campo label="Data do evento" flex={1}>
              <input
                type="date"
                style={inputStyle}
                value={dataEvento}
                onChange={(e) => setDataEvento(e.target.value)}
              />
            </Campo>
          </div>
          <Campo label="Subtítulo da capa">
            <input
              style={inputStyle}
              value={subtitulo}
              onChange={(e) => setSubtitulo(e.target.value)}
            />
          </Campo>

          <h3 style={h3Style}>Secções</h3>
          {seccoes.map((s, idx) => (
            <div
              key={s.uid}
              style={{
                backgroundColor: "#FBF7EF",
                borderRadius: "12px",
                padding: "14px",
                marginBottom: "12px",
                border: "1px solid #F0E6D0",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "10px",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: "700",
                    color: "var(--gold)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Secção {idx + 1}
                </span>
                {seccoes.length > 1 && (
                  <button
                    onClick={() => removerSeccao(s.uid)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#DC2626",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    remover
                  </button>
                )}
              </div>

              <input
                style={{ ...inputStyle, marginBottom: "8px" }}
                value={s.titulo}
                onChange={(e) =>
                  atualizarSeccao(s.uid, { titulo: e.target.value })
                }
                placeholder="Título (ex: Mesa dos convidados)"
              />

              {/* Imagem da secção */}
              <div style={{ marginBottom: "8px" }}>
                {s.imagem ? (
                  <div style={{ position: "relative", display: "inline-block" }}>
                    <img
                      src={s.imagem}
                      alt={s.titulo || `Secção ${idx + 1}`}
                      style={{
                        width: "120px",
                        height: "80px",
                        objectFit: "cover",
                        borderRadius: "10px",
                        border: "1px solid var(--gold-light)",
                        display: "block",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => atualizarSeccao(s.uid, { imagem: "" })}
                      aria-label="Remover imagem"
                      style={{
                        position: "absolute",
                        top: "-6px",
                        right: "-6px",
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        border: "none",
                        backgroundColor: "var(--charcoal)",
                        color: "white",
                        fontSize: "10px",
                        lineHeight: 1,
                        cursor: "pointer",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => pedirImagem(s.uid)}
                    disabled={carregandoImg === s.uid}
                    style={{
                      width: "120px",
                      height: "80px",
                      borderRadius: "10px",
                      border: "1.5px dashed var(--gold)",
                      backgroundColor: "white",
                      color: "var(--gold)",
                      fontSize: "12px",
                      cursor:
                        carregandoImg === s.uid ? "wait" : "pointer",
                    }}
                  >
                    {carregandoImg === s.uid
                      ? "A carregar..."
                      : "+ Imagem"}
                  </button>
                )}
              </div>

              <textarea
                style={{
                  ...inputStyle,
                  minHeight: "80px",
                  resize: "vertical",
                }}
                value={s.descricao}
                onChange={(e) =>
                  atualizarSeccao(s.uid, { descricao: e.target.value })
                }
                placeholder={
                  "Escreve como no Instagram:\nPara 25 convidados, a proposta inclui:\n- Mesa posta completa\n- Prato principal e de sobremesa\n\nA deslocação é calculada à parte.\n(linhas com - viram •; as outras ficam texto normal)"
                }
              />
            </div>
          ))}

          <button
            onClick={() => setSeccoes((prev) => [...prev, novaSeccao()])}
            style={{
              marginTop: "4px",
              padding: "9px 16px",
              borderRadius: "999px",
              fontSize: "12px",
              fontWeight: "600",
              border: "1.5px solid var(--gold)",
              color: "var(--gold)",
              backgroundColor: "white",
              cursor: "pointer",
            }}
          >
            + Adicionar secção
          </button>

          <input
            ref={inputImagem}
            type="file"
            accept="image/*"
            onChange={carregarImagem}
            style={{ display: "none" }}
          />
        </div>

        {/* ===== COLUNA DIREITA: ações ===== */}
        <div>
          <div
            style={{
              backgroundColor: "#FBF7EF",
              borderRadius: "12px",
              padding: "18px",
              border: "1px solid var(--gold-light)",
              position: "sticky",
              top: "16px",
            }}
          >
            <p
              style={{
                fontSize: "12px",
                color: "var(--gray-mid)",
                margin: "0 0 16px 0",
                lineHeight: 1.5,
              }}
            >
              A pré-visualização abaixo mostra as páginas tal como saem no
              PDF: capa primeiro, depois uma secção por página. Confere e
              carrega em imprimir para guardar.
            </p>
            <button
              onClick={imprimir}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "10px",
                fontSize: "13px",
                fontWeight: "600",
                border: "none",
                backgroundColor: "var(--gold)",
                color: "white",
                cursor: "pointer",
              }}
            >
              🖨 Imprimir / Guardar PDF
            </button>
          </div>
        </div>
      </div>

      {/* ===== PRÉ-VISUALIZAÇÃO / ÁREA IMPRIMÍVEL ===== */}
      <div className="area-impressao-prop">
        {/* CAPA */}
        <div className="pagina-prop" style={estiloPaginaEcra}>
          <div style={{ textAlign: "center" }}>
            <img
              src={logoUrl}
              alt="Do Luxo à Mesa"
              style={{ width: "120px", height: "auto", margin: "0 auto 28px" }}
            />
            <h1
              style={{
                fontFamily: "Playfair Display, serif",
                fontSize: "40px",
                fontWeight: "500",
                color: "#2A2A2A",
                letterSpacing: "0.14em",
                margin: "0 0 8px 0",
              }}
            >
              PROJECTO
            </h1>
            <div
              style={{
                width: "80px",
                height: "2px",
                backgroundColor: "var(--gold)",
                margin: "0 auto 24px",
              }}
            />
            <p
              style={{
                fontFamily: "Playfair Display, serif",
                fontSize: "20px",
                color: "#2A2A2A",
                margin: "0 0 6px 0",
              }}
            >
              {cliente || "—"}
            </p>
            <p
              style={{
                fontSize: "13px",
                letterSpacing: "0.08em",
                color: "var(--gray-mid)",
                textTransform: "uppercase",
                margin: "0 0 20px 0",
              }}
            >
              {[tipoEvento, formatarDataPT(dataEvento)]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
            {subtitulo && (
              <p
                style={{
                  fontSize: "13px",
                  fontStyle: "italic",
                  color: "var(--gray-mid)",
                  margin: 0,
                }}
              >
                {subtitulo}
              </p>
            )}
          </div>
          <p
            style={{
              position: "absolute",
              bottom: "36px",
              left: 0,
              right: 0,
              textAlign: "center",
              fontSize: "10px",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "var(--gray-mid)",
              margin: 0,
            }}
          >
            Do Luxo à Mesa · by Nádia Schultz
          </p>
        </div>

        {/* SECÇÕES — uma por página: título → texto → imagem.
            No texto, linhas começadas por "-" ou "•" viram bullets;
            as outras ficam parágrafos; linhas vazias dão espaçamento
            (a mesma textura das mensagens reais da Nádia). */}
        {seccoesComConteudo.map((s, idx) => (
          <div
            key={s.uid}
            className="pagina-prop"
            style={{
              ...estiloPaginaEcra,
              justifyContent: "flex-start",
              alignItems: "stretch",
            }}
          >
            <h2
              style={{
                fontFamily: "Playfair Display, serif",
                fontSize: "18px",
                fontWeight: "500",
                color: "var(--gold-dark)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                borderBottom: "2px solid var(--gold)",
                paddingBottom: "10px",
                margin: "0 0 20px 0",
              }}
            >
              {s.titulo || `Secção ${idx + 1}`}
            </h2>
            {s.descricao.trim() && (
              <div style={{ marginBottom: s.imagem ? "20px" : 0 }}>
                {renderDescricao(s.descricao)}
              </div>
            )}
            {s.imagem && (
              <img
                className="img-sec"
                src={s.imagem}
                alt={s.titulo || `Secção ${idx + 1}`}
                style={{
                  display: "block",
                  width: "100%",
                  maxHeight: "56vh",
                  objectFit: "contain",
                  borderRadius: "4px",
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Converte a descrição em JSX respeitando a escrita da Nádia:
//   "- item" ou "• item" → bullet
//   linha normal          → parágrafo
//   linha vazia           → espaçamento
const renderDescricao = (texto) => {
  const linhas = texto.replace(/\s+$/, "").split("\n");
  return linhas.map((linha, i) => {
    const t = linha.trim();
    if (!t) return <div key={i} style={{ height: "10px" }} />;
    const bullet = t.match(/^[-•*]\s*(.*)$/);
    if (bullet) {
      return (
        <p
          key={i}
          style={{
            fontSize: "13px",
            color: "#3A3A3A",
            margin: "0 0 5px 0",
            lineHeight: 1.6,
            paddingLeft: "6px",
          }}
        >
          • {bullet[1]}
        </p>
      );
    }
    return (
      <p
        key={i}
        style={{
          fontSize: "13px",
          color: "#2A2A2A",
          margin: "0 0 6px 0",
          lineHeight: 1.7,
        }}
      >
        {t}
      </p>
    );
  });
};

// Página no ecrã: cartão branco separado (a mesma divisão do PDF)
const estiloPaginaEcra = {
  position: "relative",
  backgroundColor: "white",
  maxWidth: "800px",
  margin: "24px auto 0",
  padding: "56px",
  boxShadow: "0 2px 24px rgba(0,0,0,0.08)",
  borderRadius: "4px",
  fontFamily: "Inter, sans-serif",
  minHeight: "420px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
};

// ---- helpers de estilo (padrão da casa) ----
function Campo({ label, children, flex }) {
  return (
    <div style={{ marginBottom: "12px", flex }}>
      <label style={miniLabel}>{label}</label>
      {children}
    </div>
  );
}

const h3Style = {
  fontSize: "15px",
  fontFamily: "Playfair Display, serif",
  color: "var(--charcoal)",
  margin: "0 0 12px 0",
};

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "8px",
  border: "1.5px solid var(--gold-light)",
  fontSize: "13px",
  outline: "none",
  fontFamily: "Inter, sans-serif",
  boxSizing: "border-box",
  backgroundColor: "white",
};

const miniLabel = {
  fontSize: "11px",
  fontWeight: "600",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--charcoal)",
  display: "block",
  marginBottom: "5px",
};