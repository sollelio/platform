import { FASES_POS_SINAL } from "./faseConfig";
import { formatarEuros } from "./orcamentos/orcamentoConfig";
import { saldoSinalPendente } from "../../lib/pagamentos";
import { estadoFormularioDoEvento } from "../../lib/invites";

// ============================================================
// jornadaEtapas — as sete paragens cronológicas do evento, o selo do
// formulário e o próximo gesto, sem uma única linha de desenho.
//
// O Formulário saiu da linha (Direção B, 27/07/2026): é a única coisa
// que acende fora de ordem — a cliente responde quando responde — e
// andava disfarçado de paragem cronológica. A linha passa a dizer só
// tempo; o formulário é um SELO à parte, com os seus quatro estados.
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
    return { valorSinal: metade, porReceber: metade, temPrevisto: false };
  }
  return {
    valorSinal: Number(previstoSinal.valor) || 0,
    porReceber: saldoSinalPendente(s.id, previstos, pagamentos || []),
    temPrevisto: true,
  };
}

// As oito etapas, com o seu estado já resolvido. Puro: só lê o que
// recebe, nunca faz queries.
// dinheiroACaminho: o plano ainda vem a caminho (drawer acabado de
// abrir) — o Sinal cala os números em vez de mostrar a estimativa e
// trocá-la pelo valor real meio segundo depois. Números que saltam
// são pior do que números que chegam.
export function construirEtapas({
  s,
  invites,
  previstos,
  pagamentos,
  dinheiroACaminho = false,
}) {
  const idxFase = FASE_ORDEM_JORNADA.indexOf(s.fase);
  const posSinal = FASES_POS_SINAL.includes(s.fase);
  const valor = Number(s.valor_acordado) || 0;
  const concluido = s.status === "Concluído";
  const emPreparacao =
    ["Em Preparação", "Confirmado"].includes(s.status) || concluido;

  // O selo do formulário. A resposta vem da fonte única (lib/invites),
  // que só dá "preenchido" quando as respostas estão NESTE evento — um
  // convite que duplicou (respostas noutro evento) não sela o original.
  const { estado: estadoFormulario } = estadoFormularioDoEvento(
    invites,
    s.id,
  );

  const { valorSinal, porReceber, temPrevisto } = numerosDoSinal(
    s,
    previstos,
    pagamentos,
    valor,
  );
  // O dinheiro entrou mas a fase ainda não o reconhece: o gesto deixa
  // de pedir um sinal que já está no banco e passa a apontar o avanço
  // (a sugestão vive na aba Pagamentos — Lote 2B).
  const sinalSaldadoSemAvanco = !posSinal && temPrevisto && porReceber <= 0;

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
      saldado: sinalSaldadoSemAvanco,
      sub: dinheiroACaminho
        ? null
        : sinalSaldadoSemAvanco
          ? "saldado · por avançar no funil"
          : !posSinal && s.fase === "sinal" && porReceber > 0
            ? `${formatarEuros(porReceber)} por receber`
            : posSinal && valorSinal > 0
              ? formatarEuros(valorSinal)
              : null,
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
      sub: dataCurta(s.data_evento),
      clicavel: posSinal,
      tituloBloqueado: "Só depois do sinal recebido",
    },
  ];

  // A etapa ATUAL: a primeira por fazer — a linha é agora puramente
  // cronológica, sem exceções a saltar
  const atual = etapas.find((e) => !e.feito);

  // Concluído com a fase atrasada (legal na BD): a régua não pede
  // "criar o projecto" a um evento que já aconteceu — pede arrumação.
  const porArrumar = concluido && !!atual;

  // A frase "→ A seguir" — a app a apontar o próximo gesto
  const proximoGesto = (() => {
    if (!atual) return null;
    if (porArrumar)
      return "a fase no funil — o evento já está concluído";
    if (atual.id === "orcamento") return "enviar o orçamento";
    if (atual.id === "sinal")
      return dinheiroACaminho
        ? "registar o sinal"
        : sinalSaldadoSemAvanco
          ? "confirmar o avanço para Cliente — o sinal está saldado"
          : porReceber > 0
            ? `registar o sinal (${formatarEuros(porReceber)})`
            : "registar o sinal";
    if (atual.id === "projecto") return "criar o projecto";
    if (atual.id === "contrato") return "preparar o contrato";
    if (atual.id === "preparacao") return "preparar o evento (Materiais)";
    if (atual.id === "grandeDia")
      return "está tudo pronto — falta o grande dia";
    return null;
  })();

  // O selo viaja ao lado das etapas: quem desenha decide onde o põe
  // (cabeçalho do cartão na cheia, ponto próprio na compacta).
  return {
    etapas,
    atual,
    proximoGesto,
    porArrumar,
    formulario: { estado: estadoFormulario },
  };
}

