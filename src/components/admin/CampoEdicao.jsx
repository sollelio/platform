import SeletorPaleta from "./SeletorPaleta";

// ============================================================
// CampoEdicao — o editor de UM campo do modelo, por tipo (paleta,
// morada, checkbox, escolha única, texto longo, input simples).
//
// Vive sozinho desde que a edição deixou de ser um modo à parte e
// passou a acontecer no lugar, dentro da Visão geral: cada campo
// corrige-se onde se lê. É a diferença entre um relatório e uma
// ferramenta.
// ============================================================

export default function CampoEdicao({ campo, valor, onChange }) {
  // Sem etiqueta própria: quem chama (o Campo, na Visão geral) já
  // escreveu a etiqueta por cima do valor e mantém-na no lugar ao
  // passar para edição — é isso que faz o campo corrigir-se SEM a
  // linha saltar. Uma etiqueta aqui aparecia a seguir à outra.
  const label = null;

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
              className="caixa-texto"
              style={{ ...inputStyle, flex: 2 }}
            />
            <input
              placeholder="Nº porta"
              value={v.numero || ""}
              onChange={(e) => atualizar("numero", e.target.value)}
              className="caixa-texto"
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
          <input
            placeholder="Andar / Fração (opcional)"
            value={v.andar || ""}
            onChange={(e) => atualizar("andar", e.target.value)}
            className="caixa-texto"
            style={inputStyle}
          />
          <div style={{ display: "flex", gap: "6px" }}>
            <input
              placeholder="Código postal"
              value={v.codigoPostal || ""}
              onChange={(e) => atualizar("codigoPostal", e.target.value)}
              className="caixa-texto"
              style={{ ...inputStyle, flex: 1 }}
            />
            <input
              placeholder="Localidade"
              value={v.localidade || ""}
              onChange={(e) => atualizar("localidade", e.target.value)}
              className="caixa-texto"
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
                className={`pastilha-escolha${
                  ativo ? " pastilha-escolha--activa" : ""
                }`}
                style={{
                  padding: "6px 12px",
                  borderRadius: "999px",
                  fontSize: "12px",
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
          className="caixa-texto"
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
          placeholder={campo.placeholder || ""}
          onChange={(e) => onChange(e.target.value)}
          className="caixa-texto"
          style={{ ...inputStyle, resize: "none" }}
        />
      </div>
    );
  }

  // Input simples (text, tel, email, number, date, time...)
  // O placeholder do modelo vale sobretudo no modo de edição, onde
  // aparecem os campos que ainda ninguém respondeu: é a única pista do
  // que lá se espera ver escrito.
  return (
    <div>
      {label}
      <input
        type={campo.type || "text"}
        value={valor || ""}
        placeholder={campo.placeholder || ""}
        onChange={(e) => onChange(e.target.value)}
        className="caixa-texto"
        style={inputStyle}
      />
    </div>
  );
}
