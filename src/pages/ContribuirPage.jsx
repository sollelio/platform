import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import LogoDourado from "../components/LogoDourado";
import { getCampanhaPublica, prometerContribuicao } from "../lib/campanhas";
import { Taca } from "../components/admin/ContribuicaoColetiva";
import { Esqueleto } from "../components/admin/acabamento";

// ============================================================
// ContribuirPage — /contribuir/:token, a única janela do público para
// uma campanha de contribuição coletiva.
//
// É a montra que a família partilha no grupo de WhatsApp — tem de
// estar à altura da etiqueta da casa: o logo, a taça a encher, a
// mensagem da anfitriã, e como contribuir. PRIVACIDADE por desenho
// (decisão de 26/07/2026): mostra a percentagem e o nº de pessoas —
// nunca valores absolutos, nem a meta, nem nomes de quem deu. Tudo o
// que esta página sabe vem da RPC campanha_publica (034); a tabela
// está fechada ao público.
//
// Token regenerado = link antigo morre → "já não está ativo".
// ============================================================

const dataLonga = (iso) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString("pt-PT", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

const eyebrow = {
  fontSize: "10px",
  fontWeight: "700",
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: "var(--gold-dark)",
  margin: "0 0 10px",
};

const serif = {
  fontFamily: "'Playfair Display', serif",
  fontWeight: "400",
  color: "var(--charcoal)",
};

const caixaTexto = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1.5px solid var(--gold-light)",
  fontSize: "14px",
  fontFamily: "inherit",
  boxSizing: "border-box",
  backgroundColor: "white",
};

// ---------- A promessa (F3) ----------
// O convidado contribui pelas instruções e deixa aqui o nome e o
// valor — fica PENDENTE até a casa confirmar que o dinheiro chegou.
// Nunca entra na taça sozinho: o módulo regista dinheiro, não promessas.
function FormularioPromessa({ token, reduzir }) {
  const [nome, setNome] = useState("");
  const [valor, setValor] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [aEnviar, setAEnviar] = useState(false);
  const [enviadoPara, setEnviadoPara] = useState(null); // nome, depois de enviar
  const [erro, setErro] = useState(null);

  if (enviadoPara) {
    return (
      <motion.div
        initial={reduzir ? false : { opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          backgroundColor: "#FBF7EF",
          border: "1px solid var(--gold-light)",
          borderRadius: "14px",
          padding: "20px",
          marginTop: "14px",
        }}
      >
        <p style={{ ...serif, fontSize: "17px", margin: "0 0 6px" }}>
          Obrigado, {enviadoPara}. 🥂
        </p>
        <p style={{ fontSize: "12.5px", color: "var(--gray-mid)", margin: 0, lineHeight: 1.6 }}>
          A tua contribuição ficou registada e entra na taça assim que for
          confirmada pela casa.
        </p>
      </motion.div>
    );
  }

  const enviar = async () => {
    setErro(null);
    if (!nome.trim()) {
      setErro("Diz-nos o teu nome — é assim que os anfitriões sabem quem pôs a mesa.");
      return;
    }
    const v = Number(valor);
    if (!Number.isFinite(v) || v <= 0) {
      setErro("Indica o valor que contribuíste (ou vais contribuir).");
      return;
    }
    setAEnviar(true);
    try {
      await prometerContribuicao(token, { nome, valor: v, mensagem });
      setEnviadoPara(nome.trim());
    } catch (e) {
      console.error(e);
      setErro(
        e.message === "campanha_indisponivel"
          ? "Esta campanha já não está a receber contribuições."
          : "Não foi possível registar. Tenta novamente daqui a um momento.",
      );
    }
    setAEnviar(false);
  };

  return (
    <div
      style={{
        backgroundColor: "white",
        border: "1px solid var(--gold-light)",
        borderRadius: "14px",
        padding: "20px",
        marginTop: "14px",
        textAlign: "left",
      }}
    >
      <p style={{ ...eyebrow, textAlign: "center", margin: "0 0 4px" }}>
        Já contribuíste?
      </p>
      <p
        style={{
          fontSize: "12.5px",
          color: "var(--gray-mid)",
          textAlign: "center",
          margin: "0 0 14px",
          lineHeight: 1.6,
          textWrap: "pretty",
        }}
      >
        Deixa o teu nome e o valor — para os anfitriões saberem quem ajudou
        a pôr esta mesa.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="O teu nome"
          maxLength={80}
          className="caixa-texto"
          style={caixaTexto}
        />
        <input
          type="number"
          step="0.01"
          min="0"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="Valor (€)"
          className="caixa-texto"
          style={caixaTexto}
        />
        <input
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          placeholder="Uma palavra aos anfitriões (opcional)"
          maxLength={280}
          className="caixa-texto"
          style={caixaTexto}
        />
        {erro && (
          <p style={{ fontSize: "12px", color: "#B91C1C", margin: 0 }}>{erro}</p>
        )}
        <button
          onClick={enviar}
          disabled={aEnviar}
          className="acao acao--cheia"
          style={{
            padding: "11px 16px",
            borderRadius: "999px",
            fontSize: "13.5px",
            fontWeight: "600",
            boxShadow: "0 4px 12px rgba(201,168,76,0.30)",
          }}
        >
          {aEnviar ? "A registar…" : "Deixar a minha contribuição"}
        </button>
        <p
          style={{
            fontSize: "10.5px",
            color: "#9B9B9B",
            textAlign: "center",
            margin: 0,
          }}
        >
          O valor entra na taça quando a casa confirmar a chegada.
        </p>
      </div>
    </div>
  );
}