// ============================================================
// A EVIDÊNCIA de um percurso perdido — o que os dados ainda provam.
//
// A fase é sobrescrita ao perder, mas o STATUS preserva-se DE
// PROPÓSITO como memória histórica (decisão do 2A; o CHECK da 040
// isenta o perdido exatamente para o permitir). E o status pós-sinal
// só se grava em fase pós-sinal — logo, um perdido "Em Preparação"
// PROVA que chegou pelo menos a Cliente: o Sinal e o Orçamento
// acendem por inferência, não por adivinha.
// ============================================================

const STATUS_POS_SINAL = ["Em Preparação", "Confirmado", "Concluído"];

export function construirEvidencia({ s, invites, previstos, pagamentos }) {
  const valor = Number(s.valor_acordado) || 0;
  const statusPos = STATUS_POS_SINAL.includes(s.status);
  // A mesma leitura da régua viva: só o dinheiro ligado ao previsto do
  // SINAL (ordem 1) — somar tudo punha contribuições e remanescente a
  // fazer de prova de sinal. Sem plano carregado, soma-se tudo, como
  // antes de existirem planos.
  const previstoSinal = (previstos || []).find(
    (p) => p.submission_id === s.id && p.ordem === 1,
  );
  const recebido = (pagamentos || []).reduce((acc, p) => {
    if (previstoSinal && p.previsto_id !== previstoSinal.id) return acc;
    return acc + (Number(p.valor) || 0);
  }, 0);
  const { estado: estadoFormulario } = estadoFormularioDoEvento(
    invites,
    s.id,
  );

  const etapas = [
    {
      id: "interessado",
      rotulo: "Interessada",
      evidencia: true,
      sub: dataCurta(s.created_at),
    },
    {
      id: "orcamento",
      rotulo: "Orçamento",
      evidencia: valor > 0 || statusPos,
      sub: valor > 0 ? formatarEuros(valor) : null,
    },
    {
      id: "sinal",
      rotulo: "Sinal",
      evidencia: recebido > 0 || statusPos,
      sub: recebido > 0 ? `${formatarEuros(recebido)} recebidos` : null,
    },
    // Sem coluna de fase histórica, Projecto e Contrato não têm prova
    // possível — ficam honestamente apagados.
    { id: "projecto", rotulo: "Projecto", evidencia: false },
    { id: "contrato", rotulo: "Contrato", evidencia: false },
    { id: "preparacao", rotulo: "Preparação", evidencia: statusPos },
    {
      id: "grandeDia",
      rotulo: "O grande dia",
      evidencia: s.status === "Concluído",
      sub: dataCurta(s.data_evento),
    },
  ];

  const fraseStatus =
    s.status === "Em Preparação"
      ? "Estava em preparação quando se perdeu."
      : s.status === "Confirmado"
        ? "Estava confirmado quando se perdeu."
        : s.status === "Concluído"
          ? "Estava concluído quando se perdeu."
          : null;

  return { etapas, formulario: { estado: estadoFormulario }, fraseStatus };
}
