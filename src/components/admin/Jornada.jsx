import { useState } from "react";
import { FASES_POS_SINAL, STATUS_OPTIONS, STATUS_COLORS } from "./faseConfig";
import { formatarEuros } from "./orcamentos/orcamentoConfig";
import { saldoSinalPendente } from "../../lib/pagamentos";

// ============================================================
// A JORNADA — a linha de vida do evento, do primeiro "olá" ao
// grande dia. Oito etapas derivadas da fase comercial, do estado
// operacional e dos formulários.
// Três estados: feito (dourado, ✓) · atual (anel dourado) ·
// futuro (cinza). O Formulário é independente da ordem (acende
// quando o cliente responde, seja quando for): ✓ preenchido,
// ◐ criado por preencher, ○ nem criado.
//
// Vive fora do SubmissionDrawer desde o redesenho: é a melhor peça
// do drawer e a resposta literal a «em que fase está isto», por isso
// aparece nos DOIS níveis — no drawer e no cabeçalho da página do
// evento. A variante `compacta` é a régua sem rótulos do cabeçalho
// encolhido (92 px), com o passo actual escrito ao lado.
//
// Props:
//   submissao      — a submissão (obrigatória)
//   invites        — todos os convites (para o passo Formulário)
//   previstos      — pagamentos_previstos deste evento (opcional)
//   pagamentos     — pagamentos reais deste evento (opcional)
//   onEtapa(id)    — clique numa etapa que não seja de estado
//   onStatusChange(id, status, fase) — mudar o estado do evento
//   compacta       — régua sem rótulos, para o cabeçalho condensado
// ============================================================

const FASE_ORDEM_JORNADA = [
  "interessado",
  "orcamento",
  "sinal",
  "cliente",
  "projecto",
  "contrato",
];

const dataCurta = (d) =>
  d
    ? new Date(d).toLocaleDateString("pt-PT", {
        day: "numeric",
        month: "short",
      })
    : null;

// O sinal em números. A fonte honesta é o PLANO (pagamentos_previstos)
// menos o que entrou de facto — respeita pagamentos parciais e planos
// que não sejam metade certa do total. Sem o plano carregado, cai na
// estimativa de sempre (metade do acordado), que é o que esta régua
// mostrava antes de existirem pagamentos a sério. Sem isto, o
// cabeçalho da página do evento mostrava "Recebido 250€" ao lado de
// uma Jornada a dizer "250€ por receber" — duas respostas para a
// mesma pergunta, lado a lado.
function numerosDoSinal(s, previstos, pagamentos, valor) {
  const previstoSinal = (previstos || []).find(
    (p) => p.submission_id === s.id && p.ordem === 1,
  );
  if (!previstoSinal) {
    const metade = valor > 0 ? valor / 2 : 0;
    return { valorSinal: metade, porReceber: metade };
  }
  return {
    valorSinal: Number(previstoSinal.valor) || 0,
    porReceber: saldoSinalPendente(s.id, previstos, pagamentos || []),
  };
}

// As oito etapas, com o seu estado já resolvido. Puro: só lê o que
// recebe, nunca faz queries.
function construirEtapas({ s, invites, previstos, pagamentos }) {
  const idxFase = FASE_ORDEM_JORNADA.indexOf(s.fase);
  const posSinal = FASES_POS_SINAL.includes(s.fase);
  const valor = Number(s.valor_acordado) || 0;
  const concluido = s.status === "Concluído";
  const emPreparacao =
    ["Em Preparação", "Confirmado"].includes(s.status) || concluido;

  // Formulário: ✓ preenchido · ◐ criado por preencher · ○ nem criado
  const invitesDoEvento = (invites || []).filter(
    (i) => i.submission_id === s.id || i.submission_alvo_id === s.id,
  );
  const formularioFeito = invitesDoEvento.some((i) => i.submission_id);
  const formularioAMeio = !formularioFeito && invitesDoEvento.length > 0;

  const { valorSinal, porReceber } = numerosDoSinal(
    s,
    previstos,
    pagamentos,
    valor,
  );

  const etapas = [
    {
      id: "interessado",
      rotulo: "Interessada",
      feito: true,
      sub: dataCurta(s.created_at),
    },
    {
      id: "orcamento",
      rotulo: "Orçamento",
      feito: idxFase >= 1,
      sub: valor > 0 ? formatarEuros(valor) : null,
      clicavel: true,
    },
    {
      id: "sinal",
      rotulo: "Sinal",
      feito: posSinal,
      sub:
        !posSinal && s.fase === "sinal" && porReceber > 0
          ? `${formatarEuros(porReceber)} por receber`
          : posSinal && valorSinal > 0
            ? formatarEuros(valorSinal)
            : null,
    },
    {
      id: "formulario",
      rotulo: "Formulário",
      feito: formularioFeito,
      aMeio: formularioAMeio,
      // Submetido (✓) = morto; pendente (◐) preenche; ausente (○) cria
      clicavel: !formularioFeito,
    },
    {
      id: "projecto",
      rotulo: "Projecto",
      feito: idxFase >= 4,
      clicavel: true,
    },
    {
      id: "contrato",
      rotulo: "Contrato",
      feito: idxFase >= 5,
      clicavel: true,
    },
    {
      id: "preparacao",
      rotulo: "Preparação",
      feito: emPreparacao,
      // Só se edita depois do sinal (ver updateStatus em
      // lib/clientes.js — o mesmo limite, aqui como afordância).
      clicavel: posSinal,
      tituloBloqueado: "Só depois do sinal recebido",
    },
    {
      id: "grandeDia",
      rotulo: "O grande dia",
      feito: concluido,
      emoji: "🥂",
      sub: dataCurta(s.data_evento),
      clicavel: posSinal,
      tituloBloqueado: "Só depois do sinal recebido",
    },
  ];

  // A etapa ATUAL: a primeira por fazer na cadeia (o Formulário fica
  // de fora — é independente da ordem)
  const atual = etapas.find((e) => e.id !== "formulario" && !e.feito);

  // A frase "→ A seguir" — a app a apontar o próximo gesto
  const proximoGesto = (() => {
    if (!atual) return null;
    if (atual.id === "orcamento") return "enviar o orçamento";
    if (atual.id === "sinal")
      return porReceber > 0
        ? `registar o sinal (${formatarEuros(porReceber)})`
        : "registar o sinal";
    if (atual.id === "projecto") return "criar o projecto";
    if (atual.id === "contrato") return "preparar o contrato";
    if (atual.id === "preparacao") return "preparar o evento (Logística)";
    if (atual.id === "grandeDia")
      return "está tudo pronto — falta o grande dia 🥂";
    return null;
  })();

  return { etapas, atual, proximoGesto };
}

