import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { listarDocumentos } from "../../lib/documentos";
import { getResumoSubmissao } from "../../lib/submissionFields";
import { Icone } from "./Navegacao";
import { STATUS_COLORS } from "./faseConfig";

// ============================================================
// DocumentosLista — a entrada principal da secção Documentos.
// ÍNDICE E CONSULTA, apenas: aqui não se criam documentos — no
// domínio, todo o documento pertence a um evento de um cliente, e a
// criação acontece exclusivamente via Evento → Drawer → botões.
//
// Lista os documentos da BD (tabela `documentos`), cruzados
// client-side com as submissions já em memória (título, tipo de
// evento, estado, data) — zero queries pesadas.
//
// Ícones: o MESMO componente `Icone` da navegação (linha fina,
// stroke 1.5, currentColor) — os 3 tipos derivam do ícone
// "documentos" da sidebar, com a marca de cada tipo.
//
// Filtros DECLARATIVOS: cada select é uma entrada em FILTROS_SELECT
// ({ id, rotulo, opcoes, aplicar }); as datas do evento têm um grupo
// próprio (INTERVALO_DATAS). Adicionar um filtro novo = acrescentar
// uma entrada; o render e a aplicação são genéricos.
//
// Props:
//   submissions            — eventos em memória (normalizados)
//   eventTypes             — tipos de evento
//   onAbrirDocumento(item) — abre o documento (fluxo contextual)
// ============================================================

const TIPO_DOC = {
  orcamento: { label: "Orçamento", icone: "orcamento" },
  contrato: { label: "Contrato", icone: "contrato" },
  // chave interna 'proposta'; na UI é "Projecto"
  proposta: { label: "Projecto", icone: "proposta" },
};

const DIA_MS = 24 * 60 * 60 * 1000;

// ---------- Filtros de escolha (extensível) ----------
// A primeira opção (valor "") é o rótulo do próprio filtro — o select
// fechado lê-se como o nome do filtro, sem labels a ocupar altura.
const FILTROS_SELECT = [
  {
    id: "tipoDoc",
    opcoes: () => [
      ["", "Documento"],
      ["orcamento", "Orçamento"],
      ["contrato", "Contrato"],
      ["proposta", "Projecto"],
    ],
    aplicar: (item, v) => !v || item.tipo === v,
  },
  {
    id: "tipoEvento",
    opcoes: ({ eventTypes }) => [
      ["", "Tipo de evento"],
      ...(eventTypes || []).map((et) => [et.id, et.nome]),
    ],
    aplicar: (item, v) => !v || item.tipoEventoId === v,
  },
  {
    id: "estado",
    opcoes: () => [
      ["", "Estado"],
      ["Recebido", "Recebido"],
      ["Em Preparação", "Em Preparação"],
      ["Confirmado", "Confirmado"],
      ["Concluído", "Concluído"],
    ],
    aplicar: (item, v) => !v || item.estado === v,
  },
  {
    id: "actualizado",
    opcoes: () => [
      ["", "Actualizado"],
      ["1", "Últimas 24h"],
      ["7", "Últimos 7 dias"],
      ["30", "Últimos 30 dias"],
    ],
    aplicar: (item, v) =>
      !v ||
      Date.now() - new Date(item.updated_at).getTime() <= Number(v) * DIA_MS,
  },
];

// Intervalo de datas do evento (data_evento em "YYYY-MM-DD" — a
// comparação de strings é a comparação cronológica)
const INTERVALO_DATAS = {
  aplicar: (item, de, ate) => {
    if (!de && !ate) return true;
    if (!item.dataEvento) return false;
    if (de && item.dataEvento < de) return false;
    if (ate && item.dataEvento > ate) return false;
    return true;
  },
};