export default function ContribuirPage() {
  const { token } = useParams();
  const [dados, setDados] = useState(null);
  const [estado, setEstado] = useState("a-carregar");
  const reduzir = useReducedMotion();

  useEffect(() => {
    let cancelado = false;
    getCampanhaPublica(token)
      .then((d) => {
        if (cancelado) return;
        if (d) {
          setDados(d);
          setEstado("pronto");
        } else {
          setEstado("nao-encontrado");
        }
      })
      .catch((e) => {
        console.error(e);
        if (!cancelado) setEstado("erro");
      });
    return () => {
      cancelado = true;
    };
  }, [token]);

  const concluida = dados?.estado === "concluida";
  const fechada = dados?.estado === "fechada";
  const pct = concluida ? 1 : (Number(dados?.pct) || 0) / 100;
  const pessoas = Number(dados?.pessoas) || 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--cream)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "40px 24px 32px",
        textAlign: "center",
      }}
    >
      <LogoDourado size={150} />

      <div style={{ width: "100%", maxWidth: "480px", marginTop: "28px" }}>
        {estado === "a-carregar" && (
          <>
            <Esqueleto w={180} h={12} style={{ margin: "0 auto 14px" }} />
            <Esqueleto w={280} h={24} style={{ margin: "0 auto 22px" }} />
            <Esqueleto w={130} h={150} r={16} style={{ margin: "0 auto 18px" }} />
            <Esqueleto w={220} h={14} style={{ margin: "0 auto" }} />
          </>
        )}

        {estado === "nao-encontrado" && (
          <>
            <p style={eyebrow}>Contribuição coletiva</p>
            <p style={{ ...serif, fontSize: "22px", margin: "0 0 10px" }}>
              Este link já não está ativo.
            </p>
            <p style={{ fontSize: "13px", color: "var(--gray-mid)", margin: 0 }}>
              Pede um link novo a quem to partilhou.
            </p>
          </>
        )}

        {estado === "erro" && (
          <>
            <p style={eyebrow}>Contribuição coletiva</p>
            <p style={{ ...serif, fontSize: "20px", margin: "0 0 10px" }}>
              Não foi possível abrir a campanha.
            </p>
            <p style={{ fontSize: "13px", color: "var(--gray-mid)", margin: 0 }}>
              Verifica a ligação à internet e tenta recarregar a página.
            </p>
          </>
        )}

        {estado === "pronto" && (
          <motion.div
            initial={reduzir ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <p style={eyebrow}>Contribuição coletiva</p>
            <p style={{ ...serif, fontSize: "24px", margin: "0 0 4px" }}>
              {fechada
                ? "Esta campanha já terminou."
                : concluida
                  ? "A meta foi atingida. 🥂"
                  : "Uma mesa posta por muitos."}
            </p>
            {(dados.tipo_evento || dados.data_evento) && (
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--gray-mid)",
                  margin: "0 0 18px",
                }}
              >
                {[dados.tipo_evento, dataLonga(dados.data_evento)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}

            {dados.mensagem && !fechada && (
              <p
                style={{
                  ...serif,
                  fontStyle: "italic",
                  fontSize: "16px",
                  color: "var(--gold-dark)",
                  lineHeight: 1.6,
                  margin: "0 0 22px",
                  textWrap: "pretty",
                }}
              >
                «{dados.mensagem}»
              </p>
            )}

            {!fechada && (
              <>
                <div style={{ display: "inline-block" }}>
                  <Taca
                    pct={pct}
                    faisca={concluida ? 1 : 0}
                    brinde={concluida}
                    reduzir={reduzir}
                  />
                </div>
                <p
                  style={{
                    fontSize: "15px",
                    fontWeight: "600",
                    color: "var(--gold-dark)",
                    fontVariantNumeric: "tabular-nums",
                    margin: "2px 0 6px",
                  }}
                >
                  {Math.min(100, Math.round(pct * 100))}%
                </p>
              </>
            )}

            <p
              style={{
                fontSize: "13.5px",
                color: "var(--gray-mid)",
                margin: "0 0 24px",
              }}
            >
              {fechada || concluida
                ? pessoas > 0
                  ? `Obrigado ${pessoas === 1 ? "à pessoa que contribuiu" : `às ${pessoas} pessoas que contribuíram`} para pôr esta mesa.`
                  : "Obrigado a todos."
                : pessoas === 0
                  ? "As primeiras contribuições estão por chegar."
                  : pessoas === 1
                    ? "1 pessoa já contribuiu para pôr esta mesa."
                    : `${pessoas} pessoas já contribuíram para pôr esta mesa.`}
            </p>

            {!fechada && !concluida && dados.como_contribuir && (
              <div
                style={{
                  backgroundColor: "white",
                  border: "1px solid var(--gold-light)",
                  borderRadius: "14px",
                  padding: "18px 20px",
                  textAlign: "center",
                }}
              >
                <p style={{ ...eyebrow, margin: "0 0 8px" }}>Como contribuir</p>
                <p
                  style={{
                    fontSize: "15px",
                    color: "var(--charcoal)",
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.6,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {dados.como_contribuir}
                </p>
              </div>
            )}

            {!fechada && !concluida && (
              <FormularioPromessa token={token} reduzir={reduzir} />
            )}
          </motion.div>
        )}
      </div>

      <p
        style={{
          marginTop: "auto",
          paddingTop: "40px",
          fontSize: "11px",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#C0B79F",
        }}
      >
        Do Luxo à Mesa
      </p>
    </div>
  );
}
