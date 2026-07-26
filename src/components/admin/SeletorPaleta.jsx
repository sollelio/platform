import { useState } from "react";
import {
  COR_NEUTRA,
  GRUPOS_PALETA,
  corTextoSobre,
  hexDaCor,
} from "../../lib/paletaCores";

// ============================================================
// SeletorPaleta — grelha de cores clicáveis (dois grupos) +
// cores personalizadas via color picker.
//
// FORMATO DO VALOR: array de objetos { nome, hex }.
// Retrocompatível: aceita também o formato antigo (array de strings
// de nomes) e normaliza-o — o hex vem do catálogo, ou fica neutro
// se for um nome antigo fora do catálogo.
//
// Props:
//   value      — array de {nome,hex} OU array de strings (antigo)
//   onChange(novoArray)  — devolve sempre array de {nome,hex}
//   compact    — amostras mais pequenas (drawer estreito)
//   extras     — cores personalizadas a mostrar mesmo por escolher.
//                É para a ficha de materiais: inventa-se "Verde Tiffany"
//                numa linha e quer-se a mesma nas cinco seguintes, sem
//                a voltar a misturar no color picker.
// ============================================================

// Normaliza qualquer formato de valor para array de { nome, hex }.
export function normalizarCores(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") {
        // formato antigo: só o nome
        return { nome: item, hex: hexDaCor(item) || COR_NEUTRA };
      }
      if (item && typeof item === "object" && item.nome) {
        return {
          nome: item.nome,
          hex: item.hex || hexDaCor(item.nome) || COR_NEUTRA,
        };
      }
      return null;
    })
    .filter(Boolean);
}

