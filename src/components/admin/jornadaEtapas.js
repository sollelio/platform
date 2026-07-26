import { FASES_POS_SINAL } from "./faseConfig";
import { formatarEuros } from "./orcamentos/orcamentoConfig";
import { saldoSinalPendente } from "../../lib/pagamentos";

// ============================================================
// jornadaEtapas — as oito etapas do evento e o próximo gesto, sem uma
// única linha de desenho.
//
// Vive fora do componente porque quem precisa desta resposta já não é
// só a régua: o drawer usa-a para saber que botão mostrar (o gesto
// muda de nome, a estrutura não), e o cabeçalho da página mostra a
// mesma coisa em compacto. Uma segunda leitura destas regras noutro
// sítio divergiria à primeira mudança.
//
// Módulo sem JSX, ao lado do faseConfig, pela mesma razão que ele: é
// vocabulário partilhado, não um componente.
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
export function construirEtapas({ s, invites, previstos, pagamentos }) {
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
    if (atual.id === "preparacao") return "preparar o evento (Materiais)";
    if (atual.id === "grandeDia")
      return "está tudo pronto — falta o grande dia 🥂";
    return null;
  })();

  return { etapas, atual, proximoGesto };
}
