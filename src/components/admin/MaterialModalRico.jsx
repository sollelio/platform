import { useState } from "react";
import { CATEGORIAS_ORDEM, uploadImagemMaterial } from "../../lib/materiais";

// ============================================================
// MaterialModalRico — criar/editar um material do inventário rico.
// Campos em três secções: Identificação, Quantidades, Notas.
// O "nome" é gerado das dimensões (grupo tipo cor medida) ao guardar —
// a Nádia não o escreve.
// ============================================================

const UNIDADES = ["un", "par", "conj", "mt", "kg", "cx"];

// Gera o nome legível a partir das dimensões preenchidas.
const gerarNome = ({ categoria, tipo, cor, medida }) => {
  const partes = [categoria, tipo, cor, medida]
    .map((p) => (p || "").trim())
    .filter(Boolean);
  return partes.join(" ") || (categoria || "Material").trim();
};

export default function MaterialModalRico({
  inicial,
  gruposExistentes = [],
  onCancel,
  onGuardar,
  onRemover,
}) {
  const ehNovo = !inicial?.id;

  // Identificação
  const [codigo, setCodigo] = useState(inicial?.codigo || "");
  const [categoria, setCategoria] = useState(inicial?.categoria || "");
  const [tipo, setTipo] = useState(inicial?.tipo || "");
  const [cor, setCor] = useState(inicial?.cor || "");
  const [medida, setMedida] = useState(inicial?.medida || "");
  const [unidade, setUnidade] = useState(inicial?.unidade || "un");

  // Quantidades
  const [quantidadeTotal, setQuantidadeTotal] = useState(
    inicial?.quantidade_total ?? 0,
  );
  const [emHigienizacao, setEmHigienizacao] = useState(
    inicial?.em_higienizacao ?? 0,
  );
  const [porConfirmar, setPorConfirmar] = useState(inicial?.por_confirmar ?? 0);
  const [stockIdeal, setStockIdeal] = useState(inicial?.stock_ideal ?? "");

  // Listas por defeito
  const [defCarga, setDefCarga] = useState(inicial?.def_carga ?? true);
  const [defMontagem, setDefMontagem] = useState(inicial?.def_montagem ?? true);
  const [defHigienizacao, setDefHigienizacao] = useState(
    inicial?.def_higienizacao ?? false,
  );

  // Notas
  const [notas, setNotas] = useState(inicial?.notas || "");

  // Imagem
  const [imagemUrl, setImagemUrl] = useState(inicial?.imagem_url || "");
  const [aEnviarImagem, setAEnviarImagem] = useState(false);
  const [erroImagem, setErroImagem] = useState(null);

  const [guardando, setGuardando] = useState(false);
  const [erro, setErro] = useState(null);
  const [confirmarRemover, setConfirmarRemover] = useState(false);
  const [removendo, setRemovendo] = useState(false);

  const escolherImagem = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reescolher o mesmo ficheiro
    if (!file) return;
    setErroImagem(null);
    setAEnviarImagem(true);
    try {
      const url = await uploadImagemMaterial(
        { codigo: codigo.trim() || null, id: inicial?.id },
        file,
      );
      setImagemUrl(url);
    } catch (err) {
      console.error(err);
      setErroImagem(
        "Não foi possível carregar a imagem. Tenta novamente ou usa outra foto.",
      );
    }
    setAEnviarImagem(false);
  };

  // Sugestões de grupo: os que já existem + os canónicos, sem repetir
  const gruposSugeridos = Array.from(
    new Set([...gruposExistentes, ...CATEGORIAS_ORDEM]),
  );

  const num = (v) => Math.max(0, Math.round(Number(v) || 0));

  const guardar = async () => {
    if (!categoria.trim()) {
      setErro("O grupo é obrigatório.");
      return;
    }
    setGuardando(true);
    setErro(null);
    const dados = {
      codigo: codigo.trim() || null,
      categoria: categoria.trim(),
      tipo: tipo.trim() || null,
      cor: cor.trim() || null,
      medida: medida.trim() || null,
      unidade,
      quantidade_total: num(quantidadeTotal),
      em_higienizacao: num(emHigienizacao),
      por_confirmar: num(porConfirmar),
      stock_ideal:
        stockIdeal === "" || stockIdeal == null ? null : num(stockIdeal),
      notas: notas.trim() || null,
      imagem_url: imagemUrl || null,
      def_carga: defCarga,
      def_montagem: defMontagem,
      def_higienizacao: defHigienizacao,
    };
    dados.nome = gerarNome(dados);
    try {
      await onGuardar(dados);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível guardar. Tenta novamente.");
      setGuardando(false);
    }
  };

  // Pré-visualização do nome gerado
  const nomePreview = gerarNome({ categoria, tipo, cor, medida });

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 150,
        backgroundColor: "var(--cortina)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--superficie)",
          borderRadius: "16px",
          padding: "24px",
          maxWidth: "460px",
          width: "100%",
          boxShadow: "0 8px 48px rgba(0,0,0,0.15)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h3
          style={{
            fontSize: "16px",
            color: "var(--charcoal)",
            margin: "0 0 4px 0",
            fontFamily: "Playfair Display, serif",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {ehNovo ? "Novo material" : "Editar material"}
        </h3>
        {/* Pré-visualização do nome gerado */}
        <p
          style={{
            fontSize: "12px",
            color: "var(--gold-dark)",
            margin: "0 0 18px 0",
            minHeight: "16px",
          }}
        >
          {nomePreview}
        </p>

        {/* ===== SECÇÃO: IMAGEM ===== */}
        <Seccao titulo="Imagem" />
        <div
          style={{
            display: "flex",
            gap: "14px",
            alignItems: "center",
            marginBottom: "18px",
          }}
        >
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "12px",
              backgroundColor: "var(--superficie-quente)",
              border: "1px solid var(--gold-light)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            {imagemUrl ? (
              <img
                src={imagemUrl}
                alt="material"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span
                style={{
                  fontFamily: "Playfair Display, serif",
                  fontSize: "24px",
                  color: "var(--gold)",
                }}
              >
                {(categoria || "?").trim().charAt(0).toUpperCase() || "?"}
              </span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <label
              style={{
                display: "inline-block",
                padding: "8px 16px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: "600",
                border: "1.5px solid var(--gold)",
                color: aEnviarImagem ? "var(--gray-mid)" : "var(--gold)",
                backgroundColor: "var(--superficie)",
                cursor: aEnviarImagem ? "wait" : "pointer",
              }}
            >
              {aEnviarImagem
                ? "A carregar..."
                : imagemUrl
                  ? "Trocar imagem"
                  : "Carregar imagem"}
              <input
                type="file"
                accept="image/*"
                onChange={escolherImagem}
                disabled={aEnviarImagem}
                style={{ display: "none" }}
              />
            </label>
            {imagemUrl && !aEnviarImagem && (
              <button
                type="button"
                onClick={() => setImagemUrl("")}
                style={{
                  marginLeft: "8px",
                  background: "none",
                  border: "none",
                  color: "var(--gray-mid)",
                  fontSize: "12px",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                remover
              </button>
            )}
            {erroImagem && (
              <p
                style={{
                  fontSize: "11px",
                  color: "var(--perigo)",
                  margin: "6px 0 0 0",
                }}
              >
                {erroImagem}
              </p>
            )}
          </div>
        </div>

        {/* ===== SECÇÃO: IDENTIFICAÇÃO ===== */}
        <Seccao titulo="Identificação" />

        <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
          <div style={{ flex: "0 0 40%" }}>
            <label style={labelStyle}>Código</label>
            <input
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="ex: CP001"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Grupo *</label>
            <input
              type="text"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="ex: Copos"
              list="grupos-sugeridos"
              style={inputStyle}
            />
            <datalist id="grupos-sugeridos">
              {gruposSugeridos.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Tipo</label>
            <input
              type="text"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              placeholder="ex: Vinho"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Cor</label>
            <input
              type="text"
              value={cor}
              onChange={(e) => setCor(e.target.value)}
              placeholder="ex: Transparente"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", marginBottom: "18px" }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Medida / detalhe</label>
            <input
              type="text"
              value={medida}
              onChange={(e) => setMedida(e.target.value)}
              placeholder="ex: Diamante"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: "0 0 30%" }}>
            <label style={labelStyle}>Unidade</label>
            <select
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
              style={inputStyle}
            >
              {UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ===== SECÇÃO: QUANTIDADES ===== */}
        <Seccao titulo="Quantidades" />

        <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Total</label>
            <input
              type="number"
              min="0"
              value={quantidadeTotal}
              onChange={(e) => setQuantidadeTotal(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Stock ideal</label>
            <input
              type="number"
              min="0"
              value={stockIdeal}
              onChange={(e) => setStockIdeal(e.target.value)}
              placeholder="—"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", marginBottom: "8px" }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Na higienização</label>
            <input
              type="number"
              min="0"
              value={emHigienizacao}
              onChange={(e) => setEmHigienizacao(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Por confirmar</label>
            <input
              type="number"
              min="0"
              value={porConfirmar}
              onChange={(e) => setPorConfirmar(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
        <p
          style={{
            fontSize: "11px",
            color: "var(--gray-mid)",
            margin: "0 0 18px 0",
            lineHeight: 1.5,
          }}
        >
          Disponível ={" "}
          <strong>
            {num(quantidadeTotal) - num(emHigienizacao) - num(porConfirmar)}
          </strong>{" "}
          (total menos higienização e por confirmar).
        </p>

        {/* ===== SECÇÃO: LISTAS POR DEFEITO ===== */}
        <Seccao titulo="Listas por defeito" />
        <p
          style={{
            fontSize: "11px",
            color: "var(--gray-mid)",
            margin: "0 0 10px 0",
            lineHeight: 1.5,
          }}
        >
          Em que listas esta peça entra quando a adicionas a um evento.
        </p>
        <CheckLinha label="Carga" checked={defCarga} onChange={setDefCarga} />
        <CheckLinha
          label="Montagem"
          checked={defMontagem}
          onChange={setDefMontagem}
        />
        <CheckLinha
          label="Higienização"
          checked={defHigienizacao}
          onChange={setDefHigienizacao}
        />

        {/* ===== SECÇÃO: NOTAS ===== */}
        <div style={{ marginTop: "18px" }}>
          <Seccao titulo="Notas" />
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Observações sobre esta peça..."
            rows={2}
            style={{ ...inputStyle, resize: "vertical", minHeight: "56px" }}
          />
        </div>

        {erro && (
          <p
            style={{
              fontSize: "12px",
              color: "var(--perigo)",
              backgroundColor: "var(--perigo-fundo)",
              border: "1px solid var(--perigo-borda)",
              borderRadius: "8px",
              padding: "10px 14px",
              margin: "16px 0 0 0",
            }}
          >
            ⚠ {erro}
          </p>
        )}

        <div
          style={{
            display: "flex",
            gap: "10px",
            justifyContent: ehNovo ? "flex-end" : "space-between",
            alignItems: "center",
            marginTop: "20px",
            flexWrap: "wrap",
          }}
        >
          {/* Remover do inventário (só para materiais existentes) */}
          {!ehNovo &&
            (confirmarRemover ? (
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: "12px", color: "var(--charcoal)" }}>
                  Remover?
                </span>
                <button
                  onClick={async () => {
                    setRemovendo(true);
                    try {
                      await onRemover();
                    } catch (e) {
                      console.error(e);
                      setRemovendo(false);
                      setConfirmarRemover(false);
                    }
                  }}
                  disabled={removendo}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: "600",
                    border: "none",
                    // Par literal: #DC2626 é o valor de --perigo, mas o
                    // papel é botão CHEIO — no escuro esse token é salmão
                    // de texto e a letra branca deixava de se ler. O cheio
                    // da identidade é --perigo-cheio (#EF4444), outro
                    // valor; não se aproxima e segue no relatório.
                    backgroundColor: "#DC2626",
                    color: "white",
                    cursor: removendo ? "not-allowed" : "pointer",
                  }}
                >
                  {removendo ? "A remover..." : "Sim, remover"}
                </button>
                <button
                  onClick={() => setConfirmarRemover(false)}
                  disabled={removendo}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    border: "1.5px solid var(--gold-light)",
                    color: "var(--gray-mid)",
                    backgroundColor: "var(--superficie)",
                    cursor: "pointer",
                  }}
                >
                  Não
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmarRemover(true)}
                style={{
                  padding: "10px 16px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  // O rosa #F0D0D0 não é a --perigo-borda (#FECACA) nem
                  // outro token — fica literal e segue no relatório.
                  border: "1.5px solid #F0D0D0",
                  color: "var(--perigo)",
                  backgroundColor: "var(--superficie)",
                  cursor: "pointer",
                }}
              >
                Remover do inventário
              </button>
            ))}

          <div style={{ display: "flex", gap: "10px", marginLeft: "auto" }}>
            <button
              onClick={onCancel}
              style={{
                padding: "10px 20px",
                borderRadius: "8px",
                fontSize: "13px",
                border: "1.5px solid var(--gold-light)",
                color: "var(--gray-mid)",
                backgroundColor: "var(--superficie)",
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={guardando}
              style={{
                padding: "10px 24px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "600",
                border: "none",
                // O ouro pálido do «A guardar…» fica literal (mesma razão
                // do login e do painel de formulários): o token equivalente
                // no escuro é tom de borda, e um botão a meio do gesto não
                // se apaga.
                backgroundColor: guardando ? "#E8D5A3" : "var(--gold)",
                color: "var(--texto-sobre-ouro)",
                cursor: guardando ? "not-allowed" : "pointer",
              }}
            >
              {guardando ? "A guardar..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Cabeçalho de secção
function Seccao({ titulo }) {
  return (
    <p
      style={{
        fontSize: "10px",
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: "var(--gold-dark)",
        margin: "0 0 10px 0",
        paddingBottom: "6px",
        borderBottom: "1px solid var(--gold-light)",
      }}
    >
      {titulo}
    </p>
  );
}

function CheckLinha({ label, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "9px 12px",
        marginBottom: "6px",
        borderRadius: "10px",
        border: `1.5px solid ${checked ? "var(--gold)" : "var(--gold-light)"}`,
        backgroundColor: checked
          ? "var(--superficie-selo)"
          : "var(--superficie)",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span
        style={{
          width: "18px",
          height: "18px",
          borderRadius: "6px",
          border: `1.5px solid ${checked ? "var(--gold)" : "var(--gold-light)"}`,
          backgroundColor: checked ? "var(--gold)" : "var(--superficie)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          // o ✓ só aparece com o fundo dourado cheio
          color: "var(--texto-sobre-ouro)",
          fontSize: "11px",
        }}
      >
        {checked ? "✓" : ""}
      </span>
      <span style={{ fontSize: "13px", color: "var(--charcoal)" }}>
        {label}
      </span>
    </button>
  );
}

const labelStyle = {
  fontSize: "11px",
  fontWeight: "600",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--charcoal)",
  display: "block",
  marginBottom: "5px",
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
  backgroundColor: "var(--superficie)",
};
