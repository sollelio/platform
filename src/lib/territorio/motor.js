// ============================================================
// territorio/motor.js — o motor de frases do Atlas da Casa (Lote A).
//
// Puro e determinístico: recebe os pedidos registados (submissions) e
// as deslocações conhecidas (linhas de orçamento), devolve frases —
// nunca toca na rede nem no relógio (o «hoje» entra por argumento;
// testável com fixtures).
//
// As três leis (Revisão 2, aprovada 10/09/2026):
//   1 · Nenhuma frase sem porquê — fórmula em palavras + linhas de
//       suporte + excluídos com motivo.
//   2 · Limiar declarado, com FAMÍLIA de justificação (nunca decreto):
//       vantagem-em-eventos, monotonicidade, existência, mediana
//       protegida, instrumentação. Abaixo do limiar a frase DORME e
//       diz o que falta.
//   3 · Uma fonte de verdade por número; e HONESTIDADE EPISTEMOLÓGICA
//       (correção do Hélio): isto são os PEDIDOS REGISTADOS, nunca «a
//       procura» — o que não foi registado não está aqui, e o texto
//       di-lo sempre assim.
//
// Regime de números (derivado, não decretado): com n registos, um
// pedido novo mexe uma proporção até 100/(n+1) pontos. Logo:
//   n < 20  → só contagens («7 de 16»)
//   20–39   → percentagens a múltiplos de 5, contagem entre parênteses
//   n ≥ 40  → percentagens inteiras
// ============================================================

// Extensões explícitas: o motor corre também em node --test (a regra
// dos módulos ESM), não só no Vite.
import { classificarLocalidade, VERSAO_ZONAMENTO } from "./zonas.js";
import { FASES_POS_SINAL, FASE_LABEL } from "../fases.js";
import { rotuloMotivoPerda } from "../perda.js";

export const POPULACAO = "pedidos registados";

// ---- números honestos ----

export const pontosDeSensibilidade = (n) =>
  n >= 0 ? Math.round(100 / (n + 1)) : null;

// null = ainda não há licença para percentagem (mostra-se a contagem).
export const percentagemHonesta = (num, den) => {
  if (!den || den < 20) return null;
  const pct = (num / den) * 100;
  if (den < 40) return `${Math.round(pct / 5) * 5}% (${num} de ${den})`;
  return `${Math.round(pct)}%`;
};

const euros = (v) =>
  `${Number(v || 0).toLocaleString("pt-PT", { maximumFractionDigits: 0 })} €`;

// «A, B e C» — a enumeração como se diz, não como se programa.
const listaPt = (arr) =>
  arr.length <= 1
    ? arr.join("")
    : `${arr.slice(0, -1).join(", ")} e ${arr[arr.length - 1]}`;

export const dataCurta = (iso) => {
  if (!iso) return "sem data";
  const [a, m, d] = iso.split("-");
  // dd/mm/aaaa — o formato dos outros ecrãs da casa (orcamentoConfig).
  return `${d}/${m}/${a}`;
};

