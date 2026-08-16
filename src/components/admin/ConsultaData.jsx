import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Icone } from "./Navegacao";
import { FASE_LABEL } from "./faseConfig";
import { estadoDoDia, irmaosDoDia } from "../../lib/disputaDia";

// ============================================================
// ConsultaData — o popover "Consulta da data" da página Início,
// irmão da ConsultaDeslocacao (a mesma pele, o mesmo lugar).
//
// O cenário da Carla (decisão de 09/08): alguém pergunta pelo
// Instagram ou ao telefone «tens o dia 25 livre?» — a Nádia escolhe a
// data, carrega em Consultar, e lê a resposta em voz alta. Quem decide
// o estado é a RPC dlm_dia_estado (via lib/disputaDia — a definição
// única de todas as portas); aqui só se veste a resposta e se lista a
// matéria-prima (irmaosDoDia) para ela ver COM QUEM está a falar.
//
// Descartável como a irmã: não guarda nada, não cria evento, remonta
// sempre em branco (o InicioTab só a monta enquanto o popover está
// aberto).
// ============================================================

const EASE = [0.22, 1, 0.36, 1];

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

// A pele exata da pastilha do cabeçalho (CabecalhoEvento) — só as
// cores mudam consoante o selo.
const pastilha = {
  fontSize: "9.5px",
  fontWeight: "700",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  borderRadius: "999px",
  padding: "4px 9px",
  whiteSpace: "nowrap",
};

// Os meses à mão, na grafia da casa (cópia deliberada de disputaDia.js,
// que não os exporta — e uma lib nunca importa de components/, por isso
// a cópia vive de cada lado): o toLocaleDateString moderno põe
// minúscula e, num browser sem ICU pt-PT, cai em inglês sem erro.
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio",
  "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// «25 de Agosto» a partir de 'YYYY-MM-DD' — partida à mão, sem Date
// local: um parse ISO puro cai em UTC e num fuso atrás recuava um dia.
const diaPorExtenso = (iso) => {
  const [, m, d] = String(iso || "").slice(0, 10).split("-").map(Number);
  if (!m || !d || !MESES[m - 1]) return "";
  return `${d} de ${MESES[m - 1]}`;
};

// «15/08», para o selo «guardado até» — curto porque o selo é curto.
const diaMes = (iso) => {
  const [, m, d] = String(iso || "").slice(0, 10).split("-").map(Number);
  if (!m || !d) return "";
  return `${d}/${String(m).padStart(2, "0")}`;
};

// «há 12 dias» a partir do created_at — a idade da conversa, que diz à
// Nádia quem chegou primeiro.
const haQuanto = (ts) => {
  if (!ts) return null;
  const dias = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  if (dias <= 0) return "chegou hoje";
  if (dias === 1) return "desde ontem";
  return `há ${dias} dias`;
};

// O dia de hoje em ISO LOCAL (nunca toISOString, que em fusos atrás da
// meia-noite UTC daria o dia seguinte) — para saber se a data já passou.
const hojeISO = () => {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
};

