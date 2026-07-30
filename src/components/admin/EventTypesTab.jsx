import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import EventTypeEditor, {
  toEditingSteps,
  blankEditingSteps,
} from "./EventTypeEditor";
import AvisosBloqueantes from "./AvisosBloqueantes";
import { deleteEventType } from "../../lib/eventTypes";

export default function EventTypesTab({ eventTypes, loading, onRefetch }) {
  const [showChooser, setShowChooser] = useState(false);
  const [duplicarDeId, setDuplicarDeId] = useState("");
  const [editorProps, setEditorProps] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [tipoParaRemover, setTipoParaRemover] = useState(null);
  const [erroRemover, setErroRemover] = useState(null);
  const [removendo, setRemovendo] = useState(false);

  const handleConfirmarRemocao = async () => {
    if (!tipoParaRemover) return;
    setRemovendo(true);
    setErroRemover(null);
    try {
      await deleteEventType(tipoParaRemover.id);
      setTipoParaRemover(null);
      await onRefetch();
      setSuccessMsg(`Tipo de evento "${tipoParaRemover.nome}" removido.`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (e) {
      console.error(e);
      // Código 23503 = violação de chave estrangeira — já há formulários
      // ou submissões a usar este tipo de evento
      if (e.code === "23503") {
        setErroRemover(
          "Não é possível remover: já existem formulários ou submissões associadas a este tipo de evento.",
        );
      } else {
        setErroRemover("Ocorreu um erro ao remover. Tenta novamente.");
      }
    }
    setRemovendo(false);
  };

  // Sempre que a lista (que vem do AdminPage) tiver tipos disponíveis,
  // garante que há um pré-selecionado no seletor de "duplicar"
  useEffect(() => {
    if (eventTypes.length > 0) {
      setDuplicarDeId((prev) => prev || eventTypes[0].id);
    }
  }, [eventTypes]);

  const abrirEmBranco = () => {
    setEditorProps({ initialNome: "", initialSteps: blankEditingSteps() });
    setShowChooser(false);
  };

  const abrirDuplicado = () => {
    const tipo = eventTypes.find((et) => et.id === duplicarDeId);
    if (!tipo) return;
    setEditorProps({
      initialNome: `${tipo.nome} (cópia)`,
      initialSteps: toEditingSteps(tipo.steps),
    });
    setShowChooser(false);
  };

  const abrirEdicao = (tipo) => {
    setEditorProps({
      editingId: tipo.id,
      isPredefinido: tipo.predefinido,
      initialNome: tipo.nome,
      initialSteps: toEditingSteps(tipo.steps),
    });
  };

  const handleSaved = async (tipo) => {
    const foiEdicao = !!editorProps?.editingId;
    setEditorProps(null);
    await onRefetch();
    setSuccessMsg(
      `Tipo de evento "${tipo.nome}" ${foiEdicao ? "actualizado" : "criado"} com sucesso!`,
    );
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const totalCampos = (steps) =>
    (steps || []).reduce((sum, step) => sum + (step.fields?.length || 0), 0);

  return (
    <motion.div
      key="tab-tipos-evento"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <AvisosBloqueantes pagina="modelos-evento">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          marginBottom: "20px",
          flexWrap: "wrap",
        }}
      >
        <p
          style={{
            fontSize: "13px",
            color: "var(--gray-mid)",
            margin: 0,
            maxWidth: "440px",
          }}
        >
          Cada tipo de evento define as perguntas que o organizador vê no
          questionário.
        </p>
        <button
          id="tour-criar-tipo-evento"
          onClick={() => setShowChooser(true)}
          style={{
            padding: "10px 20px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: "600",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            backgroundColor: "var(--gold)",
            color: "white",
            border: "none",
            cursor: "pointer",
            whiteSpace: "nowrap",
            boxShadow: "0 4px 16px rgba(201,168,76,0.4)",
          }}
        >
          + Criar Tipo de Evento
        </button>
      </div>

      {successMsg && (
        <p
          style={{
            fontSize: "12px",
            color: "#22C55E",
            backgroundColor: "#F0FDF4",
            border: "1px solid #BBF7D0",
            borderRadius: "8px",
            padding: "10px 14px",
            marginBottom: "16px",
          }}
        >
          ✓ {successMsg}
        </p>
      )}

      {loading ? (
        <p style={{ color: "var(--gray-mid)", fontSize: "13px" }}>
          A carregar...
        </p>
      ) : eventTypes.length === 0 ? (
        <p style={{ color: "var(--gray-mid)", fontSize: "13px" }}>
          Ainda não há tipos de evento criados.
        </p>
      ) : (
        <div
          id="tour-lista-tipos-evento"
          style={{ display: "flex", flexDirection: "column", gap: "12px" }}
        >
          {eventTypes.map((et) => (
            <div
              key={et.id}
              style={{
                backgroundColor: "white",
                borderRadius: "14px",
                padding: "18px 20px",
                boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: "15px",
                    color: "var(--charcoal)",
                    margin: "0 0 4px 0",
                    fontFamily: "Playfair Display, serif",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {et.nome}
                </h3>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--gray-mid)",
                    margin: 0,
                  }}
                >
                  {(et.steps || []).length} passos · {totalCampos(et.steps)}{" "}
                  campos
                </p>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                {et.predefinido && (
                  <span
                    style={{
                      fontSize: "10px",
                      padding: "4px 12px",
                      borderRadius: "999px",
                      backgroundColor: "#FEF9EC",
                      color: "var(--gold)",
                      border: "1px solid var(--gold-light)",
                      fontWeight: "600",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Predefinido
                  </span>
                )}
                <button
                  onClick={() => abrirEdicao(et)}
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
                  }}
                >
                  ✏️ Editar
                </button>
                <button
                  onClick={() => setTipoParaRemover(et)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "999px",
                    fontSize: "11px",
                    fontWeight: "600",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    border: "1.5px solid #FECACA",
                    backgroundColor: "white",
                    color: "#EF4444",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  🗑 Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Seletor: duplicar ou começar em branco */}
      {showChooser && (
        <div
          onClick={() => setShowChooser(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 150,
            backgroundColor: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "white",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "420px",
              width: "100%",
              boxShadow: "0 8px 48px rgba(0,0,0,0.15)",
            }}
          >
            <h3
              style={{
                fontSize: "16px",
                color: "var(--charcoal)",
                margin: "0 0 18px 0",
                fontFamily: "Playfair Display, serif",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Como queres começar?
            </h3>

            {/* Opção: duplicar */}
            <div
              style={{
                border: "1.5px solid var(--gold-light)",
                borderRadius: "12px",
                padding: "16px",
                marginBottom: "12px",
              }}
            >
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--charcoal)",
                  margin: "0 0 10px 0",
                  fontWeight: "600",
                }}
              >
                Duplicar um tipo existente
              </p>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--gray-mid)",
                  margin: "0 0 12px 0",
                }}
              >
                Começa com os mesmos passos e campos, e edita só as diferenças.
              </p>
              {eventTypes.length > 1 && (
                <select
                  value={duplicarDeId}
                  onChange={(e) => setDuplicarDeId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "8px",
                    border: "1.5px solid var(--gold-light)",
                    fontSize: "13px",
                    marginBottom: "12px",
                    fontFamily: "Inter, sans-serif",
                  }}
                >
                  {eventTypes.map((et) => (
                    <option key={et.id} value={et.id}>
                      {et.nome}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={abrirDuplicado}
                disabled={!duplicarDeId}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  border: "none",
                  backgroundColor: "var(--gold)",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                Duplicar
                {eventTypes.length === 1 && eventTypes[0]
                  ? ` "${eventTypes[0].nome}"`
                  : ""}
              </button>
            </div>

            {/* Opção: em branco */}
            <div
              style={{
                border: "1.5px solid var(--gold-light)",
                borderRadius: "12px",
                padding: "16px",
                marginBottom: "16px",
              }}
            >
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--charcoal)",
                  margin: "0 0 10px 0",
                  fontWeight: "600",
                }}
              >
                Começar em branco
              </p>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--gray-mid)",
                  margin: "0 0 12px 0",
                }}
              >
                Constrói os passos e campos um a um, desde o início.
              </p>
              <button
                onClick={abrirEmBranco}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  border: "1.5px solid var(--gold)",
                  backgroundColor: "white",
                  color: "var(--gold)",
                  cursor: "pointer",
                }}
              >
                Começar em Branco
              </button>
            </div>

            <button
              onClick={() => setShowChooser(false)}
              style={{
                width: "100%",
                padding: "8px",
                fontSize: "12px",
                color: "var(--gray-mid)",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Confirmação de remoção */}
      {tipoParaRemover && (
        <div
          onClick={() => {
            setTipoParaRemover(null);
            setErroRemover(null);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 150,
            backgroundColor: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "white",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "400px",
              width: "100%",
              boxShadow: "0 8px 48px rgba(0,0,0,0.15)",
            }}
          >
            <h3
              style={{
                fontSize: "16px",
                color: "var(--charcoal)",
                margin: "0 0 12px 0",
                fontFamily: "Playfair Display, serif",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Remover tipo de evento?
            </h3>
            <p
              style={{
                fontSize: "13px",
                color: "var(--gray-mid)",
                margin: "0 0 16px 0",
                lineHeight: "1.6",
              }}
            >
              O tipo <strong>{tipoParaRemover.nome}</strong> vai ser removido.
              Esta acção não pode ser anulada.
            </p>
            {erroRemover && (
              <p
                style={{
                  fontSize: "12px",
                  color: "#EF4444",
                  backgroundColor: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  margin: "0 0 16px 0",
                }}
              >
                ⚠ {erroRemover}
              </p>
            )}
            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => {
                  setTipoParaRemover(null);
                  setErroRemover(null);
                }}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  border: "1.5px solid var(--gold-light)",
                  color: "var(--gray-mid)",
                  backgroundColor: "white",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarRemocao}
                disabled={removendo}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "600",
                  border: "none",
                  backgroundColor: removendo ? "#FCA5A5" : "#EF4444",
                  color: "white",
                  cursor: removendo ? "not-allowed" : "pointer",
                }}
              >
                {removendo ? "A remover..." : "Remover"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editor — só aparece quando há um rascunho pronto (duplicado ou em branco) */}
      {editorProps && (
        <EventTypeEditor
          initialNome={editorProps.initialNome}
          initialSteps={editorProps.initialSteps}
          editingId={editorProps.editingId}
          isPredefinido={editorProps.isPredefinido}
          onCancel={() => setEditorProps(null)}
          onSaved={handleSaved}
        />
      )}
      </AvisosBloqueantes>
    </motion.div>
  );
}
