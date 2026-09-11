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
import { classificarLocalidade } from "../../lib/territorio/zonas";
import { useNomeDoUtilizador } from "../../lib/autoria";
import { Icone } from "./Navegacao";

// ============================================================
// InicioTab — a porta de entrada da app (redesenho de 10/09/2026,
// a pedido da Nádia: «está confuso e não me ajuda»).
//
// A Home responde a UMA pergunta — «o que preciso de saber agora e
// para onde devo ir?» — e mais nada: saudação, o acesso rápido de
// sempre (procurar · calcular deslocação · verificar data) e QUATRO
// cartões grandes que encaminham para os módulos (abrir evento, ver
// agenda, ver contactos, ver o funil). A Home orienta; quem resume é
// o Dashboard, quem lista é cada módulo.
//
// O que SAIU daqui nesta limpeza (registado em decisoes-de-produto):
// a lista «A precisar de ti» (reduzida a UMA linha discreta com o
// assunto mais urgente — as regras continuam vivas), a mini-agenda
// da semana, os cartões «O momento», os alertas de Equipa (vivem em
// Operações) e o «+ Nova reserva» (vive na Agenda).
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

// As microinterações da Home — hover calmo, sem bounce.
// A legenda de um atalho: uma linha, cinzenta, curta — utilidade
// percebida sem virar tutorial.
const ESTILO_LEGENDA_ATALHO = {
  fontSize: "11px",
  color: "var(--gray-mid)",
  lineHeight: 1.45,
  margin: "6px 2px 0",
  maxWidth: "190px",
};

const CSS_INICIO = `
.in-cartao{transition:box-shadow .2s ease,transform .2s ease,border-color .2s ease}
.in-cartao:hover{transform:translateY(-2px);box-shadow:0 10px 28px rgba(0,0,0,.08)}
.in-cta{transition:background-color .16s ease,border-color .16s ease}
.in-cta:hover{background-color:var(--superficie-quente);border-color:var(--gold)}
@media (prefers-reduced-motion: reduce){.in-cartao,.in-cta{transition:none}.in-cartao:hover{transform:none}}
`;

