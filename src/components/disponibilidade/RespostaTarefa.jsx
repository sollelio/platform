import { useState } from "react";
import {
  ESTADOS_RESPOSTA,
  mensagemDaRecusa,
  responderTarefa,
} from "../../lib/consultas";

// ============================================================
// UMA PERGUNTA.
//
// Cada tarefa compatível é uma pergunta com três respostas. «Posso» e
// «Não posso» guardam-se ao toque — um toque, uma resposta gravada,
// sem botão de confirmar e sem ter de chegar ao fim da folha.
//
// «Só parte do tempo» abre uma janela: a partir de que horas, até que
// horas, ou as duas. Basta UM dos lados — «só depois das 22h» é uma
// resposta inteira. E é uma janela a sério, com horas, não uma frase:
// quem depois montar a escala tem de conseguir contar com ela.
//
// A nota fica para o que é mesmo prosa, e nunca substitui a janela.
//
// Alvos de toque de 44px: isto lê-se ao telemóvel, de pé, muitas vezes
// entre serviços.
// ============================================================

const cor = {
  available: "#2E7D32",
  partial: "#B8860B",
  unavailable: "#B3261E",
};

const campo = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: "10px",
  border: "1px solid #E6DFD3",
  backgroundColor: "#FFFFFF",
  color: "#1A1A1A",
  fontSize: "16px",
  boxSizing: "border-box",
};

const rotulo = {
  display: "block",
  fontSize: "10.5px",
  color: "#8A8A8A",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: "4px",
};