// "13/07/26, 20:42" — curto, para o canto do cartão
const formatarDataHora = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// "31 jul 2026" — a data do evento, na linha secundária
const formatarData = (d) => {
  if (!d) return null;
  return new Date(d).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export default function DocumentosLista({
  submissions,
  eventTypes,
  onAbrirDocumento,
  // Cada cartão é o cruzamento de um documento com o SEU evento. Com os
  // eventos ainda a caminho o cruzamento falha em silêncio: todos os
  // cartões saem com o título genérico «Evento», sem tipo, sem estado e
  // sem data — e os filtros por tipo/estado/data escondem linhas que
  // deviam estar lá. Esperar é mais honesto do que mostrar mal.
  eventosPorChegar = false,
}) {
  const [docs, setDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const loading = loadingDocs || eventosPorChegar;
  const [erro, setErro] = useState(false);
  const [filtros, setFiltros] = useState({});
  const [pesquisa, setPesquisa] = useState("");

  const carregar = async () => {
    setLoadingDocs(true);
    setErro(false);
    try {
      setDocs(await listarDocumentos());
    } catch (e) {
      console.error("Erro ao listar documentos:", e);
      setErro(true);
    }
    setLoadingDocs(false);
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enriquecer cada documento com os dados do evento (em memória)
  const itens = useMemo(
    () =>
      docs.map((d) => {
        const ev =
          (submissions || []).find((s) => s.id === d.submission_id) || null;
        const tipoEv = ev
          ? (eventTypes || []).find((et) => et.id === ev.event_type_id) || null
          : null;
        return {
          ...d,
          titulo: ev ? getResumoSubmissao(ev, eventTypes).titulo : "Evento",
          tipoEventoId: tipoEv?.id || "",
          tipoEventoNome:
            tipoEv?.nome ||
            (ev?.respostas?.tipoEventoOutro || "").trim() ||
            "",
          estado: ev?.status || "",
          dataEvento: ev?.data_evento || null,
        };
      }),
    [docs, submissions, eventTypes],
  );

  // Aplicar filtros declarativos + intervalo de datas + pesquisa
  const filtrados = useMemo(() => {
    const termo = pesquisa.trim().toLowerCase();
    return itens.filter((item) => {
      for (const f of FILTROS_SELECT) {
        if (!f.aplicar(item, filtros[f.id] || "")) return false;
      }
      if (
        !INTERVALO_DATAS.aplicar(
          item,
          filtros.dataDe || "",
          filtros.dataAte || "",
        )
      )
        return false;
      if (termo) {
        const alvo = [
          item.titulo,
          item.tipoEventoNome,
          TIPO_DOC[item.tipo]?.label || item.tipo,
          item.estado,
        ]
          .join(" ")
          .toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [itens, filtros, pesquisa]);

  const temFiltrosAtivos =
    pesquisa.trim() !== "" ||
    Object.values(filtros).some((v) => (v || "") !== "");

  const temDatas = !!(filtros.dataDe || filtros.dataAte);

  // Pill de filtro: neutra em repouso, creme quando o filtro está ativo
  const pillFiltro = (ativo) => ({
    flexShrink: 0,
    padding: "7px 12px",
    borderRadius: "999px",
    border: "1px solid var(--gold-light)",
    backgroundColor: ativo ? "var(--superficie-quente)" : "var(--superficie)",
    color: ativo ? "var(--gold-dark)" : "var(--gray-mid)",
    fontSize: "12px",
    fontWeight: ativo ? "600" : "400",
    fontFamily: "Inter, sans-serif",
    outline: "none",
    cursor: "pointer",
    transition: "all 0.15s",
  });

  const inputData = {
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: "12px",
    fontFamily: "Inter, sans-serif",
    color: "inherit",
    padding: 0,
    cursor: "pointer",
  };

  return (
    <motion.div
      key="documentos-lista"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {/* Estados hover/active/focus dos cartões (pseudo-classes) */}
      <style>{`
        .doc-card { transition: all 0.15s; }
        .doc-card:hover {
          border-color: var(--gold);
          box-shadow: 0 4px 16px rgba(var(--ouro-rgb), 0.18);
        }
        .doc-card:active { transform: scale(0.995); }
        .doc-card:focus-visible {
          outline: 2px solid var(--gold);
          outline-offset: 2px;
        }
        .doc-pesquisa:focus { border-color: var(--gold); }
      `}</style>

      {/* Cabeçalho */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "8px",
          marginBottom: "16px",
        }}
      >
        <h2
          style={{
            fontSize: "18px",
            fontFamily: "Playfair Display, serif",
            color: "var(--charcoal)",
            margin: 0,
          }}
        >
          Documentos
        </h2>
        {!loading && !erro && (
          <span style={{ fontSize: "12px", color: "var(--gray-mid)" }}>
            {filtrados.length}
            {temFiltrosAtivos ? ` de ${itens.length}` : ""}
          </span>
        )}
      </div>

      {/* Pesquisa — o mesmo registo da lista de Clientes */}
      <input
        className="doc-pesquisa"
        style={{
          width: "100%",
          padding: "11px 18px",
          borderRadius: "999px",
          border: "1.5px solid var(--gold-light)",
          fontSize: "13px",
          outline: "none",
          fontFamily: "Inter, sans-serif",
          boxSizing: "border-box",
          backgroundColor: "var(--superficie)",
          marginBottom: "12px",
          transition: "border-color 0.15s",
        }}
        value={pesquisa}
        onChange={(e) => setPesquisa(e.target.value)}
        placeholder="Procurar por cliente, evento ou documento..."
      />

      {/* Filtros — uma linha compacta que desliza no telemóvel
          (o padrão filter-wrap/h-scroll da casa) */}
      <div className="filter-wrap" style={{ marginBottom: "20px" }}>
        <div
          className="h-scroll"
          style={{ gap: "8px", paddingRight: "32px", alignItems: "center" }}
        >
          {FILTROS_SELECT.map((f) => {
            const valor = filtros[f.id] || "";
            return (
              <select
                key={f.id}
                value={valor}
                onChange={(e) =>
                  setFiltros((prev) => ({ ...prev, [f.id]: e.target.value }))
                }
                style={pillFiltro(valor !== "")}
              >
                {f.opcoes({ eventTypes }).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            );
          })}

          {/* Intervalo de datas do evento — um grupo único */}
          <div
            style={{
              ...pillFiltro(temDatas),
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: "default",
            }}
          >
            <span style={{ whiteSpace: "nowrap" }}>Evento</span>
            <input
              type="date"
              value={filtros.dataDe || ""}
              onChange={(e) =>
                setFiltros((prev) => ({ ...prev, dataDe: e.target.value }))
              }
              style={inputData}
              aria-label="Data do evento — de"
            />
            <span>–</span>
            <input
              type="date"
              value={filtros.dataAte || ""}
              onChange={(e) =>
                setFiltros((prev) => ({ ...prev, dataAte: e.target.value }))
              }
              style={inputData}
              aria-label="Data do evento — até"
            />
          </div>

          {temFiltrosAtivos && (
            <button
              onClick={() => {
                setFiltros({});
                setPesquisa("");
              }}
              style={{
                ...pillFiltro(false),
                border: "1px solid transparent",
                color: "var(--gray-mid)",
              }}
            >
              ✕ Limpar
            </button>
          )}
        </div>
      </div>

      {/* Estados: a carregar / erro / vazio / lista */}
      {loading && (
        <p
          style={{
            fontSize: "13px",
            color: "var(--gray-mid)",
            fontStyle: "italic",
            textAlign: "center",
            padding: "32px 0",
          }}
        >
          A carregar os documentos…
        </p>
      )}

      {!loading && erro && (
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <p
            style={{
              fontSize: "13px",
              color: "var(--gray-mid)",
              margin: "0 0 12px 0",
            }}
          >
            Não foi possível carregar os documentos.
          </p>
          <button
            onClick={carregar}
            style={{
              padding: "9px 18px",
              borderRadius: "10px",
              fontSize: "12px",
              fontWeight: "600",
              border: "1.5px solid var(--gold)",
              color: "var(--gold-dark)",
              backgroundColor: "var(--superficie)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!loading && !erro && itens.length === 0 && (
        <p
          style={{
            fontSize: "13px",
            color: "var(--gray-mid)",
            fontStyle: "italic",
            textAlign: "center",
            padding: "32px 0",
            lineHeight: 1.6,
          }}
        >
          Ainda não há documentos.
          <br />
          Abre a ficha de um evento em Clientes e usa os botões Orçamento,
          Projecto ou Contrato.
        </p>
      )}

      {!loading && !erro && itens.length > 0 && filtrados.length === 0 && (
        <p
          style={{
            fontSize: "13px",
            color: "var(--gray-mid)",
            fontStyle: "italic",
            textAlign: "center",
            padding: "32px 0",
          }}
        >
          Nenhum documento corresponde aos filtros.
        </p>
      )}

      {!loading && !erro && filtrados.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filtrados.map((item) => {
            const cfg = TIPO_DOC[item.tipo] || {
              label: item.tipo,
              icone: "documentos",
            };
            const cores = STATUS_COLORS[item.estado] || null;
            const linhaSecundaria = [
              item.tipoEventoNome,
              formatarData(item.dataEvento),
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <button
                key={item.id}
                className="doc-card"
                onClick={() => onAbrirDocumento(item)}
                title={`Abrir ${cfg.label.toLowerCase()} de ${item.titulo}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  width: "100%",
                  textAlign: "left",
                  backgroundColor: "var(--superficie)",
                  border: "1px solid var(--gold-light)",
                  borderRadius: "14px",
                  padding: "14px 16px",
                  cursor: "pointer",
                  // Sombra preta fica literal (0.04 ≠ 0.05 do --sombra-cartao).
                  boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
                  fontFamily: "Inter, sans-serif",
                }}
              >
                {/* Ícone do tipo — o conjunto de linha fina da navegação */}
                <div
                  style={{
                    flexShrink: 0,
                    width: "38px",
                    height: "38px",
                    borderRadius: "50%",
                    backgroundColor: "var(--superficie-quente)",
                    border: "1px solid var(--gold-light)",
                    color: "var(--gold-dark)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icone nome={cfg.icone} tamanho={18} />
                </div>

                {/* Hierarquia: tipo (micro-label) → cliente → evento·data */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: "10px",
                      fontWeight: "600",
                      color: "var(--gold-dark)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      margin: "0 0 2px 0",
                    }}
                  >
                    {cfg.label}
                  </p>
                  <p
                    style={{
                      fontSize: "14px",
                      fontWeight: "600",
                      color: "var(--charcoal)",
                      margin: "0 0 2px 0",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.titulo}
                  </p>
                  {linhaSecundaria && (
                    <p
                      style={{
                        fontSize: "12px",
                        color: "var(--gray-mid)",
                        margin: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {linhaSecundaria}
                    </p>
                  )}
                </div>

                {/* Estado (identificável de imediato) + actualização
                    (informação secundária, despromovida) */}
                <div
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: "6px",
                  }}
                >
                  {cores && (
                    <span
                      style={{
                        padding: "4px 12px",
                        borderRadius: "999px",
                        fontSize: "11px",
                        fontWeight: "600",
                        border: `1px solid ${cores.border}`,
                        backgroundColor: cores.bg,
                        color: cores.color,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.estado}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: "10px",
                      color: "var(--gray-mid)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Act. {formatarDataHora(item.updated_at)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}