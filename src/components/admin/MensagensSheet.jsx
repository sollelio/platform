import { useState, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  getMensagens,
  createMensagem,
  updateMensagem,
  removerMensagem,
  resolverMensagem,
  linkWhatsApp,
} from "../../lib/mensagens";

// ============================================================
// MensagensSheet — o painel de mensagens-tipo, aberto do drawer de
// um evento (💬 Mensagens). Cada mensagem aparece JÁ RESOLVIDA com
// os dados do evento ({SINAL} vira "138€", {LINK_INTERESSE} vira o
// link real...) e um toque em Copiar põe-na no clipboard, pronta a
// colar no Instagram.
//
// Gestão no próprio painel: tocar no texto abre a edição (com os
// placeholders crus, para ela os poder mexer), "+ Nova mensagem",
// e "remover" (soft-delete) com confirmação inline.
//
// props:
//   dados    — contexto do evento (getDadosParaDocumento) ou null
//   onFechar — fecha o painel (o drawer fica por baixo, intacto)
// ============================================================

// A pega ⠿ — copiada traço por traço do editor de modelos de evento,
// para o gesto ser exatamente o mesmo em toda a app.
function PegaArrastar({ attributes, listeners }) {
  return (
    <button
      type="button"
      {...attributes}
      {...listeners}
      title="Arrastar para reordenar"
      style={{
        cursor: "grab",
        background: "none",
        border: "none",
        color: "var(--gray-mid)",
        fontSize: "18px",
        padding: "6px 4px",
        flexShrink: 0,
        touchAction: "none",
        lineHeight: 1,
      }}
    >
      ⠿
    </button>
  );
}

// O invólucro sortable de um cartão de mensagem: dá a pega ao filho
// (render prop) e trata do fantasma/transições do dnd-kit.
function MensagemArrastavel({ mensagem, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: mensagem.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      {children(
        <PegaArrastar attributes={attributes} listeners={listeners} />,
      )}
    </div>
  );
}

