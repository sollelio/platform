import { useState } from "react";
import { motion } from "framer-motion";
import ReservaModal from "./ReservaModal";
import CaptacaoForm from "../captacao/CaptacaoForm";
import { agruparReservasPorDia } from "../../lib/reservas";
import { getResumoSubmissao } from "../../lib/submissionFields";

const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

// Cores por estado — mantém o mesmo padrão visual do resto da app
const STATUS_CORES = {
  Recebido: { bg: "#FEF9EC", border: "#E8D5A3", texto: "#A07830" },
  "Em Preparação": { bg: "#EFF6FF", border: "#BFDBFE", texto: "#1D4ED8" },
  Confirmado: { bg: "#F0FDF4", border: "#BBF7D0", texto: "#15803D" },
  Concluído: { bg: "#F9FAFB", border: "#E5E7EB", texto: "#6B7280" },
};

// Cor das reservas / em negociação — VERMELHO FORTE e tracejado
// (pedido da Nádia): a data está segura mas ainda não está vendida;
// tem de saltar à vista. Desaparece sozinha quando o sinal entra
// (fase pós-sinal → cor do estado operacional).
// Nota histórica:
// para se distinguir num relance dos eventos reais (que têm cor sólida)
const RESERVA_COR = { bg: "#FEF2F2", border: "#DC2626", texto: "#B91C1C" };

// Fases comerciais ainda EM NEGOCIAÇÃO — na Agenda aparecem provisórias
// (tracejadas, como as reservas): o dia está prometido, não vendido.
// Do sinal em diante (cliente/projecto/contrato) pinta sólido pelo estado;
// "perdido" não ocupa dias.
const FASES_EM_NEGOCIACAO = ["interessado", "orcamento", "sinal"];
const emNegociacao = (s) => FASES_EM_NEGOCIACAO.includes(s.fase);

// Cores de um evento na Agenda — a regra COMBINADA (comercial +
// operacional) pedida pela Nádia:
//   pré-sinal                    → vermelho Reserva (tracejado)
//   pós-sinal                    → VERDE Confirmado (a data está vendida)
//   pós-sinal + "Em Preparação"  → azul Em Preparação
//   "Concluído"                  → cinza Concluído
// (O estado "Recebido" não tem cor própria aqui — um pós-sinal
// Recebido É uma data confirmada; o Recebido vive na Logística.)
const coresDoEvento = (s) => {
  if (emNegociacao(s)) return RESERVA_COR;
  if (s.status === "Concluído") return STATUS_CORES["Concluído"];
  if (s.status === "Em Preparação") return STATUS_CORES["Em Preparação"];
  return STATUS_CORES["Confirmado"];
};

function getTituloSubmissao(s, eventTypes) {
  return getResumoSubmissao(s, eventTypes).titulo;
}

function getTipoNome(s, eventTypes) {
  const tipo = eventTypes?.find((et) => et.id === s.event_type_id);
  if (tipo?.nome) return tipo.nome;
  // Tipo "Outro" da captação — o texto do cliente com a marca ✳
  // (por classificar) até ser associado a um modelo na ficha.
  const livre = (s.respostas?.tipoEventoOutro || "").trim();
  return livre ? `${livre} ✳` : null;
}

// Devolve os dias do mês numa grelha começando à Segunda
function buildGrid(ano, mes) {
  const primeiroDia = new Date(ano, mes, 1);
  const ultimoDia = new Date(ano, mes + 1, 0);
  // 0=Dom … em PT começamos na Segunda (1)
  const offset = (primeiroDia.getDay() + 6) % 7; // 0=Seg, 6=Dom
  const grid = [];
  for (let i = 0; i < offset; i++) grid.push(null);
  for (let d = 1; d <= ultimoDia.getDate(); d++) grid.push(d);
  while (grid.length % 7 !== 0) grid.push(null);
  return grid;
}

