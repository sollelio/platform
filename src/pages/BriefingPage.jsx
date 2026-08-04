import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ehFuncaoRpcEmFalta } from "../lib/rpc";
import { EMPRESA, LINHA_BY_LUXURY, SLOGAN_CASA } from "../lib/casa";
import {
  normalizeSubmission,
  getValorAtual,
  getResumoSubmissao,
  formatarDataISO,
} from "../lib/submissionFields";
import { normalizarCores } from "../components/admin/SeletorPaleta";
import { coresDeTexto } from "../lib/paletaCores";
import { formatarMorada } from "../lib/morada";

// ============================================================
// BriefingPage — o resumo imprimível de UM evento.
//
// GENÉRICO desde a reescrita: as secções vêm dos PASSOS do modelo
// do evento e os campos das respostas (via getValorAtual — dupla
// fonte: colunas fixas + JSONB). Funciona para qualquer modelo,
// presente ou futuro. Campos vazios não aparecem; secções sem
// nenhum campo preenchido também não. O antigo lia colunas fixas
// do casamento original — por isso os outros tipos saíam vazios.
// ============================================================

/* ===== Ícones SVG dourados (linha fina) ===== */
function IconCal() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#C9A84C"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  );
}
function IconPin() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#C9A84C"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d="M12 21s-7-6.1-7-11a7 7 0 0114 0c0 4.9-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
function IconGuests() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#C9A84C"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" />
      <path d="M16 8.5a3 3 0 100-6M21 20c0-2.6-1.8-4.4-4.5-4.9" />
    </svg>
  );
}
function IconPrint() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d="M6 9V3h12v6" />
      <rect x="6" y="14" width="12" height="7" />
      <path d="M6 18H4a2 2 0 01-2-2v-3a2 2 0 012-2h16a2 2 0 012 2v3a2 2 0 01-2 2h-2" />
    </svg>
  );
}

