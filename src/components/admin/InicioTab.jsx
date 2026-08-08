import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getResumoSubmissao } from "../../lib/submissionFields";
import { getPagamentosVarios, saldoSinalPendente } from "../../lib/pagamentos";
import { FASES_POS_SINAL } from "./faseConfig";
import { formatarEuros } from "./orcamentos/orcamentoConfig";
import CaptacaoForm from "../captacao/CaptacaoForm";
import ErrosFormulario from "./ErrosFormulario";
import ConsultaDeslocacao from "./ConsultaDeslocacao";
import ConsultaData from "./ConsultaData";
import { Icone } from "./Navegacao";
import AvisosBloqueantes from "./AvisosBloqueantes";

// ============================================================
// InicioTab — a porta de entrada da app (bloco 12b).
// Em vez de abrir numa lista, a app abre num assistente: cumprimenta
// a Nádia, mostra o próximo evento, diz-lhe O QUE PRECISA DELA hoje
// (interessados parados, sinais pendentes, formulários por preencher,
// eventos por preparar) e põe as duas ações mais frequentes a um
// clique. O sistema a trabalhar para ela, não ela a procurar nele.
//
// Read-only sobre os dados que o AdminPage já tem; as saídas são
// onAbrirEvento (drawer) e onNavegar (mudar de ecrã).
// ============================================================

const DIA_MS = 1000 * 60 * 60 * 24;

const hojeZero = () => {
  const h = new Date();
  h.setHours(0, 0, 0, 0);
  return h;
};

const diasAte = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - hojeZero()) / DIA_MS);
};

const diasDesde = (isoTimestamp) => {
  if (!isoTimestamp) return null;
  return Math.floor((Date.now() - new Date(isoTimestamp).getTime()) / DIA_MS);
};

const formatarDataLonga = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "long",
  });
};

const saudacao = () => {
  const h = new Date().getHours();
  if (h < 6) return "Boa noite";
  if (h < 13) return "Bom dia";
  if (h < 20) return "Boa tarde";
  return "Boa noite";
};