// A régua sem rótulos do cabeçalho encolhido: bolinhas e fios, com o
// passo actual escrito ao lado. Sem cliques — encolhido, o cabeçalho
// só informa; para agir volta-se a subir.
function JornadaCompacta({ etapas, atual }) {
  const legenda = atual
    ? [atual.rotulo, atual.sub].filter(Boolean).join(" · ")
    : "percurso completo";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
      {etapas.map((e, i) => {
        const ehAtual = atual && atual.id === e.id;
        return (
          <div
            key={e.id}
            style={{ display: "flex", alignItems: "center", gap: "5px" }}
          >
            <span
              title={[e.rotulo, e.sub].filter(Boolean).join(" · ")}
              style={{
                display: "block",
                width: ehAtual ? "10px" : "8px",
                height: ehAtual ? "10px" : "8px",
                borderRadius: "50%",
                boxSizing: "border-box",
                backgroundColor: ehAtual
                  ? "white"
                  : e.feito
                    ? "var(--gold)"
                    : e.aMeio
                      ? "#EAD9AC"
                      : "#F1EBDD",
                border: ehAtual ? "2px solid var(--gold)" : "none",
              }}
            />
            {i < etapas.length - 1 && (
              <span
                style={{
                  display: "block",
                  width: "14px",
                  height: "2px",
                  backgroundColor: e.feito ? "var(--gold)" : "#F1EBDD",
                }}
              />
            )}
          </div>
        );
      })}
      <span
        style={{
          fontSize: "11px",
          color: "var(--gold-dark)",
          marginLeft: "8px",
          whiteSpace: "nowrap",
        }}
      >
        {legenda}
      </span>
    </div>
  );
}