export default function InicioTab({
  submissions = [],
  invites = [],
  eventTypes = [],
  loading = false,
  onAbrirEvento,
  onNavegar,
  onDadosMudaram,
}) {
  // 105 · Quem se saúda é QUEM ENTROU, não a titular da casa; pelo
  // primeiro nome, como quem fala com ela. Sem nome, a saudação fica
  // sozinha em vez de acabar numa vírgula pendurada.
  const nomeDeQuemEntrou = useNomeDoUtilizador();
  const tratamento = (nomeDeQuemEntrou || "").trim().split(" ")[0];
  const [novoInteressado, setNovoInteressado] = useState(false);
  const [consultaAberta, setConsultaAberta] = useState(false);
  const [consultaDataAberta, setConsultaDataAberta] = useState(false);

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

  // ---- Os quatro números da primeira leitura ----
  const futuros = vivos
    .filter((s) => s.data_evento && s.status !== "Concluído")
    .filter((s) => diasAte(s.data_evento) >= 0)
    .sort((a, b) => new Date(a.data_evento) - new Date(b.data_evento));
  const proximo = futuros[0] || null;
  const estaSemana = futuros.filter((s) => diasAte(s.data_evento) <= 7).length;

  const emConversa = vivos.filter((s) =>
    ["interessado", "orcamento"].includes(s.fase),
  ).length;

  const listaAEsperaDoSinal = vivos.filter((s) => s.fase === "sinal");
  const aEsperaDoSinal = listaAEsperaDoSinal.length;
  // "à porta" = o saldo real do plano de sinal, já a descontar
  // qualquer pagamento parcial registado antes de a fase avançar.
  const valorSinaisAPorta = listaAEsperaDoSinal.reduce(
    (acc, s) =>
      acc + saldoSinalPendente(s.id, dadosSinal.previstos, dadosSinal.pagamentos),
    0,
  );

  // ---- «A precisar de ti», reduzido a UMA linha ----
  // As regras de sempre continuam a correr (são o radar de prazos:
  // pagamento final até 48h, sinal por receber, contrato por assinar,
  // formulário por preencher, evento por preparar, interessada
  // parada) — mas a Home só diz O MAIS URGENTE, numa linha calma.
  // A lista morreu: era a maior fonte de poluição do ecrã.
  const alertas = [];
  vivos
    .filter((s) => s.fase === "interessado")
    .forEach((s) => {
      const dias = diasDesde(s.created_at);
      if (dias !== null && dias >= 3)
        alertas.push({
          texto: `${titulo(s)} — interessada há ${dias} dias, ainda sem orçamento`,
          evento: s,
          peso: 2,
        });
    });
  vivos
    .filter((s) => s.fase === "sinal")
    .forEach((s) =>
      alertas.push({
        texto: `${titulo(s)} — aceitou o orçamento, sinal por receber`,
        evento: s,
        peso: 3,
      }),
    );
  vivos
    .filter((s) => s.fase === "contrato")
    .forEach((s) =>
      alertas.push({
        texto: `${titulo(s)} — sinal recebido, contrato por assinar`,
        evento: s,
        peso: 3,
      }),
    );
  vivos
    .filter(
      (s) =>
        FASES_POS_SINAL.includes(s.fase) && s.data_evento && !s.pagamento_final,
    )
    .forEach((s) => {
      const dias = diasAte(s.data_evento);
      if (dias === null || dias < 0 || dias > 7) return;
      const urgente = dias <= 3;
      alertas.push({
        texto: urgente
          ? `${titulo(s)} — PRAZO: pagamento final até 48h antes (evento ${dias === 0 ? "HOJE" : `em ${dias} dias`})`
          : `${titulo(s)} — falta o pagamento final (até 48h antes do evento)`,
        evento: s,
        peso: urgente ? 6 : 4,
      });
    });
  const idsComFormulario = new Set(
    invites.filter((i) => i.submission_id).map((i) => i.submission_id),
  );
  vivos
    .filter((s) => FASES_POS_SINAL.includes(s.fase) && s.data_evento)
    .forEach((s) => {
      const dias = diasAte(s.data_evento);
      if (dias !== null && dias >= 0 && dias <= 21 && !idsComFormulario.has(s.id))
        alertas.push({
          texto: `${titulo(s)} — evento ${dias === 0 ? "HOJE" : `em ${dias} dias`}, formulário por preencher`,
          evento: s,
          peso: 4,
        });
    });
  vivos
    .filter(
      (s) =>
        FASES_POS_SINAL.includes(s.fase) &&
        s.data_evento &&
        s.status === "Recebido",
    )
    .forEach((s) => {
      const dias = diasAte(s.data_evento);
      if (dias !== null && dias >= 0 && dias <= 7)
        alertas.push({
          texto: `${titulo(s)} — evento ${dias === 0 ? "HOJE" : `em ${dias} dias`} ainda por preparar`,
          evento: s,
          peso: 5,
        });
    });
  const alertaTopo = alertas.sort((a, b) => b.peso - a.peso)[0] || null;
  const maisAssuntos = alertas.length - 1;

  const proximoQuando = proximo
    ? (() => {
        const d = diasAte(proximo.data_evento);
        if (d === 0) return "é hoje";
        if (d === 1) return "é amanhã";
        return `em ${d} dias`;
      })()
    : null;

  return (
    <motion.div
      key="tab-inicio"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <style>{CSS_INICIO}</style>

      {/* Topo: a saudação grande + o único gesto de criação da Home */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "14px",
          marginBottom: "26px",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: "clamp(30px, 4vw, 42px)",
              fontFamily: "Playfair Display, serif",
              fontWeight: "500",
              letterSpacing: "0.01em",
              color: "var(--charcoal)",
              margin: "0 0 4px 0",
              lineHeight: 1.15,
            }}
          >
            {tratamento ? `${saudacao()}, ${tratamento}` : saudacao()}
          </h2>
          <p style={{ fontSize: "14px", color: "var(--gray-mid)", margin: 0 }}>
            {hojePorExtenso()}
          </p>
        </div>
        <button
          onClick={() => setNovoInteressado(true)}
          className="in-cta"
          style={{
            padding: "11px 20px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: "600",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            border: "none",
            backgroundColor: "var(--gold)",
            color: "var(--texto-sobre-ouro)",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          + Registar pedido
        </button>
      </div>

      {/* Atalhos rápidos — os fluxos reais de sempre, agora com nome e
          legenda: PROCURAR o que já existe vs CONSULTAR para decidir.
          A diferença lê-se na proximidade (as duas consultas andam
          juntas) e numa linha de microcopy por controlo — secção, não
          tutorial. */}
      <div style={{ maxWidth: "720px", margin: "0 0 34px 0" }}>
        <p
          style={{
            fontSize: "10px",
            fontWeight: "700",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--gold-dark)",
            margin: "0 0 10px 0",
          }}
        >
          Atalhos rápidos
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "18px",
            flexWrap: "wrap",
          }}
        >
        <div style={{ flex: "1 1 250px", minWidth: 0 }}>
        <div style={{ position: "relative" }}>
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
              backgroundColor: "var(--superficie)",
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
                  backgroundColor: "var(--superficie)",
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
                          borderBottom: "1px solid var(--borda-leve)",
                          backgroundColor: "var(--superficie)",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            "var(--superficie-quente)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            "var(--superficie)")
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
        <p style={ESTILO_LEGENDA_ATALHO}>
          Procurar um cliente ou evento que já existe.
        </p>
        </div>

        {/* As duas CONSULTAS andam juntas (gap menor = par): decidir na
            hora, sem abrir módulo nenhum. Popovers descartáveis: só
            montam enquanto abertos, reabrem em branco. */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <div style={{ flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
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
              backgroundColor: consultaAberta
                ? "var(--gold)"
                : "var(--superficie)",
              color: consultaAberta
                ? "var(--texto-sobre-ouro)"
                : "var(--charcoal)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <Icone nome="pin" tamanho={14} />
            Calcular deslocação
          </button>
          <AnimatePresence>
            {consultaAberta && (
              <>
                <div
                  onClick={() => setConsultaAberta(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 40 }}
                />
                <ConsultaDeslocacao
                  onFechar={() => setConsultaAberta(false)}
                  onRegistarPedido={(morada) => {
                    // 109 · A ponte: a consulta vira registo com a
                    // localidade já escrita. MAS o campo de destino é a
                    // LOCALIDADE (o que o Atlas lê por zona): uma morada
                    // de rua não entra lá (é PII e sujava o censo).
                    setConsultaAberta(false);
                    const c = classificarLocalidade(morada);
                    setNovoInteressado(
                      c.estado === "zonada" ? { local: c.original } : true,
                    );
                  }}
                />
              </>
            )}
          </AnimatePresence>
        </div>
        <p style={ESTILO_LEGENDA_ATALHO}>
          Distância e valor, antes de dar o preço.
        </p>
        </div>

        {/* "Verificar data" — livre / em negociação / preferência /
            tomado, pela definição única da dlm_dia_estado. Abrir uma
            fecha a outra (dois popovers no mesmo canto não coexistem). */}
        <div style={{ flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
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
              backgroundColor: consultaDataAberta
                ? "var(--gold)"
                : "var(--superficie)",
              color: consultaDataAberta
                ? "var(--texto-sobre-ouro)"
                : "var(--charcoal)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <Icone nome="agenda" tamanho={14} />
            Verificar data
          </button>
          <AnimatePresence>
            {consultaDataAberta && (
              <>
                <div
                  onClick={() => setConsultaDataAberta(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 40 }}
                />
                <ConsultaData
                  onFechar={() => setConsultaDataAberta(false)}
                  onRegistarPedido={(dataISO) => {
                    // 109 · A ponte irmã: a data consultada entra já
                    // escrita no registo do pedido.
                    setConsultaDataAberta(false);
                    setNovoInteressado({ dataEvento: dataISO });
                  }}
                />
              </>
            )}
          </AnimatePresence>
        </div>
        <p style={ESTILO_LEGENDA_ATALHO}>
          O dia está livre ou tomado?
        </p>
        </div>
        </div>
        </div>
      </div>

      {/* Erros técnicos dos formulários públicos — raro, crítico, sem
          outra casa: só aparece se os houver */}
      <ErrosFormulario />

      {/* A informação principal: quatro cartões, quatro portas */}
      {loading ? (
        <EsqueletoInicio />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(235px, 1fr))",
            gap: "20px",
            alignItems: "stretch",
          }}
        >
          <CartaoInicio
            icone="agenda"
            overline="Próximo evento"
            grande={proximo ? titulo(proximo) : "—"}
            grandeSerif
            sub={
              proximo
                ? `${formatarDataLonga(proximo.data_evento)} · ${proximoQuando}`
                : "Sem eventos marcados"
            }
            cta={proximo ? "Abrir evento" : "Ver agenda"}
            onClick={() =>
              proximo
                ? onAbrirEvento && onAbrirEvento(proximo)
                : onNavegar && onNavegar("calendario")
            }
          />
          <CartaoInicio
            icone="formularios"
            overline="Eventos esta semana"
            grande={String(estaSemana)}
            sub={estaSemana === 1 ? "evento nos próximos 7 dias" : "eventos nos próximos 7 dias"}
            cta="Ver agenda"
            onClick={() => onNavegar && onNavegar("calendario")}
          />
          <CartaoInicio
            icone="contactos"
            overline="Contactos em conversa"
            grande={String(emConversa)}
            sub={emConversa === 1 ? "contacto por fechar" : "contactos por fechar"}
            cta="Ver contactos"
            onClick={() => onNavegar && onNavegar("clientes")}
          />
          <CartaoInicio
            icone="moeda"
            overline="A entrar"
            grande={String(aEsperaDoSinal)}
            sub={aEsperaDoSinal === 1 ? "sinal por receber" : "sinais por receber"}
            dinheiro={
              valorSinaisAPorta > 0
                ? `${formatarEuros(valorSinaisAPorta)} à porta`
                : null
            }
            cta="Ver o funil"
            onClick={() => onNavegar && onNavegar("clientes")}
          />
        </div>
      )}

      {/* O radar de prazos, numa linha só — clicar abre o evento */}
      {!loading && alertaTopo && (
        <button
          onClick={() => onAbrirEvento && onAbrirEvento(alertaTopo.evento)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginTop: "26px",
            padding: "4px 2px",
            border: "none",
            background: "none",
            cursor: "pointer",
            textAlign: "left",
            maxWidth: "100%",
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "999px",
              backgroundColor: "var(--gold)",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: "13px",
              color: "var(--gray-mid)",
              lineHeight: 1.5,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: "var(--charcoal)" }}>A precisar de ti: </span>
            {alertaTopo.texto}
            {maisAssuntos > 0
              ? ` · +${maisAssuntos} ${maisAssuntos === 1 ? "assunto" : "assuntos"}`
              : ""}
          </span>
          <span
            style={{
              fontSize: "13px",
              color: "var(--gold-dark)",
              flexShrink: 0,
            }}
          >
            ver →
          </span>
        </button>
      )}

      {/* Modal de novo interessado — o mesmo CaptacaoForm das outras
          portas (uma UI, quatro portas) */}
      {novoInteressado && (
        <div
          onClick={() => setNovoInteressado(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            backgroundColor: "var(--cortina)",
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
              backgroundColor: "var(--superficie)",
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
            {/* O formulário de captação é peça PÚBLICA embutida no admin —
                o .papel reancora os tokens ao claro (regressão de 16/08:
                sem ele, no escuro a letra clara caía sobre campo branco). */}
            <div className="papel">
              <CaptacaoForm
                modoInterno
                textoBotao="Registar pedido"
                dataInicial={novoInteressado?.dataEvento || ""}
                localInicial={novoInteressado?.local || ""}
                onSubmetido={() => {
                  setNovoInteressado(false);
                  if (onDadosMudaram) onDadosMudaram();
                  if (onNavegar) onNavegar("clientes");
                }}
              />
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ------------------------------------------------------------
// UM cartão da Home: ícone em medalhão quente, overline, o número ou
// nome em GRANDE, uma linha de contexto, e um CTA claro para o módulo
// certo. O cartão inteiro é clicável; o CTA di-lo por palavras.
// ------------------------------------------------------------
function CartaoInicio({
  icone,
  overline,
  grande,
  grandeSerif = false,
  sub,
  dinheiro,
  cta,
  onClick,
}) {
  return (
    <div
      className="in-cartao"
      onClick={onClick}
      style={{
        backgroundColor: "var(--superficie)",
        border: "1px solid var(--borda)",
        borderRadius: "16px",
        padding: "22px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        minHeight: "205px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "18px",
        }}
      >
        <span
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "999px",
            backgroundColor: "var(--superficie-quente)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--gold-dark)",
            flexShrink: 0,
          }}
        >
          <Icone nome={icone} tamanho={20} />
        </span>
        <span
          style={{
            fontSize: "11px",
            fontWeight: "600",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--gray-mid)",
          }}
        >
          {overline}
        </span>
      </div>
      <p
        style={{
          fontSize: grandeSerif ? "clamp(22px, 2vw, 28px)" : "34px",
          fontFamily: "Playfair Display, serif",
          fontWeight: "600",
          color: "var(--charcoal)",
          margin: "0 0 4px 0",
          lineHeight: 1.2,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {grande}
      </p>
      <p style={{ fontSize: "13.5px", color: "var(--gray-mid)", margin: 0 }}>
        {sub}
      </p>
      {dinheiro && (
        <p
          style={{
            fontSize: "13.5px",
            fontWeight: "700",
            color: "var(--gold-dark)",
            margin: "3px 0 0 0",
          }}
        >
          {dinheiro}
        </p>
      )}
      <span
        className="in-cta"
        style={{
          marginTop: "auto",
          alignSelf: "flex-start",
          paddingTop: "16px",
        }}
      >
        <span
          style={{
            display: "inline-block",
            fontSize: "13px",
            color: "var(--gold-dark)",
            border: "1px solid var(--gold-light)",
            borderRadius: "999px",
            padding: "8px 16px",
            whiteSpace: "nowrap",
          }}
        >
          {cta} →
        </span>
      </span>
    </div>
  );
}

// Estado de carregamento — quatro cartões fantasma a pulsar (mostrar
// zeros seria afirmar «não há nada» quando os dados só ainda não
// chegaram).
function EsqueletoInicio() {
  return (
    <>
      <style>{`
        @keyframes dlm-esqueleto-pulso {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
        @media (prefers-reduced-motion: reduce) {
          .in-esqueleto { animation: none !important; }
        }
      `}</style>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(235px, 1fr))",
          gap: "20px",
        }}
      >
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            style={{
              backgroundColor: "var(--superficie)",
              border: "1px solid var(--borda)",
              borderRadius: "16px",
              padding: "22px",
              minHeight: "205px",
              boxSizing: "border-box",
            }}
          >
            <span
              className="in-esqueleto"
              style={{
                display: "block",
                width: "44px",
                height: "44px",
                borderRadius: "999px",
                backgroundColor: "var(--borda)",
                animation: "dlm-esqueleto-pulso 1.3s ease-in-out infinite",
                marginBottom: "18px",
              }}
            />
            <span
              className="in-esqueleto"
              style={{
                display: "block",
                width: "55%",
                height: "26px",
                borderRadius: "6px",
                backgroundColor: "var(--borda)",
                animation: "dlm-esqueleto-pulso 1.3s ease-in-out infinite",
                marginBottom: "10px",
              }}
            />
            <span
              className="in-esqueleto"
              style={{
                display: "block",
                width: "75%",
                height: "13px",
                borderRadius: "6px",
                backgroundColor: "var(--borda)",
                animation: "dlm-esqueleto-pulso 1.3s ease-in-out infinite",
              }}
            />
          </div>
        ))}
      </div>
    </>
  );
}