const hojePorExtenso = () => {
  const texto = new Date().toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

export default function InicioTab({
  submissions = [],
  invites = [],
  eventTypes = [],
  loading = false,
  onAbrirEvento,
  onNavegar,
  onDadosMudaram,
}) {
  const [novoInteressado, setNovoInteressado] = useState(false);
  const [consultaAberta, setConsultaAberta] = useState(false);
  const [consultaDataAberta, setConsultaDataAberta] = useState(false);

  // 3 colunas só quando há largura para elas (senão empilham)
  const [largura, setLargura] = useState(window.innerWidth);
  useEffect(() => {
    const aoRedimensionar = () => setLargura(window.innerWidth);
    window.addEventListener("resize", aoRedimensionar);
    return () => window.removeEventListener("resize", aoRedimensionar);
  }, []);
  const tresColunas = largura >= 1100;

  const titulo = (s) => getResumoSubmissao(s, eventTypes).titulo;
  const vivos = submissions.filter((s) => s.fase !== "perdido");

  // O sinal "à porta" lê o PLANO real (pagamentos_previstos menos
  // pagamentos), nunca uma divisão por dois — assim reflecte sinais
  // pagos parcialmente antes de a fase avançar no Funil. Chave estável
  // (ids ordenados) para o efeito não refazer o pedido em todos os
  // renders só porque o array de eventos mudou de referência.
  const idsEmSinal = vivos
    .filter((s) => s.fase === "sinal")
    .map((s) => s.id)
    .sort()
    .join(",");
  const [dadosSinal, setDadosSinal] = useState({ previstos: [], pagamentos: [] });
  useEffect(() => {
    // Nada para ir buscar: com a lista de "à espera do sinal" vazia, o
    // reduce do valorSinaisAPorta nem chega a olhar para dadosSinal —
    // não há necessidade de o repor.
    if (!idsEmSinal) return;
    let cancelado = false;
    getPagamentosVarios(idsEmSinal.split(","))
      .then((dados) => {
        if (!cancelado) setDadosSinal(dados);
      })
      .catch((e) => console.error("getPagamentosVarios falhou:", e));
    return () => {
      cancelado = true;
    };
  }, [idsEmSinal]);

  // Procura rápida — da chamada telefónica à ficha em dois segundos.
  // Procura no título (nome da pessoa), tipo e local, sobre os dados
  // que o Início já tem em memória. Máximo 7 resultados.
  const [busca, setBusca] = useState("");
  const resultadosBusca = (() => {
    const q = busca.trim().toLowerCase();
    if (q.length < 2) return [];
    const nomeTipoDe = (s) => {
      const t = (eventTypes || []).find((et) => et.id === s.event_type_id);
      return t ? t.nome : "";
    };
    return submissions
      .filter((s) => {
        const resumo = getResumoSubmissao(s, eventTypes);
        return (
          (resumo.titulo || "").toLowerCase().includes(q) ||
          nomeTipoDe(s).toLowerCase().includes(q) ||
          (s.local_evento || "").toLowerCase().includes(q)
        );
      })
      .slice(0, 7);
  })();

  // ---- Próximo evento (com data futura, não concluído) ----
  const futuros = vivos
    .filter((s) => s.data_evento && s.status !== "Concluído")
    .filter((s) => diasAte(s.data_evento) >= 0)
    .sort((a, b) => new Date(a.data_evento) - new Date(b.data_evento));
  const proximo = futuros[0] || null;

  // ---- Esta semana: os próximos 7 dias com rosto ----
  const semana = futuros.filter((s) => diasAte(s.data_evento) <= 7);
  const nomeDoTipo = (s) =>
    eventTypes.find((et) => et.id === s.event_type_id)?.nome || null;
  const DIAS_ABREV = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
  const pastilhaDia = (iso) => {
    const d = new Date(iso);
    return { semana: DIAS_ABREV[d.getUTCDay()], numero: d.getUTCDate() };
  };

  // ---- Números do momento ----
  const estaSemana = futuros.filter((s) => diasAte(s.data_evento) <= 7).length;
  const somaValores = (lista) =>
    lista.reduce((acc, e) => acc + (Number(e.valor_acordado) || 0), 0);

  const listaEmConversa = vivos.filter((s) =>
    ["interessado", "orcamento"].includes(s.fase),
  );
  const emConversa = listaEmConversa.length;
  const valorEmConversa = somaValores(listaEmConversa);

  const listaAEsperaDoSinal = vivos.filter((s) => s.fase === "sinal");
  const aEsperaDoSinal = listaAEsperaDoSinal.length;
  // "à porta" = o saldo real do plano de sinal (nunca uma divisão por
  // dois) — soma o que falta de cada evento, já a descontar qualquer
  // pagamento parcial registado antes de a fase ter avançado.
  const valorSinaisAPorta = listaAEsperaDoSinal.reduce(
    (acc, s) =>
      acc + saldoSinalPendente(s.id, dadosSinal.previstos, dadosSinal.pagamentos),
    0,
  );

  // O garantido — o mesmo recorte do funil: pós-sinal, sem Concluídos
  const listaGarantidos = vivos.filter(
    (s) => FASES_POS_SINAL.includes(s.fase) && s.status !== "Concluído",
  );
  const valorGarantido = somaValores(listaGarantidos);

  // ---- "A precisar de ti" — as regras do dia a dia ----
  // Cada alerta: { chave, texto, evento } — clicar abre o drawer.
  const alertas = [];

  // a) Interessados parados há 3+ dias (ainda sem orçamento enviado)
  vivos
    .filter((s) => s.fase === "interessado")
    .forEach((s) => {
      const dias = diasDesde(s.created_at);
      if (dias !== null && dias >= 3) {
        alertas.push({
          chave: `parado-${s.id}`,
          texto: `${titulo(s)} · interessada há ${dias} dias, ainda sem orçamento`,
          evento: s,
          peso: 2,
        });
      }
    });

  // b0) Orçamento ACEITE, sinal por receber — o primeiro degrau do
  // limbo (ordem final, 077): é o sinal que reserva a data, e parado
  // aqui nada está garantido. Aparece sempre (sem mínimo de dias).
  vivos
    .filter((s) => s.fase === "sinal")
    .forEach((s) => {
      alertas.push({
        chave: `sinal-${s.id}`,
        texto: `${titulo(s)} · aceitou o orçamento, sinal por receber`,
        evento: s,
        peso: 3,
      });
    });

  // b) Sinal RECEBIDO, contrato por assinar — o segundo degrau: a data
  // já é dela, falta passar a escrito. Aparece sempre (sem mínimo de
  // dias).
  vivos
    .filter((s) => s.fase === "contrato")
    .forEach((s) => {
      alertas.push({
        chave: `contrato-${s.id}`,
        texto: `${titulo(s)} · sinal recebido, contrato por assinar`,
        evento: s,
        peso: 3,
      });
    });

  // b2) PAGAMENTO FINAL (o pedido da Nádia): sinal de 50% recebido,
  // mas o resto paga-se ATÉ 48H ANTES — alerta com o evento a ≤7
  // dias sem pagamento_final; a ≤3 dias sobe para o topo com o prazo.
  vivos
    .filter(
      (s) =>
        FASES_POS_SINAL.includes(s.fase) &&
        s.data_evento &&
        !s.pagamento_final,
    )
    .forEach((s) => {
      const dias = diasAte(s.data_evento);
      if (dias === null || dias < 0 || dias > 7) return;
      const urgente = dias <= 3;
      alertas.push({
        chave: `pag-${s.id}`,
        texto: urgente
          ? `${titulo(s)} · PRAZO: pagamento final até 48h antes — evento em ${dias === 0 ? "HOJE" : `${dias} dias`}`
          : `${titulo(s)} · falta o pagamento final (até 48h antes do evento)`,
        evento: s,
        peso: urgente ? 6 : 4,
      });
    });

  // c) Cliente fechado com evento próximo e formulário por preencher
  //    (não existe nenhum convite PREENCHIDO ligado a este evento)
  const idsComFormulario = new Set(
    invites.filter((i) => i.submission_id).map((i) => i.submission_id),
  );
  vivos
    .filter((s) => FASES_POS_SINAL.includes(s.fase) && s.data_evento)
    .forEach((s) => {
      const dias = diasAte(s.data_evento);
      if (
        dias !== null &&
        dias >= 0 &&
        dias <= 21 &&
        !idsComFormulario.has(s.id)
      ) {
        alertas.push({
          chave: `form-${s.id}`,
          texto: `${titulo(s)} · evento em ${dias === 0 ? "HOJE" : `${dias} dias`}, formulário por preencher`,
          evento: s,
          peso: 4,
        });
      }
    });

  // d) Evento em ≤7 dias ainda "Recebido" (por preparar) — só faz
  // sentido pós-sinal; "Recebido" pré-sinal é só o estado neutro de
  // partida, não "por preparar" (ver updateStatus em lib/clientes.js).
  vivos
    .filter(
      (s) =>
        FASES_POS_SINAL.includes(s.fase) &&
        s.data_evento &&
        s.status === "Recebido",
    )
    .forEach((s) => {
      const dias = diasAte(s.data_evento);
      if (dias !== null && dias >= 0 && dias <= 7) {
        alertas.push({
          chave: `prep-${s.id}`,
          texto: `${titulo(s)} · evento em ${dias === 0 ? "HOJE" : `${dias} dias`} ainda por preparar`,
          evento: s,
          peso: 5,
        });
      }
    });

  // Mais urgente primeiro; máximo 6 para não virar lista infinita
  const alertasVisiveis = alertas.sort((a, b) => b.peso - a.peso).slice(0, 6);

  return (
    <motion.div
      key="tab-inicio"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <AvisosBloqueantes pagina="inicio">
      {/* Saudação */}
      <h2
        style={{
          fontSize: "28px",
          fontFamily: "Playfair Display, serif",
          fontWeight: "500",
          letterSpacing: "0.01em",
          color: "var(--charcoal)",
          margin: "0 0 2px 0",
        }}
      >
        {saudacao()}, Nádia
      </h2>
      <p
        style={{
          fontSize: "13px",
          color: "var(--gray-mid)",
          margin: "0 0 26px 0",
        }}
      >
        {hojePorExtenso()}
        {!loading && estaSemana > 0
          ? ` · ${estaSemana} ${estaSemana === 1 ? "evento" : "eventos"} esta semana`
          : ""}
      </p>

      {/* Procura rápida + as duas consultas (deslocação e data) */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "10px",
          maxWidth: "560px",
          margin: "-10px 0 22px 0",
        }}
      >
      <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Procurar cliente ou evento..."
          style={{
            width: "100%",
            padding: "11px 16px",
            borderRadius: "12px",
            border: "1.5px solid var(--gold-light)",
            fontSize: "13px",
            outline: "none",
            fontFamily: "Inter, sans-serif",
            boxSizing: "border-box",
            backgroundColor: "white",
          }}
          onFocus={(e) => (e.target.style.borderColor = "var(--gold)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--gold-light)")}
        />
        {busca.trim().length >= 2 && (
          <>
            <div
              onClick={() => setBusca("")}
              style={{ position: "fixed", inset: 0, zIndex: 40 }}
            />
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0,
                right: 0,
                zIndex: 41,
                backgroundColor: "white",
                borderRadius: "12px",
                border: "1px solid var(--gold-light)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
                overflow: "hidden",
              }}
            >
              {resultadosBusca.length === 0 ? (
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--gray-mid)",
                    padding: "12px 16px",
                    margin: 0,
                  }}
                >
                  Nenhum cliente ou evento encontrado.
                </p>
              ) : (
                resultadosBusca.map((s) => {
                  const resumo = getResumoSubmissao(s, eventTypes);
                  const tipo = (eventTypes || []).find(
                    (et) => et.id === s.event_type_id,
                  );
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setBusca("");
                        if (onAbrirEvento) onAbrirEvento(s);
                      }}
                      style={{
                        width: "100%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        padding: "10px 16px",
                        border: "none",
                        borderBottom: "1px solid #F5ECD7",
                        backgroundColor: "white",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor = "#FBF7EF")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = "white")
                      }
                    >
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: "500",
                          color: "var(--charcoal)",
                        }}
                      >
                        {resumo.titulo}
                      </span>
                      <span
                        style={{ fontSize: "11px", color: "var(--gray-mid)" }}
                      >
                        {tipo ? `${tipo.nome} · ` : ""}
                        {s.data_evento
                          ? new Date(s.data_evento).toLocaleDateString(
                              "pt-PT",
                              { day: "numeric", month: "short" },
                            )
                          : "sem data"}
                        {s.fase === "perdido" ? " · perdido" : ""}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

        {/* Pílula "Deslocação" — abre a consulta rápida (popover), mesmo
            padrão de fecho ao clicar fora que a pesquisa acima. Descartável:
            o popover só monta enquanto está aberto, por isso reabre sempre
            em branco. */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => {
              setConsultaDataAberta(false);
              setConsultaAberta((v) => !v);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              padding: "10.5px 16px",
              borderRadius: "999px",
              fontSize: "13px",
              fontWeight: consultaAberta ? "700" : "500",
              border: `1.5px solid ${consultaAberta ? "var(--gold)" : "var(--gold-light)"}`,
              backgroundColor: consultaAberta ? "var(--gold)" : "white",
              color: consultaAberta ? "white" : "var(--charcoal)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <Icone nome="pin" tamanho={14} />
            Deslocação
          </button>
          <AnimatePresence>
            {consultaAberta && (
              <>
                <div
                  onClick={() => setConsultaAberta(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 40 }}
                />
                <ConsultaDeslocacao onFechar={() => setConsultaAberta(false)} />
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Pílula "Data" — a Consulta da Data (decisão de 09/08, o
            cenário da Carla ao telefone): livre / em negociação /
            preferência / tomado, pela definição única da dlm_dia_estado.
            O mesmo padrão descartável da irmã — abrir uma fecha a outra
            (dois popovers ancorados ao mesmo canto não podem coexistir). */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => {
              setConsultaAberta(false);
              setConsultaDataAberta((v) => !v);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              padding: "10.5px 16px",
              borderRadius: "999px",
              fontSize: "13px",
              fontWeight: consultaDataAberta ? "700" : "500",
              border: `1.5px solid ${consultaDataAberta ? "var(--gold)" : "var(--gold-light)"}`,
              backgroundColor: consultaDataAberta ? "var(--gold)" : "white",
              color: consultaDataAberta ? "white" : "var(--charcoal)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <Icone nome="agenda" tamanho={14} />
            Data
          </button>
          <AnimatePresence>
            {consultaDataAberta && (
              <>
                <div
                  onClick={() => setConsultaDataAberta(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 40 }}
                />
                <ConsultaData onFechar={() => setConsultaDataAberta(false)} />
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Próximo evento */}
      {proximo && (
        <div
          onClick={() => onAbrirEvento && onAbrirEvento(proximo)}
          style={{
            backgroundColor: "#FBF7EF",
            border: "1px solid var(--gold-light)",
            borderRadius: "14px",
            padding: "16px 20px",
            marginBottom: "18px",
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                fontSize: "11px",
                color: "var(--gold-dark)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                margin: "0 0 3px 0",
              }}
            >
              Próximo evento ·{" "}
              {(() => {
                const d = diasAte(proximo.data_evento);
                if (d === 0) return "é hoje!";
                if (d === 1) return "é amanhã";
                return `faltam ${d} dias`;
              })()}
            </p>
            <p
              style={{
                fontSize: "19px",
                fontWeight: "600",
                fontFamily: "Playfair Display, serif",
                color: "var(--charcoal)",
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {titulo(proximo)}
              {" · "}
              {formatarDataLonga(proximo.data_evento)}
            </p>
          </div>
          <span
            style={{
              flexShrink: 0,
              fontSize: "13px",
              color: "var(--gold-dark)",
              border: "1px solid var(--gold)",
              borderRadius: "999px",
              padding: "6px 14px",
              whiteSpace: "nowrap",
            }}
          >
            Abrir evento →
          </span>
        </div>
      )}

      {/* Erros técnicos dos formulários públicos — só aparece se os houver */}
      <ErrosFormulario />

      {/* Duas colunas: A precisar de ti + O momento */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: tresColunas
            ? "1.35fr 1fr 0.95fr"
            : "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "26px",
          alignItems: "start",
        }}
      >
        {loading ? (
          <EsqueletoInicio />
        ) : (
          <>
        {/* A precisar de ti */}
        <div>
          <p style={tituloSeccao}>A precisar de ti</p>
          {alertasVisiveis.length === 0 ? (
            <div
              style={{
                backgroundColor: "white",
                borderRadius: "12px",
                padding: "18px",
                border: "1px solid #F0E6D0",
                textAlign: "center",
              }}
            >
              <p
                style={{
                  fontSize: "14px",
                  color: "var(--gray-mid)",
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                Tudo em dia ✨
                <br />
                Nada a precisar de ti neste momento.
              </p>
            </div>
          ) : (
            alertasVisiveis.map((a) => (
              <div
                key={a.chave}
                onClick={() => onAbrirEvento && onAbrirEvento(a.evento)}
                style={{
                  backgroundColor: "white",
                  borderRadius: "12px",
                  padding: "12px 14px",
                  marginBottom: "8px",
                  border: "1px solid #F0E6D0",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <span
                  style={{
                    fontSize: "14px",
                    color: "var(--charcoal)",
                    lineHeight: 1.5,
                    display: "flex",
                    alignItems: "center",
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: "5px",
                      height: "5px",
                      borderRadius: "50%",
                      backgroundColor: "var(--gold)",
                      marginRight: "10px",
                      verticalAlign: "middle",
                      flexShrink: 0,
                    }}
                  />
                  {a.texto}
                </span>
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: "13px",
                    color: "var(--gold-dark)",
                    whiteSpace: "nowrap",
                  }}
                >
                  ver →
                </span>
              </div>
            ))
          )}
        </div>

        {/* Esta semana — mini-agenda dos próximos 7 dias */}
        <div>
          <p style={tituloSeccao}>Esta semana</p>
          {semana.length === 0 ? (
            <div
              style={{
                backgroundColor: "white",
                borderRadius: "12px",
                padding: "18px",
                border: "1px solid #F0E6D0",
                textAlign: "center",
              }}
            >
              <p
                style={{
                  fontSize: "14px",
                  color: "var(--gray-mid)",
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                Semana tranquila ✨
                <br />
                Sem eventos nos próximos 7 dias.
              </p>
            </div>
          ) : (
            <>
              {semana.map((s) => {
                const p = pastilhaDia(s.data_evento);
                const tipo = nomeDoTipo(s);
                return (
                  <div
                    key={`sem-${s.id}`}
                    onClick={() => onAbrirEvento && onAbrirEvento(s)}
                    style={{
                      backgroundColor: "white",
                      borderRadius: "12px",
                      padding: "10px 12px",
                      marginBottom: "8px",
                      border: "1px solid #F0E6D0",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        width: "38px",
                        textAlign: "center",
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          fontSize: "9px",
                          fontWeight: "600",
                          letterSpacing: "0.1em",
                          color: "var(--gold)",
                        }}
                      >
                        {p.semana}
                      </span>
                      <span
                        style={{
                          display: "block",
                          fontSize: "18px",
                          fontWeight: "600",
                          fontFamily: "Playfair Display, serif",
                          color: "var(--gold-dark)",
                          lineHeight: 1.1,
                        }}
                      >
                        {p.numero}
                      </span>
                    </span>
                    <span
                      style={{
                        fontSize: "14px",
                        color: "var(--charcoal)",
                        lineHeight: 1.4,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {titulo(s)}
                      {tipo ? ` · ${tipo}` : ""}
                    </span>
                  </div>
                );
              })}
              <button
                onClick={() => onNavegar && onNavegar("calendario")}
                style={{
                  width: "100%",
                  padding: "9px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  fontWeight: "600",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  border: "none",
                  backgroundColor: "transparent",
                  color: "var(--gold-dark)",
                  cursor: "pointer",
                }}
              >
                Ver a agenda completa →
              </button>
            </>
          )}
        </div>

        {/* O momento + ações rápidas */}
        <div>
          <p style={tituloSeccao}>O momento</p>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
          >
            <CartaoNumero
              numero={emConversa}
              legenda={
                emConversa === 1
                  ? "contacto em conversa"
                  : "contactos em conversa"
              }
              dinheiro={
                valorEmConversa > 0
                  ? `${formatarEuros(valorEmConversa)} possíveis`
                  : null
              }
              onClick={() => onNavegar && onNavegar("clientes")}
            />
            <CartaoNumero
              numero={aEsperaDoSinal}
              legenda="à espera do sinal"
              dinheiro={
                valorSinaisAPorta > 0
                  ? `${formatarEuros(valorSinaisAPorta)} à porta`
                  : null
              }
              onClick={() => onNavegar && onNavegar("clientes")}
            />
            {/* O garantido — o pulso verde do funil, na porta de entrada */}
            <CartaoNumero
              numero={formatarEuros(valorGarantido)}
              legenda={`garantidos · ${listaGarantidos.length} ${
                listaGarantidos.length === 1 ? "evento" : "eventos"
              }`}
              verde
              onClick={() => onNavegar && onNavegar("clientes")}
            />
            <button
              onClick={() => setNovoInteressado(true)}
              style={{
                padding: "13px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: "600",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                border: "none",
                backgroundColor: "var(--gold)",
                color: "white",
                cursor: "pointer",
                marginTop: "6px",
              }}
            >
              + Registar pedido
            </button>
            <button
              onClick={() => onNavegar && onNavegar("calendario")}
              style={{
                padding: "13px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: "600",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                border: "1px solid var(--gold)",
                backgroundColor: "white",
                color: "var(--gold-dark)",
                cursor: "pointer",
              }}
            >
              + Nova reserva
            </button>
          </div>
        </div>
          </>
        )}
      </div>

      {/* Modal de novo interessado — o mesmo CaptacaoForm das outras
          portas (uma UI, quatro portas 😄) */}
      {novoInteressado && (
        <div
          onClick={() => setNovoInteressado(false)}
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
                Novo pedido
              </h3>
              <button
                onClick={() => setNovoInteressado(false)}
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
              Transcreve o que a pessoa te disse na conversa.
            </p>
            <CaptacaoForm
              modoInterno
              textoBotao="Registar pedido"
              onSubmetido={() => {
                setNovoInteressado(false);
                if (onDadosMudaram) onDadosMudaram();
                if (onNavegar) onNavegar("clientes");
              }}
            />
          </div>
        </div>
      )}
      </AvisosBloqueantes>
    </motion.div>
  );
}

// Estado de carregamento — em vez de mostrar zeros e "tudo em dia" (falso:
// os dados ainda não chegaram, não é que não existam), mostra placeholders
// a pulsar até os dados reais chegarem do Supabase.
function EsqueletoBarra({ largura = "100%", altura = "14px" }) {
  return (
    <span
      style={{
        display: "block",
        width: largura,
        height: altura,
        borderRadius: "6px",
        backgroundColor: "#F0E6D0",
        animation: "dlm-esqueleto-pulso 1.3s ease-in-out infinite",
      }}
    />
  );
}

function EsqueletoCartao({ altura = "56px" }) {
  return (
    <div
      style={{
        backgroundColor: "white",
        borderRadius: "12px",
        padding: "12px 14px",
        marginBottom: "8px",
        border: "1px solid #F0E6D0",
        height: altura,
        display: "flex",
        alignItems: "center",
      }}
    >
      <EsqueletoBarra largura="70%" />
    </div>
  );
}

function EsqueletoInicio() {
  return (
    <>
      <style>{`
        @keyframes dlm-esqueleto-pulso {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>
      <div>
        <p style={tituloSeccao}>A precisar de ti</p>
        <EsqueletoCartao />
        <EsqueletoCartao />
      </div>
      <div>
        <p style={tituloSeccao}>Esta semana</p>
        <EsqueletoCartao altura="52px" />
        <EsqueletoCartao altura="52px" />
      </div>
      <div>
        <p style={tituloSeccao}>O momento</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              style={{
                backgroundColor: "white",
                borderRadius: "12px",
                padding: "12px 16px",
                border: "1px solid #F0E6D0",
              }}
            >
              <div style={{ marginBottom: "6px" }}>
                <EsqueletoBarra largura="34px" altura="22px" />
              </div>
              <EsqueletoBarra largura="60%" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function CartaoNumero({ numero, legenda, dinheiro, verde, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: verde ? "#F0FDF4" : "white",
        borderRadius: "12px",
        padding: "12px 16px",
        border: verde ? "1px solid #BBF7D0" : "1px solid #F0E6D0",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <p
        style={{
          fontSize: "24px",
          fontWeight: "600",
          color: verde ? "#166534" : "var(--gold-dark)",
          margin: 0,
          lineHeight: 1.2,
        }}
      >
        {numero}
      </p>
      <p style={{ fontSize: "13px", color: "var(--gray-mid)", margin: 0 }}>
        {legenda}
      </p>
      {dinheiro && (
        <p
          style={{
            fontSize: "12px",
            fontWeight: "700",
            color: verde ? "#166534" : "var(--gold-dark)",
            margin: "4px 0 0 0",
          }}
        >
          {dinheiro}
        </p>
      )}
    </div>
  );
}

const tituloSeccao = {
  fontSize: "12px",
  fontWeight: "600",
  color: "var(--gray-mid)",
  textTransform: "uppercase",
  letterSpacing: "0.18em",
  margin: "0 0 12px 0",
};