export default function Jornada({
  submissao,
  invites = [],
  previstos = null,
  pagamentos = null,
  onEtapa,
  onStatusChange,
  compacta = false,
}) {
  // O estado (Recebido/Em Preparação/Confirmado/Concluído) edita-se
  // aqui dentro — nos passos "Preparação" e "Grande dia" — em vez de
  // num bloco à parte sem ligação visual à Jornada. Hook antes de
  // qualquer return condicional (fase "perdido" também usa isto).
  const [popoverEtapa, setPopoverEtapa] = useState(null);

  const s = submissao;
  if (!s) return null;

  // Percurso terminado — sem jornada, só a lápide discreta
  if (s.fase === "perdido") {
    if (compacta) {
      return (
        <span style={{ fontSize: "11px", color: "var(--gray-mid)" }}>
          Percurso terminado (perdido)
        </span>
      );
    }
    return (
      <div
        style={{
          backgroundColor: "#F9FAFB",
          border: "1px solid #E5E7EB",
          borderRadius: "12px",
          padding: "10px 14px",
          marginBottom: "14px",
          fontSize: "12px",
          color: "var(--gray-mid)",
        }}
      >
        Percurso terminado (perdido) — pode ser recuperado no funil.
      </div>
    );
  }

  const { etapas, atual, proximoGesto } = construirEtapas({
    s,
    invites,
    previstos,
    pagamentos,
  });

  if (compacta) return <JornadaCompacta etapas={etapas} atual={atual} />;

  // Preparação/Grande dia abrem o escolhedor de estado ali mesmo; os
  // restantes continuam a delegar no onEtapa do pai (gerar documento,
  // preencher formulário).
  const aoClicarEtapa = (id) => {
    if (id === "preparacao" || id === "grandeDia") {
      setPopoverEtapa((atualAberto) => (atualAberto === id ? null : id));
    } else if (onEtapa) {
      onEtapa(id);
    }
  };

  return (
    <div
      style={{
        backgroundColor: "#FBF7EF",
        border: "1px solid var(--gold-light)",
        borderRadius: "12px",
        padding: "14px 10px 10px",
        marginBottom: "14px",
      }}
    >
      <p
        style={{
          fontSize: "9px",
          fontWeight: "700",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--gold-dark)",
          margin: "0 4px 12px",
        }}
      >
        A Jornada
      </p>
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        {etapas.map((e, i) => {
          const ehAtual = atual && atual.id === e.id;
          const corBola = e.feito
            ? "var(--gold)"
            : e.aMeio
              ? "#EAD9AC"
              : "#F1EBDD";
          return (
            <div
              key={e.id}
              onClick={e.clicavel ? () => aoClicarEtapa(e.id) : undefined}
              title={e.clicavel ? "Abrir" : e.tituloBloqueado}
              style={{
                flex: 1,
                textAlign: "center",
                position: "relative",
                cursor: e.clicavel ? "pointer" : "default",
                minWidth: 0,
              }}
            >
              {i < etapas.length - 1 && (
                <div
                  style={{
                    position: "absolute",
                    top: "10px",
                    left: "50%",
                    right: "-50%",
                    height: "2px",
                    backgroundColor: e.feito ? "var(--gold)" : "#E5DCC3",
                  }}
                />
              )}
              <div
                style={{
                  position: "relative",
                  width: ehAtual ? "24px" : "21px",
                  height: ehAtual ? "24px" : "21px",
                  borderRadius: "50%",
                  backgroundColor: ehAtual ? "white" : corBola,
                  border: ehAtual ? "2.5px solid var(--gold)" : "none",
                  boxShadow: ehAtual
                    ? "0 0 0 4px rgba(201,168,76,0.22)"
                    : "none",
                  margin: `${ehAtual ? "-1px" : "0"} auto 5px`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: e.emoji ? "11px" : "10px",
                  color: e.feito ? "white" : "var(--gray-mid)",
                  fontWeight: "700",
                }}
              >
                {e.emoji ? e.emoji : e.feito ? "✓" : ehAtual ? "●" : "○"}
              </div>
              <p
                style={{
                  fontSize: "8.5px",
                  fontWeight: e.feito || ehAtual ? "600" : "400",
                  color: ehAtual
                    ? "var(--gold-dark)"
                    : e.feito
                      ? "var(--charcoal)"
                      : "var(--gray-mid)",
                  margin: "0 2px",
                  lineHeight: 1.25,
                  overflowWrap: "break-word",
                }}
              >
                {e.rotulo}
              </p>
              {e.sub && (
                <p
                  style={{
                    fontSize: "8.5px",
                    color: ehAtual ? "#B45309" : "var(--gray-mid)",
                    fontWeight: ehAtual ? "600" : "400",
                    margin: 0,
                    lineHeight: 1.3,
                  }}
                >
                  {e.sub}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {popoverEtapa && (
        <div
          style={{
            marginTop: "10px",
            backgroundColor: "white",
            border: "1px solid var(--gold-light)",
            borderRadius: "10px",
            padding: "10px 12px",
          }}
        >
          <p
            style={{
              fontSize: "10px",
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--gold-dark)",
              margin: "0 0 8px",
            }}
          >
            Estado do evento
          </p>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {STATUS_OPTIONS.map((status) => {
              const colors = STATUS_COLORS[status];
              const isActive = s.status === status;
              return (
                <button
                  key={status}
                  onClick={() => {
                    onStatusChange && onStatusChange(s.id, status, s.fase);
                    setPopoverEtapa(null);
                  }}
                  style={{
                    padding: "5px 12px",
                    borderRadius: "999px",
                    fontSize: "11.5px",
                    fontWeight: "600",
                    border: `1px solid ${colors.border}`,
                    backgroundColor: isActive ? colors.color : colors.bg,
                    color: isActive ? "white" : colors.color,
                    cursor: "pointer",
                  }}
                >
                  {status}
                </button>
              );
            })}
          </div>
          {popoverEtapa === "preparacao" && onEtapa && (
            <button
              onClick={() => {
                onEtapa("preparacao");
                setPopoverEtapa(null);
              }}
              style={{
                marginTop: "8px",
                fontSize: "11px",
                border: "none",
                background: "none",
                color: "var(--gold-dark)",
                cursor: "pointer",
                padding: 0,
                textDecoration: "underline",
              }}
            >
              Abrir Logística →
            </button>
          )}
        </div>
      )}
      {proximoGesto && (
        <p
          style={{
            fontSize: "11px",
            fontStyle: "italic",
            color: "var(--gold-dark)",
            margin: "10px 4px 0",
          }}
        >
          → A seguir: {proximoGesto}
        </p>
      )}
    </div>
  );
}