export default function SeletorPaleta({
  value,
  onChange,
  compact = false,
  extras = [],
}) {
  const selecionadas = normalizarCores(value);
  const [mostrarPicker, setMostrarPicker] = useState(false);
  const [corTemp, setCorTemp] = useState("#C9A84C");
  const [nomeTemp, setNomeTemp] = useState("");

  const estaSelecionada = (nome) =>
    selecionadas.some((c) => c.nome.toLowerCase() === nome.toLowerCase());

  const toggle = (cor) => {
    if (estaSelecionada(cor.nome)) {
      onChange(
        selecionadas.filter(
          (c) => c.nome.toLowerCase() !== cor.nome.toLowerCase(),
        ),
      );
    } else {
      onChange([...selecionadas, { nome: cor.nome, hex: cor.hex }]);
    }
  };

  const adicionarPersonalizada = () => {
    const nome = nomeTemp.trim() || corTemp; // se não der nome, usa o hex
    if (estaSelecionada(nome)) {
      // já existe uma com esse nome — não duplica
      setMostrarPicker(false);
      setNomeTemp("");
      return;
    }
    onChange([...selecionadas, { nome, hex: corTemp }]);
    setNomeTemp("");
    setMostrarPicker(false);
  };

  const amostra = compact ? 30 : 40;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {GRUPOS_PALETA.map((grupo) => (
        <div key={grupo.titulo}>
          <p style={grupoTituloStyle}>{grupo.titulo}</p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: compact ? "6px" : "8px",
            }}
          >
            {grupo.cores.map((cor) => {
              const ativo = estaSelecionada(cor.nome);
              return (
                <BolaCor
                  key={cor.nome}
                  cor={cor}
                  ativo={ativo}
                  amostra={amostra}
                  compact={compact}
                  onClick={() => toggle(cor)}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* Cores fora do catálogo: as escolhidas aqui e as que já andam
          pela ficha (extras). Clicam-se como as outras — a diferença é
          só de onde vieram. */}
      {(() => {
        const nomesCatalogo = new Set(
          GRUPOS_PALETA.flatMap((g) =>
            g.cores.map((c) => c.nome.toLowerCase()),
          ),
        );
        const personalizadas = [];
        const vistas = new Set();
        for (const cor of [...selecionadas, ...normalizarCores(extras)]) {
          const chave = cor.nome.toLowerCase();
          if (nomesCatalogo.has(chave) || vistas.has(chave)) continue;
          vistas.add(chave);
          personalizadas.push(cor);
        }
        if (personalizadas.length === 0) return null;
        return (
          <div>
            <p style={grupoTituloStyle}>Personalizadas</p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: compact ? "6px" : "8px",
              }}
            >
              {personalizadas.map((cor) => (
                <BolaCor
                  key={cor.nome}
                  cor={cor}
                  ativo={estaSelecionada(cor.nome)}
                  amostra={amostra}
                  compact={compact}
                  onClick={() => toggle(cor)}
                />
              ))}
            </div>
          </div>
        );
      })()}

      {/* Botão + Cor personalizada */}
      {!mostrarPicker ? (
        <button
          type="button"
          onClick={() => setMostrarPicker(true)}
          style={{
            alignSelf: "flex-start",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 14px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: "600",
            border: "1.5px dashed var(--gold-light)",
            backgroundColor: "#FBF7EF",
            color: "var(--gold)",
            cursor: "pointer",
          }}
        >
          + Cor personalizada
        </button>
      ) : (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "10px",
            padding: "12px",
            borderRadius: "12px",
            border: "1.5px solid var(--gold-light)",
            backgroundColor: "#FBF7EF",
          }}
        >
          <input
            type="color"
            value={corTemp}
            onChange={(e) => setCorTemp(e.target.value)}
            style={{
              width: "44px",
              height: "44px",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              background: "none",
              padding: 0,
            }}
          />
          <input
            type="text"
            value={nomeTemp}
            onChange={(e) => setNomeTemp(e.target.value)}
            placeholder="Nome da cor (ex: Verde Tiffany)"
            style={{
              flex: "1 1 160px",
              padding: "9px 12px",
              borderRadius: "8px",
              border: "1.5px solid var(--gold-light)",
              fontSize: "13px",
              outline: "none",
              fontFamily: "Inter, sans-serif",
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              onClick={adicionarPersonalizada}
              style={{
                padding: "9px 16px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: "600",
                border: "none",
                backgroundColor: "var(--gold)",
                color: "white",
                cursor: "pointer",
              }}
            >
              Adicionar
            </button>
            <button
              type="button"
              onClick={() => {
                setMostrarPicker(false);
                setNomeTemp("");
              }}
              style={{
                padding: "9px 14px",
                borderRadius: "8px",
                fontSize: "12px",
                border: "1.5px solid var(--gold-light)",
                backgroundColor: "white",
                color: "var(--gray-mid)",
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Resumo das cores escolhidas */}
      {selecionadas.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
            paddingTop: "4px",
            borderTop: "1px solid var(--gold-light)",
          }}
        >
          <span style={{ fontSize: "11px", color: "var(--gray-mid)" }}>
            Escolhidas:
          </span>
          <span
            style={{
              fontSize: "12px",
              color: "var(--charcoal)",
              fontWeight: "500",
            }}
          >
            {selecionadas.map((c) => c.nome).join(", ")}
          </span>
        </div>
      )}
    </div>
  );
}

// Bola de cor individual (amostra + nome)
function BolaCor({ cor, ativo, amostra, compact, onClick }) {
  const corTexto = corTextoSobre(cor.hex);
  const ehBranco = String(cor.hex).toUpperCase() === "#FFFFFF";
  return (
    <button
      type="button"
      onClick={onClick}
      title={cor.nome}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
        border: "none",
        background: "none",
        cursor: "pointer",
        padding: 0,
        width: compact ? "52px" : "64px",
      }}
    >
      <span
        style={{
          width: `${amostra}px`,
          height: `${amostra}px`,
          borderRadius: "50%",
          backgroundColor: cor.hex,
          border: ehBranco
            ? "1.5px solid var(--gold-light)"
            : "1.5px solid rgba(0,0,0,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: ativo ? "0 0 0 3px var(--gold)" : "none",
          transition: "box-shadow 0.15s",
        }}
      >
        {ativo && (
          <svg
            width={compact ? "14" : "18"}
            height={compact ? "14" : "18"}
            viewBox="0 0 24 24"
            fill="none"
            stroke={corTexto}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </span>
      <span
        style={{
          fontSize: "9px",
          color: ativo ? "var(--charcoal)" : "var(--gray-mid)",
          fontWeight: ativo ? "600" : "400",
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        {cor.nome}
      </span>
    </button>
  );
}

const grupoTituloStyle = {
  fontSize: "10px",
  fontWeight: "600",
  color: "var(--gray-mid)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  margin: "0 0 8px 0",
};

// ============================================================
// AmostraPaleta — versão só-leitura (drawer/briefing).
// Aceita os dois formatos (strings antigas ou {nome,hex}).
// ============================================================
export function AmostraPaleta({ value }) {
  const cores = normalizarCores(value);
  if (cores.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        alignItems: "center",
      }}
    >
      {cores.map((cor) => {
        const ehBranco = String(cor.hex).toUpperCase() === "#FFFFFF";
        return (
          <div
            key={cor.nome}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "3px 10px 3px 4px",
              borderRadius: "999px",
              border: "1px solid var(--gold-light)",
              backgroundColor: "white",
            }}
          >
            <span
              style={{
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                backgroundColor: cor.hex,
                border: ehBranco
                  ? "1px solid var(--gold-light)"
                  : "1px solid rgba(0,0,0,0.08)",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: "12px", color: "var(--charcoal)" }}>
              {cor.nome}
            </span>
          </div>
        );
      })}
    </div>
  );
}