// Um valor de resposta vira texto imprimível (arrays, paletas, sim/não,
// morada — o único tipo cujo valor é um objecto com partes, ver morada.js)
function paraTexto(valor) {
  if (valor === null || valor === undefined) return "";
  if (Array.isArray(valor)) {
    return valor
      .map((v) => (v && typeof v === "object" && v.nome ? v.nome : String(v)))
      .filter((t) => t && t.trim() !== "")
      .join(", ");
  }
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (valor && typeof valor === "object") return formatarMorada(valor);
  const data = formatarDataISO(valor);
  if (data !== valor) return data;
  // Morada guardada como TEXTO JSON em vez de objecto (submissões
  // antigas e importadas). Na folha que ela leva para o evento, as
  // chavetas em bruto são o pior sítio possível para as deixar.
  if (typeof valor === "string" && valor.trim().startsWith("{")) {
    try {
      const composta = formatarMorada(JSON.parse(valor));
      if (composta) return composta;
    } catch {
      /* não era JSON — segue como texto normal */
    }
  }
  return String(valor);
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: "28px", breakInside: "avoid" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "12px",
        }}
      >
        <div style={{ height: "1px", flex: 1, backgroundColor: "#C9A84C" }} />
        <p
          style={{
            fontSize: "10px",
            fontWeight: "700",
            color: "#C9A84C",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            margin: 0,
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </p>
        <div style={{ height: "1px", flex: 1, backgroundColor: "#C9A84C" }} />
      </div>
      <div
        className="briefing-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px 24px",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Um campo do briefing. `largo` ocupa a linha inteira (textos longos).
function Field({ label, value, largo = false, paleta = null }) {
  const display = paraTexto(value);
  if (!display) return null;

  // Campos de paleta: bolinha da cor ao lado do nome. O
  // printColorAdjust força o browser a IMPRIMIR o fundo da bolinha
  // (sem ele, no papel sairiam círculos brancos).
  if (paleta && paleta.length > 0) {
    return (
      <div
        style={{
          borderBottom: "1px solid #F5ECD7",
          paddingBottom: "8px",
          ...(largo ? { gridColumn: "1 / -1" } : {}),
        }}
      >
        <p
          style={{
            fontSize: "9px",
            color: "#6B7280",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            margin: "0 0 4px 0",
          }}
        >
          {label}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
          {paleta.map((c) => (
            <span
              key={c.nome}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                color: "#1A1A1A",
                lineHeight: "1.5",
              }}
            >
              <span
                style={{
                  width: "13px",
                  height: "13px",
                  borderRadius: "50%",
                  backgroundColor: c.hex || "#E5E7EB",
                  border: "1px solid rgba(0,0,0,0.15)",
                  flexShrink: 0,
                  printColorAdjust: "exact",
                  WebkitPrintColorAdjust: "exact",
                }}
              />
              {c.nome}
            </span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        borderBottom: "1px solid #F5ECD7",
        paddingBottom: "8px",
        ...(largo ? { gridColumn: "1 / -1" } : {}),
      }}
    >
      <p
        style={{
          fontSize: "9px",
          color: "#6B7280",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          margin: "0 0 2px 0",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: "12px",
          color: "#1A1A1A",
          margin: 0,
          lineHeight: "1.5",
        }}
      >
        {display}
      </p>
    </div>
  );
}

// Campos "largos" no papel: textos longos e listas ficam a toda a largura
const TIPOS_LARGOS = ["textarea", "checkbox", "paleta", "morada"];

// A secção da captação — as chaves canónicas que podem não estar no
// modelo (a primeira conversa com o cliente também é briefing)
const CAMPOS_CAPTACAO = [
  ["contactoPrincipal", "Contacto Principal", false],
  ["numeroWhatsapp", "WhatsApp", false],
  ["tipoLocal", "Espaço", false],
  ["servicos", "Serviços Pedidos", true],
  ["servicosBuffet", "Pacote de Buffet", false],
  ["servicosBalcao", "Tipo de Balcão", false],
  ["mensagemInicial", "Notas da Primeira Conversa", true],
];

// ------------------------------------------------------------
// A ficha de materiais impressa. UMA tabela, não três folhas: até aqui
// o imprimirFicha.js gerava uma folha por lista (carga, montagem,
// higienização) numa janela à parte. No terreno é o contrário do útil —
// o mesmo material aparecia em três sítios e nenhum deles mostrava o
// conjunto. Aqui é uma linha por material, com as letras C · M · H a
// dizer em que listas entra.
// ------------------------------------------------------------
function FichaImpressa({ materiais }) {
  if (!materiais || materiais.length === 0) return null;

  const grupos = [];
  for (const m of materiais) {
    const cat = m.categoria || "Sem categoria";
    let grupo = grupos.find((g) => g.categoria === cat);
    if (!grupo) {
      grupo = { categoria: cat, itens: [] };
      grupos.push(grupo);
    }
    grupo.itens.push(m);
  }

  const totalUn = materiais.reduce(
    (acc, m) => acc + (Number(m.quantidade) || 0),
    0,
  );

  const letra = (activa, texto) => (
    <span
      style={{
        display: "inline-block",
        width: "15px",
        textAlign: "center",
        fontSize: "10px",
        fontWeight: activa ? "700" : "400",
        color: activa ? "#A07830" : "#D8D2C4",
      }}
    >
      {texto}
    </span>
  );

  return (
    <div className="ficha-materiais" style={{ padding: "32px 40px 0" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          borderBottom: "2px solid #C9A84C",
          paddingBottom: "8px",
          marginBottom: "4px",
        }}
      >
        <h2
          style={{
            fontFamily: "Playfair Display, serif",
            fontSize: "17px",
            fontWeight: "600",
            color: "#1A1A1A",
          }}
        >
          Ficha de Materiais
        </h2>
        <span style={{ fontSize: "11px", color: "#6B6B6B" }}>
          {materiais.length}{" "}
          {materiais.length === 1 ? "material" : "materiais"} · {totalUn} un
        </span>
      </div>
      <p
        style={{
          fontSize: "10px",
          color: "#9B9B9B",
          letterSpacing: "0.04em",
          margin: "0 0 14px",
        }}
      >
        C carga · M montagem · H higienização
      </p>

      {grupos.map((grupo) => (
        <div
          key={grupo.categoria}
          className="ficha-grupo"
          style={{ marginBottom: "16px" }}
        >
          <p
            style={{
              fontSize: "10px",
              fontWeight: "700",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#A07830",
              backgroundColor: "#FBF7EF",
              padding: "4px 8px",
              marginBottom: "2px",
            }}
          >
            {grupo.categoria}
          </p>
          {grupo.itens.map((m) => (
            <div
              key={m.id}
              className="ficha-linha"
              style={{
                display: "grid",
                gridTemplateColumns: "16px 1fr 52px 96px 52px",
                gap: "8px",
                alignItems: "start",
                padding: "6px 8px",
                borderBottom: "1px solid #F5ECD7",
                fontSize: "11.5px",
              }}
            >
              {/* a caixa para riscar no terreno */}
              <span
                className="cor-bolinha"
                style={{
                  width: "12px",
                  height: "12px",
                  border: "1.5px solid #C9A84C",
                  borderRadius: "3px",
                  marginTop: "1px",
                  display: "block",
                }}
              />
              <span>
                {m.nome}
                {m.observacoes && (
                  <span
                    style={{
                      display: "block",
                      fontStyle: "italic",
                      fontSize: "10px",
                      color: "#6B6B6B",
                    }}
                  >
                    {m.observacoes}
                  </span>
                )}
              </span>
              <span
                style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
              >
                {m.quantidade ?? "—"}
                {m.unidade ? ` ${m.unidade}` : ""}
              </span>
              <span style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
                {coresDeTexto(m.cores).map((c) => (
                  <span
                    key={c.nome || c.hex}
                    title={c.nome}
                    className="cor-bolinha"
                    style={{
                      width: "11px",
                      height: "11px",
                      borderRadius: "50%",
                      backgroundColor: c.hex,
                      border: "1px solid rgba(0,0,0,0.12)",
                      display: "block",
                    }}
                  />
                ))}
              </span>
              <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {letra(m.lista_carga, "C")}
                {letra(m.lista_montagem, "M")}
                {letra(m.lista_higienizacao, "H")}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function BriefingPage() {
  const { id } = useParams();
  const [submission, setSubmission] = useState(null);
  const [tipoEvento, setTipoEvento] = useState(null);
  const [materiais, setMateriais] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      // Caminho novo: RPC formulario_briefing (migração 020) — o id
      // (uuid não adivinhável) continua a ser a chave de acesso, mas
      // sem SELECT anónimo à tabela inteira. Enquanto a função não
      // existir na BD, usa as queries antigas.
      let data = null;
      let tipo = null;
      const rpc = await supabase.rpc("formulario_briefing", { p_id: id });
      if (!rpc.error && rpc.data) {
        data = rpc.data.submission;
        tipo = rpc.data.event_type;
      } else if (rpc.error && ehFuncaoRpcEmFalta(rpc.error)) {
        const antigo = await supabase
          .from("submissions")
          .select("*")
          .eq("id", id)
          .single();
        data = antigo.data;
        if (data?.event_type_id) {
          const { data: t } = await supabase
            .from("event_types")
            .select("*")
            .eq("id", data.event_type_id)
            .single();
          tipo = t;
        }
      }
      const sub = normalizeSubmission(data);
      setSubmission(sub);
      // O modelo do evento — é dele que nascem as secções
      setTipoEvento(tipo || null);
      setLoading(false);

      // A ficha de materiais vai no fim da folha. Mesma porta do
      // briefing: RPC security definer (migração 031), porque esta rota
      // é pública e evento_materiais está fechada a authenticated. Com
      // sessão aberta a query directa também serve; sem RPC nem sessão,
      // a folha sai sem ficha em vez de não sair de todo.
      const rpcMat = await supabase.rpc("briefing_materiais", { p_id: id });
      if (!rpcMat.error && Array.isArray(rpcMat.data)) {
        setMateriais(rpcMat.data);
      } else {
        const { data: linhas } = await supabase
          .from("evento_materiais")
          .select("*, material:materiais(nome, categoria, unidade, ordem)")
          .eq("submission_id", id);
        setMateriais(
          (linhas || []).map((l) => ({
            id: l.id,
            nome: l.material?.nome,
            categoria: l.material?.categoria,
            unidade: l.material?.unidade,
            quantidade: l.quantidade,
            cores: l.cores,
            observacoes: l.observacoes,
            lista_carga: l.lista_carga,
            lista_montagem: l.lista_montagem,
            lista_higienizacao: l.lista_higienizacao,
          })),
        );
      }
    };
    fetch();
  }, [id]);

  const formatDate = (date) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("pt-PT", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  if (loading)
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Inter, sans-serif",
        }}
      >
        <p style={{ color: "#6B7280", fontSize: "14px" }}>
          A carregar briefing...
        </p>
      </div>
    );

  if (!submission)
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Inter, sans-serif",
        }}
      >
        <p style={{ color: "#6B7280", fontSize: "14px" }}>
          Briefing não encontrado.
        </p>
      </div>
    );

  // Título pela cadeia canónica (nomeNoivo & nomeNoiva → nomeDoCliente
  // → ... → tipo) — a mesma da app inteira. Adeus "&" órfão.
  const resumo = getResumoSubmissao(
    submission,
    tipoEvento ? [tipoEvento] : [],
  );

  const localEvento = getValorAtual(submission, "localEvento");
  const convidados = getValorAtual(submission, "numeroConvidados");

  // As secções do MODELO: cada passo com pelo menos um campo respondido
  const seccoesModelo = (tipoEvento?.steps || [])
    .map((step) => {
      const campos = (step.fields || [])
        .map((f) => ({
          label: f.label,
          valor: getValorAtual(submission, f.id),
          largo: TIPOS_LARGOS.includes(f.type),
          paleta:
            f.type === "paleta"
              ? normalizarCores(getValorAtual(submission, f.id) || [])
              : null,
        }))
        .filter((c) => paraTexto(c.valor) !== "");
      return { titulo: step.title, campos };
    })
    .filter((s) => s.campos.length > 0);

  // A secção da captação (só chaves não cobertas pelo modelo)
  const idsDoModelo = new Set(
    (tipoEvento?.steps || []).flatMap((s) =>
      (s.fields || []).map((f) => f.id),
    ),
  );
  const camposCaptacao = CAMPOS_CAPTACAO.filter(
    ([id_]) => !idsDoModelo.has(id_),
  )
    .map(([id_, label, largo]) => ({
      label,
      valor: getValorAtual(submission, id_),
      largo,
    }))
    .filter((c) => paraTexto(c.valor) !== "");

  const nadaPreenchido =
    seccoesModelo.length === 0 && camposCaptacao.length === 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=Inter:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { margin: 0; background: #FAFAF8; }

        .briefing-toolbar {
          position: fixed; top: 20px; right: 20px; z-index: 100;
        }
        .briefing-print-btn {
          padding: 11px 22px; border-radius: 10px; font-size: 13px;
          font-weight: 600; cursor: pointer;
          background-color: #C9A84C; color: white; border: none;
          box-shadow: 0 4px 16px rgba(201,168,76,0.4);
          font-family: 'Inter, sans-serif';
          display: inline-flex; align-items: center; gap: 8px;
        }
        .briefing-hint {
          display: block;
          font-size: 11px; color: #6B7280;
          margin: 8px 0 0; line-height: 1.5;
          text-align: right; max-width: 240px;
        }

        .briefing-header {
          background-color: #C9A84C; padding: 28px 40px;
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
        }

        @media (max-width: 600px) {
          .briefing-toolbar {
            position: static; padding: 12px 16px 0;
          }
          .briefing-print-btn {
            width: 100%; justify-content: center; padding: 13px;
            font-size: 14px;
          }
          .briefing-hint {
            text-align: center;
            margin: 8px 16px 0;
            max-width: none;
          }
          .briefing-header {
            flex-direction: column; align-items: flex-start;
            gap: 10px; padding: 22px 22px;
          }
          .briefing-header-date { text-align: left !important; }
          .briefing-grid { grid-template-columns: 1fr !important; }
          .briefing-body { padding: 22px !important; }
          .briefing-names { padding: 22px 22px 18px !important; }
          .briefing-footer {
            flex-direction: column !important; align-items: flex-start !important;
            gap: 6px; padding: 16px 22px !important;
          }
        }

        @media print {
          /* @page com margem 0 mata o cabeçalho e o URL que o browser
             imprime por cima da folha — mesmo tratamento do orçamento e
             da proposta (ver GerarProposta.jsx). */
          @page { size: A4; margin: 0; }
          body { background: white; }
          .no-print { display: none !important; }
          .briefing-outer { padding: 0 !important; }
          .page {
            box-shadow: none !important; margin: 0 !important;
            border-radius: 0 !important; max-width: 100% !important;
            /* o overflow:hidden do ecrã cortava a saída multi-página */
            overflow: visible !important;
          }
          /* O dourado do cabeçalho e do rodapé é identidade, não
             decoração: tem de sair impresso mesmo com "gráficos de
             fundo" desligado, como já acontecia com as bolinhas da
             paleta. */
          .briefing-header, .briefing-footer, .ficha-lista, .cor-bolinha {
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }
          /* A ficha de materiais começa em página nova: é o que vai para
             o terreno, e quem confere não quer o briefing pelo meio. */
          .ficha-materiais { page-break-before: always; }
          .ficha-grupo { break-inside: avoid; }
          .ficha-linha { break-inside: avoid; }
        }
      `}</style>

      {/* Toolbar — botão imprimir/guardar */}
      <div className="briefing-toolbar no-print">
        <button className="briefing-print-btn" onClick={() => window.print()}>
          <IconPrint /> Imprimir / Guardar PDF
        </button>
        <p className="briefing-hint">
          Para guardar como PDF, escolhe “Guardar como PDF” no destino da
          impressão.
        </p>
      </div>

      <div
        className="briefing-outer"
        style={{ padding: "40px 20px", fontFamily: "Inter, sans-serif" }}
      >
        <div
          className="page"
          style={{
            backgroundColor: "white",
            maxWidth: "720px",
            margin: "0 auto",
            borderRadius: "16px",
            overflow: "hidden",
            boxShadow: "0 8px 48px rgba(0,0,0,0.08)",
          }}
        >
          {/* Cabeçalho dourado */}
          <div className="briefing-header">
            <div>
              <h1
                style={{
                  fontFamily: "Playfair Display, serif",
                  fontSize: "22px",
                  color: "white",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  margin: "0 0 2px 0",
                }}
              >
                {EMPRESA.designacao}
              </h1>
              <p
                style={{
                  fontSize: "10px",
                  color: "rgba(255,255,255,0.8)",
                  textTransform: "uppercase",
                  letterSpacing: "0.2em",
                  margin: 0,
                }}
              >
                {LINHA_BY_LUXURY}
              </p>
            </div>
            <div
              className="briefing-header-date"
              style={{ textAlign: "right" }}
            >
              <p
                style={{
                  fontSize: "10px",
                  color: "rgba(255,255,255,0.7)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  margin: "0 0 2px 0",
                }}
              >
                Briefing do Evento
              </p>
              <p
                style={{
                  fontSize: "12px",
                  color: "white",
                  fontWeight: "500",
                  margin: 0,
                }}
              >
                {new Date().toLocaleDateString("pt-PT")}
              </p>
            </div>
          </div>

          {/* Nome + dados principais */}
          <div
            className="briefing-names"
            style={{
              padding: "28px 40px 20px",
              borderBottom: "1px solid #F5ECD7",
            }}
          >
            <h2
              style={{
                fontFamily: "Playfair Display, serif",
                fontSize: "28px",
                color: "#1A1A1A",
                margin: "0 0 10px 0",
              }}
            >
              {resumo.titulo}
            </h2>
            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
              <p
                style={{
                  fontSize: "13px",
                  color: "#6B7280",
                  margin: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <IconCal /> {formatDate(submission.data_evento)}
              </p>
              {localEvento && (
                <p
                  style={{
                    fontSize: "13px",
                    color: "#6B7280",
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <IconPin /> {paraTexto(localEvento)}
                </p>
              )}
              {convidados && (
                <p
                  style={{
                    fontSize: "13px",
                    color: "#6B7280",
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <IconGuests /> {paraTexto(convidados)} convidados
                </p>
              )}
            </div>

            <div
              style={{
                marginTop: "12px",
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              {tipoEvento?.nome && (
                <span
                  style={{
                    fontSize: "11px",
                    padding: "4px 12px",
                    borderRadius: "999px",
                    backgroundColor: "#FEF9EC",
                    color: "#C9A84C",
                    border: "1px solid #E8D5A3",
                    fontWeight: "500",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {tipoEvento.nome}
                </span>
              )}
              <span
                style={{
                  fontSize: "11px",
                  padding: "4px 12px",
                  borderRadius: "999px",
                  backgroundColor: "#FEF9EC",
                  color: "#C9A84C",
                  border: "1px solid #E8D5A3",
                  fontWeight: "500",
                }}
              >
                {submission.status}
              </span>
            </div>
          </div>

          {/* Conteúdo — as secções do MODELO + a captação */}
          <div className="briefing-body" style={{ padding: "28px 40px" }}>
            {camposCaptacao.length > 0 && (
              <Section title="O pedido">
                {camposCaptacao.map((c) => (
                  <Field
                    key={c.label}
                    label={c.label}
                    value={c.valor}
                    largo={c.largo}
                  />
                ))}
              </Section>
            )}

            {seccoesModelo.map((sec) => (
              <Section key={sec.titulo} title={sec.titulo}>
                {sec.campos.map((c) => (
                  <Field
                    key={c.label}
                    label={c.label}
                    value={c.valor}
                    largo={c.largo}
                    paleta={c.paleta}
                  />
                ))}
              </Section>
            ))}

            {nadaPreenchido && (
              <p
                style={{
                  fontSize: "13px",
                  color: "#6B7280",
                  fontStyle: "italic",
                  textAlign: "center",
                  padding: "24px 0",
                }}
              >
                Ainda não há respostas do questionário — o briefing enche-se
                quando o questionário do evento for preenchido.
              </p>
            )}
          </div>

          {/* A ficha de materiais, no fim — é o que ela consulta no dia:
              uma caixa por linha para riscar, as cores impressas a cor,
              e as letras C · M · H a dizer em que lista cada material
              entra. Pagamentos não entram: não servem no local, e a
              folha anda com a equipa. */}
          <FichaImpressa materiais={materiais} />

          {/* Rodapé */}
          <div
            className="briefing-footer"
            style={{
              backgroundColor: "#FBF7EF",
              padding: "16px 40px",
              borderTop: "1px solid #F0E6D0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <p
              style={{
                fontSize: "10px",
                color: "#C9A84C",
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                margin: 0,
              }}
            >
              {SLOGAN_CASA}
            </p>
            <p style={{ fontSize: "10px", color: "#6B7280", margin: 0 }}>
              {EMPRESA.designacao} · {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}