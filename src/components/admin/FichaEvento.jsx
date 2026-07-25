import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getMateriais,
  getEventoMateriais,
  addEventoMaterial,
  updateEventoMaterial,
  removeEventoMaterial,
  agruparPorCategoria,
} from "../../lib/materiais";
import { imprimirFicha } from "../../lib/imprimirFicha";
import { getResumoSubmissao } from "../../lib/submissionFields";
import SeletorPaleta, {
  AmostraPaleta,
  normalizarCores,
} from "./SeletorPaleta";

// Título legível de uma submissão — usa a lógica genérica (papéis),
// consistente com Clientes e Questionários.
function tituloSubmissao(s, eventTypes) {
  return getResumoSubmissao(s, eventTypes).titulo;
}

// Nome do tipo de evento (para a etiqueta), ou null se desconhecido.
function nomeTipo(s, eventTypes) {
  const tipo = (eventTypes || []).find((et) => et.id === s?.event_type_id);
  return tipo ? tipo.nome : null;
}

function formatData(data) {
  if (!data) return "Sem data";
  return new Date(data).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// ============================================================
// Cores da linha de material — a coluna `cores` continua TEXTO
// ("Branco, Dourado"): o PDF imprime igual e as fichas antigas
// abrem sem migração. O SeletorPaleta é só a interface: ao abrir,
// o texto vira seleção (nomes do catálogo acendem as bolinhas;
// nomes desconhecidos ficam como personalizadas); ao escolher,
// a seleção volta a texto.
// ============================================================
const textoParaCores = (txt) =>
  normalizarCores(
    String(txt || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  );

const coresParaTexto = (arr) => (arr || []).map((c) => c.nome).join(", ");

export default function FichaEvento({
  submissions = [],
  eventTypes = [],
  todasFichas = [],
  onFichaAlterada,
}) {
  const [submissionId, setSubmissionId] = useState("");
  const [buscaEvento, setBuscaEvento] = useState("");
  const [seletorAberto, setSeletorAberto] = useState(false);

  const submissaoAtual = useMemo(
    () => submissions.find((s) => s.id === submissionId) || null,
    [submissions, submissionId],
  );

  const eventosFiltrados = useMemo(() => {
    const q = buscaEvento.trim().toLowerCase();
    const lista = [...submissions].sort((a, b) => {
      // por data mais próxima primeiro; sem data ao fim
      if (!a.data_evento) return 1;
      if (!b.data_evento) return -1;
      return new Date(a.data_evento) - new Date(b.data_evento);
    });
    if (!q) return lista;
    return lista.filter(
      (s) =>
        tituloSubmissao(s, eventTypes).toLowerCase().includes(q) ||
        (s.local_evento || "").toLowerCase().includes(q),
    );
  }, [submissions, buscaEvento, eventTypes]);

  // Conjunto de eventos que já têm ficha começada (pelo menos um material
  // com quantidade > 0). Usado para mostrar o estado no seletor.
  const idsComFicha = useMemo(() => {
    const set = new Set();
    (todasFichas || []).forEach((linha) => {
      if (linha && linha.submission_id && Number(linha.quantidade) > 0) {
        set.add(linha.submission_id);
      }
    });
    return set;
  }, [todasFichas]);

  return (
    <div>
      {/* Seletor de evento */}
      <div style={{ position: "relative", marginBottom: "24px" }}>
        <label
          style={{
            fontSize: "11px",
            fontWeight: "600",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            color: "var(--charcoal)",
            display: "block",
            marginBottom: "6px",
          }}
        >
          Evento
        </label>

        {submissaoAtual && !seletorAberto ? (
          // Evento escolhido — card compacto com botão para trocar
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              padding: "14px 18px",
              borderRadius: "12px",
              border: "1.5px solid var(--gold)",
              backgroundColor: "#FEF9EC",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <p
                style={{
                  fontSize: "15px",
                  fontWeight: "600",
                  color: "var(--charcoal)",
                  margin: "0 0 2px 0",
                  fontFamily: "Playfair Display, serif",
                }}
              >
                {tituloSubmissao(submissaoAtual, eventTypes)}
              </p>
              {nomeTipo(submissaoAtual, eventTypes) && (
                <span
                  style={{
                    display: "inline-block",
                    fontSize: "10px",
                    fontWeight: "700",
                    padding: "2px 10px",
                    borderRadius: "999px",
                    backgroundColor: "#FEF9EC",
                    color: "var(--gold)",
                    border: "1px solid var(--gold-light)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    margin: "0 0 4px 0",
                  }}
                >
                  {nomeTipo(submissaoAtual, eventTypes)}
                </span>
              )}
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--gray-mid)",
                  margin: 0,
                }}
              >
                {formatData(submissaoAtual.data_evento)}
                {submissaoAtual.local_evento
                  ? ` · ${submissaoAtual.local_evento}`
                  : ""}
              </p>
            </div>
            <button
              onClick={() => setSeletorAberto(true)}
              style={{
                padding: "8px 16px",
                borderRadius: "999px",
                fontSize: "11px",
                fontWeight: "600",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                border: "1.5px solid var(--gold-light)",
                backgroundColor: "white",
                color: "var(--gold)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              Trocar
            </button>
          </div>
        ) : (
          // Busca de evento
          <>
            <input
              type="text"
              value={buscaEvento}
              onChange={(e) => setBuscaEvento(e.target.value)}
              onFocus={() => setSeletorAberto(true)}
              placeholder="Procurar evento por nome ou local..."
              style={{
                width: "100%",
                padding: "11px 14px",
                borderRadius: "12px",
                border: "1.5px solid var(--gold)",
                fontSize: "13px",
                outline: "none",
                fontFamily: "Inter, sans-serif",
                boxSizing: "border-box",
                backgroundColor: "white",
                boxShadow: "0 0 0 3px rgba(201,168,76,0.08)",
              }}
            />
            {seletorAberto && (
              <>
                <div
                  onClick={() => setSeletorAberto(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 30 }}
                />
                <div
                  className="eventos-dropdown"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    left: 0,
                    right: 0,
                    zIndex: 31,
                    backgroundColor: "white",
                    borderRadius: "10px",
                    border: "1px solid var(--gold-light)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
                    overflowY: "auto",
                  }}
                >
                  {eventosFiltrados.length === 0 ? (
                    <p
                      style={{
                        fontSize: "12px",
                        color: "var(--gray-mid)",
                        padding: "12px 14px",
                        margin: 0,
                      }}
                    >
                      Nenhum evento encontrado.
                    </p>
                  ) : (
                    eventosFiltrados.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSubmissionId(s.id);
                          setSeletorAberto(false);
                          setBuscaEvento("");
                        }}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                          width: "100%",
                          padding: "10px 14px",
                          border: "none",
                          borderBottom: "1px solid #F5ECD7",
                          backgroundColor: "white",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = "#FBF7EF")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor = "white")
                        }
                      >
                        <span
                          style={{
                            fontSize: "13px",
                            color: "var(--charcoal)",
                            fontWeight: "500",
                          }}
                        >
                          {tituloSubmissao(s, eventTypes)}
                        </span>
                        <span
                          style={{ fontSize: "10px", color: "var(--gray-mid)" }}
                        >
                          {nomeTipo(s, eventTypes)
                            ? `${nomeTipo(s, eventTypes)} · `
                            : ""}
                          {formatData(s.data_evento)}
                          {s.local_evento ? ` · ${s.local_evento}` : ""}
                        </span>
                        {idsComFicha.has(s.id) ? (
                          <span
                            style={{
                              marginTop: "4px",
                              fontSize: "9px",
                              fontWeight: "700",
                              padding: "2px 8px",
                              borderRadius: "999px",
                              backgroundColor: "#FEF9EC",
                              color: "var(--gold-dark)",
                              border: "1px solid var(--gold-light)",
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                            }}
                          >
                            ✓ Ficha iniciada
                          </span>
                        ) : (
                          <span
                            style={{
                              marginTop: "4px",
                              fontSize: "9px",
                              fontWeight: "600",
                              color: "var(--gray-mid)",
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                            }}
                          >
                            Sem ficha
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Ficha do evento escolhido */}
      {submissaoAtual ? (
        <FichaMateriais
          key={submissaoAtual.id}
          submissionId={submissaoAtual.id}
          submissao={submissaoAtual}
          eventTypes={eventTypes}
          onFichaAlterada={onFichaAlterada}
        />
      ) : (
        <div style={{ textAlign: "center", padding: "50px 20px" }}>
          <p style={{ fontSize: "32px", marginBottom: "12px" }}>📋</p>
          <p style={{ fontSize: "14px", color: "var(--gray-mid)", margin: 0 }}>
            Escolhe um evento para ver ou preparar a ficha operacional.
          </p>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// A ficha propriamente dita: materiais na ficha + adicionar
//
// Exportada porque vive em dois sítios: aqui, debaixo do selector de
// eventos da Logística, e como separador "Materiais" da página do
// evento. Nesse segundo caso passa `dentroDaPagina`, que desliga a
// barra sticky (o cabeçalho da página já é sticky e já diz de que
// evento se trata — duas barras coladas ao topo brigavam pelo mesmo
// espaço) e as margens negativas, que só compensam o padding do
// container do AdminPage.
// ------------------------------------------------------------
export function FichaMateriais({
  submissionId,
  submissao,
  eventTypes = [],
  onFichaAlterada,
  dentroDaPagina = false,
}) {
  const [catalogo, setCatalogo] = useState([]);
  const [linhas, setLinhas] = useState([]); // evento_materiais (com .material)
  const [loading, setLoading] = useState(true);
  const [mostrarAdicionar, setMostrarAdicionar] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [cat, ems] = await Promise.all([
        getMateriais(), // só ativos
        getEventoMateriais(submissionId),
      ]);
      setCatalogo(cat);
      setLinhas(ems);
    } catch (e) {
      console.error("Erro ao carregar ficha:", e);
    }
    setLoading(false);
  }, [submissionId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Feedback de guardado — mostra "A guardar…" e depois "✓ Guardado".
  // Também avisa o pai (OperacionalTab) que a ficha mudou, para o badge
  // e a lista de alertas recalcularem sem refrescar a página.
  const marcarGuardado = () => {
    setSaveState("saved");
    setTimeout(() => setSaveState("idle"), 1800);
    onFichaAlterada?.();
  };

  // ids dos materiais já na ficha (para o seletor saber o que está dentro)
  const idsNaFicha = useMemo(
    () => new Set(linhas.map((l) => l.material_id)),
    [linhas],
  );

  // linhas agrupadas por categoria (para mostrar a ficha)
  const gruposFicha = useMemo(() => {
    // agruparPorCategoria trabalha sobre objetos com .material aqui
    return agruparPorCategoria(
      linhas.map((l) => ({ ...l, categoria: l.material?.categoria })),
    );
  }, [linhas]);

  // --- ações ---

  const adicionar = async (material) => {
    setSaveState("saving");
    try {
      const nova = await addEventoMaterial(submissionId, material);
      // anexa o material para termos os dados do catálogo na linha
      const linhaCompleta = { ...nova, material };
      setLinhas((prev) => {
        // evita duplicado se já existir (upsert devolve a mesma linha)
        const semEste = prev.filter((l) => l.material_id !== material.id);
        return [...semEste, linhaCompleta];
      });
      marcarGuardado();
    } catch (e) {
      console.error(e);
      setSaveState("idle");
      alert("Não foi possível adicionar. Tenta novamente.");
    }
  };

  const remover = async (linha) => {
    setSaveState("saving");
    try {
      await removeEventoMaterial(linha.id);
      setLinhas((prev) => prev.filter((l) => l.id !== linha.id));
      marcarGuardado();
    } catch (e) {
      console.error(e);
      setSaveState("idle");
      alert("Não foi possível remover. Tenta novamente.");
    }
  };

  // atualização otimista de uma linha + persistência
  const atualizarLinha = async (linhaId, campos, { debounced } = {}) => {
    setLinhas((prev) =>
      prev.map((l) => (l.id === linhaId ? { ...l, ...campos } : l)),
    );
    setSaveState("saving");
    try {
      await updateEventoMaterial(linhaId, campos);
      marcarGuardado();
    } catch (e) {
      console.error(e);
      setSaveState("idle");
    }
  };

  const totalNaFicha = linhas.length;

  return (
    <div>
      {/* Barra de estado + adicionar — sticky no topo enquanto rola
          (na página do evento não, ver o comentário em FichaMateriais) */}
      <div
        style={{
          position: dentroDaPagina ? "static" : "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          // margens negativas para colar de ponta a ponta (compensa o
          // padding do container do AdminPage) e um fundo opaco para os
          // materiais não se verem por trás ao rolar
          margin: dentroDaPagina ? "0 0 16px" : "0 -16px 16px",
          padding: dentroDaPagina ? "0 0 12px" : "12px 16px",
          backgroundColor: dentroDaPagina ? "transparent" : "var(--cream)",
          borderBottom: "1px solid var(--gold-light)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          {/* Na página, o nome do evento já está no cabeçalho */}
          {!dentroDaPagina && (
            <p
              style={{
                fontSize: "13px",
                fontWeight: "600",
                color: "var(--charcoal)",
                margin: 0,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {tituloSubmissao(submissao, eventTypes)}
            </p>
          )}
          <p style={{ fontSize: "12px", color: "var(--gray-mid)", margin: 0 }}>
            {totalNaFicha === 0
              ? "Ainda sem materiais"
              : `${totalNaFicha} ${totalNaFicha === 1 ? "material" : "materiais"}`}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexShrink: 0,
          }}
        >
          <SaveIndicator state={saveState} />
          {linhas.length > 0 && (
            <button
              onClick={() => imprimirFicha(linhas, submissao)}
              title="Imprimir ou guardar como PDF"
              style={{
                padding: "9px 18px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: "600",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                backgroundColor: "white",
                color: "var(--gold)",
                border: "1.5px solid var(--gold-light)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              🖨 Imprimir
            </button>
          )}
          <button
            onClick={() => setMostrarAdicionar(true)}
            style={{
              padding: "9px 18px",
              borderRadius: "999px",
              fontSize: "12px",
              fontWeight: "600",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              backgroundColor: "var(--gold)",
              color: "white",
              border: "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
              boxShadow: "0 4px 16px rgba(201,168,76,0.4)",
            }}
          >
            + Adicionar
          </button>
        </div>
      </div>

      {loading ? (
        <p
          style={{
            textAlign: "center",
            padding: "50px",
            color: "var(--gray-mid)",
            fontSize: "14px",
          }}
        >
          A carregar...
        </p>
      ) : linhas.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "40px 20px",
            backgroundColor: "white",
            borderRadius: "14px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
          }}
        >
          <p style={{ fontSize: "13px", color: "var(--gray-mid)", margin: 0 }}>
            Usa o botão <strong>+ Adicionar</strong> para escolher os materiais
            deste evento.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {gruposFicha.map((grupo) => (
            <div key={grupo.categoria}>
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: "600",
                  color: "var(--gold)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  borderBottom: "1px solid var(--gold-light)",
                  paddingBottom: "6px",
                  margin: "0 0 12px 0",
                }}
              >
                {grupo.categoria}
              </p>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {grupo.itens.map((linha) => (
                  <LinhaMaterial
                    key={linha.id}
                    linha={linha}
                    onUpdate={atualizarLinha}
                    onRemove={() => remover(linha)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Painel de adicionar materiais */}
      <AnimatePresence>
        {mostrarAdicionar && (
          <AdicionarMateriais
            catalogo={catalogo}
            idsNaFicha={idsNaFicha}
            onAdicionar={adicionar}
            onRemoverPorMaterial={(materialId) => {
              const linha = linhas.find((l) => l.material_id === materialId);
              if (linha) remover(linha);
            }}
            onFechar={() => setMostrarAdicionar(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Indicador discreto de auto-save
function SaveIndicator({ state }) {
  if (state === "idle") return null;
  return (
    <span
      style={{
        fontSize: "11px",
        color: state === "saving" ? "var(--gray-mid)" : "#22C55E",
        fontWeight: "500",
        whiteSpace: "nowrap",
      }}
    >
      {state === "saving" ? "A guardar…" : "✓ Guardado"}
    </span>
  );
}

// ------------------------------------------------------------
// Linha de um material na ficha (mini-card empilhado, mobile-first)
// ------------------------------------------------------------
function LinhaMaterial({ linha, onUpdate, onRemove }) {
  const m = linha.material;
  const debounceRef = useRef(null);

  // valores locais para os campos de texto (para digitação fluida)
  const [quantidade, setQuantidade] = useState(linha.quantidade ?? 0);
  const [observacoes, setObservacoes] = useState(linha.observacoes ?? "");

  // Cores: guardadas como TEXTO na BD (retrocompatível + PDF igual),
  // editadas pelo SeletorPaleta. Local: array de {nome, hex}.
  const [cores, setCores] = useState(() => textoParaCores(linha.cores));
  const [paletaAberta, setPaletaAberta] = useState(false);

  // agenda gravação debounced de um conjunto de campos
  const agendarGravacao = (campos) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onUpdate(linha.id, campos, { debounced: true });
    }, 800);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const toggleLista = (campo) => {
    onUpdate(linha.id, { [campo]: !linha[campo] });
  };

  // Cada clique numa bolinha é uma intenção — grava logo (sem debounce)
  const mudarCores = (novas) => {
    setCores(novas);
    onUpdate(linha.id, { cores: coresParaTexto(novas) });
  };

  return (
    <div
      style={{
        backgroundColor: "white",
        borderRadius: "14px",
        padding: "16px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
      }}
    >
      {/* Nome + remover */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "10px",
          marginBottom: "12px",
        }}
      >
        <p
          style={{
            fontSize: "14px",
            fontWeight: "600",
            color: "var(--charcoal)",
            margin: 0,
          }}
        >
          {m?.nome || "Material"}
        </p>
        <button
          onClick={onRemove}
          title="Remover da ficha"
          style={{
            padding: "4px 8px",
            borderRadius: "8px",
            border: "1px solid #FECACA",
            backgroundColor: "#FEF2F2",
            color: "#DC2626",
            cursor: "pointer",
            fontSize: "12px",
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* Quantidade */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          marginBottom: "10px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 100px", minWidth: "100px", maxWidth: "180px" }}>
          <label style={miniLabel}>Quantidade ({m?.unidade || "un"})</label>
          <input
            type="number"
            min="0"
            value={quantidade}
            onChange={(e) => {
              const v =
                e.target.value === "" ? 0 : parseInt(e.target.value, 10);
              setQuantidade(e.target.value);
              agendarGravacao({ quantidade: Number.isNaN(v) ? 0 : v });
            }}
            style={miniInput}
          />
        </div>
      </div>

      {/* Cores — pastilhas do que está escolhido + seletor no sítio */}
      <div style={{ marginBottom: "10px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            marginBottom: "6px",
          }}
        >
          <label style={{ ...miniLabel, marginBottom: 0 }}>Cores</label>
          <button
            type="button"
            onClick={() => setPaletaAberta((v) => !v)}
            style={{
              padding: "4px 12px",
              borderRadius: "999px",
              fontSize: "11px",
              fontWeight: "600",
              border: `1.5px solid ${paletaAberta ? "var(--gold)" : "var(--gold-light)"}`,
              backgroundColor: paletaAberta ? "#FEF9EC" : "white",
              color: "var(--gold-dark)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {paletaAberta
              ? "Concluído"
              : cores.length > 0
                ? "🎨 Alterar"
                : "🎨 Escolher cores"}
          </button>
        </div>
        {cores.length > 0 ? (
          <AmostraPaleta value={cores} />
        ) : (
          !paletaAberta && (
            <p
              style={{
                fontSize: "12px",
                fontStyle: "italic",
                color: "var(--gray-mid)",
                margin: 0,
              }}
            >
              Sem cores definidas.
            </p>
          )
        )}
        {paletaAberta && (
          <div
            style={{
              marginTop: "10px",
              padding: "14px",
              borderRadius: "12px",
              border: "1.5px solid var(--gold-light)",
              backgroundColor: "#FBF7EF",
            }}
          >
            <SeletorPaleta value={cores} onChange={mudarCores} compact />
          </div>
        )}
      </div>

      {/* Observações */}
      <div style={{ marginBottom: "12px" }}>
        <label style={miniLabel}>Observações</label>
        <input
          type="text"
          value={observacoes}
          onChange={(e) => {
            setObservacoes(e.target.value);
            agendarGravacao({ observacoes: e.target.value });
          }}
          placeholder="Notas para a equipa..."
          style={miniInput}
        />
      </div>

      {/* Toggles de lista */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <ListaToggle
          label="Carga"
          ativo={linha.lista_carga}
          onClick={() => toggleLista("lista_carga")}
        />
        <ListaToggle
          label="Montagem"
          ativo={linha.lista_montagem}
          onClick={() => toggleLista("lista_montagem")}
        />
        <ListaToggle
          label="Higienização"
          ativo={linha.lista_higienizacao}
          onClick={() => toggleLista("lista_higienizacao")}
        />
      </div>
    </div>
  );
}

// Toggle de inclusão numa lista (Carga/Montagem/Higienização)
function ListaToggle({ label, ativo, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 12px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: "600",
        border: `1.5px solid ${ativo ? "var(--gold)" : "var(--gold-light)"}`,
        backgroundColor: ativo ? "var(--gold)" : "white",
        color: ativo ? "white" : "var(--gray-mid)",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      <span style={{ fontSize: "12px", lineHeight: 1 }}>
        {ativo ? "✓" : "○"}
      </span>
      {label}
    </button>
  );
}

// ------------------------------------------------------------
// Painel modal para adicionar materiais (busca + accordion)
// ------------------------------------------------------------
function AdicionarMateriais({
  catalogo,
  idsNaFicha,
  onAdicionar,
  onRemoverPorMaterial,
  onFechar,
}) {
  const [busca, setBusca] = useState("");
  const [abertas, setAbertas] = useState({});

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return catalogo;
    return catalogo.filter(
      (m) =>
        m.nome.toLowerCase().includes(q) ||
        m.categoria.toLowerCase().includes(q),
    );
  }, [catalogo, busca]);

  const grupos = useMemo(() => agruparPorCategoria(filtrados), [filtrados]);

  const buscaAtiva = busca.trim().length > 0;
  const isAberta = (cat) => (buscaAtiva ? true : !!abertas[cat]);
  const toggleCat = (cat) => {
    if (buscaAtiva) return;
    setAbertas((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <motion.div
      onClick={onFechar}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        backgroundColor: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
        style={{
          backgroundColor: "var(--cream)",
          borderRadius: "20px 20px 0 0",
          width: "100%",
          maxWidth: "480px",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 -4px 32px rgba(0,0,0,0.15)",
        }}
      >
        {/* Handle + cabeçalho */}
        <div style={{ padding: "16px 20px 12px", flexShrink: 0 }}>
          <div
            style={{
              width: "40px",
              height: "4px",
              borderRadius: "999px",
              backgroundColor: "#E5E7EB",
              margin: "0 auto 16px",
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "12px",
            }}
          >
            <h3
              style={{
                fontSize: "16px",
                color: "var(--charcoal)",
                margin: 0,
                fontFamily: "Playfair Display, serif",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Adicionar Materiais
            </h3>
            <button
              onClick={onFechar}
              style={{
                fontSize: "20px",
                color: "var(--gray-mid)",
                background: "none",
                border: "none",
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

          {/* Busca */}
          <div style={{ position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: "14px",
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: "14px",
                pointerEvents: "none",
                color: "var(--gray-mid)",
              }}
            >
              🔍
            </span>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              autoFocus
              placeholder="Procurar material..."
              style={{
                width: "100%",
                padding: "11px 14px 11px 42px",
                borderRadius: "12px",
                border: "1.5px solid var(--gold-light)",
                fontSize: "13px",
                outline: "none",
                fontFamily: "Inter, sans-serif",
                boxSizing: "border-box",
                backgroundColor: "white",
              }}
            />
          </div>
        </div>

        {/* Lista scrollável */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 16px 24px",
          }}
        >
          {grupos.length === 0 ? (
            <p
              style={{
                fontSize: "13px",
                color: "var(--gray-mid)",
                textAlign: "center",
                padding: "40px 20px",
              }}
            >
              Nenhum material encontrado.
            </p>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {grupos.map((grupo) => {
                const aberta = isAberta(grupo.categoria);
                const naFicha = grupo.itens.filter((m) =>
                  idsNaFicha.has(m.id),
                ).length;
                return (
                  <div
                    key={grupo.categoria}
                    style={{
                      backgroundColor: "white",
                      borderRadius: "12px",
                      overflow: "hidden",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                    }}
                  >
                    <button
                      onClick={() => toggleCat(grupo.categoria)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "10px",
                        padding: "14px 16px",
                        border: "none",
                        backgroundColor: "transparent",
                        cursor: buscaAtiva ? "default" : "pointer",
                        textAlign: "left",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            transform: aberta
                              ? "rotate(90deg)"
                              : "rotate(0deg)",
                            transition: "transform 0.2s",
                            color: "var(--gold)",
                            fontSize: "11px",
                          }}
                        >
                          ▶
                        </span>
                        <span
                          style={{
                            fontSize: "14px",
                            color: "var(--charcoal)",
                            fontFamily: "Playfair Display, serif",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}
                        >
                          {grupo.categoria}
                        </span>
                      </div>
                      {naFicha > 0 && (
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: "600",
                            color: "var(--gold)",
                            backgroundColor: "#FEF9EC",
                            border: "1px solid var(--gold-light)",
                            borderRadius: "999px",
                            padding: "2px 8px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {naFicha} na ficha
                        </span>
                      )}
                    </button>

                    {aberta && (
                      <div
                        style={{
                          borderTop: "1px solid var(--gold-light)",
                          padding: "6px",
                        }}
                      >
                        {grupo.itens.map((m) => {
                          const dentro = idsNaFicha.has(m.id);
                          return (
                            <button
                              key={m.id}
                              onClick={() =>
                                dentro
                                  ? onRemoverPorMaterial(m.id)
                                  : onAdicionar(m)
                              }
                              style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "10px",
                                padding: "10px 12px",
                                borderRadius: "8px",
                                border: "none",
                                backgroundColor: dentro ? "#FEF9EC" : "white",
                                cursor: "pointer",
                                textAlign: "left",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "13px",
                                  color: "var(--charcoal)",
                                }}
                              >
                                {m.nome}
                              </span>
                              <span
                                style={{
                                  width: "24px",
                                  height: "24px",
                                  borderRadius: "50%",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                  fontSize: "14px",
                                  fontWeight: "700",
                                  border: `1.5px solid ${dentro ? "var(--gold)" : "var(--gold-light)"}`,
                                  backgroundColor: dentro
                                    ? "var(--gold)"
                                    : "white",
                                  color: dentro ? "white" : "var(--gold)",
                                }}
                              >
                                {dentro ? "✓" : "+"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--gold-light)",
            backgroundColor: "white",
            flexShrink: 0,
          }}
        >
          <button
            onClick={onFechar}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "10px",
              fontSize: "13px",
              fontWeight: "600",
              backgroundColor: "var(--gold)",
              color: "white",
              border: "none",
              cursor: "pointer",
            }}
          >
            Concluído
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

const miniLabel = {
  fontSize: "10px",
  color: "var(--gray-mid)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  display: "block",
  marginBottom: "4px",
};

const miniInput = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: "8px",
  border: "1.5px solid var(--gold-light)",
  fontSize: "13px",
  outline: "none",
  fontFamily: "Inter, sans-serif",
  boxSizing: "border-box",
  backgroundColor: "white",
};