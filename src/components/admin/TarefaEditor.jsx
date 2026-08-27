import { useState } from "react";
import { motion } from "framer-motion";
import { groupFunctionsByArea } from "../../lib/staff";

// ============================================================
// A folha de uma tarefa. O quê, quando, que capacidade exige e
// quantas pessoas precisa no MÍNIMO — o mínimo é um chão, e o
// texto por baixo do campo diz isso à Nádia por extenso, porque
// «mínimo» num formulário lê-se as duas vezes como «quantas».
// ============================================================

const campo = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid var(--borda)",
  backgroundColor: "var(--superficie)",
  color: "var(--texto)",
  fontSize: "13px",
  boxSizing: "border-box",
};

const rotulo = {
  display: "block",
  fontSize: "11px",
  color: "var(--texto-suave)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: "5px",
};

const caixaErro = {
  fontSize: "12.5px",
  color: "var(--perigo-texto)",
  backgroundColor: "var(--perigo-fundo)",
  border: "1px solid var(--perigo-borda)",
  borderRadius: "10px",
  padding: "10px 14px",
  margin: "0 0 14px",
};

// datetime-local quer «YYYY-MM-DDTHH:mm» na hora local.
const paraCampo = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function TarefaEditor({ tarefa, funcoes, onGuardar, onFechar }) {
  const aEditar = Boolean(tarefa?.id);
  const [title, setTitle] = useState(tarefa?.title ?? "");
  const [staffFunctionId, setStaffFunctionId] = useState(
    tarefa?.staff_function_id ?? funcoes[0]?.id ?? "",
  );
  const [startsAt, setStartsAt] = useState(paraCampo(tarefa?.starts_at));
  const [endsAt, setEndsAt] = useState(paraCampo(tarefa?.ends_at));
  const [minimumPeople, setMinimumPeople] = useState(
    String(tarefa?.minimum_people ?? 1),
  );
  const [notes, setNotes] = useState(tarefa?.notes ?? "");
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState(null);

  const submeter = async (e) => {
    e.preventDefault();
    if (!title.trim()) return setErro("Diz o que é a tarefa.");
    if (!staffFunctionId) return setErro("Escolhe a função que a tarefa exige.");
    if (!startsAt) return setErro("Diz quando começa.");
    const minimo = Number(minimumPeople);
    if (!Number.isInteger(minimo) || minimo < 1)
      return setErro("O mínimo é pelo menos uma pessoa.");
    if (endsAt && endsAt < startsAt)
      return setErro("O fim não pode ser antes do início.");

    setErro(null);
    setAGuardar(true);
    try {
      await onGuardar({
        staffFunctionId,
        title,
        notes,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        minimumPeople: minimo,
      });
    } catch (err) {
      console.error(err);
      setErro("Não foi possível guardar. Tenta outra vez.");
      setAGuardar(false);
    }
  };

  const porArea = groupFunctionsByArea(funcoes);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={aEditar ? "Editar tarefa" : "Nova tarefa"}
      onClick={onFechar}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "var(--cortina)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        zIndex: 150,
      }}
    >
      <motion.form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submeter}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          backgroundColor: "var(--superficie)",
          borderRadius: "16px",
          boxShadow: "var(--sombra-flutuante)",
          padding: "24px",
          width: "100%",
          maxWidth: "480px",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h3
          style={{
            fontFamily: "Playfair Display, serif",
            fontSize: "17px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--texto)",
            margin: "0 0 18px",
          }}
        >
          {aEditar ? "Editar tarefa" : "Nova tarefa"}
        </h3>

        {erro && (
          <p role="alert" style={caixaErro}>
            ⚠ {erro}
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={rotulo} htmlFor="tarefa-title">
              O quê
            </label>
            <input
              id="tarefa-title"
              autoFocus
              style={campo}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Serviço ao jantar"
            />
          </div>

          <div>
            <label style={rotulo} htmlFor="tarefa-funcao">
              Função exigida
            </label>
            <select
              id="tarefa-funcao"
              style={campo}
              value={staffFunctionId}
              onChange={(e) => setStaffFunctionId(e.target.value)}
            >
              {porArea.map((grupo) => (
                <optgroup key={grupo.area} label={grupo.area}>
                  {grupo.items.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 180px" }}>
              <label style={rotulo} htmlFor="tarefa-inicio">
                Começa
              </label>
              <input
                id="tarefa-inicio"
                type="datetime-local"
                style={campo}
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div style={{ flex: "1 1 180px" }}>
              <label style={rotulo} htmlFor="tarefa-fim">
                Termina (opcional)
              </label>
              <input
                id="tarefa-fim"
                type="datetime-local"
                style={campo}
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>
          <p
            style={{
              fontSize: "11.5px",
              color: "var(--texto-suave)",
              margin: "-6px 0 0",
            }}
          >
            A tarefa tem hora própria: a montagem pode ser na véspera e a
            recolha no dia seguinte.
          </p>

          <div style={{ maxWidth: "180px" }}>
            <label style={rotulo} htmlFor="tarefa-minimo">
              Mínimo de pessoas
            </label>
            <input
              id="tarefa-minimo"
              type="number"
              min="1"
              step="1"
              style={campo}
              value={minimumPeople}
              onChange={(e) => setMinimumPeople(e.target.value)}
            />
            <p
              style={{
                fontSize: "11.5px",
                color: "var(--texto-suave)",
                margin: "6px 0 0",
              }}
            >
              É um chão, não um tecto: podem ficar mais.
            </p>
          </div>

          <div>
            <label style={rotulo} htmlFor="tarefa-notas">
              Notas (opcional)
            </label>
            <textarea
              id="tarefa-notas"
              rows={3}
              style={{ ...campo, resize: "vertical" }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            marginTop: "22px",
          }}
        >
          <button
            type="button"
            className="acao acao--neutra"
            onClick={onFechar}
            style={{ padding: "9px 16px", borderRadius: "10px", fontSize: "12.5px" }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="acao acao--ouro"
            disabled={aGuardar}
            style={{
              padding: "9px 18px",
              borderRadius: "10px",
              fontSize: "12.5px",
              opacity: aGuardar ? 0.6 : 1,
            }}
          >
            {aGuardar ? "A guardar…" : "Guardar"}
          </button>
        </div>
      </motion.form>
    </div>
  );
}