// O dia em ISO LOCAL — nunca toISOString: em Lisboa no verão, entre a
// meia-noite e a 1h, o corte UTC ainda é ONTEM (a regra já escrita na
// ConsultaData). O motor continua puro: o «hoje» entra por argumento.
const diaISO = (data) =>
  `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;

// ---- o censo dos pedidos registados ----

const FASES_EM_CONVERSA = ["interessado", "orcamento", "sinal"];

export const construirCenso = (submissions = [], hoje = new Date()) => {
  const pedidos = (submissions || []).map((s) => {
    const texto =
      (s.local_evento || "").trim() || (s.respostas?.localEvento || "").trim();
    const c = classificarLocalidade(texto);
    const valor =
      s.valor_acordado === null || s.valor_acordado === undefined
        ? null
        : Number(s.valor_acordado);
    const perdido = s.fase === "perdido";
    return {
      id: s.id,
      localidadeTexto: texto,
      classificacao: c,
      zona: c.estado === "zonada" ? c.zona : null,
      concelho: c.estado === "zonada" ? c.concelho : null,
      valor: Number.isFinite(valor) ? valor : null,
      fase: s.fase || "interessado",
      status: s.status || "Recebido",
      dataEvento: s.data_evento || null,
      criadoEm: s.created_at || null,
      perdido,
      motivoPerda: s.motivo_perda || null,
      canal: s.respostas?.canalOrigem || null,
      realizado: s.status === "Concluído",
      fechado: FASES_POS_SINAL.includes(s.fase) && s.status !== "Concluído",
      emConversa: FASES_EM_CONVERSA.includes(s.fase),
    };
  });

  const zonaveis = pedidos.filter((p) => p.zona);
  const porZona = new Map();
  for (const p of zonaveis) {
    if (!porZona.has(p.zona)) porZona.set(p.zona, []);
    porZona.get(p.zona).push(p);
  }
  const zonasOrdenadas = [...porZona.entries()]
    .map(([zona, lista]) => ({ zona, lista, n: lista.length }))
    .sort((a, b) => b.n - a.n || a.zona.localeCompare(b.zona));

  const primeiroRegisto = pedidos
    .map((p) => p.criadoEm)
    .filter(Boolean)
    .sort()[0];

  return {
    hoje,
    pedidos,
    n: pedidos.length,
    zonaveis,
    porZona,
    zonasOrdenadas,
    semLocalidade: pedidos.filter((p) => p.classificacao.estado === "vazia"),
    vagas: pedidos.filter((p) => p.classificacao.estado === "vaga"),
    porClassificar: pedidos.filter(
      (p) => p.classificacao.estado === "por_classificar",
    ),
    comValor: pedidos.filter((p) => p.valor !== null),
    perdidos: pedidos.filter((p) => p.perdido),
    primeiroRegisto,
  };
};

// ---- apertos (a janela da conferência de material) ----
// Dois eventos partilham um aperto quando as janelas data±BUFFER se
// tocam (|Δ| ≤ 2·BUFFER). O BUFFER espelha o app_config da conferência
// (2/2 dias em produção) — nota declarada no porquê.
const BUFFER_DIAS = 2;

export const agruparApertos = (pedidos, hoje) => {
  const vivos = pedidos
    .filter((p) => !p.perdido && p.dataEvento && !p.realizado)
    .sort((a, b) => a.dataEvento.localeCompare(b.dataEvento));
  const clusters = [];
  let atual = null;
  const dias = (a, b) =>
    Math.round((new Date(b) - new Date(a)) / (24 * 3600 * 1000));
  for (const p of vivos) {
    if (
      atual &&
      dias(atual.lista[atual.lista.length - 1].dataEvento, p.dataEvento) <=
        2 * BUFFER_DIAS
    ) {
      atual.lista.push(p);
    } else {
      atual = { lista: [p] };
      clusters.push(atual);
    }
  }
  return clusters
    .filter((c) => c.lista.length >= 2)
    .map((c) => ({
      lista: c.lista,
      de: c.lista[0].dataEvento,
      ate: c.lista[c.lista.length - 1].dataEvento,
      zonas: [
        ...new Set(c.lista.map((p) => p.zona || "por localizar")),
      ],
      futuro: c.lista[0].dataEvento >= diaISO(hoje),
    }));
};

// ---- as frases ----
// Cada frase: { id, camada, familia, justificacao, despertar, calcular }
// calcular devolve { segmentos, chip, porque } — segmentos alternam
// texto e número ({t:'x'|'n', v}) para a UI pintar os números a ouro.

const linhaPedido = (p) =>
  `${dataCurta(p.dataEvento)} · ${p.localidadeTexto || "sem localidade"} · ${FASE_LABEL[p.fase] || p.fase}${p.valor !== null ? ` · ${euros(p.valor)}` : ""}`;

const notaSensibilidade = (den) =>
  den < 20
    ? `Com ${den} registos, um pedido novo mexe uma proporção até ${pontosDeSensibilidade(den)} pontos — por isso mostro contagens, não percentagens.`
    : `Um pedido novo mexe estas percentagens até ${pontosDeSensibilidade(den)} pontos.`;

const excluidosGeo = (censo) => {
  const ex = [];
  if (censo.semLocalidade.length)
    ex.push(`${censo.semLocalidade.length} sem localidade`);
  if (censo.vagas.length)
    ex.push(`${censo.vagas.length} com localidade vaga`);
  if (censo.porClassificar.length)
    ex.push(`${censo.porClassificar.length} por classificar`);
  return ex;
};

const FRASES = [
  {
    id: "concentracao",
    camada: "procura",
    familia: "Concentração",
    justificacao:
      "Vantagem em eventos: com ≥2 pedidos de avanço, nenhum pedido único troca a liderança.",
    condicao: "Acorda com uma zona líder de ≥4 pedidos e vantagem ≥2 sobre a 2.ª.",
    despertar: (c) => {
      const [z1, z2] = c.zonasOrdenadas;
      return !!z1 && z1.n >= 4 && z1.n - (z2?.n || 0) >= 2;
    },
    calcular: (c) => {
      const [z1, z2] = c.zonasOrdenadas;
      return {
        segmentos: [
          { t: "n", v: String(z1.n) },
          { t: "x", v: ` dos teus ` },
          { t: "n", v: String(c.zonaveis.length) },
          { t: "x", v: ` ${POPULACAO} com zona vieram da ` },
          { t: "n", v: z1.zona },
          z2
            ? { t: "x", v: ` — a 2.ª frente é a ${z2.zona}, com ${z2.n}.` }
            : { t: "x", v: "." },
        ],
        chip: `${c.zonaveis.length} de ${c.n} ${POPULACAO}`,
        porque: {
          formula: `Contei os ${POPULACAO} cuja localidade pertence a cada zona (tabela de zonamento ${VERSAO_ZONAMENTO}) e ordenei. A frase só acende com vantagem ≥2 da líder — imune a um pedido único.`,
          linhas: z1.lista.map((p) => ({ id: p.id, texto: linhaPedido(p) })),
          excluidos: excluidosGeo(c),
          notas: [notaSensibilidade(c.zonaveis.length)],
        },
      };
    },
  },
  {
    id: "tres-frentes",
    camada: "procura",
    familia: "Frentes do território",
    justificacao:
      "Monotonicidade: pedidos novos só podem acrescentar frentes, nunca apagá-las.",
    condicao: "Acorda com ≥3 zonas com ≥2 pedidos cada.",
    despertar: (c) => c.zonasOrdenadas.filter((z) => z.n >= 2).length >= 3,
    calcular: (c) => {
      const frentes = c.zonasOrdenadas.filter((z) => z.n >= 2);
      return {
        segmentos: [
          { t: "x", v: "O teu território tem " },
          { t: "n", v: String(frentes.length) },
          { t: "x", v: " frentes: " },
          {
            t: "n",
            v: frentes.map((z) => `${z.zona} (${z.n})`).join(" · "),
          },
          { t: "x", v: "." },
        ],
        chip: `${c.zonaveis.length} de ${c.n} ${POPULACAO}`,
        porque: {
          formula: `Uma frente é uma zona a que já voltámos: ≥2 ${POPULACAO}. Um pedido é uma visita; dois é um caminho.`,
          linhas: frentes.flatMap((z) =>
            z.lista.map((p) => ({ id: p.id, texto: linhaPedido(p) })),
          ),
          excluidos: excluidosGeo(c),
          notas: [notaSensibilidade(c.zonaveis.length)],
        },
      };
    },
  },
  {
    id: "funil-zona",
    camada: "procura",
    familia: "Funil da zona",
    justificacao:
      "Contagens em parcelas sobre os pedidos registados — percentagens só quando o regime de números as permitir.",
    condicao: "Acorda com uma zona com ≥3 pedidos registados.",
    despertar: (c) => (c.zonasOrdenadas[0]?.n || 0) >= 3,
    calcular: (c) => {
      const z = c.zonasOrdenadas[0];
      const realizados = z.lista.filter((p) => p.realizado).length;
      const fechados = z.lista.filter((p) => p.fechado).length;
      const conversa = z.lista.filter((p) => p.emConversa).length;
      const perdidos = z.lista.filter((p) => p.perdido).length;
      const desde = c.primeiroRegisto
        ? ` desde ${dataCurta(c.primeiroRegisto.slice(0, 10))}`
        : "";
      return {
        segmentos: [
          { t: "x", v: `Da ` },
          { t: "n", v: z.zona },
          { t: "x", v: ` chegaram-te ` },
          { t: "n", v: String(z.n) },
          { t: "x", v: ` pedidos${desde}: ` },
          {
            t: "n",
            v: `${realizados} realizado${realizados === 1 ? "" : "s"} · ${fechados} fechado${fechados === 1 ? "" : "s"} · ${conversa} em conversa`,
          },
          {
            t: "x",
            v:
              perdidos > 0
                ? ` — e ${perdidos} perdido${perdidos === 1 ? "" : "s"}.`
                : " — perdidos, ainda nenhum registado.",
          },
        ],
        chip: `zona com mais registos`,
        porque: {
          formula:
            "Realizado = estado «Concluído»; fechado = fase pós-sinal por concluir; em conversa = interessado/orçamento/sinal; perdido = fase «perdido». O funil está ABERTO — isto não é uma taxa.",
          linhas: z.lista.map((p) => ({ id: p.id, texto: linhaPedido(p) })),
          excluidos: excluidosGeo(c),
          notas: [
            "Só vês os pedidos que foram registados — os que morrem sem registo não contam aqui.",
            notaSensibilidade(z.n),
          ],
        },
      };
    },
  },
  {
    id: "valor-zona",
    camada: "procura",
    familia: "Valor por zona",
    justificacao:
      "Uma soma sobre os pedidos registados é um facto a qualquer n — a contagem vai na frase.",
    condicao: "Acorda com ≥1 pedido com valor acordado e zona.",
    despertar: (c) => c.zonasOrdenadas.some((z) => z.lista.some((p) => p.valor !== null)),
    calcular: (c) => {
      const somas = c.zonasOrdenadas
        .map((z) => ({
          zona: z.zona,
          n: z.n,
          comValor: z.lista.filter((p) => p.valor !== null),
          soma: z.lista.reduce((acc, p) => acc + (p.valor || 0), 0),
        }))
        .filter((z) => z.comValor.length > 0)
        .sort((a, b) => b.soma - a.soma);
      const top = somas[0];
      const semValor = top.n - top.comValor.length;
      // Um perdido com valor CONTA — é procura registada — mas a nota
      // diz que não é receita (gate de aceitação, 10/09).
      const perdidosNoTop = top.comValor.filter((p) => p.perdido).length;
      return {
        segmentos: [
          { t: "x", v: `A zona mais valiosa até hoje é a ` },
          { t: "n", v: top.zona },
          { t: "x", v: `: ` },
          { t: "n", v: euros(top.soma) },
          { t: "x", v: ` acordados em ` },
          { t: "n", v: String(top.comValor.length) },
          {
            t: "x",
            v: ` ${POPULACAO}${semValor ? ` (${semValor} sem valor)` : ""}.`,
          },
        ],
        chip: `${c.comValor.length} de ${c.n} com valor`,
        porque: {
          formula:
            "Somei o valor acordado dos pedidos registados de cada zona e ordenei. É soma, não média — e diz sempre quantos entraram na conta.",
          linhas: somas.map((z) => ({
            id: null,
            texto: `${z.zona} — ${euros(z.soma)} em ${z.comValor.length} pedidos${z.n - z.comValor.length ? ` (${z.n - z.comValor.length} sem valor)` : ""}`,
          })),
          excluidos: excluidosGeo(c),
          notas: [
            ...(perdidosNoTop > 0
              ? [
                  `${perdidosNoTop} destes pedidos ${perdidosNoTop === 1 ? "foi perdido" : "foram perdidos"} — contam como procura registada, não como receita.`,
                ]
              : []),
            notaSensibilidade(c.comValor.length),
          ],
        },
      };
    },
  },
  {
    id: "alcance",
    camada: "operacoes",
    familia: "Alcance",
    justificacao: "Existência de um facto: precisa de n=1 e da contagem na frase.",
    condicao: "Acorda com ≥1 orçamento com km calculado.",
    despertar: (c, extra) => (extra.deslocacoes || []).some((d) => d.distanciaKm != null),
    calcular: (c, extra) => {
      const comKm = extra.deslocacoes.filter((d) => d.distanciaKm != null);
      const max = [...comKm].sort((a, b) => b.distanciaKm - a.distanciaKm)[0];
      const pedido = c.pedidos.find((p) => p.id === max.submissionId);
      return {
        segmentos: [
          { t: "x", v: "O teu evento mais distante até hoje custou " },
          { t: "n", v: `${Math.round(max.distanciaKm)} km` },
          { t: "x", v: " de estrada" },
          {
            t: "x",
            v: pedido?.localidadeTexto ? ` — ${pedido.localidadeTexto}.` : ".",
          },
        ],
        chip: `${comKm.length} de ${c.n} com km`,
        porque: {
          formula:
            "O maior km congelado nas linhas de Deslocação dos orçamentos — km por estrada, medidos da base do calculador de deslocação: a MESMA que os teus orçamentos usam (vive na configuração do servidor; se um dia mudar, isto passa a ser história da base antiga).",
          linhas: comKm.map((d) => {
            const p = c.pedidos.find((x) => x.id === d.submissionId);
            return {
              id: d.submissionId,
              texto: `${Math.round(d.distanciaKm)} km${d.duracaoMin ? ` · ≈${d.duracaoMin} min` : ""} · ${p?.localidadeTexto || "?"}${d.isento ? " · oferecida" : ""}`,
            };
          }),
          excluidos: [
            `${c.n - comKm.length} pedidos ainda sem km calculado (o km só existe onde a linha Deslocação foi usada)`,
          ],
          notas: [],
        },
      };
    },
  },
  {
    id: "estrada-rendida",
    camada: "operacoes",
    familia: "Estrada cobrada",
    justificacao:
      "Uma soma sobre os registos é um facto a qualquer n.",
    condicao: "Acorda com ≥1 orçamento com linha de Deslocação.",
    despertar: (c, extra) => (extra.deslocacoes || []).length >= 1,
    calcular: (c, extra) => {
      const linhas = extra.deslocacoes;
      const cobradas = linhas.filter((d) => !d.isento);
      const soma = cobradas.reduce((acc, d) => acc + (Number(d.valor) || 0), 0);
      const isentas = linhas.length - cobradas.length;
      return {
        segmentos: [
          { t: "x", v: "A deslocação cobrada já rendeu " },
          { t: "n", v: euros(soma) },
          { t: "x", v: " em " },
          { t: "n", v: String(cobradas.length) },
          {
            t: "x",
            v: ` orçamento${cobradas.length === 1 ? "" : "s"}${isentas ? ` (${isentas} oferecida${isentas === 1 ? "" : "s"})` : ""}.`,
          },
        ],
        chip: `${linhas.length} orçamentos com deslocação`,
        porque: {
          formula:
            "Somei o valor das linhas «Deslocação» dos orçamentos (a regra comercial da casa: 5 km incluídos + 0,50 €/km por troço). As oferecidas contam à parte — omiti-las seria mentir por omissão.",
          linhas: linhas.map((d) => {
            const p = c.pedidos.find((x) => x.id === d.submissionId);
            return {
              id: d.submissionId,
              texto: `${p?.localidadeTexto || "?"} · ${d.distanciaKm != null ? `${Math.round(d.distanciaKm)} km` : "km à mão"} · ${d.isento ? "oferecida" : euros(d.valor)}`,
            };
          }),
          excluidos: [],
          notas: [],
        },
      };
    },
  },
  {
    id: "calendario-90",
    camada: "operacoes",
    familia: "Próximos 90 dias",
    justificacao: "Contagem de agenda — a frase de uso semanal (logística).",
    condicao: "Acorda com ≥1 evento vivo nos próximos 90 dias.",
    despertar: (c) => {
      const hojeISO = diaISO(c.hoje);
      const lim = diaISO(new Date(c.hoje.getTime() + 90 * 24 * 3600 * 1000));
      return c.pedidos.some(
        (p) => !p.perdido && p.dataEvento && p.dataEvento >= hojeISO && p.dataEvento <= lim,
      );
    },
    calcular: (c) => {
      const hojeISO = diaISO(c.hoje);
      const lim = diaISO(new Date(c.hoje.getTime() + 90 * 24 * 3600 * 1000));
      const futuros = c.pedidos
        .filter(
          (p) =>
            !p.perdido && p.dataEvento && p.dataEvento >= hojeISO && p.dataEvento <= lim,
        )
        .sort((a, b) => a.dataEvento.localeCompare(b.dataEvento));
      const garantidos = futuros.filter((p) => p.fechado || p.realizado).length;
      const porZona = new Map();
      for (const p of futuros) {
        const chave = p.zona || "por localizar";
        porZona.set(chave, (porZona.get(chave) || 0) + 1);
      }
      const resumo = [...porZona.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([z, k]) => `${z} ${k}`)
        .join(" · ");
      return {
        segmentos: [
          { t: "x", v: "Nos próximos 90 dias tens " },
          { t: "n", v: String(futuros.length) },
          {
            t: "x",
            v: ` evento${futuros.length === 1 ? "" : "s"} marcado${futuros.length === 1 ? "" : "s"} (${garantidos} já garantido${garantidos === 1 ? "" : "s"}): `,
          },
          { t: "n", v: resumo },
          { t: "x", v: "." },
        ],
        chip: "janela: 90 dias",
        porque: {
          formula:
            "Eventos vivos (não perdidos) com data nos próximos 90 dias, agrupados por zona. «Garantido» = fase pós-sinal.",
          linhas: futuros.map((p) => ({ id: p.id, texto: linhaPedido(p) })),
          excluidos: [],
          notas: [],
        },
      };
    },
  },
  {
    id: "aperto",
    camada: "operacoes",
    familia: "Apertos de agenda",
    justificacao:
      "Determinístico e citável evento a evento — reutiliza a janela da conferência de material.",
    condicao: "Acorda quando 2+ eventos vivos partilham a janela de material (data ±2 dias).",
    despertar: (c) => agruparApertos(c.pedidos, c.hoje).length >= 1,
    calcular: (c) => {
      const clusters = agruparApertos(c.pedidos, c.hoje);
      const alvo = clusters.find((cl) => cl.futuro) || clusters[0];
      const zonas = listaPt(alvo.zonas);
      const umDia = alvo.de === alvo.ate;
      return {
        segmentos: [
          { t: "x", v: umDia ? "No dia " : "Entre " },
          {
            t: "n",
            v: umDia
              ? dataCurta(alvo.de)
              : `${dataCurta(alvo.de)} e ${dataCurta(alvo.ate)}`,
          },
          { t: "x", v: alvo.futuro ? " vais ter " : " tiveste " },
          { t: "n", v: String(alvo.lista.length) },
          { t: "x", v: " eventos no mesmo aperto de carrinha e stock: " },
          { t: "n", v: zonas },
          { t: "x", v: "." },
        ],
        chip: `${clusters.length} aperto${clusters.length === 1 ? "" : "s"} no total`,
        porque: {
          formula:
            "Dois eventos partilham um aperto quando as janelas data ±2 dias se tocam — a MESMA janela da conferência de material («a carrinha sai à sexta»). Zonas diferentes no mesmo aperto = material, carrinha e equipa divididos geograficamente.",
          linhas: clusters.flatMap((cl) =>
            cl.lista.map((p) => ({ id: p.id, texto: linhaPedido(p) })),
          ),
          excluidos: ["eventos concluídos e perdidos"],
          notas: [],
        },
      };
    },
  },
  {
    id: "procura-perdida",
    camada: "procura",
    familia: "Procura perdida",
    justificacao:
      "Instrumentação primeiro: o motivo de perda é novo (109); 3 perdas do MESMO motivo transformam casos em padrão.",
    condicao:
      "Acorda com ≥3 pedidos perdidos com o mesmo motivo. Enquanto não marcares pedidos como perdidos (com motivo), não te sei dizer onde recusas trabalho.",
    despertar: (c) => {
      const porMotivo = new Map();
      for (const p of c.perdidos) {
        if (!p.motivoPerda) continue;
        porMotivo.set(p.motivoPerda, (porMotivo.get(p.motivoPerda) || 0) + 1);
      }
      return [...porMotivo.values()].some((k) => k >= 3);
    },
    calcular: (c) => {
      const porMotivo = new Map();
      for (const p of c.perdidos) {
        if (!p.motivoPerda) continue;
        if (!porMotivo.has(p.motivoPerda)) porMotivo.set(p.motivoPerda, []);
        porMotivo.get(p.motivoPerda).push(p);
      }
      const [motivo, lista] = [...porMotivo.entries()].sort(
        (a, b) => b[1].length - a[1].length,
      )[0];
      return {
        segmentos: [
          { t: "x", v: "Perdeste " },
          { t: "n", v: String(lista.length) },
          { t: "x", v: " pedidos por " },
          { t: "n", v: (rotuloMotivoPerda(motivo) || motivo).toLowerCase() },
          { t: "x", v: " — há procura que não estás a servir." },
        ],
        chip: `${c.perdidos.length} perdidos registados`,
        porque: {
          formula:
            "Agrupei os pedidos marcados «perdido» pelo motivo escolhido no gesto. A frase só acende com 3 perdas do MESMO motivo — casos isolados não são padrão.",
          linhas: lista.map((p) => ({ id: p.id, texto: linhaPedido(p) })),
          excluidos: c.perdidos.filter((p) => !p.motivoPerda).length
            ? [`${c.perdidos.filter((p) => !p.motivoPerda).length} perdidos sem motivo`]
            : [],
          notas: [
            "Só vês as perdas registadas — as que morreram sem registo não contam aqui.",
          ],
        },
      };
    },
  },
  {
    id: "tipico-zona",
    camada: "procura",
    familia: "Valor típico da zona",
    justificacao: "Mediana protegida: ≥5 valores dá ≥2 de cada lado do típico.",
    condicao: "Acorda com ≥5 pedidos com valor na mesma zona.",
    despertar: (c) =>
      c.zonasOrdenadas.some((z) => z.lista.filter((p) => p.valor !== null).length >= 5),
    calcular: (c) => {
      const z = c.zonasOrdenadas.find(
        (x) => x.lista.filter((p) => p.valor !== null).length >= 5,
      );
      const valores = z.lista
        .filter((p) => p.valor !== null)
        .map((p) => p.valor)
        .sort((a, b) => a - b);
      const meio = Math.floor(valores.length / 2);
      const mediana =
        valores.length % 2 ? valores[meio] : (valores[meio - 1] + valores[meio]) / 2;
      return {
        segmentos: [
          { t: "x", v: `Na ` },
          { t: "n", v: z.zona },
          { t: "x", v: `, metade dos pedidos com valor vale mais de ` },
          { t: "n", v: euros(mediana) },
          { t: "x", v: ` (${valores.length} pedidos).` },
        ],
        chip: `${valores.length} com valor na zona`,
        porque: {
          formula:
            "O valor do meio dos pedidos registados com valor nessa zona — com pelo menos dois de cada lado, um pedido extremo não o arrasta.",
          linhas: z.lista
            .filter((p) => p.valor !== null)
            .map((p) => ({ id: p.id, texto: linhaPedido(p) })),
          excluidos: [],
          notas: [],
        },
      };
    },
  },
  {
    id: "tipo-x-zona",
    camada: "procura",
    familia: "Tipo × zona",
    justificacao: "Vantagem em eventos na zona modal do tipo (nunca quota fixa).",
    // A verdade e nada mais: o censo ainda não lê o tipo de evento —
    // prometer «acorda com ≥6» seria mentir (o despertar é falso por
    // construção; apanhado na revisão de 10/09).
    condicao:
      "Fica para uma fase seguinte — o Atlas ainda não lê o tipo de evento; quando ler, acordará com um tipo com ≥6 pedidos com zona.",
    despertar: () => false,
    calcular: () => null,
  },
  {
    id: "estrada-tipica",
    camada: "operacoes",
    familia: "Estrada típica",
    justificacao: "Mediana protegida sobre km conhecidos.",
    condicao: "Acorda com ≥5 orçamentos com km calculado.",
    despertar: (c, extra) =>
      (extra.deslocacoes || []).filter((d) => d.distanciaKm != null).length >= 5,
    calcular: (c, extra) => {
      const kms = extra.deslocacoes
        .filter((d) => d.distanciaKm != null)
        .map((d) => Math.round(d.distanciaKm))
        .sort((a, b) => a - b);
      const meio = Math.floor(kms.length / 2);
      const mediana = kms.length % 2 ? kms[meio] : Math.round((kms[meio - 1] + kms[meio]) / 2);
      return {
        segmentos: [
          { t: "x", v: "Um evento típico fica a " },
          { t: "n", v: `${mediana} km` },
          { t: "x", v: ` de estrada da base (${kms.length} orçamentos com km).` },
        ],
        chip: `${kms.length} com km`,
        porque: {
          formula: "A mediana dos km congelados nos orçamentos — relativa à base atual.",
          linhas: [],
          excluidos: [],
          notas: [],
        },
      };
    },
  },
  {
    id: "canal-origem",
    camada: "procura",
    familia: "De onde vens",
    justificacao: "Instrumentação: o campo «como nos conheceste» é novo (R1).",
    condicao: "Acorda com ≥10 pedidos com «como nos conheceste» preenchido.",
    despertar: (c) => c.pedidos.filter((p) => p.canal).length >= 10,
    calcular: (c) => {
      const comCanal = c.pedidos.filter((p) => p.canal);
      const porCanal = new Map();
      for (const p of comCanal)
        porCanal.set(p.canal, (porCanal.get(p.canal) || 0) + 1);
      const top = [...porCanal.entries()].sort((a, b) => b[1] - a[1]);
      return {
        segmentos: [
          { t: "x", v: "Dos pedidos que dizem de onde vieram, o canal mais forte é " },
          { t: "n", v: `${top[0][0]} (${top[0][1]} de ${comCanal.length})` },
          { t: "x", v: "." },
        ],
        chip: `${comCanal.length} de ${c.n} com canal`,
        porque: {
          formula: "Contei o campo «como nos conheceste» dos pedidos registados.",
          linhas: top.map(([canal, k]) => ({ id: null, texto: `${canal} — ${k}` })),
          excluidos: [`${c.n - comCanal.length} sem canal (campo novo)`],
          notas: [],
        },
      };
    },
  },
];

// ---- arrumação (housekeeping — nunca abre o ecrã, fecha-o) ----

export const frasesArrumacao = (censo) => {
  const out = [];
  if (censo.semLocalidade.length > 0) {
    out.push({
      id: "sem-localidade",
      camada: "arrumacao",
      familia: "Sem localidade",
      segmentos: [
        { t: "n", v: String(censo.semLocalidade.length) },
        {
          t: "x",
          v: ` pedido${censo.semLocalidade.length === 1 ? "" : "s"} ainda sem localidade — sem ela não entra${censo.semLocalidade.length === 1 ? "" : "m"} nas contas por zona.`,
        },
      ],
      chip: null,
      porque: {
        formula: "Pedidos registados com o campo de localidade vazio.",
        linhas: censo.semLocalidade.map((p) => ({ id: p.id, texto: linhaPedido(p) })),
        excluidos: [],
        notas: ["Pede a localidade na próxima conversa e escreve-a na ficha."],
      },
    });
  }
  const problematicos = [...censo.vagas, ...censo.porClassificar];
  if (problematicos.length > 0) {
    out.push({
      id: "por-classificar",
      camada: "arrumacao",
      familia: "Por classificar",
      segmentos: [
        { t: "n", v: String(problematicos.length) },
        {
          t: "x",
          v: ` localidade${problematicos.length === 1 ? "" : "s"} que não sei arrumar — diz-me o concelho e eu arrumo (ex.: «Grande Lisboa» é vago).`,
        },
      ],
      chip: null,
      porque: {
        formula: `Texto de localidade sem correspondência na tabela de zonamento (${VERSAO_ZONAMENTO}) ou demasiado vago. Nunca adivinho — corrige-se a ficha (ou o dicionário cresce).`,
        linhas: problematicos.map((p) => ({ id: p.id, texto: linhaPedido(p) })),
        excluidos: [],
        notas: [],
      },
    });
  }
  return out;
};

// ---- a chamada única do ecrã ----

export const gerarAtlas = (submissions, { deslocacoes = [], hoje = new Date() } = {}) => {
  const censo = construirCenso(submissions, hoje);
  const extra = { deslocacoes };
  const ativas = [];
  const adormecidas = [];
  for (const f of FRASES) {
    let acordada;
    try {
      acordada = f.despertar(censo, extra);
    } catch {
      acordada = false;
    }
    if (acordada) {
      const calc = f.calcular(censo, extra);
      if (calc)
        ativas.push({
          id: f.id,
          camada: f.camada,
          familia: f.familia,
          justificacao: f.justificacao,
          ...calc,
        });
    } else {
      adormecidas.push({
        id: f.id,
        camada: f.camada,
        familia: f.familia,
        condicao: f.condicao,
      });
    }
  }
  return { censo, ativas, arrumacao: frasesArrumacao(censo), adormecidas };
};

// ---- contexto do cartão «Avaliar novo pedido» ----

export const contextoAvaliacao = (censo, deslocacoes = []) => {
  const interessados = censo.pedidos.filter(
    (p) => p.emConversa && p.localidadeTexto,
  );
  const kmsConhecidos = deslocacoes
    .filter((d) => d.distanciaKm != null)
    .map((d) => Math.round(d.distanciaKm));
  const valores = censo.comValor.map((p) => p.valor).sort((a, b) => a - b);
  const meio = Math.floor(valores.length / 2);
  // Mediana protegida (a mesma família das frases): com <5 valores não
  // há «típico» — a UI omite a comparação em vez de a fabricar.
  const valorTipico =
    valores.length >= 5
      ? valores.length % 2
        ? valores[meio]
        : (valores[meio - 1] + valores[meio]) / 2
      : null;
  return { interessados, kmsConhecidos, valorTipico };
};