// O MIOLO (lista + copiar + editor) — partilhado entre a folha do
// drawer e o separador Mensagens (biblioteca sem contexto de evento).
export function MensagensConteudo({
  dados,
  reordenavel = false,
  whatsapp = null,
}) {
  const [mensagens, setMensagens] = useState([]);
  // Reordenação por arrasto (só no separador Mensagens; a folha do
  // drawer dispensa a pega — é um modal de copiar, não de gerir)
  const [aArrastar, setAArrastar] = useState(null); // título do fantasma

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Ao largar: reordena localmente e grava a ordem nova (1, 2, 3...)
  const aoLargar = ({ active, over }) => {
    setAArrastar(null);
    if (!over || active.id === over.id) return;
    setMensagens((prev) => {
      const de = prev.findIndex((m) => m.id === active.id);
      const para = prev.findIndex((m) => m.id === over.id);
      if (de === -1 || para === -1) return prev;
      const novas = arrayMove(prev, de, para);
      // Persistir em fundo — a ordem local já está certa; se falhar,
      // o refresh repõe a verdade da base de dados.
      Promise.all(
        novas.map((m, i) =>
          m.ordem === i + 1 ? null : updateMensagem(m.id, { ordem: i + 1 }),
        ),
      ).catch((e) => console.error("Falha a gravar a ordem:", e));
      return novas.map((m, i) => ({ ...m, ordem: i + 1 }));
    });
  };
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [copiadoId, setCopiadoId] = useState(null);
  const [editando, setEditando] = useState(null); // {id?, titulo, corpo} | null
  const [guardando, setGuardando] = useState(false);
  const [confirmandoRemover, setConfirmandoRemover] = useState(null); // id

  const carregar = async () => {
    setCarregando(true);
    setErro(null);
    try {
      setMensagens(await getMensagens());
    } catch (e) {
      console.error(e);
      setErro("Não foi possível carregar as mensagens.");
    }
    setCarregando(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  const copiar = async (m) => {
    try {
      await navigator.clipboard.writeText(resolverMensagem(m.corpo, dados));
      setCopiadoId(m.id);
      setTimeout(() => setCopiadoId(null), 1600);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível copiar. Tenta novamente.");
    }
  };

  const guardar = async () => {
    if (!editando?.titulo?.trim() || !editando?.corpo?.trim()) return;
    setGuardando(true);
    try {
      if (editando.id) {
        await updateMensagem(editando.id, {
          titulo: editando.titulo.trim(),
          corpo: editando.corpo.trim(),
        });
      } else {
        await createMensagem(editando);
      }
      setEditando(null);
      await carregar();
    } catch (e) {
      console.error(e);
      setErro("Não foi possível guardar. Tenta novamente.");
    }
    setGuardando(false);
  };

  const remover = async (id) => {
    try {
      await removerMensagem(id);
      setConfirmandoRemover(null);
      await carregar();
    } catch (e) {
      console.error(e);
      setErro("Não foi possível remover. Tenta novamente.");
    }
  };

  // O cartão de uma mensagem (partilhado entre a lista normal e a
  // reordenável — a `pega` só existe quando reordenavel)
  const renderCartao = (m, pega) => (
    <div
              style={{
                border: "1px solid #F0E6D0",
                backgroundColor: "#FBF7EF",
                borderRadius: "12px",
                padding: "12px 14px",
                marginBottom: "10px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "6px",
                }}
              >
                {pega}
                <p
                  style={{
                    flex: 1,
                    fontSize: "11px",
                    fontWeight: "700",
                    color: "var(--gold-dark)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    margin: 0,
                  }}
                >
                  {m.titulo}
                </p>
                <button
                  onClick={() => copiar(m)}
                  style={{
                    flexShrink: 0,
                    padding: "5px 14px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: "600",
                    border:
                      copiadoId === m.id
                        ? "1.5px solid var(--gold)"
                        : "none",
                    backgroundColor:
                      copiadoId === m.id ? "white" : "var(--gold)",
                    color: copiadoId === m.id ? "var(--gold-dark)" : "white",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {copiadoId === m.id ? "Copiado ✓" : "Copiar"}
                </button>
                {linkWhatsApp(whatsapp) && (
                  <button
                    onClick={() =>
                      window.open(
                        linkWhatsApp(
                          whatsapp,
                          resolverMensagem(m.corpo, dados),
                        ),
                        "_blank",
                      )
                    }
                    title="Abrir no WhatsApp com esta mensagem"
                    style={{
                      flexShrink: 0,
                      padding: "5px 14px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: "600",
                      border: "1.5px solid #BBF7D0",
                      backgroundColor: "#F0FDF4",
                      color: "#166534",
                      cursor: "pointer",
                    }}
                  >
                    💬 WhatsApp
                  </button>
                )}
              </div>

              {/* Texto resolvido — tocar abre a edição (com placeholders crus) */}
              <p
                onClick={() =>
                  setEditando({ id: m.id, titulo: m.titulo, corpo: m.corpo })
                }
                title="Tocar para editar"
                style={{
                  fontSize: "13px",
                  color: "var(--charcoal)",
                  margin: 0,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  cursor: "pointer",
                }}
              >
                {resolverMensagem(m.corpo, dados)}
              </p>

              {/* Remoção com confirmação inline */}
              <div style={{ marginTop: "8px", textAlign: "right" }}>
                {confirmandoRemover === m.id ? (
                  <span style={{ fontSize: "12px" }}>
                    <button
                      onClick={() => remover(m.id)}
                      style={{
                        border: "none",
                        background: "none",
                        color: "#DC2626",
                        fontWeight: "600",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    >
                      Sim, remover
                    </button>
                    <button
                      onClick={() => setConfirmandoRemover(null)}
                      style={{
                        border: "none",
                        background: "none",
                        color: "var(--gray-mid)",
                        cursor: "pointer",
                        fontSize: "12px",
                        marginLeft: "10px",
                      }}
                    >
                      Cancelar
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmandoRemover(m.id)}
                    style={{
                      border: "none",
                      background: "none",
                      color: "var(--gray-mid)",
                      cursor: "pointer",
                      fontSize: "11px",
                    }}
                  >
                    remover
                  </button>
                )}
              </div>
            </div>
  );

  // O editor — abre NO LUGAR do cartão clicado (edição no sítio,
  // zero scroll); para mensagem nova, abre em baixo, onde o botão está.
  const renderEditor = () => (

          <div
            style={{
              border: "1.5px solid var(--gold-light)",
              borderRadius: "12px",
              padding: "14px",
              marginBottom: "10px",
              backgroundColor: "white",
            }}
          >
            <p
              style={{
                fontSize: "11px",
                fontWeight: "700",
                color: "var(--gold)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                margin: "0 0 10px 0",
              }}
            >
              {editando.id ? "Editar mensagem" : "Nova mensagem"}
            </p>
            <input
              style={{ ...inputStyle, marginBottom: "8px" }}
              value={editando.titulo}
              onChange={(e) =>
                setEditando((p) => ({ ...p, titulo: e.target.value }))
              }
              placeholder="Título (ex: Follow-up)"
            />
            <textarea
              style={{ ...inputStyle, minHeight: "110px", resize: "vertical" }}
              value={editando.corpo}
              onChange={(e) =>
                setEditando((p) => ({ ...p, corpo: e.target.value }))
              }
              placeholder="O texto da mensagem..."
            />
            <p
              style={{
                fontSize: "11px",
                color: "var(--gray-mid)",
                margin: "6px 0 10px 0",
                lineHeight: 1.5,
              }}
            >
              Placeholders que se preenchem sozinhos: {"{NOME}"},{" "}
              {"{TIPO_EVENTO}"}, {"{DATA}"}, {"{VALOR}"}, {"{SINAL}"} (50% do
              valor), {"{LINK_INTERESSE}"}.
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setEditando(null)}
                style={{
                  flex: 1,
                  padding: "9px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  border: "1.5px solid var(--gold-light)",
                  color: "var(--gray-mid)",
                  backgroundColor: "white",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={guardando}
                style={{
                  flex: 2,
                  padding: "9px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: "600",
                  border: "none",
                  backgroundColor: guardando
                    ? "var(--gold-light)"
                    : "var(--gold)",
                  color: "white",
                  cursor: guardando ? "wait" : "pointer",
                }}
              >
                {guardando ? "A guardar..." : "✓ Guardar"}
              </button>
            </div>
          </div>
  );

  return (
    <div>
        {carregando && (
          <p style={{ fontSize: "13px", color: "var(--gray-mid)" }}>
            A carregar mensagens...
          </p>
        )}
        {erro && <p style={{ fontSize: "13px", color: "#DC2626" }}>{erro}</p>}

        {/* Lista de mensagens resolvidas */}
        {!carregando &&
          !erro &&
          (reordenavel ? (
            <DndContext
              sensors={sensores}
              collisionDetection={closestCenter}
              onDragStart={({ active }) => {
                const m = mensagens.find((x) => x.id === active.id);
                setAArrastar(m?.titulo || "Mensagem");
              }}
              onDragEnd={aoLargar}
              onDragCancel={() => setAArrastar(null)}
            >
              <p
                style={{
                  fontSize: "11px",
                  color: "var(--gray-mid)",
                  margin: "0 0 10px 0",
                }}
              >
                ⠿ Arrasta pela pega para reordenar as mensagens.
              </p>
              <SortableContext
                items={mensagens
                  .filter((m) => m.id !== editando?.id)
                  .map((m) => m.id)}
                strategy={verticalListSortingStrategy}
              >
                {mensagens.map((m) =>
                  editando?.id === m.id ? (
                    <div key={m.id}>{renderEditor()}</div>
                  ) : (
                    <MensagemArrastavel key={m.id} mensagem={m}>
                      {(pega) => renderCartao(m, pega)}
                    </MensagemArrastavel>
                  ),
                )}
              </SortableContext>
              <DragOverlay>
                {aArrastar ? (
                  <div
                    style={{
                      backgroundColor: "white",
                      borderRadius: "12px",
                      padding: "14px 18px",
                      boxShadow: "0 10px 32px rgba(0,0,0,0.2)",
                      border: "1.5px solid var(--gold)",
                      fontSize: "13px",
                      fontWeight: "600",
                      color: "var(--charcoal)",
                      fontFamily: "Inter, sans-serif",
                    }}
                  >
                    ⠿ {aArrastar}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          ) : (
            mensagens.map((m) =>
              editando?.id === m.id ? (
                <div key={m.id}>{renderEditor()}</div>
              ) : (
                <div key={m.id}>{renderCartao(m, null)}</div>
              ),
            )
          ))}

        {/* Em baixo: o editor de NOVA mensagem, ou o botão para a criar.
            (A edição de existentes abre no lugar do cartão, lá em cima.) */}
        {editando && !editando.id ? (
          renderEditor()
        ) : (
          !carregando && (
            <button
              onClick={() => setEditando({ titulo: "", corpo: "" })}
              style={{
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
              + Nova mensagem
            </button>
          )
        )}
    </div>
  );
}

// A folha que abre do drawer de um evento (💬): overlay + cabeçalho
// com o nome do cliente + o miolo partilhado.
export default function MensagensSheet({
  dados,
  whatsapp = null,
  onFechar,
}) {
  return (
    <div
      onClick={onFechar}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70, // por cima do drawer (50)
        backgroundColor: "rgba(0,0,0,0.35)",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: "24px 16px",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "white",
          borderRadius: "16px",
          padding: "20px",
          width: "100%",
          maxWidth: "460px",
          border: "1px solid var(--gold-light)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "4px",
          }}
        >
          <h3
            style={{
              fontSize: "17px",
              fontFamily: "Playfair Display, serif",
              color: "var(--charcoal)",
              margin: 0,
            }}
          >
            Mensagens
            {dados?.nomeCliente ? ` · ${dados.nomeCliente}` : ""}
          </h3>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            style={{
              fontSize: "18px",
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
        <p
          style={{
            fontSize: "12px",
            color: "var(--gray-mid)",
            margin: "0 0 16px 0",
          }}
        >
          Já preenchidas com os dados deste evento — toca em Copiar e cola
          no Instagram.
        </p>
        <MensagensConteudo dados={dados} whatsapp={whatsapp} />
      </div>
    </div>
  );
}

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