import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Icone } from "./Navegacao";
import { formatarEuros } from "./orcamentos/orcamentoConfig";
import { calcularDeslocacao, TROCOS_PADRAO } from "../../lib/deslocacaoRegra";
import { obterDistancia } from "../../lib/obterDistancia";

// ============================================================
// ConsultaDeslocacao — o popover "Consulta rápida" da página Início.
// A Nádia usa isto ao telefone: o cliente diz uma morada, ela escreve,
// lê o € em voz alta. Descartável — não guarda nada, não cria evento,
// remonta sempre em branco (o próprio InicioTab só monta este
// componente enquanto o popover está aberto).
//
// Reutiliza a MESMA regra de negócio e a MESMA função de distância do
// painel de deslocação do orçamento (deslocacaoRegra.js,
// obterDistancia.js) — zero lógica duplicada, só a embalagem é nova.
// Sem isenção aqui (não faz sentido "oferecer" numa simples consulta).
// ============================================================

const EASE = [0.22, 1, 0.36, 1];

const formatKm = (n) => {
  const arredondado = Math.round(n * 10) / 10;
  return Number.isInteger(arredondado) ? String(arredondado) : arredondado.toFixed(1);
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

const miniLabel = {
  fontSize: "10.5px",
  fontWeight: "600",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--charcoal)",
  display: "block",
  marginBottom: "5px",
};

