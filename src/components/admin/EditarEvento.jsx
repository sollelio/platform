import { useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  getValorAtual,
  FIELD_MAP_INVERSO,
} from "../../lib/submissionFields";
import SeletorPaleta from "./SeletorPaleta";

// ============================================================
// EditarEvento — corrigir os dados do evento no sítio onde eles se
// leem: o separador Visão geral da página.
//
// Saiu do drawer com o redesenho. A regra: se a acção produz uma
// alteração que exige atenção — escrever, escolher, conferir — não
// pertence ao drawer. Corrigir uma hora de montagem obrigava a abrir o
// drawer e carregar em "Editar"; agora faz-se onde o valor está.
//
// Escreve nas DUAS fontes: no `respostas` (todos os campos do modelo)
// e, quando o campo tem coluna antiga equivalente, também na coluna —
// para não partir o Casamento nem os briefings.
// ============================================================

// O mapa partilhado mais uma entrada que só a edição precisa: um
// modelo pode ter um campo com id "dataEvento" sem o papel "data", e
// nesse caso a coluna data_evento tem de ser escrita à mesma. Fora
// daqui dataEvento não é um campo legado, por isso não entra no
// FIELD_MAP global, onde mudaria o getValorAtual de toda a gente.
const FIELD_MAP_EDICAO = { ...FIELD_MAP_INVERSO, dataEvento: "data_evento" };