// <input type="datetime-local"> quer «YYYY-MM-DDTHH:mm» na hora local.
const paraCampo = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const horaCurta = (iso) =>
  iso
    ? new Date(iso).toLocaleString("pt-PT", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

export default function RespostaTarefa({ token, tarefa, quando, onGuardada }) {
  const guardada = tarefa.resposta ?? null;
  const [aAbrirJanela, setAAbrirJanela] = useState(false);
  const [de, setDe] = useState(paraCampo(guardada?.de));
  const [ate, setAte] = useState(paraCampo(guardada?.ate));
  const [nota, setNota] = useState(guardada?.nota ?? "");
  const [aGuardar, setAGuardar] = useState(null);
  const [erro, setErro] = useState(null);
  const [acabouDeGuardar, setAcabouDeGuardar] = useState(false);

  const guardar = async (estado, janela) => {
    setErro(null);
    setAGuardar(estado);
    try {
      const r = await responderTarefa({
        token,
        eventTaskId: tarefa.id,
        estado,
        de: janela?.de ? new Date(janela.de).toISOString() : null,
        ate: janela?.ate ? new Date(janela.ate).toISOString() : null,
        nota: janela?.nota ?? null,
      });
      // A porta pode ter fechado entre a pintura e o toque.
      if (r?.estado === "terminado") {
        onGuardada(null, true);
        return;
      }
      onGuardada(r?.resposta ?? null, false);
      setAAbrirJanela(false);
      setAcabouDeGuardar(true);
      setTimeout(() => setAcabouDeGuardar(false), 2000);
    } catch (e) {
      console.error(e);
      setErro(mensagemDaRecusa(e));
    } finally {
      setAGuardar(null);
    }
  };

  const escolher = (estado) => {
    if (estado === "partial") {
      setAAbrirJanela(true);
      setErro(null);
      return;
    }
    guardar(estado, null);
  };

  const guardarJanela = () => {
    if (!de && !ate) {
      setErro("Diz a partir de que horas podes, até que horas, ou as duas.");
      return;
    }
    if (de && ate && new Date(ate) < new Date(de)) {
      setErro("A hora de fim é anterior à de início.");
      return;
    }
    guardar("partial", { de, ate, nota });
  };

  return (
    <div
      style={{
        borderTop: "1px solid #F0EBE2",
        paddingTop: "14px",
        marginTop: "14px",
      }}
    >
      <p style={{ fontSize: "14.5px", margin: "0 0 3px", fontWeight: 500 }}>
        {tarefa.titulo}
      </p>
      <p style={{ fontSize: "12.5px", color: "#6B6B6B", margin: "0 0 10px" }}>
        {quando} · {tarefa.funcao}
        {tarefa.area ? ` (${tarefa.area})` : ""}
        {tarefa.minimo > 1 ? ` · precisam de ${tarefa.minimo}` : ""}
      </p>

      <div
        role="group"
        aria-label={`A tua resposta para ${tarefa.titulo}`}
        style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}
      >
        {ESTADOS_RESPOSTA.map((op) => {
          const activa = guardada?.estado === op.id;
          const ocupada = aGuardar === op.id;
          return (
            <button
              key={op.id}
              type="button"
              aria-pressed={activa}
              disabled={Boolean(aGuardar)}
              onClick={() => escolher(op.id)}
              style={{
                flex: "1 1 auto",
                minWidth: "96px",
                minHeight: "44px",
                padding: "10px 14px",
                borderRadius: "999px",
                fontSize: "13px",
                fontWeight: activa ? 600 : 500,
                cursor: aGuardar ? "default" : "pointer",
                border: `1.5px solid ${activa ? cor[op.id] : "#E6DFD3"}`,
                backgroundColor: activa ? `${cor[op.id]}14` : "#FFFFFF",
                color: activa ? cor[op.id] : "#6B6B6B",
                opacity: ocupada ? 0.55 : 1,
                transition: "all 0.15s",
              }}
            >
              {activa ? "✓ " : ""}
              {ocupada ? "A guardar…" : op.label}
            </button>
          );
        })}
      </div>

      {guardada?.estado === "partial" && !aAbrirJanela && (
        <p style={{ fontSize: "12.5px", color: cor.partial, margin: "8px 0 0" }}>
          {guardada.de ? `A partir de ${horaCurta(guardada.de)}` : ""}
          {guardada.de && guardada.ate ? " · " : ""}
          {guardada.ate ? `Até ${horaCurta(guardada.ate)}` : ""}
          {guardada.nota ? ` — ${guardada.nota}` : ""}{" "}
          <button
            type="button"
            onClick={() => setAAbrirJanela(true)}
            style={{
              border: "none",
              background: "none",
              color: cor.partial,
              textDecoration: "underline",
              cursor: "pointer",
              fontSize: "12.5px",
              padding: 0,
            }}
          >
            alterar
          </button>
        </p>
      )}

      {aAbrirJanela && (
        <div
          style={{
            marginTop: "12px",
            padding: "14px",
            borderRadius: "12px",
            backgroundColor: "#FBF8F3",
            border: "1px solid #EDE6DA",
          }}
        >
          <p
            style={{ fontSize: "12.5px", color: "#6B6B6B", margin: "0 0 12px" }}
          >
            Chega preencher só um dos lados.
          </p>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 150px" }}>
              <label style={rotulo} htmlFor={`de-${tarefa.id}`}>
                A partir de
              </label>
              <input
                id={`de-${tarefa.id}`}
                type="datetime-local"
                style={campo}
                value={de}
                onChange={(e) => setDe(e.target.value)}
              />
            </div>
            <div style={{ flex: "1 1 150px" }}>
              <label style={rotulo} htmlFor={`ate-${tarefa.id}`}>
                Até
              </label>
              <input
                id={`ate-${tarefa.id}`}
                type="datetime-local"
                style={campo}
                value={ate}
                onChange={(e) => setAte(e.target.value)}
              />
            </div>
          </div>
          <div style={{ marginTop: "10px" }}>
            <label style={rotulo} htmlFor={`nota-${tarefa.id}`}>
              Nota (opcional)
            </label>
            <input
              id={`nota-${tarefa.id}`}
              maxLength={280}
              style={campo}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Chego do outro serviço"
            />
          </div>
          <div
            style={{
              display: "flex",
              gap: "8px",
              justifyContent: "flex-end",
              marginTop: "12px",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setAAbrirJanela(false);
                setErro(null);
                setDe(paraCampo(guardada?.de));
                setAte(paraCampo(guardada?.ate));
                setNota(guardada?.nota ?? "");
              }}
              style={{
                minHeight: "44px",
                padding: "8px 16px",
                borderRadius: "999px",
                border: "1px solid #E6DFD3",
                backgroundColor: "transparent",
                color: "#6B6B6B",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={Boolean(aGuardar)}
              onClick={guardarJanela}
              style={{
                minHeight: "44px",
                padding: "8px 18px",
                borderRadius: "999px",
                border: "none",
                backgroundColor: cor.partial,
                color: "#FFFFFF",
                fontSize: "13px",
                fontWeight: 600,
                cursor: aGuardar ? "default" : "pointer",
                opacity: aGuardar ? 0.6 : 1,
              }}
            >
              {aGuardar ? "A guardar…" : "Guardar"}
            </button>
          </div>
        </div>
      )}

      {erro && (
        <p
          role="alert"
          style={{ fontSize: "12.5px", color: "#B3261E", margin: "8px 0 0" }}
        >
          ⚠ {erro}
        </p>
      )}
      {acabouDeGuardar && !erro && (
        <p style={{ fontSize: "12px", color: cor.available, margin: "8px 0 0" }}>
          ✓ Guardado
        </p>
      )}
    </div>
  );
}
