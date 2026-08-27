import { useState } from "react";
import { motion } from "framer-motion";
import { saveTeamInstructions } from "../../lib/planos";

// ============================================================
// AS INDICAÇÕES FIXAS DA EQUIPA.
//
// São regras da CASA, não de um evento: o mesmo pólo, o mesmo crachá,
// as mesmas refeições, a mesma água, em todos os planos. Escrevem-se
// uma vez e saem no rodapé de cada plano individual.
//
// Não há excepções por evento, de propósito. A decisão do negócio é que
// estas indicações são fixas, e um ecrã que permitisse a excepção
// convidava-a.
//
// A secção do calor é uma contingência SEMPRE presente e rotulada como
// tal — ninguém consulta meteorologia aqui. Sai debaixo das outras com
// um cabeçalho que se lê como «se estiver muito calor, também isto».
// ============================================================

const campo = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid var(--borda)",
  backgroundColor: "var(--superficie)",
  color: "var(--texto)",
  fontSize: "13px",
  lineHeight: 1.55,
  boxSizing: "border-box",
  resize: "vertical",
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

export default function InstrucoesEquipa({
  organizationId,
  instrucoes,
  onGuardadas,
  onFechar,
}) {
  const [standard, setStandard] = useState(
    instrucoes?.standard_instructions ?? "",
  );
  const [hotWeather, setHotWeather] = useState(
    instrucoes?.hot_weather_instructions ?? "",
  );
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState(null);

  const submeter = async (e) => {
    e.preventDefault();
    setErro(null);
    setAGuardar(true);
    try {
      const guardadas = await saveTeamInstructions({
        organizationId,
        standard,
        hotWeather,
      });
      onGuardadas(guardadas);
    } catch (err) {
      console.error(err);
      setErro("Não foi possível guardar as indicações. Tenta outra vez.");
      setAGuardar(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Indicações fixas da equipa"
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
          maxWidth: "540px",
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
            margin: "0 0 6px",
          }}
        >
          Indicações da equipa
        </h3>
        <p
          style={{
            fontSize: "12.5px",
            color: "var(--texto-suave)",
            margin: "0 0 18px",
            lineHeight: 1.55,
          }}
        >
          São iguais para todos os eventos e saem no fim de cada plano
          individual. Escreve-as uma vez.
        </p>

        {erro && (
          <p role="alert" style={caixaErro}>
            ⚠ {erro}
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={rotulo} htmlFor="instrucoes-standard">
              Indicações normais
            </label>
            <textarea
              id="instrucoes-standard"
              autoFocus
              rows={6}
              maxLength={4000}
              style={campo}
              value={standard}
              onChange={(e) => setStandard(e.target.value)}
              placeholder="O que a equipa veste e leva sempre — pólo, crachá, refeições, água…"
            />
          </div>
          <div>
            <label style={rotulo} htmlFor="instrucoes-calor">
              Em dias de muito calor
            </label>
            <textarea
              id="instrucoes-calor"
              rows={5}
              maxLength={4000}
              style={campo}
              value={hotWeather}
              onChange={(e) => setHotWeather(e.target.value)}
              placeholder="O que acresce quando está calor — bebidas, protector solar, boné…"
            />
            <p
              style={{
                fontSize: "11.5px",
                color: "var(--texto-suave)",
                margin: "6px 0 0",
                lineHeight: 1.5,
              }}
            >
              Sai sempre no plano, debaixo das normais e com este título. A
              app não consulta meteorologia: quem lê é que decide se o dia é
              desses.
            </p>
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