export default function EditarEvento({
  submissao,
  seccoes,
  campoData,
  onSaved,
  onFechar,
}) {
  const [editData, setEditData] = useState(() => {
    const dados = {};
    for (const sec of seccoes) {
      for (const campo of sec.campos) {
        const v = getValorAtual(submissao, campo.id);
        // arrays (checkbox) ficam array; resto fica string
        dados[campo.id] = Array.isArray(v) ? v : (v ?? "");
      }
    }
    return dados;
  });
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    setSaving(true);

    // 1) novo respostas = respostas atual + edições (por id de campo)
    const novoRespostas = { ...(submissao.respostas || {}) };
    for (const [campoId, valor] of Object.entries(editData)) {
      novoRespostas[campoId] = valor;
    }

    // 2) montar o update: respostas + colunas antigas equivalentes
    const update = { respostas: novoRespostas };
    for (const [campoId, valor] of Object.entries(editData)) {
      const coluna = FIELD_MAP_EDICAO[campoId];
      if (coluna) update[coluna] = valor;
    }

    // 2b) o campo do modelo marcado com "papel: data" É a data do
    // evento, seja qual for o seu id (o modelo pode ter mais do que
    // uma data — entrega, ensaio, etc. — só essa conta).
    if (campoData && campoData.id in editData) {
      update.data_evento = editData[campoData.id] || null;
    }

    const { data, error } = await supabase
      .from("submissions")
      .update(update)
      .eq("id", submissao.id)
      .select()
      .single();

    setSaving(false);
    if (error) {
      console.error(error);
      alert("Erro ao guardar. Tenta novamente.");
      return;
    }
    if (onSaved) onSaved(data);
    if (onFechar) onFechar();
  };

  const cancelar = () => onFechar && onFechar();

  return (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "20px" }}
            >
              {seccoes.map((sec) => {
                if (sec.campos.length === 0) return null;
                return (
                  <div key={sec.titulo}>
                    <p
                      style={{
                        fontSize: "11px",
                        fontWeight: "600",
                        color: "var(--gold)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        borderBottom: "1px solid var(--gold-light)",
                        paddingBottom: "6px",
                        marginBottom: "12px",
                      }}
                    >
                      {sec.titulo}
                    </p>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                      }}
                    >
                      {sec.campos.map((campo) => (
                        <CampoEdicao
                          key={campo.id}
                          campo={campo}
                          valor={editData[campo.id]}
                          onChange={(v) =>
                            setEditData((prev) => ({ ...prev, [campo.id]: v }))
                          }
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

              <div style={{ display: "flex", gap: "10px", paddingTop: "8px" }}>
                <button
                  onClick={() => cancelar()}
                  style={{
                    flex: 1,
                    padding: "11px",
                    borderRadius: "10px",
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
                  onClick={guardar}
                  disabled={saving}
                  style={{
                    flex: 2,
                    padding: "11px",
                    borderRadius: "10px",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: saving ? "not-allowed" : "pointer",
                    backgroundColor: saving
                      ? "var(--gold-light)"
                      : "var(--gold)",
                    color: "white",
                    border: "none",
                    boxShadow: "0 4px 12px rgba(201,168,76,0.3)",
                  }}
                >
                  {saving ? "A guardar..." : "✓ Guardar alterações"}
                </button>
              </div>
            </div>
  );
}

function CampoEdicao({ campo, valor, onChange }) {
  const label = (
    <label
      style={{
        fontSize: "11px",
        color: "var(--gray-mid)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        display: "block",
        marginBottom: "4px",
      }}
    >
      {campo.label}
    </label>
  );

  const inputStyle = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "8px",
    border: "1.5px solid var(--gold-light)",
    fontSize: "13px",
    outline: "none",
    fontFamily: "Inter, sans-serif",
    boxSizing: "border-box",
  };

  // Paleta de cores (catálogo visual clicável)
  if (campo.type === "paleta") {
    return (
      <div>
        {label}
        <SeletorPaleta value={valor} onChange={onChange} compact />
      </div>
    );
  }

  // Morada (endereço partido nas partes que o compõem — ver src/lib/morada.js)
  if (campo.type === "morada") {
    const v = valor && typeof valor === "object" ? valor : {};
    const atualizar = (parte, val) => onChange({ ...v, [parte]: val });
    return (
      <div>
        {label}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", gap: "6px" }}>
            <input
              placeholder="Rua"
              value={v.rua || ""}
              onChange={(e) => atualizar("rua", e.target.value)}
              style={{ ...inputStyle, flex: 2 }}
            />
            <input
              placeholder="Nº porta"
              value={v.numero || ""}
              onChange={(e) => atualizar("numero", e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
          <input
            placeholder="Andar / Fração (opcional)"
            value={v.andar || ""}
            onChange={(e) => atualizar("andar", e.target.value)}
            style={inputStyle}
          />
          <div style={{ display: "flex", gap: "6px" }}>
            <input
              placeholder="Código postal"
              value={v.codigoPostal || ""}
              onChange={(e) => atualizar("codigoPostal", e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
            <input
              placeholder="Localidade"
              value={v.localidade || ""}
              onChange={(e) => atualizar("localidade", e.target.value)}
              style={{ ...inputStyle, flex: 2 }}
            />
          </div>
        </div>
      </div>
    );
  }

  // Campos de múltipla escolha (checkbox): lista de botões toggle
  if (campo.type === "checkbox" && Array.isArray(campo.options)) {
    const selecionados = Array.isArray(valor) ? valor : [];
    const toggle = (opt) => {
      if (selecionados.includes(opt)) {
        onChange(selecionados.filter((o) => o !== opt));
      } else {
        onChange([...selecionados, opt]);
      }
    };
    return (
      <div>
        {label}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {campo.options.map((opt) => {
            const ativo = selecionados.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  border: `1.5px solid ${ativo ? "var(--gold)" : "var(--gold-light)"}`,
                  backgroundColor: ativo ? "var(--gold)" : "white",
                  color: ativo ? "white" : "var(--gray-mid)",
                  cursor: "pointer",
                }}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Escolha única (radio/select)
  if (
    (campo.type === "radio" || campo.type === "select") &&
    Array.isArray(campo.options)
  ) {
    return (
      <div>
        {label}
        <select
          value={valor || ""}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        >
          <option value="">—</option>
          {campo.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Texto longo
  if (campo.type === "textarea") {
    return (
      <div>
        {label}
        <textarea
          rows={2}
          value={valor || ""}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, resize: "none" }}
        />
      </div>
    );
  }

  // Input simples (text, tel, email, number, date, time...)
  return (
    <div>
      {label}
      <input
        type={campo.type || "text"}
        value={valor || ""}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    </div>
  );
}