export default function ConsultaDeslocacao({ onFechar }) {
  const [morada, setMorada] = useState("");
  const [distancia, setDistancia] = useState(""); // string do input; "" = sem valor
  const [origem, setOrigem] = useState(null); // null | "auto" | "manual"
  const [nTrocos, setNTrocos] = useState(TROCOS_PADRAO);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const inputRef = useRef(null);

  // Foco automático ao abrir — é o campo principal, quem liga ao
  // telefone não sabe a distância, só a morada.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const distanciaNum = distancia === "" ? undefined : Number(distancia);
  const calc = calcularDeslocacao({ distanciaKm: distanciaNum, nTrocos, isento: false });

  const calcular = async () => {
    if (!morada.trim() || carregando) return;
    setCarregando(true);
    setErro(null);
    try {
      const km = await obterDistancia(morada);
      setDistancia(String(km));
      setOrigem("auto");
    } catch (e) {
      setErro(e.message);
      setDistancia("");
      setOrigem(null);
    }
    setCarregando(false);
  };

  const aoEditarDistancia = (valor) => {
    setDistancia(valor);
    setOrigem(valor === "" ? null : "manual");
    setErro(null); // editar à mão é exatamente o que o banner pedia — não insiste
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.18, ease: EASE }}
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        right: 0,
        width: "340px",
        maxWidth: "92vw",
        background: "var(--superficie)",
        border: "1px solid var(--gold-light)",
        borderRadius: "16px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
        padding: "18px",
        zIndex: 41,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "14px",
        }}
      >
        <span
          style={{
            fontSize: "11px",
            fontWeight: "700",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--gold-dark)",
          }}
        >
          Consulta rápida
        </span>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          style={{
            background: "none",
            border: "none",
            color: "var(--gray-mid)",
            cursor: "pointer",
            fontSize: "16px",
            lineHeight: 1,
            padding: 0,
          }}
        >
          ✕
        </button>
      </div>

      <label style={miniLabel}>Morada do evento</label>
      <div style={{ display: "flex", gap: "6px" }}>
        <input
          ref={inputRef}
          value={morada}
          onChange={(e) => setMorada(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") calcular();
          }}
          placeholder="Rua, localidade..."
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          type="button"
          onClick={calcular}
          disabled={carregando || !morada.trim()}
          style={{
            padding: "0 16px",
            borderRadius: "8px",
            fontSize: "12.5px",
            fontWeight: "600",
            border: "1.5px solid var(--gold)",
            color: carregando ? "var(--gray-mid)" : "var(--gold)",
            backgroundColor: "var(--superficie)",
            cursor: carregando || !morada.trim() ? "not-allowed" : "pointer",
            opacity: !morada.trim() && !carregando ? 0.6 : 1,
            whiteSpace: "nowrap",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          {carregando && <Spinner />}
          {carregando ? "" : "Calcular"}
        </button>
      </div>

      {erro && (
        <div
          style={{
            display: "flex",
            gap: "7px",
            alignItems: "flex-start",
            background: "var(--aviso-fundo)",
            border: "1px solid var(--aviso-borda)",
            borderRadius: "9px",
            padding: "9px 11px",
            margin: "10px 0 0",
            color: "var(--aviso-texto)",
            fontSize: "11.5px",
            lineHeight: 1.5,
          }}
        >
          <span style={{ flexShrink: 0, marginTop: "1px" }}>
            <Icone nome="alerta" tamanho={13} />
          </span>
          <span>Não consegui esta morada — escreve os km à mão abaixo.</span>
        </div>
      )}

      <div style={{ display: "flex", gap: "8px", marginTop: "12px", alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <label style={miniLabel}>Distância à base</label>
          <div style={{ position: "relative" }}>
            <input
              type="number"
              min="0"
              value={distancia}
              onChange={(e) => aoEditarDistancia(e.target.value)}
              placeholder="—"
              style={{ ...inputStyle, paddingRight: "32px" }}
            />
            <span
              style={{
                position: "absolute",
                right: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: "11px",
                color: "var(--gray-mid)",
                pointerEvents: "none",
              }}
            >
              km
            </span>
          </div>
        </div>
        {origem && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              flexShrink: 0,
              padding: "5px 9px",
              marginBottom: "1px",
              borderRadius: "999px",
              fontSize: "10.5px",
              fontWeight: "600",
              whiteSpace: "nowrap",
              // Fundos fora da paleta (#FBF0D9 / #F3F1EC) — o par
              // inteiro fica literal, fixado nos claros, para não
              // ficar letra clara sobre fundo claro no escuro.
              ...(origem === "auto"
                ? {
                    background: "#FBF0D9",
                    border: "1px solid #E8D5A3",
                    color: "#A07830",
                  }
                : {
                    background: "#F3F1EC",
                    border: "1px solid #DCD5C4",
                    color: "#6B6B6B",
                  }),
            }}
          >
            {origem === "auto" && <Icone nome="check" tamanho={8} />}
            {origem === "auto" ? "auto" : "manual"}
          </span>
        )}
      </div>

      <div
        style={{
          display: "flex",
          border: "1.5px solid var(--gold-light)",
          borderRadius: "9px",
          overflow: "hidden",
          marginTop: "12px",
        }}
      >
        {[2, 4].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setNTrocos(n)}
            style={{
              flex: 1,
              padding: "8px 6px",
              fontSize: "12px",
              fontWeight: "600",
              border: "none",
              borderLeft: n === 4 ? "1.5px solid var(--gold-light)" : "none",
              backgroundColor: nTrocos === n ? "var(--gold)" : "var(--superficie)",
              color: nTrocos === n ? "var(--texto-sobre-ouro)" : "var(--charcoal)",
              cursor: "pointer",
            }}
          >
            {n} troços
          </button>
        ))}
      </div>

      <div
        style={{
          textAlign: "center",
          marginTop: "18px",
          paddingTop: "16px",
          borderTop: "1px solid var(--borda)",
        }}
      >
        <div
          style={{
            fontFamily: "Playfair Display, serif",
            fontSize: "38px",
            fontWeight: "600",
            lineHeight: 1,
            color: calc.temDistancia ? "var(--gold-dark)" : "var(--gray-mid)",
          }}
        >
          {calc.temDistancia ? formatarEuros(calc.custoFinal) : "— €"}
        </div>
        <p style={{ fontSize: "12px", color: "var(--gray-mid)", margin: "8px 0 0" }}>
          {calc.temDistancia
            ? calc.dentroDoRaio
              ? `Dentro do raio de ${calc.kmIncluidos} km`
              : `${formatKm(calc.kmForaDoRaio)} km fora do raio · ${nTrocos} troços`
            : "Escreve a morada ou os km"}
        </p>
      </div>

      <p
        style={{
          fontSize: "10.5px",
          fontStyle: "italic",
          color: "var(--gray-mid)",
          textAlign: "center",
          margin: "12px 0 0",
        }}
      >
        Não guarda nada — é só uma consulta.
      </p>
    </motion.div>
  );
}

function Spinner() {
  return (
    <motion.span
      animate={{ rotate: 360 }}
      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
      style={{
        width: "13px",
        height: "13px",
        borderRadius: "50%",
        border: "2px solid var(--gold-light)",
        borderTopColor: "var(--gold)",
        display: "inline-block",
      }}
    />
  );
}