export default function ConsultaData({ onFechar }) {
  const navigate = useNavigate();
  const [data, setData] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);
  // null = ainda sem consulta; depois {dataISO, estado, irmaos,
  // indisponivel} — o dataISO fica congelado no resultado para a
  // resposta não mudar de assunto se a Nádia mexer no input a seguir.
  const [resultado, setResultado] = useState(null);
  const inputRef = useRef(null);

  // Foco automático ao abrir — a pergunta ao telefone é sempre a data.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const consultar = async () => {
    if (!data || carregando) return;
    setCarregando(true);
    setErro(false);
    try {
      const [estado, irmaos] = await Promise.all([
        estadoDoDia(data),
        irmaosDoDia(data),
      ]);
      // estado null = a 083 ainda não correu nesta BD (a lib degrada em
      // silêncio) — mostra-se a nota curta em vez de fingir «livre».
      setResultado({ dataISO: data, estado, irmaos, indisponivel: estado === null });
    } catch {
      // Erro a sério (rede, sessão) — a lib só engole os de esquema.
      setResultado(null);
      setErro(true);
    }
    setCarregando(false);
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
          Consulta da data
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

      <label style={miniLabel}>Data do evento</label>
      <div style={{ display: "flex", gap: "6px" }}>
        <input
          ref={inputRef}
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") consultar();
          }}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          type="button"
          onClick={consultar}
          disabled={carregando || !data}
          style={{
            padding: "0 16px",
            borderRadius: "8px",
            fontSize: "12.5px",
            fontWeight: "600",
            border: "1.5px solid var(--gold)",
            color: carregando ? "var(--gray-mid)" : "var(--gold)",
            backgroundColor: "var(--superficie)",
            cursor: carregando || !data ? "not-allowed" : "pointer",
            opacity: !data && !carregando ? 0.6 : 1,
            whiteSpace: "nowrap",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          {carregando && <Spinner />}
          {carregando ? "" : "Consultar"}
        </button>
      </div>

      {erro && (
        <div style={caixaAmbar}>
          <span style={{ flexShrink: 0, marginTop: "1px" }}>
            <Icone nome="alerta" tamanho={13} />
          </span>
          <span>Não consegui consultar agora — tenta outra vez.</span>
        </div>
      )}

      {resultado && !erro && (
        <Resposta resultado={resultado} navigate={navigate} />
      )}

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

// O padrão âmbar da casa (FormulariosOrfaos) — serve o erro e as
// leituras de disputa.
const caixaAmbar = {
  display: "flex",
  gap: "7px",
  alignItems: "flex-start",
  background: "var(--aviso-fundo)",
  border: "1px solid var(--aviso-borda)",
  borderRadius: "9px",
  padding: "9px 11px",
  margin: "12px 0 0",
  color: "var(--aviso-texto)",
  fontSize: "11.5px",
  lineHeight: 1.5,
};

function Resposta({ resultado, navigate }) {
  const { dataISO, estado, irmaos, indisponivel } = resultado;

  // A 083 por correr — a nota curta, sem fingir que o dia está livre.
  if (indisponivel) {
    return (
      <p
        style={{
          fontSize: "11.5px",
          color: "var(--gray-mid)",
          lineHeight: 1.5,
          margin: "12px 0 0",
        }}
      >
        A consulta do dia ainda não está disponível nesta base de dados
        (falta a migração 083).
      </p>
    );
  }

  const passado = dataISO < hojeISO();
  const extenso = diaPorExtenso(dataISO);

  // A leitura de topo, no tom da casa. Uma data passada lê-se como
  // história (o padrão do caducou: não há disputa sobre o que já foi) —
  // a lista abaixo fica na mesma, para memória.
  let leitura;
  if (passado) {
    leitura = { tom: "neutro", texto: `${extenso} já passou.` };
  } else if (estado?.estado === "tomado") {
    leitura = {
      tom: "ambar",
      texto: `Tomado por ${estado.rival_nome || "outro evento"}.`,
      sub: "O dia já tem sinal registado.",
    };
  } else if (estado?.estado === "preferencia") {
    leitura = {
      tom: "ambar",
      texto: `Preferência ativa até ${diaPorExtenso(estado.ate)}.`,
      sub: `O dia está guardado para ${estado.rival_nome || "uma cliente"} — depois fica em aberto.`,
    };
  } else if (estado?.estado === "em_confirmacao") {
    leitura = {
      tom: "ambar",
      texto: `Em confirmação — ${estado.rival_nome || "uma cliente"} disse que já enviou o sinal.`,
      sub: "Confere a conta e regista, ou limpa a confirmação.",
    };
  } else if (irmaos.length > 0) {
    // 'livre' aos olhos da RPC mas com pedidos vivos = negociação.
    leitura = {
      tom: "ambar",
      texto: "Em negociação — o primeiro sinal registado reserva.",
    };
  } else {
    leitura = { tom: "verde", texto: `${extenso} está livre.` };
  }

  return (
    <div style={{ marginTop: "12px" }}>
      {leitura.tom === "verde" && (
        <div
          style={{
            background: "var(--sucesso-fundo)",
            border: "1px solid var(--sucesso-borda)",
            borderRadius: "9px",
            padding: "10px 12px",
            color: "var(--sucesso-texto)",
            fontSize: "13px",
            fontWeight: "600",
            lineHeight: 1.5,
          }}
        >
          {leitura.texto}
        </div>
      )}
      {leitura.tom === "neutro" && (
        <p
          style={{
            fontSize: "11.5px",
            color: "var(--gray-mid)",
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {leitura.texto}
        </p>
      )}
      {leitura.tom === "ambar" && (
        <div style={{ ...caixaAmbar, margin: 0, display: "block" }}>
          {/* A linha do ⚠ na medida do padrão (13px/700) */}
          <p
            style={{
              fontSize: "13px",
              fontWeight: "700",
              margin: leitura.sub ? "0 0 4px" : 0,
              lineHeight: 1.5,
            }}
          >
            ⚠ {leitura.texto}
          </p>
          {leitura.sub && (
            <p style={{ fontSize: "11.5px", margin: 0, lineHeight: 1.5 }}>
              {leitura.sub}
            </p>
          )}
        </div>
      )}

      {irmaos.length > 0 &&
        irmaos.map((ev) => <LinhaIrmao key={ev.id} ev={ev} navigate={navigate} />)}
    </div>
  );
}

function LinhaIrmao({ ev, navigate }) {
  // fase null = reserva provisória sem evento no funil — chama-se pelo
  // nome verdadeiro, não por uma fase que não tem.
  const rotuloFase = ev.ehReserva
    ? "Reserva provisória"
    : FASE_LABEL[ev.fase] || ev.fase;
  const idade = haQuanto(ev.criadoEm);

  return (
    <div
      style={{
        border: "1px solid var(--borda)",
        borderRadius: "10px",
        padding: "9px 11px",
        marginTop: "8px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "8px",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            fontSize: "13px",
            fontWeight: "600",
            color: "var(--charcoal)",
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {ev.nome || "Sem nome"}
        </p>
        <p
          style={{
            fontSize: "11px",
            color: "var(--gray-mid)",
            margin: "1px 0 0",
          }}
        >
          {rotuloFase}
          {idade ? ` · ${idade}` : ""}
        </p>
        {(ev.temSinal || ev.confirmacao || ev.guardadoAte) && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "4px",
              marginTop: "5px",
            }}
          >
            {ev.temSinal && (
              <span
                style={{
                  ...pastilha,
                  color: "var(--sucesso-texto)",
                  background: "var(--sucesso-fundo)",
                  border: "1px solid var(--sucesso-borda)",
                }}
              >
                sinal pago
              </span>
            )}
            {ev.confirmacao && (
              <span
                style={{
                  ...pastilha,
                  color: "var(--aviso-texto)",
                  background: "var(--aviso-fundo)",
                  border: "1px solid var(--aviso-borda)",
                }}
              >
                em confirmação
              </span>
            )}
            {ev.guardadoAte && (
              <span
                style={{
                  ...pastilha,
                  color: "var(--gold-dark)",
                  background: "var(--superficie-selo)",
                  border: "1px solid var(--gold-light)",
                }}
              >
                guardado até {diaMes(ev.guardadoAte)}
              </span>
            )}
          </div>
        )}
      </div>
      {/* Uma reserva provisória não tem página de evento — o «Abrir»
          só existe para quem vive no funil. */}
      {!ev.ehReserva && (
        <button
          type="button"
          onClick={() => navigate(`/evento/${ev.id}`)}
          style={{
            flexShrink: 0,
            border: "none",
            background: "none",
            padding: 0,
            fontSize: "12px",
            fontWeight: "600",
            color: "var(--gold-dark)",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Abrir →
        </button>
      )}
    </div>
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