// Constrói a chave 'YYYY-MM-DD' de um dia do mês em vista.
function chaveDia(ano, mes, dia) {
  const mm = String(mes + 1).padStart(2, "0");
  const dd = String(dia).padStart(2, "0");
  return `${ano}-${mm}-${dd}`;
}

export default function CalendarioTab({
  // Os três contadores do mês somam sobre eventos e reservas que vêm
  // por prop. Antes de eles chegarem, «0 eventos · 0 reservas · 0 dias
  // ocupados» não é um mês vazio — é uma pergunta ainda sem resposta,
  // dita como se fosse resposta. Enquanto não sabemos, mostra-se um
  // travessão.
  dadosPorChegar = false,
  submissions,
  eventTypes,
  reservas = [],
  onSelectSubmission,
  onReservasChange,
  onCriarQuestionario,
  onDadosMudaram,
}) {
  const hoje = new Date();
  const [viewDate, setViewDate] = useState(
    new Date(hoje.getFullYear(), hoje.getMonth(), 1),
  );
  // Popup de dia: { dia, eventos, reservasDia } ou null
  const [popupDia, setPopupDia] = useState(null);
  // Modal de reserva: { dataInicial } (criar) ou { reserva } (editar) ou null
  const [modalReserva, setModalReserva] = useState(null);

  const ano = viewDate.getFullYear();
  const mes = viewDate.getMonth();
  const grid = buildGrid(ano, mes);

  const mesAnterior = () => setViewDate(new Date(ano, mes - 1, 1));
  const mesSeguinte = () => setViewDate(new Date(ano, mes + 1, 1));

  // Eventos com reserva provisória ligada (bloco 7): a tracejada da
  // reserva já os representa na Agenda — mostrar os dois duplicaria o
  // mesmo negócio no mesmo dia. Após a conversão, a reserva sai da
  // lista (só vêm provisórias) e o evento passa a aparecer.
  const idsComReservaProvisoria = new Set(
    reservas.map((r) => r.submission_id).filter(Boolean),
  );

  // Agrupa as submissões por dia do mês actual
  const eventosPorDia = {};
  submissions.forEach((s) => {
    if (s.fase === "perdido") return; // negócios mortos não ocupam dias
    if (idsComReservaProvisoria.has(s.id)) return; // a reserva representa-o
    // Usa a data do resumo — apanha eventos cuja data só está em
    // "respostas" (modelos onde a coluna data_evento ficou vazia).
    const dataEvento = getResumoSubmissao(s, eventTypes).data;
    if (!dataEvento) return;
    const d = new Date(dataEvento);
    if (d.getFullYear() !== ano || d.getMonth() !== mes) return;
    const dia = d.getUTCDate();
    if (!eventosPorDia[dia]) eventosPorDia[dia] = [];
    eventosPorDia[dia].push(s);
  });

  // Agrupa as reservas por dia (chave 'YYYY-MM-DD'), depois filtra pelo mês
  const reservasPorChave = agruparReservasPorDia(reservas);
  const reservasPorDia = {};
  Object.entries(reservasPorChave).forEach(([chave, lista]) => {
    const [a, m, d] = chave.split("-").map(Number);
    if (a === ano && m - 1 === mes) reservasPorDia[d] = lista;
  });

  const totalEventosMes = Object.values(eventosPorDia).flat().length;
  // "Reservas" na cabeça da Nádia = pills vermelhas: as linhas legadas
  // da tabela de reservas + os eventos em negociação (pré-sinal).
  const totalReservasMes =
    Object.values(reservasPorDia).flat().length +
    Object.values(eventosPorDia)
      .flat()
      .filter((s) => FASES_EM_NEGOCIACAO.includes(s.fase)).length;
  const diasOcupados = new Set([
    ...Object.keys(eventosPorDia),
    ...Object.keys(reservasPorDia),
  ]).size;

  // Após criar/editar/remover uma reserva, pede ao pai para recarregar.
  const recarregar = () => {
    if (onReservasChange) onReservasChange();
    setModalReserva(null);
  };

  // Conversão em cliente: fecha o modal e abre a criação do questionário
  // já pré-preenchido e carimbado com esta reserva (tratado no AdminPage).
  // Quando o questionário for submetido, a reserva converte-se sozinha.
  const handleConverter = (reserva) => {
    setModalReserva(null);
    if (onCriarQuestionario) onCriarQuestionario(reserva);
  };

  return (
    <motion.div
      key="tab-calendario"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Cabeçalho do mês + navegação */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={mesAnterior}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              border: "1.5px solid var(--gold-light)",
              background: "white",
              cursor: "pointer",
              fontSize: "16px",
              color: "var(--gold)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ‹
          </button>
          <h2
            style={{
              fontFamily: "Playfair Display, serif",
              fontSize: "20px",
              color: "var(--charcoal)",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              minWidth: "220px",
              textAlign: "center",
            }}
          >
            {MESES[mes]} {ano}
          </h2>
          <button
            onClick={mesSeguinte}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              border: "1.5px solid var(--gold-light)",
              background: "white",
              cursor: "pointer",
              fontSize: "16px",
              color: "var(--gold)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ›
          </button>
        </div>

        {/* Resumo rápido do mês */}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <div
            style={{
              fontSize: "12px",
              color: "var(--gray-mid)",
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "6px 14px",
              border: "1px solid var(--gold-light)",
            }}
          >
            <span style={{ fontWeight: "700", color: "var(--gold)" }}>
              {dadosPorChegar ? "—" : totalEventosMes}
            </span>{" "}
            {!dadosPorChegar && totalEventosMes === 1 ? "evento" : "eventos"}
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "var(--gray-mid)",
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "6px 14px",
              border: "1px solid var(--gold-light)",
            }}
          >
            <span style={{ fontWeight: "700", color: "var(--gold-dark)" }}>
              {dadosPorChegar ? "—" : totalReservasMes}
            </span>{" "}
            {!dadosPorChegar && totalReservasMes === 1 ? "reserva" : "reservas"}
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "var(--gray-mid)",
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "6px 14px",
              border: "1px solid var(--gold-light)",
            }}
          >
            <span style={{ fontWeight: "700", color: "var(--gold)" }}>
              {dadosPorChegar ? "—" : diasOcupados}
            </span>{" "}
            {!dadosPorChegar && diasOcupados === 1
              ? "dia ocupado"
              : "dias ocupados"}
          </div>
        </div>
      </div>

      {/* Legenda */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          marginBottom: "12px",
          flexWrap: "wrap",
        }}
      >
        {Object.entries(STATUS_CORES)
          .filter(([status]) => status !== "Recebido")
          .map(([status, cor]) => (
            <div
              key={status}
              style={{ display: "flex", alignItems: "center", gap: "5px" }}
            >
              <div
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  backgroundColor: cor.bg,
                  border: `1.5px solid ${cor.border}`,
                }}
              />
              <span style={{ fontSize: "10px", color: "var(--gray-mid)" }}>
                {status}
              </span>
            </div>
          ))}
        {/* Legenda das reservas */}
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              backgroundColor: RESERVA_COR.bg,
              border: `1.5px dashed ${RESERVA_COR.border}`,
            }}
          />
          <span style={{ fontSize: "10px", color: "var(--gray-mid)" }}>
            Reserva / em negociação
          </span>
        </div>
      </div>

      {/* Grelha do calendário */}
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "16px",
          overflow: "hidden",
          boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
          border: "1px solid var(--gold-light)",
        }}
      >
        {/* Cabeçalho dos dias da semana */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            backgroundColor: "var(--gold)",
          }}
        >
          {DIAS_SEMANA.map((d) => (
            <div
              key={d}
              style={{
                textAlign: "center",
                padding: "10px 0",
                fontSize: "11px",
                fontWeight: "700",
                color: "white",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Dias */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {grid.map((dia, i) => {
            if (dia === null) {
              return (
                <div
                  key={`empty-${i}`}
                  style={{
                    minHeight: "90px",
                    backgroundColor: "#FAFAF8",
                    borderRight: "1px solid #F0E6D0",
                    borderBottom: "1px solid #F0E6D0",
                  }}
                />
              );
            }

            const ehHoje =
              dia === hoje.getDate() &&
              mes === hoje.getMonth() &&
              ano === hoje.getFullYear();
            const eventos = eventosPorDia[dia] || [];
            const reservasDia = reservasPorDia[dia] || [];
            const temEventos = eventos.length > 0;
            const temReservas = reservasDia.length > 0;
            // Mostra até 2 itens no total (eventos primeiro, depois reservas)
            const itens = [
              ...eventos.map((e) => ({ tipo: "evento", dados: e })),
              ...reservasDia.map((r) => ({ tipo: "reserva", dados: r })),
            ];
            const visiveis = itens.slice(0, 2);
            const extra = itens.length - visiveis.length;

            return (
              <div
                key={dia}
                className="dia-calendario"
                style={{
                  minHeight: "90px",
                  borderRight: "1px solid #F0E6D0",
                  borderBottom: "1px solid #F0E6D0",
                  padding: "8px 6px",
                  backgroundColor:
                    temEventos || temReservas ? "#FFFDF5" : "white",
                  position: "relative",
                  transition: "background-color 0.15s",
                }}
              >
                {/* Cabeçalho do dia: número + botão de reserva */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "4px",
                  }}
                >
                  <div
                    style={{
                      width: "26px",
                      height: "26px",
                      borderRadius: "50%",
                      backgroundColor: ehHoje ? "var(--gold)" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight:
                          ehHoje || temEventos || temReservas ? "700" : "400",
                        color: ehHoje
                          ? "white"
                          : temEventos || temReservas
                            ? "var(--gold-dark)"
                            : "var(--gray-mid)",
                      }}
                    >
                      {dia}
                    </span>
                  </div>

                  {/* Botão "+" para reservar este dia */}
                  <button
                    className="btn-reservar-dia"
                    onClick={(e) => {
                      e.stopPropagation();
                      setModalReserva({
                        dataInicial: chaveDia(ano, mes, dia),
                      });
                    }}
                    title="Reservar este dia"
                    style={{
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      border: "1px solid var(--gold-light)",
                      backgroundColor: "white",
                      color: "var(--gold)",
                      cursor: "pointer",
                      fontSize: "13px",
                      lineHeight: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0,
                      flexShrink: 0,
                    }}
                  >
                    +
                  </button>
                </div>

                {/* Itens do dia (eventos + reservas) */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "3px",
                  }}
                >
                  {visiveis.map((item, idx) => {
                    if (item.tipo === "evento") {
                      const s = item.dados;
                      const cores = coresDoEvento(s);
                      const negociacao = emNegociacao(s);
                      const titulo = getTituloSubmissao(s, eventTypes);
                      const tipo = getTipoNome(s, eventTypes);
                      return (
                        <button
                          key={`ev-${s.id}`}
                          onClick={() => onSelectSubmission(s)}
                          title={`${titulo}${tipo ? ` · ${tipo}` : ""} · ${negociacao ? "Em negociação" : s.status}`}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            padding: "3px 6px",
                            borderRadius: "5px",
                            backgroundColor: cores.bg,
                            border: `1px ${negociacao ? "dashed" : "solid"} ${cores.border}`,
                            cursor: "pointer",
                            transition: "opacity 0.15s",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.opacity = "0.75")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.opacity = "1")
                          }
                        >
                          <p
                            style={{
                              fontSize: "10px",
                              fontWeight: "600",
                              color: cores.texto,
                              margin: 0,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {titulo}
                          </p>
                          {tipo && (
                            <p
                              style={{
                                fontSize: "9px",
                                color: cores.texto,
                                margin: 0,
                                opacity: 0.75,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {tipo}
                            </p>
                          )}
                        </button>
                      );
                    }
                    // reserva
                    const r = item.dados;
                    return (
                      <button
                        key={`res-${r.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setModalReserva({ reserva: r });
                        }}
                        title={`Reserva · ${r.nome_cliente}`}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "3px 6px",
                          borderRadius: "5px",
                          backgroundColor: RESERVA_COR.bg,
                          border: `1px dashed ${RESERVA_COR.border}`,
                          cursor: "pointer",
                          transition: "opacity 0.15s",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.opacity = "0.75")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.opacity = "1")
                        }
                      >
                        <p
                          style={{
                            fontSize: "10px",
                            fontWeight: "600",
                            color: RESERVA_COR.texto,
                            margin: 0,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            fontStyle: "italic",
                          }}
                        >
                          {r.nome_cliente}
                        </p>
                        <p
                          style={{
                            fontSize: "9px",
                            color: RESERVA_COR.texto,
                            margin: 0,
                            opacity: 0.75,
                          }}
                        >
                          reserva
                        </p>
                      </button>
                    );
                  })}
                  {extra > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPopupDia({ dia, eventos, reservasDia });
                      }}
                      style={{
                        fontSize: "9px",
                        color: "var(--gold)",
                        fontWeight: "700",
                        paddingLeft: "4px",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        padding: "2px 4px",
                        borderRadius: "4px",
                        textDecoration: "underline",
                        textDecorationStyle: "dotted",
                      }}
                    >
                      +{extra} mais
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Nota de rodapé */}
      <p
        style={{
          fontSize: "11px",
          color: "var(--gray-mid)",
          textAlign: "center",
          marginTop: "12px",
        }}
      >
        Clica num evento para abrir a ficha, ou no <strong>+</strong> de um dia
        para criar uma reserva.
      </p>

      {/* Popup — todos os itens de um dia */}
      {popupDia && (
        <div
          onClick={() => setPopupDia(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 300,
            backgroundColor: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "white",
              borderRadius: "16px",
              boxShadow: "0 16px 48px rgba(0,0,0,0.18)",
              border: "1px solid var(--gold-light)",
              width: "100%",
              maxWidth: "360px",
              overflow: "hidden",
            }}
          >
            {/* Cabeçalho do popup */}
            <div
              style={{
                backgroundColor: "var(--gold)",
                padding: "14px 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <p
                style={{
                  fontFamily: "Playfair Display, serif",
                  fontSize: "15px",
                  color: "white",
                  margin: 0,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {popupDia.dia} de {MESES[mes]}
              </p>
              <button
                onClick={() => setPopupDia(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "white",
                  fontSize: "18px",
                  cursor: "pointer",
                  lineHeight: 1,
                  padding: "2px",
                  opacity: 0.85,
                }}
              >
                ✕
              </button>
            </div>

            {/* Lista de eventos + reservas do dia */}
            <div
              style={{
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              {popupDia.eventos.map((s) => {
                const cores = coresDoEvento(s);
                const negociacao = emNegociacao(s);
                const titulo = getTituloSubmissao(s, eventTypes);
                const tipo = getTipoNome(s, eventTypes);
                return (
                  <button
                    key={`pev-${s.id}`}
                    onClick={() => {
                      setPopupDia(null);
                      onSelectSubmission(s);
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 14px",
                      borderRadius: "10px",
                      backgroundColor: cores.bg,
                      border: `1px ${negociacao ? "dashed" : "solid"} ${cores.border}`,
                      cursor: "pointer",
                      transition: "opacity 0.15s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.opacity = "0.75")
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                  >
                    <p
                      style={{
                        fontSize: "13px",
                        fontWeight: "600",
                        color: cores.texto,
                        margin: "0 0 2px 0",
                      }}
                    >
                      {titulo}
                    </p>
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                      }}
                    >
                      {tipo && (
                        <span
                          style={{
                            fontSize: "10px",
                            color: cores.texto,
                            opacity: 0.75,
                          }}
                        >
                          {tipo}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: "10px",
                          padding: "1px 8px",
                          borderRadius: "999px",
                          backgroundColor: "white",
                          color: cores.texto,
                          border: `1px solid ${cores.border}`,
                          fontWeight: "500",
                        }}
                      >
                        {negociacao ? "Em negociação" : s.status}
                      </span>
                    </div>
                  </button>
                );
              })}

              {/* Reservas do dia */}
              {popupDia.reservasDia.map((r) => (
                <button
                  key={`pres-${r.id}`}
                  onClick={() => {
                    setPopupDia(null);
                    setModalReserva({ reserva: r });
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    backgroundColor: RESERVA_COR.bg,
                    border: `1px dashed ${RESERVA_COR.border}`,
                    cursor: "pointer",
                    transition: "opacity 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                >
                  <p
                    style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      color: RESERVA_COR.texto,
                      margin: "0 0 2px 0",
                      fontStyle: "italic",
                    }}
                  >
                    {r.nome_cliente}
                  </p>
                  <span
                    style={{
                      fontSize: "10px",
                      padding: "1px 8px",
                      borderRadius: "999px",
                      backgroundColor: "white",
                      color: RESERVA_COR.texto,
                      border: `1px dashed ${RESERVA_COR.border}`,
                      fontWeight: "500",
                    }}
                  >
                    Reserva
                  </span>
                </button>
              ))}
            </div>

            <div
              style={{
                padding: "10px 12px 14px",
                textAlign: "center",
              }}
            >
              <p
                style={{
                  fontSize: "11px",
                  color: "var(--gray-mid)",
                  margin: 0,
                }}
              >
                {popupDia.eventos.length + popupDia.reservasDia.length} no total
                neste dia
              </p>
            </div>
          </motion.div>
        </div>
      )}

      {/* Reserva NOVA = interessado com a data segura: o mesmo
          CaptacaoForm das outras portas, com a data do dia clicado
          já preenchida. Segue o funil normal até Cliente. */}
      {modalReserva?.dataInicial && !modalReserva?.reserva && (
        <div
          onClick={() => setModalReserva(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            backgroundColor: "rgba(0,0,0,0.35)",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            padding: "24px 16px",
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "white",
              borderRadius: "16px",
              padding: "22px 20px",
              width: "100%",
              maxWidth: "440px",
              border: "1px solid var(--gold-light)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "4px",
              }}
            >
              <h3
                style={{
                  fontSize: "17px",
                  fontFamily: "Playfair Display, serif",
                  color: "var(--charcoal)",
                  margin: 0,
                }}
              >
                Nova reserva
              </h3>
              <button
                onClick={() => setModalReserva(null)}
                aria-label="Fechar"
                style={{
                  fontSize: "18px",
                  color: "var(--gray-mid)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
            <p
              style={{
                fontSize: "12px",
                color: "var(--gray-mid)",
                margin: "0 0 16px 0",
              }}
            >
              A data fica segura no funil como interessado (a vermelho na Agenda
              até o sinal entrar). Nome e tipo chegam — o resto é opcional.
            </p>
            <CaptacaoForm
              modoInterno
              textoBotao="Criar reserva"
              dataInicial={modalReserva.dataInicial}
              onSubmetido={() => {
                setModalReserva(null);
                if (onDadosMudaram) onDadosMudaram();
              }}
            />
          </div>
        </div>
      )}

      {/* Modal antigo: só para EDITAR reservas legadas (pills antigas) */}
      {modalReserva?.reserva && (
        <ReservaModal
          dataInicial={modalReserva.dataInicial}
          reserva={modalReserva.reserva}
          eventTypes={eventTypes}
          onGuardar={recarregar}
          onRemover={recarregar}
          onConverter={handleConverter}
          onFechar={() => setModalReserva(null)}
        />
      )}
    </motion.div>
  );
}
